"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BBT, GAME } from "@/lib/brand";
import { DEFAULT_SETTINGS } from "@/lib/config";
import { AudioManager } from "@/lib/game/audio";
import {
  MatchEngine,
  type EngineNetMessage,
  type HudState,
  type WorldInfo,
} from "@/lib/game/engine";
import { MultiplayerClient } from "@/lib/net/multiplayer";
import {
  loadSessionAccount,
  loadSettings,
  logOut,
  saveSettings,
  updateAccount,
} from "@/lib/storage";
import type {
  Account,
  ChatMessage,
  GameMode,
  LobbyPlayer,
  MatchResults,
  MatchSettings,
  MatchStart,
  Profile,
  RoomState,
  Screen,
  ServerInfo,
  Settings,
} from "@/lib/types";
import AuthScreen from "./AuthScreen";
import CharacterStudio from "./CharacterStudio";
import LobbyScreen from "./LobbyScreen";
import MainMenu from "./MainMenu";
import MatchBrowser from "./MatchBrowser";
import MatchHud from "./MatchHud";
import ResultsScreen from "./ResultsScreen";
import SettingsPanel from "./SettingsPanel";
import { BrandMark } from "./BrandMark";

let chatSeq = 0;
function chatId(): string {
  chatSeq += 1;
  return `local_chat_${Date.now()}_${chatSeq}`;
}

function systemMessage(text: string): ChatMessage {
  return { id: chatId(), sender: "SITE CONTROL", text, system: true };
}

export default function GameClient() {
  const [booted, setBooted] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [screen, setScreen] = useState<Screen>("auth");
  const [firstRun, setFirstRun] = useState(false);
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [peerId, setPeerId] = useState("");
  const [room, setRoom] = useState<RoomState | null>(null);
  const [lobbyStatus, setLobbyStatus] = useState("");
  const [browserMode, setBrowserMode] = useState<GameMode | undefined>(undefined);
  const [roomChat, setRoomChat] = useState<ChatMessage[]>([]);

  const [matchStart, setMatchStart] = useState<MatchStart | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [worldInfo, setWorldInfo] = useState<WorldInfo | null>(null);
  const [matchChat, setMatchChat] = useState<ChatMessage[]>([]);
  const [results, setResults] = useState<MatchResults | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const audioRef = useRef<AudioManager | null>(null);
  const netRef = useRef<MultiplayerClient | null>(null);
  const engineRef = useRef<MatchEngine | null>(null);
  const gameHostRef = useRef<HTMLDivElement>(null);
  const pendingNetRef = useRef<EngineNetMessage[]>([]);
  const noticeTimerRef = useRef<number | null>(null);
  const soloIdRef = useRef("");

  const screenRef = useRef<Screen>(screen);
  const roomRef = useRef<RoomState | null>(room);
  const matchStartRef = useRef<MatchStart | null>(matchStart);
  const settingsRef = useRef<Settings>(settings);
  const accountRef = useRef<Account | null>(account);

  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);
  useEffect(() => {
    roomRef.current = room;
  }, [room]);
  useEffect(() => {
    matchStartRef.current = matchStart;
  }, [matchStart]);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    accountRef.current = account;
  }, [account]);

  const ensureAudio = useCallback((): AudioManager => {
    if (!audioRef.current) {
      audioRef.current = new AudioManager();
      audioRef.current.setVolumes(
        settingsRef.current.musicVolume,
        settingsRef.current.sfxVolume,
      );
    }
    audioRef.current.ensure();
    return audioRef.current;
  }, []);

  const showNotice = useCallback((text: string) => {
    setNotice(text);
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 4500);
  }, []);

  // --- boot -------------------------------------------------------------
  useEffect(() => {
    const existing = loadSessionAccount();
    const stored = loadSettings();
    setSettings(stored);
    setAccount(existing);
    setScreen(existing ? "menu" : "auth");
    setBooted(true);
  }, []);

  useEffect(() => {
    const unlock = () => {
      const audio = audioRef.current || ensureAudio();
      audio.ensure();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, [ensureAudio]);

  useEffect(
    () => () => {
      if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
      audioRef.current?.dispose();
      audioRef.current = null;
    },
    [],
  );

  // --- music scene ------------------------------------------------------
  useEffect(() => {
    if (!booted) return;
    const audio = ensureAudio();
    if (!account) audio.setScene("off");
    else if (screen === "game") audio.setScene("match");
    else if (screen === "results") audio.setScene("results");
    else audio.setScene("menu");
  }, [booted, account, screen, ensureAudio]);

  // --- network ----------------------------------------------------------
  useEffect(() => {
    const net = new MultiplayerClient({
      onReady: (id) => setPeerId(id),
      onServers: setServers,
      onRoom: (nextRoom) => setRoom(nextRoom),
      onRoomClosed: (reason) => {
        setRoom(null);
        setLobbyStatus("");
        showNotice(reason);
        if (
          screenRef.current === "game" ||
          screenRef.current === "results" ||
          screenRef.current === "lobby"
        ) {
          setMatchStart(null);
          setResults(null);
          setHud(null);
          setWorldInfo(null);
          setScreen("menu");
          setSettingsOpen(false);
        }
      },
      onMatchStart: (start) => {
        setResults(null);
        setHud(null);
        setWorldInfo(null);
        setMatchChat([
          systemMessage(
            `${GAME.shortName} · ${start.mode.toUpperCase()} · 10 POINT POOL. EVERY ELIMINATION MOVES ONE POINT. ZERO POINTS = OUT.`,
          ),
        ]);
        setMatchStart(start);
        setScreen("game");
        setSettingsOpen(false);
      },
      onEngineMessage: (message) => {
        if (engineRef.current) engineRef.current.handleNet(message);
        else {
          pendingNetRef.current.push(message);
          if (pendingNetRef.current.length > 240) pendingNetRef.current.shift();
        }
      },
      onChat: (message) => {
        if (screenRef.current === "game" || screenRef.current === "results") {
          setMatchChat((prev) => [...prev, message].slice(-80));
        } else {
          setRoomChat((prev) => [...prev, message].slice(-80));
        }
      },
      onPeerGone: (playerId) => {
        engineRef.current?.removeCombatant(playerId);
      },
      onError: (message) => {
        showNotice(message);
        if (screenRef.current === "lobby" && !roomRef.current) {
          setScreen("browser");
        }
      },
      onStatus: (status) => {
        setLobbyStatus(status);
      },
    });
    netRef.current = net;
    void net.start();
    return () => {
      net.stop();
      if (netRef.current === net) netRef.current = null;
    };
  }, [showNotice]);

  // --- settings -> live systems -----------------------------------------
  useEffect(() => {
    engineRef.current?.setVolumes(settings.musicVolume, settings.sfxVolume);
    audioRef.current?.setVolumes(settings.musicVolume, settings.sfxVolume);
  }, [settings.musicVolume, settings.sfxVolume]);

  useEffect(() => {
    engineRef.current?.setSensitivity(settings.mouseSensitivity);
  }, [settings.mouseSensitivity]);

  useEffect(() => {
    engineRef.current?.setGraphicsQuality(settings.graphics);
  }, [settings.graphics]);

  useEffect(() => {
    engineRef.current?.setFirstPerson(settings.firstPerson);
  }, [settings.firstPerson]);

  useEffect(() => {
    engineRef.current?.setInputEnabled(!settingsOpen);
    if (settingsOpen && document.pointerLockElement) {
      try {
        document.exitPointerLock();
      } catch {
        /* ignore */
      }
    }
  }, [settingsOpen]);

  // --- match engine -----------------------------------------------------
  useEffect(() => {
    if (screen !== "game" || !matchStart || !gameHostRef.current) return;
    const act = accountRef.current;
    if (!act) return;

    const localId =
      matchStart.hostId === "solo"
        ? soloIdRef.current
        : netRef.current?.peerId || matchStart.hostId;
    const localLobby = matchStart.players.find((player) => player.id === localId);
    const localProfile: Profile = localLobby
      ? {
          id: localLobby.id,
          nickname: localLobby.nickname,
          gender: localLobby.gender,
          customization: localLobby.customization,
        }
      : {
          id: localId || `solo_${act.nickname.toLowerCase()}`,
          nickname: act.nickname,
          gender: act.gender,
          customization: act.customization,
        };
    const role =
      matchStart.hostId === "solo"
        ? "solo"
        : matchStart.hostId === netRef.current?.peerId
          ? "host"
          : "client";
    const audio = ensureAudio();
    const current = settingsRef.current;
    let engine: MatchEngine | null = null;

    try {
      engine = new MatchEngine({
        container: gameHostRef.current,
        matchId: matchStart.matchId,
        mode: matchStart.mode,
        role,
        hostId: matchStart.hostId,
        localProfile,
        players: matchStart.players,
        settings: matchStart.settings,
        graphics: current.graphics,
        firstPerson: current.firstPerson,
        mouseSensitivity: current.mouseSensitivity,
        audio,
        onHud: (next) => setHud(next),
        onEvent: (event) => {
          if (event.type === "notice") showNotice(event.text);
        },
        onWorldReady: (info) => setWorldInfo(info),
        onNetwork: (message) => netRef.current?.sendEngineMessage(message),
        onMatchEnd: (matchResults) => {
          setResults(matchResults);
          setScreen("results");
          setHud(null);
          setWorldInfo(null);
          setSettingsOpen(false);
          audioRef.current?.setScene("results");
          const local = matchResults.players.find((player) => player.id === localProfile.id);
          if (local) {
            setAccount((prev) => {
              if (!prev) return prev;
              const nextAccount: Account = {
                ...prev,
                stats: {
                  ...prev.stats,
                  matches: prev.stats.matches + 1,
                  wins:
                    prev.stats.wins +
                    (matchResults.winnerTeam !== "draw" &&
                    local.team === matchResults.winnerTeam
                      ? 1
                      : 0),
                  kills: prev.stats.kills + local.kills,
                  deaths: prev.stats.deaths + local.deaths,
                  bestScore: Math.max(prev.stats.bestScore, local.points),
                },
              };
              updateAccount(nextAccount);
              return nextAccount;
            });
          }
        },
        onFirstPersonChange: (value) => {
          setSettings((prev) => {
            if (prev.firstPerson === value) return prev;
            const next = { ...prev, firstPerson: value };
            saveSettings(next);
            return next;
          });
        },
      });
    } catch {
      showNotice("WebGL could not start on this device. Try a lower graphics setting.");
      setScreen("menu");
      setMatchStart(null);
      return;
    }

    engineRef.current = engine;
    audio.ensure();
    const queued = pendingNetRef.current;
    pendingNetRef.current = [];
    queued.forEach((message) => engine?.handleNet(message));

    return () => {
      engine?.dispose();
      if (engineRef.current === engine) engineRef.current = null;
      pendingNetRef.current = [];
      setWorldInfo(null);
    };
    // The engine is intentionally re-created only for a new match id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, matchStart?.matchId]);

  // --- detect mobile / desktop ---
  useEffect(() => {
    const ua = navigator.userAgent || navigator.vendor;
    const agent = /android|webos|iphone|ipad|ipod|blackberry/i.test(ua);
    setIsMobile(agent);
  }, []);

  // --- global keyboard --------------------------------------------------
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isMobile) return;
      if (screenRef.current !== "game") return;
      const target = event.target;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;
      if (event.code === "Escape" && !typing && !isMobile) {
        setSettingsOpen((open) => !open);
        return;
      }
      if (event.code === "Enter" && !typing) {
        event.preventDefault();
        if (document.pointerLockElement) {
          try {
            document.exitPointerLock();
          } catch {
            /* ignore */
          }
        }
        window.setTimeout(() => {
          document.getElementById("match-chat-input")?.focus();
        }, 60);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // --- helpers ----------------------------------------------------------
  const makeProfile = useCallback((): Profile => {
    const act = accountRef.current!;
    return {
      id: `operator_${Date.now().toString(36)}`,
      nickname: act.nickname,
      gender: act.gender,
      customization: act.customization,
    };
  }, []);

  const changeSettings = useCallback((next: Settings) => {
    setSettings(next);
    saveSettings(next);
    audioRef.current?.setVolumes(next.musicVolume, next.sfxVolume);
    engineRef.current?.setVolumes(next.musicVolume, next.sfxVolume);
    engineRef.current?.setSensitivity(next.mouseSensitivity);
    engineRef.current?.setGraphicsQuality(next.graphics);
    engineRef.current?.setFirstPerson(next.firstPerson);
  }, []);

  const startTraining = useCallback(() => {
    const act = accountRef.current;
    if (!act) return;
    ensureAudio().click();
    if (netRef.current?.role === "host" || netRef.current?.role === "client") {
      netRef.current.leaveRoom();
    }
    const id = `solo_${act.nickname.toLowerCase().replace(/[^a-z0-9]/g, "")}_${Date.now().toString(36)}`;
    soloIdRef.current = id;
    const player: LobbyPlayer = {
      id,
      nickname: act.nickname,
      gender: act.gender,
      customization: act.customization,
      team: "alpha",
      ready: true,
      host: true,
    };
    setMatchChat([
      systemMessage(
        "SITE TRAINING · One operator against a site bot. Learn the tower, then take it online.",
      ),
    ]);
    setResults(null);
    setHud(null);
    setWorldInfo(null);
    setMatchStart({
      matchId: `training_${Date.now().toString(36)}`,
      mode: "training",
      hostId: "solo",
      players: [player],
      settings: { difficulty: "normal", botCount: 1, timeLimitSec: 12 * 60 },
      startAt: Date.now(),
    });
    setScreen("game");
    setSettingsOpen(false);
  }, [ensureAudio]);

  const openBrowser = useCallback(
    (mode?: GameMode) => {
      ensureAudio().click();
      setBrowserMode(mode);
      setScreen("browser");
      netRef.current?.refresh();
    },
    [ensureAudio],
  );

  const createRoom = useCallback(
    (config: { mode: GameMode; settings: MatchSettings }) => {
      const act = accountRef.current;
      const net = netRef.current;
      if (!act || !net) {
        showNotice("Network is still starting. Try again in a moment.");
        return;
      }
      ensureAudio().click();
      setRoom(null);
      setRoomChat([]);
      setLobbyStatus("Opening site…");
      net.hostRoom({
        profile: makeProfile(),
        mode: config.mode,
        settings: config.settings,
        hostName: `${act.nickname}'s site`,
      });
      setScreen("lobby");
    },
    [ensureAudio, makeProfile, showNotice],
  );

  const joinRoom = useCallback(
    (hostId: string) => {
      const act = accountRef.current;
      const net = netRef.current;
      if (!act || !net) return;
      ensureAudio().click();
      setRoom(null);
      setRoomChat([]);
      setLobbyStatus("Connecting…");
      net.joinRoom(hostId, makeProfile());
      setScreen("lobby");
    },
    [ensureAudio, makeProfile],
  );

  const leaveLobby = useCallback(() => {
    netRef.current?.leaveRoom();
    setRoom(null);
    setRoomChat([]);
    setLobbyStatus("");
    setScreen("menu");
  }, []);

  const startLobbyMatch = useCallback(() => {
    const net = netRef.current;
    if (!net) return;
    ensureAudio().click();
    setSettingsOpen(false);
    net.startMatch(`match_${Date.now().toString(36)}`);
  }, [ensureAudio]);

  const updateRoom = useCallback(
    (patch: { mode?: GameMode; settings?: Partial<MatchSettings> }) => {
      netRef.current?.updateRoomSettings(patch);
      netRef.current?.refresh();
    },
    [],
  );

  const leaveMatch = useCallback(() => {
    if (!window.confirm("Leave this match and return to the main menu?")) return;
    netRef.current?.leaveRoom();
    setSettingsOpen(false);
    setMatchStart(null);
    setResults(null);
    setHud(null);
    setWorldInfo(null);
    setMatchChat([]);
    setScreen("menu");
  }, []);

  const returnToLobby = useCallback(() => {
    if (netRef.current?.role === "host") netRef.current.returnToLobby();
    setResults(null);
    setMatchStart(null);
    setHud(null);
    setWorldInfo(null);
    setScreen(roomRef.current ? "lobby" : "menu");
  }, []);

  const rematch = useCallback(() => {
    const net = netRef.current;
    if (!net || net.role !== "host") return;
    ensureAudio().click();
    setResults(null);
    setHud(null);
    setWorldInfo(null);
    setSettingsOpen(false);
    net.startMatch(`match_${Date.now().toString(36)}`);
  }, [ensureAudio]);

  const menuFromResults = useCallback(() => {
    netRef.current?.leaveRoom();
    setResults(null);
    setMatchStart(null);
    setHud(null);
    setWorldInfo(null);
    setRoom(null);
    setMatchChat([]);
    setScreen("menu");
  }, []);

  const sendRoomChat = useCallback((text: string) => {
    const act = accountRef.current;
    if (!act) return;
    netRef.current?.sendChat(act.nickname, text);
  }, []);

  const sendMatchChat = useCallback((text: string) => {
    const act = accountRef.current;
    if (!act) return;
    if (matchStartRef.current?.hostId === "solo") {
      setMatchChat((prev) =>
        [...prev, { id: chatId(), sender: act.nickname, text }].slice(-80),
      );
      return;
    }
    netRef.current?.sendChat(act.nickname, text);
  }, []);

  const handleAuthenticated = useCallback(
    (nextAccount: Account, isNew: boolean) => {
      ensureAudio().click();
      setAccount(nextAccount);
      setFirstRun(isNew);
      setScreen(isNew ? "character" : "menu");
    },
    [ensureAudio],
  );

  const saveCharacter = useCallback((nextAccount: Account) => {
    updateAccount(nextAccount);
    setAccount(nextAccount);
    setFirstRun(false);
    setScreen("menu");
  }, []);

  const handleCustomize = useCallback(() => {
    ensureAudio().click();
    setFirstRun(false);
    setScreen("character");
  }, [ensureAudio]);

  const handleLogout = useCallback(() => {
    if (!window.confirm("Sign out of this operator on this device?")) return;
    netRef.current?.leaveRoom();
    logOut();
    setAccount(null);
    setRoom(null);
    setRoomChat([]);
    setMatchChat([]);
    setResults(null);
    setMatchStart(null);
    setHud(null);
    setScreen("auth");
    setSettingsOpen(false);
  }, []);

  const handleResume = useCallback(() => {
    ensureAudio();
    engineRef.current?.requestPointerLock();
  }, [ensureAudio]);

  const isHost = room ? room.hostId === peerId : false;
  const inMatch = screen === "game" || screen === "results";

  if (!booted) {
    return (
      <div className="boot-screen">
        <BrandMark />
        <div className="loader-ring" />
        <span>OPENING SITE 07</span>
      </div>
    );
  }

  return (
    <div className={`app-root${inMatch ? " in-match" : ""}`}>
      {screen === "auth" && <AuthScreen onAuthenticated={handleAuthenticated} />}

      {screen === "character" && account && (
        <CharacterStudio
          account={account}
          firstRun={firstRun}
          onSave={saveCharacter}
          onBack={() => setScreen("menu")}
        />
      )}

      {screen === "menu" && account && (
        <MainMenu
          account={account}
          servers={servers}
          onDeploy={openBrowser}
          onTraining={startTraining}
          onCustomize={handleCustomize}
          onSettings={() => {
            setSettingsOpen(true);
            ensureAudio().click();
          }}
          onLogout={handleLogout}
        />
      )}

      {screen === "browser" && account && (
        <MatchBrowser
          servers={servers}
          peerId={peerId}
          initialMode={browserMode}
          onBack={() => setScreen("menu")}
          onRefresh={() => netRef.current?.refresh()}
          onJoin={joinRoom}
          onCreate={createRoom}
        />
      )}

      {screen === "lobby" && account && (
        <LobbyScreen
          room={room}
          profileId={peerId}
          isHost={isHost}
          status={lobbyStatus}
          chat={roomChat}
          onStart={startLobbyMatch}
          onLeave={leaveLobby}
          onUpdate={updateRoom}
          onSendChat={sendRoomChat}
        />
      )}

      {screen === "game" && account && (
        <div className="game-stage">
          <div ref={gameHostRef} className="game-canvas-host" />
          {hud && (
            <MatchHud
              hud={hud}
              world={worldInfo}
              chat={matchChat}
              onResume={handleResume}
              onSettings={() => setSettingsOpen(true)}
              onSendChat={sendMatchChat}
            />
          )}
          {!hud && (
            <div className="game-loading">
              <div className="loader-ring" />
              <span>BUILDING SITE 07</span>
            </div>
          )}
        </div>
      )}

      {screen === "results" && account && results && (
        <ResultsScreen
          results={results}
          account={account}
          localId={
            matchStartRef.current?.hostId === "solo"
              ? soloIdRef.current
              : peerId
          }
          isHost={isHost}
          inRoom={!!room}
          onRematch={rematch}
          onLobby={returnToLobby}
          onMenu={menuFromResults}
        />
      )}

      <SettingsPanel
        open={settingsOpen}
        settings={settings}
        inMatch={inMatch}
        onChange={changeSettings}
        onClose={() => setSettingsOpen(false)}
        onLeaveMatch={screen === "game" ? leaveMatch : screen === "results" ? menuFromResults : undefined}
      />

      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      <div className="tiny-studio-mark" aria-hidden="true">
        {BBT.name} · {GAME.shortName}
      </div>
    </div>
  );
}
