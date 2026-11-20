"use client";

import { useMemo } from "react";
import { BBT, GAME } from "@/lib/brand";
import { GAME_MODES, type Account, type GameMode, type ServerInfo } from "@/lib/types";
import { generateAvatarHeadshotUrl } from "@/lib/game/avatars";
import { BrandMark, GameWordmark, StudioFooter } from "./BrandMark";

const MODE_ACCENTS: Record<GameMode, string> = {
  training: "#78dba4",
  duel: "#ff7a1a",
  lonewolf: "#ffc21c",
  team: "#4aa9ff",
};

export default function MainMenu({
  account,
  servers,
  onDeploy,
  onTraining,
  onCustomize,
  onSettings,
  onLogout,
}: {
  account: Account;
  servers: ServerInfo[];
  onDeploy: (mode?: GameMode) => void;
  onTraining: () => void;
  onCustomize: () => void;
  onSettings: () => void;
  onLogout: () => void;
}) {
  const headshot = useMemo(
    () => generateAvatarHeadshotUrl(account.customization),
    [account.customization],
  );
  const onlinePlayers = servers.reduce((sum, server) => sum + server.players, 0);
  const openRooms = servers.filter((server) => server.status === "lobby").length;
  const winRate =
    account.stats.matches > 0
      ? Math.round((account.stats.wins / account.stats.matches) * 100)
      : 0;

  return (
    <div className="screen menu-screen">
      <div className="menu-grid-bg" aria-hidden="true" />
      <header className="site-header menu-header">
        <BrandMark />
        <div className="menu-header-live">
          <span className="live-dot" />
          <span>{openRooms} OPEN SITE{openRooms === 1 ? "" : "S"}</span>
          <span className="menu-header-divider" />
          <span>{onlinePlayers} OPERATOR{onlinePlayers === 1 ? "" : "S"} ONLINE</span>
        </div>
        <div className="menu-header-actions">
          <button type="button" className="icon-btn" onClick={onSettings} title="Settings">
            ⚙
          </button>
          <button type="button" className="icon-btn" onClick={onLogout} title="Sign out">
            ⏏
          </button>
        </div>
      </header>

      <main className="menu-main">
        <section className="menu-hero">
          <GameWordmark />
          <p>
            {GAME.description}
          </p>
          <div className="menu-hero-actions">
            <button className="btn btn-primary btn-xl" onClick={() => onDeploy()}>
              DEPLOY ONLINE <span>→</span>
            </button>
            <button className="btn btn-secondary btn-xl" onClick={onTraining}>
              SITE TRAINING
            </button>
          </div>
          <div className="menu-rule-strip">
            <span><b>10</b> POINTS START</span>
            <span><b>1</b> POINT PER KILL</span>
            <span><b>0</b> POINTS = OUT</span>
            <span><b>01</b> CREW STANDING</span>
          </div>
        </section>

        <aside className="operator-card panel">
          <div className="operator-card-banner">SITE PASS · TOWER 07</div>
          <div className="operator-card-body">
            <div
              className="operator-headshot"
              style={headshot ? { backgroundImage: `url(${headshot})` } : undefined}
            >
              {!headshot && <span>{account.nickname.slice(0, 2).toUpperCase()}</span>}
            </div>
            <div className="operator-identity">
              <span className="eyebrow">ACTIVE OPERATOR</span>
              <h2>{account.nickname}</h2>
              <span className="operator-role">
                {account.customization.hat === "hardhat"
                  ? "HARD HAT CREW"
                  : account.customization.hat === "cap"
                    ? "SITE CREW"
                    : account.customization.hat === "beanie"
                      ? "NIGHT SHIFT"
                      : "CIVILIAN CONTRACTOR"}
              </span>
            </div>
            <button type="button" className="operator-edit" onClick={onCustomize}>
              EDIT OPERATOR
            </button>
          </div>
          <div className="operator-stats">
            <div><strong>{account.stats.matches}</strong><span>MATCHES</span></div>
            <div><strong>{account.stats.wins}</strong><span>WINS</span></div>
            <div><strong>{winRate}%</strong><span>WIN RATE</span></div>
            <div><strong>{account.stats.kills}</strong><span>ELIMS</span></div>
          </div>
          <div className="operator-best">
            <span>BEST SCORE</span>
            <strong>{account.stats.bestScore} PTS</strong>
          </div>
        </aside>
      </main>

      <section className="mode-section">
        <div className="mode-section-head">
          <div>
            <span className="eyebrow">CHOOSE YOUR CONTRACT</span>
            <h3>Deploy into the tower</h3>
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => onDeploy()}>
            BROWSE ALL SITES →
          </button>
        </div>
        <div className="mode-grid">
          {GAME_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={`mode-card${mode.id === "lonewolf" ? " featured" : ""}`}
              style={{ ["--mode-accent" as string]: MODE_ACCENTS[mode.id] }}
              onClick={() => (mode.id === "training" ? onTraining() : onDeploy(mode.id))}
            >
              <div className="mode-card-top">
                <span className="mode-code">{mode.tagline}</span>
                {mode.online ? (
                  <span className="mode-badge">ONLINE</span>
                ) : (
                  <span className="mode-badge offline">OFFLINE</span>
                )}
              </div>
              <strong>{mode.name}</strong>
              <p>{mode.description}</p>
              <span className="mode-card-cta">
                {mode.id === "training" ? "START TRAINING" : "FIND A SITE"} →
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="menu-bottom">
        <div className="menu-systems">
          <span><i /> PEER-TO-PEER READY</span>
          <span><i /> HOST-AUTHORITATIVE SCORING</span>
          <span><i /> {BBT.name.toUpperCase()} NETWORK</span>
        </div>
        <StudioFooter />
      </div>
    </div>
  );
}
