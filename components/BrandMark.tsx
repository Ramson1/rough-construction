import { BBT, GAME } from "@/lib/brand";

export function BrandMark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  return (
    <div className={`brand-lockup brand-${size}`}>
      <div className="brand-chips" aria-hidden="true">
        <span>B</span>
        <span>B</span>
      </div>
      <div className="brand-copy">
        <strong>{BBT.name}</strong>
        <span>{BBT.slogan}</span>
      </div>
    </div>
  );
}

export function GameWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`game-wordmark${compact ? " compact" : ""}`}>
      <span className="game-wordmark-kicker">SITE 07 · UNFINISHED TOWER</span>
      <strong>ROUGH</strong>
      <strong>CONSTRUCTION</strong>
      <em>{GAME.tagline}</em>
    </div>
  );
}

export function StudioFooter() {
  return (
    <footer className="studio-footer">
      <span>PRESENTED BY {BBT.name.toUpperCase()}</span>
      <span className="studio-dot" aria-hidden="true">
        •
      </span>
      <span>{BBT.philosophy}</span>
      <span className="studio-dot" aria-hidden="true">
        •
      </span>
      <a href={BBT.website} target="_blank" rel="noreferrer">
        {BBT.website.replace("https://", "")}
      </a>
    </footer>
  );
}
