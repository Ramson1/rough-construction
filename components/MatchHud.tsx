"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage, GameMode, TeamId } from "@/lib/types";
import { GAME_MODES } from "@/lib/types";
import type { HudState, MinimapPlayer, WorldInfo } from "@/lib/game/engineTypes";
import { TEAM_COLORS, TEAM_NAMES } from "@/lib/game/engine";
import type { MinimapFloor } from "@/lib/game/world";

const MODE_SHORT: Record<GameMode, string> = {
  training: "SITE TRAINING",
  duel: "DUEL",
  lonewolf: "LONE WOLF",
  team: "TEAM BATTLE",
};

const CONTROL_HINTS: Array<[string, string]> = [
  ["W A S D", "Move"],
  ["SHIFT", "Sprint"],
  ["SPACE", "Jump"],
  ["CTRL / C", "Crouch"],
  ["MOUSE", "Look / aim"],
  ["LEFT CLICK", "Fire"],
  ["RIGHT CLICK", "Aim down sights"],
  ["R", "Reload"],
  ["1 2 3", "Weapons"],
  ["V", "Camera view"],
  ["TAB", "Scoreboard"],
  ["ENTER", "Team chat"],
  ["ESC", "Pause / settings"],
  ["H / F1", "Toggle this card"],
];

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function playerMapX(x: number): number {
  return 50 + (x / 54) * 100;
}

function playerMapZ(z: number): number {
  return 50 + (z / 54) * 100;
}

function MiniMap({
  world,
  hud,
}: {
  world: WorldInfo | null;
  hud: HudState;
}) {
  if (!world) {
    return (
      <div className="minimap minimap-empty">
        <span>SITE MAP LOADING</span>
      </div>
    );
  }
  const floor: MinimapFloor | undefined =
    world.minimap.find((entry) => entry.level === hud.level) || world.minimap[0];
  if (!floor) return <div className="minimap minimap-empty"><span>NO MAP</span></div>;

  const visiblePlayers = hud.players.filter((player) => player.alive);
  return (
    <div className="minimap">
      <div className="minimap-head">
        <span>{hud.levelName.toUpperCase()}</span>
        <strong>LVL {String(hud.level).padStart(2, "0")}</strong>
      </div>
      <svg viewBox="0 0 100 100" className="minimap-svg" role="img" aria-label="Site minimap">
        <defs>
          <pattern id="mm-grid" width="8" height="8" patternUnits="userSpaceOnUse">
            <path d="M 8 0 L 0 0 0 8" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.35" />
          </pattern>
          <filter id="mm-glow">
            <feGaussianBlur stdDeviation="1.1" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect x="0" y="0" width="100" height="100" fill="#0d1218" />
        <rect x="0" y="0" width="100" height="100" fill="url(#mm-grid)" />
        {floor.rects.map((rect, index) => {
          const x = playerMapX(rect.minX);
          const y = playerMapZ(rect.minZ);
          const width = playerMapX(rect.maxX) - x;
          const height = playerMapZ(rect.maxZ) - y;
          const fill =
            rect.kind === "wall"
              ? "#5b6470"
              : rect.kind === "cover"
                ? "#8a6a3a"
                : rect.kind === "rail"
                  ? "#8e5a2c"
                  : "#2a333d";
          return (
            <rect
              key={index}
              x={x}
              y={y}
              width={Math.max(0.5, width)}
              height={Math.max(0.5, height)}
              fill={fill}
              opacity={rect.kind === "floor" ? 0.28 : 0.9}
              rx={rect.kind === "cover" ? 0.5 : 0}
            />
          );
        })}
        {floor.hole && (
          <rect
            x={playerMapX(floor.hole.minX)}
            y={playerMapZ(floor.hole.minZ)}
            width={playerMapX(floor.hole.maxX) - playerMapX(floor.hole.minX)}
            height={playerMapZ(floor.hole.maxZ) - playerMapZ(floor.hole.minZ)}
            fill="#080b0e"
            stroke="rgba(255,197,30,0.35)"
            strokeWidth="0.4"
          />
        )}
        {floor.connectors.map((connector, index) => (
          <circle
            key={`connector_${index}`}
            cx={playerMapX(connector.x)}
            cy={playerMapZ(connector.z)}
            r="1.1"
            fill="none"
            stroke="#ffb51e"
            strokeWidth="0.5"
            opacity="0.65"
          />
        ))}
        {visiblePlayers
          .filter((player) => player.level !== hud.level)
          .map((player) => (
            <circle
              key={`other_${player.id}`}
              cx={playerMapX(player.x)}
              cy={playerMapZ(player.z)}
              r="1"
              fill={TEAM_COLORS[player.team]}
              opacity="0.28"
            />
          ))}
        {visiblePlayers
          .filter((player) => player.level === hud.level)
          .map((player) => (
            <PlayerBlip key={player.id} player={player} hud={hud} />
          ))}
        <line x1="50" y1="4" x2="50" y2="9" stroke="#ffb51e" strokeWidth="0.6" opacity="0.6" />
        <text x="53" y="9" fill="#ffb51e" fontSize="3" opacity="0.7">N</text>
      </svg>
      <div className="minimap-legend">
        <span><i style={{ background: TEAM_COLORS[hud.localTeam] }} /> YOUR CREW</span>
        <span><i className="enemy" /> RIVALS</span>
        <span><i className="other-floor" /> OTHER FLOOR</span>
      </div>
    </div>
  );
}

function PlayerBlip({ player, hud }: { player: MinimapPlayer; hud: HudState }) {
  const sameTeam = player.team === hud.localTeam;
  const color = player.isLocal
    ? "#ffffff"
    : sameTeam
      ? TEAM_COLORS[player.team]
      : "#ff5b48";
  const x = playerMapX(player.x);
  const y = playerMapZ(player.z);
  const degrees = (player.yaw * 180) / Math.PI;
  return (
    <g transform={`translate(${x} ${y})`} filter={player.isLocal ? "url(#mm-glow)" : undefined}>
      {player.isLocal && <circle r="2.5" fill="none" stroke="#ffffff" strokeWidth="0.5" opacity="0.8" />}
      <g transform={`rotate(${degrees})`}>
        <path d="M 0 1.9 L -1.45 -1.4 L 0 -0.75 L 1.45 -1.4 Z" fill={color} />
      </g>
    </g>
  );
}

function TeamScoreStrip({ hud }: { hud: HudState }) {
  const showSolo = hud.mode === "lonewolf";
  const leftLabel = showSolo ? "WOLF" : "ALPHA";
  const rightLabel = showSolo ? "HUNTERS" : "BRAVO";
  const left = showSolo ? hud.teamScores.solo : hud.teamScores.alpha;
  const right = showSolo ? hud.teamScores.bravo : hud.teamScores.bravo;
  return (
    <div className="team-score-strip">
      <div style={{ ["--team" as string]: showSolo ? TEAM_COLORS.solo : TEAM_COLORS.alpha }}>
        <span>{leftLabel}</span>
        <strong>{left}</strong>
      </div>
      <em>POINTS</em>
      <div style={{ ["--team" as string]: TEAM_COLORS.bravo }}>
        <span>{rightLabel}</span>
        <strong>{right}</strong>
      </div>
    </div>
  );
}

function WeaponSlot({
  index,
  label,
  active,
  ammo,
}: {
  index: number;
  label: string;
  active: boolean;
  ammo?: string;
}) {
  return (
    <div className={`weapon-slot${active ? " active" : ""}`}>
      <span>{index}</span>
      <div>
        <strong>{label}</strong>
        {ammo && <small>{ammo}</small>}
      </div>
    </div>
  );
}

export default function MatchHud({
  hud,
  world,
  chat,
  onResume,
  onSettings,
  onSendChat,
}: {
  hud: HudState;
  world: WorldInfo | null;
  chat: ChatMessage[];
  onResume: () => void;
  onSettings: () => void;
  onSendChat: (text: string) => void;
}) {
  const [chatText, setChatText] = useState("");
  const [chatFocus, setChatFocus] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [hudHidden, setHudHidden] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const mode = GAME_MODES.find((entry) => entry.id === hud.mode);
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  const recentHit = now - hud.hitMarkerAt < 220;
  const recentDamage = now - hud.damageFlashAt < 420;
  const lowHealth = hud.alive && hud.health <= 30;
  const phaseCountdown = hud.phase === "countdown" && hud.countdown > 0;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [chat.length, chatFocus]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (event.code === "Escape") {
        setControlsOpen(false);
        return;
      }
      if (event.code !== "KeyH" && event.code !== "F1" && event.code !== "F2") return;
      event.preventDefault();
      if (event.code === "F2") {
        setHudHidden((open) => !open);
      } else {
        setControlsOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function sendChat(event: React.FormEvent) {
    event.preventDefault();
    if (!chatText.trim()) return;
    onSendChat(chatText);
    setChatText("");
  }

  return (
    <div className={`match-hud${recentDamage ? " damaged" : ""}${lowHealth ? " low-health" : ""}${hudHidden ? " hud-hidden" : ""}`}>
      <div className="match-vignette" aria-hidden="true" />
      <div className="damage-flash" aria-hidden="true" />

      <header className="match-topbar">
        <div className="match-topbar-left">
          <img
            src="/rough-construction-32.png"
            alt="Rough Construction"
            width={32}
            height={32}
            style={{ marginRight: '8px', display: 'block' }}
          />
          <span className="match-mode">{MODE_SHORT[hud.mode]}</span>
          <span className="match-role">
            {hud.role === "host" ? "HOST" : hud.role === "client" ? "P2P" : "SOLO"}
          </span>
          <span className="match-floor">{hud.levelName.toUpperCase()}</span>
        </div>
        <div className="match-clock">
          <span>{phaseCountdown ? "DEPLOYING" : hud.phase === "ended" ? "COMPLETE" : "SITE TIME"}</span>
          <strong>{formatTime(hud.timeLeft)}</strong>
        </div>
        <div className="match-topbar-right">
          <button
            type="button"
            className={`hud-icon-btn hud-controls-chip${controlsOpen ? " active" : ""}`}
            onClick={() => setControlsOpen((open) => !open)}
            title="Controls (H)"
            aria-expanded={controlsOpen}
          >
            H · CONTROLS
          </button>
          {isMobile && (
            <div className="mobile-joystick-panel">
              <div className="joystick-container joystick-left">
                <div className="joystick-base">
                  <div className="joystick-head" id="joystick-left-base" />
                </div>
              </div>
              <div className="joystick-container joystick-right">
                <div className="joystick-base">
                  <div className="joystick-head" id="joystick-right-aim" />
                </div>
              </div>
            </div>
          )}
          <span className="match-fps">{hud.fps} FPS</span>
          <button
            type="button"
            className={`hud-icon-btn hud-controls-chip${controlsOpen ? " active" : ""}`}
            onClick={() => setControlsOpen((open) => !open)}
            title="Controls (H)"
            aria-expanded={controlsOpen}
          >
            H · CONTROLS
          </button>
          <span className="match-fps">{hud.fps} FPS</span>
          <button type="button" className="hud-icon-btn" onClick={onSettings} title="Settings">
            ⚙
          </button>
        </div>
      </header>

      <div className="hud-left-rail">
        <MiniMap world={world} hud={hud} />
        <TeamScoreStrip hud={hud} />
      </div>

      <div className="hud-killfeed">
        {hud.killFeed.slice(-5).map((entry) => (
          <div key={entry.id} className={`killfeed-row${entry.environment ? " environmental" : ""}`}>
            <strong>{entry.killerName}</strong>
            <span className="killfeed-weapon">
              {entry.weapon === "fall" ? "⚠" : entry.weapon === "knife" ? "⌁" : "▸"}
              {entry.headshot ? " HS" : ""}
            </span>
            <strong>{entry.victimName}</strong>
            {entry.points > 0 && <em>+{entry.points}</em>}
          </div>
        ))}
      </div>

      <div className="crosshair" aria-hidden="true">
        <i className="ch-top" />
        <i className="ch-right" />
        <i className="ch-bottom" />
        <i className="ch-left" />
        <span />
      </div>
      {recentHit && <div key={hud.hitMarkerAt} className="hit-marker" aria-hidden="true">×</div>}

      <section className="hud-status">
        <div className="health-block">
          <div className="health-top">
            <span>VITALS</span>
            <strong>{hud.health}<em>/ {hud.maxHealth}</em></strong>
          </div>
          <div className="health-track">
            <div
              className="health-fill"
              style={{ width: `${Math.max(0, Math.min(100, (hud.health / hud.maxHealth) * 100))}%` }}
            />
          </div>
          <div className="status-chips">
            {hud.crouching && <span>CROUCHED</span>}
            {hud.sprinting && <span>SPRINT</span>}
            {hud.spawnProtect > 0 && <span className="safe">SPAWN SHIELD {Math.ceil(hud.spawnProtect)}</span>}
            {hud.eliminated && <span className="danger">ELIMINATED</span>}
          </div>
        </div>
        <div className="point-block">
          <span>POINT POOL</span>
          <strong>{hud.points}</strong>
          <small>{hud.points <= 3 ? "LAST LIVES · ONE KILL = ONE POINT" : "POINTS ACT AS LIVES"}</small>
        </div>
      </section>

      <section className="hud-weapons">
        <div className="ammo-readout">
          <span>{hud.weapon === "knife" ? "MELEE" : "AMMUNITION"}</span>
          {hud.weapon === "knife" ? (
            <strong className="melee">∞</strong>
          ) : (
            <strong>
              {hud.ammoMag}
              <em>/ {hud.ammoReserve}</em>
            </strong>
          )}
        </div>
        {hud.reloading && (
          <div className="reload-row">
            <span>RELOADING</span>
            <div><i style={{ width: `${Math.round(hud.reloadProgress * 100)}%` }} /></div>
          </div>
        )}
        <div className="weapon-slots">
          <WeaponSlot index={1} label="RC-4" active={hud.weapon === "rifle"} />
          <WeaponSlot index={2} label="SIDEARM" active={hud.weapon === "pistol"} />
          <WeaponSlot index={3} label="KNIFE" active={hud.weapon === "knife"} />
        </div>
      </section>

      <div className="hud-chat">
        <div className="hud-chat-log">
          {chat.slice(-5).map((message) => (
            <div key={message.id} className={message.system ? "system" : ""}>
              <strong>{message.sender}</strong>
              <span>{message.text}</span>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <form className={`hud-chat-form${chatFocus ? " focused" : ""}`} onSubmit={sendChat}>
          <span>ENTER</span>
          <input
            id="match-chat-input"
            value={chatText}
            onChange={(event) => setChatText(event.target.value)}
            onFocus={() => setChatFocus(true)}
            onBlur={() => setChatFocus(false)}
            placeholder="Team radio…"
            maxLength={120}
          />
        </form>
      </div>

      <div className="hud-cutcorners" aria-hidden="true" />

      {phaseCountdown && (
        <div className="countdown-overlay">
          <span className="eyebrow">SITE 07 · DEPLOYMENT</span>
          <strong>{hud.countdown}</strong>
          <p>{mode?.name} · {mode?.tagline}</p>
          <em>10 points each. Every kill moves one point. Zero points and you are out.</em>
        </div>
      )}

      {!hud.alive && hud.phase === "live" && (
        <div className="respawn-overlay">
          <span className="eyebrow">{hud.eliminated ? "CONTRACT TERMINATED" : "OPERATOR DOWN"}</span>
          <h2>{hud.eliminated ? "OUT OF POINTS" : `RESPAWN IN ${hud.respawnIn}`}</h2>
          <p>
            {hud.eliminated
              ? "Your point pool is empty. You are spectating the rest of the match."
              : `${hud.points} point${hud.points === 1 ? "" : "s"} left. You redeploy with a full carbine.`}
          </p>
          {hud.spectating && <span className="spectating">SPECTATING · {hud.spectating}</span>}
        </div>
      )}

      {hud.phase !== "ended" && !hud.lookActive && hud.alive && !controlsOpen && (
        <div className="engage-overlay" onClick={onResume}>
          <span className="eyebrow">MOUSE CAPTURE RELEASED</span>
          <strong>CLICK TO ENGAGE</strong>
          <p>WASD move · Mouse aim · LMB fire · Esc pause</p>
        </div>
      )}

      {controlsOpen && (
        <div className="controls-overlay" onClick={() => setControlsOpen(false)}>
          <div
            className="controls-card panel"
            role="dialog"
            aria-label="Controls"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="controls-head">
              <div>
                <span className="eyebrow">FIELD MANUAL</span>
                <h2>Controls</h2>
              </div>
              <button
                type="button"
                className="hud-icon-btn"
                onClick={() => setControlsOpen(false)}
                title="Close (H)"
              >
                ✕
              </button>
            </div>
            <div className="controls-grid">
              {CONTROL_HINTS.map(([keys, action]) => (
                <span key={keys}>
                  <kbd>{keys}</kbd>
                  <em>{action}</em>
                </span>
              ))}
            </div>
            <p className="controls-foot">
              Press <kbd>H</kbd> or <kbd>F1</kbd> at any time to toggle this card.
            </p>
          </div>
        </div>
      )}

      {hud.scoreboardOpen && (
        <div className="scoreboard-overlay">
          <div className="scoreboard panel">
            <div className="scoreboard-head">
              <div>
                <span className="eyebrow">{mode?.name.toUpperCase()} · LIVE MANIFEST</span>
                <h2>Scoreboard</h2>
              </div>
              <div className="scoreboard-teams">
                <span style={{ color: TEAM_COLORS.alpha }}>ALPHA {hud.teamScores.alpha}</span>
                <span style={{ color: TEAM_COLORS.bravo }}>BRAVO {hud.teamScores.bravo}</span>
                {hud.teamScores.solo > 0 && <span style={{ color: TEAM_COLORS.solo }}>WOLF {hud.teamScores.solo}</span>}
              </div>
            </div>
            <div className="scoreboard-table">
              <div className="scoreboard-row head">
                <span>OPERATOR</span>
                <span>CREW</span>
                <span>PTS</span>
                <span>K</span>
                <span>D</span>
                <span>VITALS</span>
                <span>STATUS</span>
              </div>
              {hud.scoreboard.map((row) => (
                <div
                  key={row.id}
                  className={`scoreboard-row${row.isLocal ? " local" : ""}${row.points <= 0 ? " out" : ""}`}
                >
                  <span>
                    {row.nickname}
                    {row.isBot && <em>BOT</em>}
                    {row.isLocal && <em>YOU</em>}
                  </span>
                  <span style={{ color: TEAM_COLORS[row.team] }}>{TEAM_NAMES[row.team]}</span>
                  <strong>{row.points}</strong>
                  <span>{row.kills}</span>
                  <span>{row.deaths}</span>
                  <span>{row.health}</span>
                  <span className={row.alive ? "up" : "down"}>
                    {row.points <= 0 ? "OUT" : row.alive ? "LIVE" : "DOWN"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
