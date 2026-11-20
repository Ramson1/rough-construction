"use client";

import { GAME_MODES, type Account, type MatchResults, type TeamId } from "@/lib/types";
import { BBT } from "@/lib/brand";
import { BrandMark, StudioFooter } from "./BrandMark";

const TEAM_LABEL: Record<TeamId | "draw", string> = {
  alpha: "ALPHA CREW",
  bravo: "BRAVO CREW",
  solo: "LONE WOLF",
  bots: "SITE BOTS",
  draw: "DRAW",
};

const TEAM_COLOR: Record<TeamId | "draw", string> = {
  alpha: "#4aa9ff",
  bravo: "#ff6b4a",
  solo: "#ffc21c",
  bots: "#b98cff",
  draw: "#e8e4d8",
};

export default function ResultsScreen({
  results,
  account,
  localId,
  isHost,
  inRoom,
  onRematch,
  onLobby,
  onMenu,
}: {
  results: MatchResults;
  account: Account;
  localId: string;
  isHost: boolean;
  inRoom: boolean;
  onRematch: () => void;
  onLobby: () => void;
  onMenu: () => void;
}) {
  const mode = GAME_MODES.find((entry) => entry.id === results.mode);
  const local = results.players.find((player) => player.id === localId);
  const winnerLabel =
    results.winnerTeam === "draw" ? "DRAW" : TEAM_LABEL[results.winnerTeam];
  const localWon =
    results.winnerTeam !== "draw" && local ? local.team === results.winnerTeam : false;
  const outcome = results.winnerTeam === "draw" ? "DRAW" : localWon ? "VICTORY" : "DEFEAT";
  const sorted = [...results.players].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.kills !== a.kills) return b.kills - a.kills;
    return a.deaths - b.deaths;
  });
  const mvp = sorted[0];

  return (
    <div className={`screen results-screen outcome-${outcome.toLowerCase()}`}>
      <div className="results-grid-bg" aria-hidden="true" />
      <header className="site-header">
        <BrandMark />
        <div className="site-header-title">
          <span>{mode?.name.toUpperCase()} · MATCH COMPLETE</span>
          <strong>AFTER ACTION REPORT</strong>
        </div>
        <span className="results-stamp">{outcome}</span>
      </header>

      <main className="results-main">
        <section className="results-hero">
          <span className="eyebrow">TOWER 07 · SITE CLOSED</span>
          <h1>{outcome}</h1>
          <p>
            {results.winnerTeam === "draw"
              ? "The crews ran out of points at the same time. No winner on this site."
              : `${winnerLabel} holds the tower with the last point pool standing.`}
          </p>
          <div className="results-hero-row">
            <div className="results-outcome-stat">
              <span>YOUR SCORE</span>
              <strong>{local?.points ?? 0}</strong>
            </div>
            <div className="results-outcome-stat">
              <span>ELIMINATIONS</span>
              <strong>{local?.kills ?? 0}</strong>
            </div>
            <div className="results-outcome-stat">
              <span>DEATHS</span>
              <strong>{local?.deaths ?? 0}</strong>
            </div>
            <div className="results-outcome-stat">
              <span>OPERATOR</span>
              <strong className="small">{account.nickname}</strong>
            </div>
          </div>
        </section>

        <section className="results-board panel">
          <div className="results-board-head">
            <div>
              <span className="eyebrow">FINAL MANIFEST</span>
              <h2>Scoreboard</h2>
            </div>
            <div className="results-mvp">
              <span>MVP</span>
              <strong>{mvp?.nickname || "—"}</strong>
              <em>{mvp?.points ?? 0} PTS</em>
            </div>
          </div>
          <div className="results-table">
            <div className="results-table-head">
              <span>#</span>
              <span>OPERATOR</span>
              <span>CREW</span>
              <span>POINTS</span>
              <span>K</span>
              <span>D</span>
              <span>STATUS</span>
            </div>
            {sorted.map((player, index) => {
              const winning = results.winnerTeam !== "draw" && player.team === results.winnerTeam;
              return (
                <div
                  key={player.id}
                  className={`results-row${player.id === localId ? " local" : ""}${player.points <= 0 ? " eliminated" : ""}`}
                >
                  <span className="rank">{String(index + 1).padStart(2, "0")}</span>
                  <span className="player-name">
                    {player.nickname}
                    {player.id === localId && <em>YOU</em>}
                    {player.isBot && <em className="bot">BOT</em>}
                  </span>
                  <span style={{ color: TEAM_COLOR[player.team] }}>{TEAM_LABEL[player.team]}</span>
                  <strong>{player.points}</strong>
                  <span>{player.kills}</span>
                  <span>{player.deaths}</span>
                  <span className={winning ? "win" : player.points <= 0 ? "out" : "standing"}>
                    {winning ? "LAST STANDING" : player.points <= 0 ? "OUT OF POINTS" : "STANDING"}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="results-board-foot">
            <span>WIN CONDITION · LAST CREW WITH POINTS</span>
            <span>KILL TRANSFER · 1 POINT</span>
            <span>START POOL · 10 POINTS</span>
          </div>
        </section>

        <div className="results-actions">
          {isHost && inRoom && (
            <button type="button" className="btn btn-primary btn-xl" onClick={onRematch}>
              RUN IT BACK →
            </button>
          )}
          {inRoom && (
            <button type="button" className="btn btn-secondary btn-xl" onClick={onLobby}>
              RETURN TO LOBBY
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-xl" onClick={onMenu}>
            MAIN MENU
          </button>
        </div>
      </main>

      <div className="results-footer">
        <span>{BBT.name.toUpperCase()} · {BBT.positioning.toUpperCase()}</span>
        <StudioFooter />
      </div>
    </div>
  );
}
