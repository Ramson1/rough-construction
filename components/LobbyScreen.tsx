"use client";

import { useMemo, useState } from "react";
import {
  GAME_MODES,
  type BotDifficulty,
  type ChatMessage,
  type GameMode,
  type LobbyPlayer,
  type MatchSettings,
  type RoomState,
  type TeamId,
} from "@/lib/types";
import { generateAvatarHeadshotUrl } from "@/lib/game/avatars";
import { roomCodeOf } from "@/lib/net/multiplayer";
import { BrandMark, StudioFooter } from "./BrandMark";

const TEAM_LABEL: Record<TeamId, string> = {
  alpha: "ALPHA CREW",
  bravo: "BRAVO CREW",
  solo: "LONE WOLF",
  bots: "SITE BOTS",
};

const TEAM_COLOR: Record<TeamId, string> = {
  alpha: "#4aa9ff",
  bravo: "#ff6b4a",
  solo: "#ffc21c",
  bots: "#b98cff",
};

function LobbyPlayerRow({ player }: { player: LobbyPlayer }) {
  const headshot = useMemo(
    () => generateAvatarHeadshotUrl(player.customization),
    [player.customization],
  );
  return (
    <div className="lobby-player">
      <div
        className="lobby-player-avatar"
        style={headshot ? { backgroundImage: `url(${headshot})` } : undefined}
      >
        {!headshot && player.nickname.slice(0, 2).toUpperCase()}
      </div>
      <div className="lobby-player-copy">
        <strong>
          {player.nickname}
          {player.host && <span className="host-tag">HOST</span>}
        </strong>
        <span style={{ color: TEAM_COLOR[player.team] }}>{TEAM_LABEL[player.team]}</span>
      </div>
      <span className="ready-tag">READY</span>
    </div>
  );
}

export default function LobbyScreen({
  room,
  profileId,
  isHost,
  status,
  chat,
  onStart,
  onLeave,
  onUpdate,
  onSendChat,
}: {
  room: RoomState | null;
  profileId: string;
  isHost: boolean;
  status: string;
  chat: ChatMessage[];
  onStart: () => void;
  onLeave: () => void;
  onUpdate: (patch: { mode?: GameMode; settings?: Partial<MatchSettings> }) => void;
  onSendChat: (text: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [chatText, setChatText] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (!room) {
    return (
      <div className="screen lobby-screen lobby-loading">
        <div className="loader-ring" />
        <span className="eyebrow">CONNECTING TO SITE</span>
        <h1>{status || "Calling the host…"}</h1>
        <p>Building a peer-to-peer link. This usually takes a moment.</p>
        <button type="button" className="btn btn-ghost" onClick={onLeave}>
          CANCEL
        </button>
      </div>
    );
  }

  const modeInfo = GAME_MODES.find((entry) => entry.id === room.mode);
  const humans = room.players.length;
  const minimum = modeInfo?.minPlayers ?? 2;
  const enoughHumans = humans >= minimum || humans + room.settings.botCount >= minimum;
  const hasOpponent =
    room.mode === "duel"
      ? humans + room.settings.botCount >= 2
      : room.players.some((player) => player.id !== profileId) || room.settings.botCount > 0;
  const canStart = isHost && room.status === "lobby" && enoughHumans && hasOpponent;

  const teams: TeamId[] =
    room.mode === "lonewolf" ? ["solo", "bravo"] : ["alpha", "bravo"];

  async function copyCode() {
    const code = roomCodeOf(room.hostId);
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  function sendChat(event: React.FormEvent) {
    event.preventDefault();
    if (!chatText.trim()) return;
    onSendChat(chatText);
    setChatText("");
  }

  return (
    <div className="screen lobby-screen">
      <header className="site-header">
        <BrandMark />
        <div className="site-header-title">
          <span>{modeInfo?.name.toUpperCase() || "ROOM"} · {modeInfo?.tagline}</span>
          <strong>SITE LOBBY</strong>
        </div>
        <button type="button" className="btn btn-ghost" onClick={onLeave}>
          ← LEAVE SITE
        </button>
      </header>

      <main className="lobby-main">
        <section className="lobby-roster panel">
          <div className="lobby-roster-head">
            <div>
              <span className="eyebrow">CREW MANIFEST</span>
              <h1>{room.hostName}</h1>
            </div>
            <span className={`server-status ${room.status}`}>
              {room.status === "lobby" ? "WAITING" : "IN MATCH"}
            </span>
          </div>

          <div className="room-code-card">
            <div>
              <span>ROOM CODE</span>
              <strong>{roomCodeOf(room.hostId)}</strong>
            </div>
            <button type="button" className="btn btn-secondary" onClick={copyCode}>
              {copied ? "COPIED ✓" : "COPY CODE"}
            </button>
          </div>

          <div className="lobby-teams">
            {teams.map((team) => {
              const players = room.players.filter((player) => player.team === team);
              return (
                <div key={team} className="lobby-team" style={{ ["--team-color" as string]: TEAM_COLOR[team] }}>
                  <div className="lobby-team-head">
                    <span>{TEAM_LABEL[team]}</span>
                    <strong>{players.length}</strong>
                  </div>
                  <div className="lobby-team-list">
                    {players.length === 0 && (
                      <div className="lobby-empty-slot">AWAITING OPERATOR</div>
                    )}
                    {players.map((player) => (
                      <LobbyPlayerRow key={player.id} player={player} />
                    ))}
                    {Array.from({ length: Math.min(room.settings.botCount, 4) }).map((_, index) => (
                      <div key={`bot_${team}_${index}`} className="lobby-player lobby-bot">
                        <div className="lobby-player-avatar bot">AI</div>
                        <div className="lobby-player-copy">
                          <strong>SITE BOT {index + 1}</strong>
                          <span>{TEAM_LABEL[team]}</span>
                        </div>
                        <span className="ready-tag">{room.settings.difficulty.toUpperCase()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="lobby-foot-note">
            <span className="live-dot" />
            <span>
              {humans} OPERATOR{humans === 1 ? "" : "S"} + {room.settings.botCount} BOT{room.settings.botCount === 1 ? "" : "S"}
            </span>
            <span>·</span>
            <span>{room.settings.timeLimitSec / 60} MIN MATCH</span>
            <span>·</span>
            <span>P2P HOSTED BY {isHost ? "YOU" : room.hostName}</span>
          </div>
        </section>

        <aside className="lobby-side">
          <section className="lobby-match-card panel">
            <span className="eyebrow">MATCH CONTRACT</span>
            <h2>{modeInfo?.name}</h2>
            <p>{modeInfo?.description}</p>
            <div className="lobby-match-stats">
              <div><span>MODE</span><strong>{modeInfo?.tagline}</strong></div>
              <div><span>BOTS</span><strong>{room.settings.botCount} · {room.settings.difficulty.toUpperCase()}</strong></div>
              <div><span>LIMIT</span><strong>{room.settings.timeLimitSec / 60} MIN</strong></div>
              <div><span>RULESET</span><strong>10 PTS · LAST STANDING</strong></div>
            </div>

            {isHost ? (
              <>
                <button
                  type="button"
                  className="btn btn-ghost btn-block"
                  onClick={() => setSettingsOpen((open) => !open)}
                >
                  {settingsOpen ? "HIDE HOST SETTINGS" : "HOST SETTINGS"}
                </button>
                {settingsOpen && (
                  <div className="lobby-settings">
                    <div className="field">
                      <span>MODE</span>
                      <select
                        value={room.mode}
                        onChange={(event) => onUpdate({ mode: event.target.value as GameMode })}
                      >
                        {GAME_MODES.filter((entry) => entry.online).map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.name} ({entry.tagline})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <span>BOT FILL · {room.settings.botCount}</span>
                      <input
                        type="range"
                        min={0}
                        max={room.mode === "duel" ? 1 : 5}
                        value={room.settings.botCount}
                        onChange={(event) =>
                          onUpdate({ settings: { botCount: Number(event.target.value) } })
                        }
                      />
                    </div>
                    <div className="field">
                      <span>BOT DIFFICULTY</span>
                      <div className="segmented">
                        {(["easy", "normal", "hard"] as BotDifficulty[]).map((entry) => (
                          <button
                            key={entry}
                            type="button"
                            className={room.settings.difficulty === entry ? "active" : ""}
                            onClick={() => onUpdate({ settings: { difficulty: entry } })}
                          >
                            {entry.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="field">
                      <span>MATCH LENGTH</span>
                      <select
                        value={room.settings.timeLimitSec}
                        onChange={(event) =>
                          onUpdate({ settings: { timeLimitSec: Number(event.target.value) } })
                        }
                      >
                        <option value={8 * 60}>8 MINUTES</option>
                        <option value={12 * 60}>12 MINUTES</option>
                        <option value={20 * 60}>20 MINUTES</option>
                      </select>
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  className="btn btn-primary btn-block btn-xl"
                  disabled={!canStart}
                  onClick={onStart}
                >
                  START MATCH →
                </button>
                {!canStart && (
                  <p className="lobby-warning">
                    {humans + room.settings.botCount < minimum
                      ? `Need at least ${minimum} operators or bots for ${modeInfo?.name}.`
                      : "Waiting for the site to be ready."}
                  </p>
                )}
              </>
            ) : (
              <div className="lobby-waiting">
                <div className="loader-ring small" />
                <strong>WAITING FOR HOST</strong>
                <span>The host starts the match. Keep this tab open.</span>
              </div>
            )}
          </section>

          <section className="lobby-chat panel">
            <div className="lobby-chat-head">
              <span>CREW RADIO</span>
              <span>{chat.length}</span>
            </div>
            <div className="lobby-chat-log">
              {chat.length === 0 && (
                <p className="chat-empty">Radio silence. Say hello to the crew.</p>
              )}
              {chat.slice(-12).map((message) => (
                <div key={message.id} className={`chat-line${message.system ? " system" : ""}`}>
                  <strong>{message.sender}</strong>
                  <span>{message.text}</span>
                </div>
              ))}
            </div>
            <form className="lobby-chat-form" onSubmit={sendChat}>
              <input
                value={chatText}
                onChange={(event) => setChatText(event.target.value)}
                placeholder="Message crew…"
                maxLength={120}
              />
              <button type="submit" className="btn btn-secondary">SEND</button>
            </form>
          </section>
        </aside>
      </main>

      <StudioFooter />
    </div>
  );
}
