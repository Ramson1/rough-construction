"use client";

import { useMemo, useState } from "react";
import { BBT } from "@/lib/brand";
import {
  GAME_MODES,
  type BotDifficulty,
  type GameMode,
  type MatchSettings,
  type ServerInfo,
} from "@/lib/types";
import { roomCodeOf } from "@/lib/net/multiplayer";
import { BrandMark, StudioFooter } from "./BrandMark";

const ONLINE_MODES = GAME_MODES.filter((mode) => mode.online);
const MODE_LABEL: Record<GameMode, string> = {
  training: "TRAINING",
  duel: "DUEL",
  lonewolf: "LONE WOLF",
  team: "TEAM BATTLE",
};

export default function MatchBrowser({
  servers,
  peerId,
  initialMode,
  onBack,
  onRefresh,
  onJoin,
  onCreate,
}: {
  servers: ServerInfo[];
  peerId: string;
  initialMode?: GameMode;
  onBack: () => void;
  onRefresh: () => void;
  onJoin: (hostId: string) => void;
  onCreate: (config: { mode: GameMode; settings: MatchSettings }) => void;
}) {
  const [mode, setMode] = useState<GameMode>(
    initialMode && initialMode !== "training" ? initialMode : "team",
  );
  const [filter, setFilter] = useState<"all" | GameMode>("all");
  const [joinCode, setJoinCode] = useState("");
  const [botCount, setBotCount] = useState(0);
  const [difficulty, setDifficulty] = useState<BotDifficulty>("normal");
  const [timeLimit, setTimeLimit] = useState(12 * 60);
  const [createOpen, setCreateOpen] = useState(true);

  const filtered = useMemo(() => {
    const list =
      filter === "all" ? servers : servers.filter((server) => server.mode === filter);
    return list.filter((server) => server.hostId !== peerId);
  }, [servers, filter, peerId]);

  const modeInfo = ONLINE_MODES.find((entry) => entry.id === mode) || ONLINE_MODES[0];

  function submitCreate() {
    onCreate({
      mode,
      settings: { difficulty, botCount, timeLimitSec: timeLimit },
    });
  }

  function submitCode(event: React.FormEvent) {
    event.preventDefault();
    if (joinCode.trim()) onJoin(joinCode);
  }

  return (
    <div className="screen browser-screen">
      <header className="site-header">
        <BrandMark />
        <div className="site-header-title">
          <span>MULTIPLAYER</span>
          <strong>SITE BROWSER</strong>
        </div>
        <div className="site-header-actions">
          <button type="button" className="btn btn-ghost" onClick={onRefresh}>
            ↻ REFRESH
          </button>
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            ← MAIN MENU
          </button>
        </div>
      </header>

      <main className="browser-main">
        <section className="browser-list-pane">
          <div className="browser-head">
            <div>
              <span className="eyebrow">OPEN CONSTRUCTION SITES</span>
              <h1>Find a crew</h1>
            </div>
            <div className="browser-count">
              <strong>{filtered.length}</strong>
              <span>ROOMS FOUND</span>
            </div>
          </div>

          <div className="mode-filter-row">
            <button
              type="button"
              className={filter === "all" ? "active" : ""}
              onClick={() => setFilter("all")}
            >
              ALL
            </button>
            {ONLINE_MODES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={filter === entry.id ? "active" : ""}
                onClick={() => setFilter(entry.id)}
              >
                {MODE_LABEL[entry.id]}
              </button>
            ))}
          </div>

          <div className="server-list">
            {filtered.length === 0 && (
              <div className="server-empty panel">
                <span className="eyebrow">NO SITES ON THE BOARD</span>
                <h3>Be the first crew on the tower.</h3>
                <p>
                  Open a room and share its code, or ask another operator for their
                  code and join directly.
                </p>
                <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
                  OPEN A SITE
                </button>
              </div>
            )}
            {filtered.map((server) => {
              const full = server.players >= server.maxPlayers;
              const joinable = server.status === "lobby" && !full;
              return (
                <article key={server.hostId} className={`server-row server-${server.mode}`}>
                  <div className="server-mode-block">
                    <span>{MODE_LABEL[server.mode]}</span>
                    <strong>{roomCodeOf(server.hostId)}</strong>
                  </div>
                  <div className="server-main">
                    <div className="server-name-row">
                      <strong>{server.hostName}</strong>
                      <span className={`server-status ${server.status}`}>
                        {server.status === "lobby" ? "IN LOBBY" : "IN MATCH"}
                      </span>
                    </div>
                    <div className="server-meta-row">
                      <span>{server.players}/{server.maxPlayers} OPERATORS</span>
                      <span className="server-source">{server.source?.toUpperCase() || "P2P"}</span>
                      <span>{server.mode === "duel" ? "1 V 1" : server.mode === "lonewolf" ? "1 V HUNTERS" : "N V N"}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`btn ${joinable ? "btn-primary" : "btn-disabled"}`}
                    disabled={!joinable}
                    onClick={() => onJoin(server.hostId)}
                  >
                    {full ? "FULL" : server.status === "playing" ? "LOCKED" : "JOIN →"}
                  </button>
                </article>
              );
            })}
          </div>

          <div className="join-code-strip panel">
            <div>
              <span className="eyebrow">PRIVATE SITE CODE</span>
              <strong>Got a room code from a friend?</strong>
            </div>
            <form onSubmit={submitCode} className="join-code-form">
              <input
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                placeholder="ABC1234"
                maxLength={12}
                spellCheck={false}
                aria-label="Room code"
              />
              <button type="submit" className="btn btn-secondary">
                JOIN SITE
              </button>
            </form>
          </div>

          <div className="browser-note">
            <span>P2P LINK</span>
            <code>{peerId || "CONNECTING…"}</code>
            <em>PeerJS room codes work across the internet. Same-browser tabs also discover each other instantly.</em>
          </div>
        </section>

        <aside className={`browser-create panel${createOpen ? " open" : ""}`}>
          <div className="browser-create-head">
            <span className="eyebrow">HOST CONTROLS</span>
            <h2>Open a site</h2>
            <p>You become the host and referee. Your browser keeps the score.</p>
          </div>

          <div className="field">
            <span>MODE</span>
            <div className="create-mode-grid">
              {ONLINE_MODES.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={`create-mode${mode === entry.id ? " active" : ""}`}
                  onClick={() => setMode(entry.id)}
                >
                  <strong>{entry.name}</strong>
                  <small>{entry.tagline}</small>
                </button>
              ))}
            </div>
            <small className="field-help">{modeInfo.description}</small>
          </div>

          <div className="field">
            <span>FILL WITH SITE BOTS</span>
            <div className="range-row">
              <input
                type="range"
                min={0}
                max={mode === "duel" ? 1 : 5}
                value={botCount}
                onChange={(event) => setBotCount(Number(event.target.value))}
              />
              <strong>{botCount}</strong>
            </div>
            <small className="field-help">
              Bots are spawned by the host. Lone Wolf bots join the hunter crew.
            </small>
          </div>

          <div className="field">
            <span>BOT DIFFICULTY</span>
            <div className="segmented">
              {(["easy", "normal", "hard"] as BotDifficulty[]).map((entry) => (
                <button
                  key={entry}
                  type="button"
                  className={difficulty === entry ? "active" : ""}
                  onClick={() => setDifficulty(entry)}
                >
                  {entry.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span>MATCH LENGTH</span>
            <select
              value={timeLimit}
              onChange={(event) => setTimeLimit(Number(event.target.value))}
            >
              <option value={8 * 60}>8 MINUTES</option>
              <option value={12 * 60}>12 MINUTES</option>
              <option value={20 * 60}>20 MINUTES</option>
            </select>
          </div>

          <div className="site-rules">
            <span>10 POINTS PER OPERATOR</span>
            <span>LAST CREW STANDING</span>
            <span>FRIENDLY FIRE OFF</span>
          </div>

          <button type="button" className="btn btn-primary btn-block" onClick={submitCreate}>
            OPEN SITE & GET CODE →
          </button>
          <p className="browser-create-fine">
            {BBT.name} peer-to-peer room. No account data leaves this device.
          </p>
        </aside>
      </main>

      <StudioFooter />
    </div>
  );
}
