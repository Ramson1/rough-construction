import type {
  ChatMessage,
  GameMode,
  HitEvent,
  KillEvent,
  LobbyPlayer,
  MatchResults,
  MatchSettings,
  PlayerSnapshot,
  Profile,
  Settings,
  ShotInput,
  TeamId,
  WeaponId,
} from "@/lib/types";
import type { AudioManager } from "./audio";
import type { MinimapFloor } from "./world";

export type MatchPhase = "countdown" | "live" | "ended";
export type EngineRole = "solo" | "host" | "client";

export interface WorldInfo {
  minimap: MinimapFloor[];
  levelY: number[];
}

export interface ScoreRow {
  id: string;
  nickname: string;
  team: TeamId;
  points: number;
  kills: number;
  deaths: number;
  health: number;
  alive: boolean;
  eliminated: boolean;
  isBot: boolean;
  isLocal: boolean;
  level: number;
}

export interface KillFeedEntry {
  id: string;
  killerName: string;
  victimName: string;
  weapon: WeaponId | "fall";
  headshot: boolean;
  points: number;
  environment: boolean;
  at: number;
}

export interface MinimapPlayer {
  id: string;
  x: number;
  z: number;
  y: number;
  level: number;
  yaw: number;
  team: TeamId;
  alive: boolean;
  isLocal: boolean;
  isBot: boolean;
}

export interface TeamScores {
  alpha: number;
  bravo: number;
  solo: number;
  bots: number;
}

export interface HudState {
  matchId: string;
  mode: GameMode;
  phase: MatchPhase;
  countdown: number;
  timeLeft: number;
  role: EngineRole;
  pointerLocked: boolean;
  lookActive: boolean;

  health: number;
  maxHealth: number;
  points: number;
  kills: number;
  deaths: number;
  alive: boolean;
  eliminated: boolean;
  respawnIn: number;
  spawnProtect: number;

  weapon: WeaponId;
  ammoMag: number;
  ammoReserve: number;
  reloading: boolean;
  reloadProgress: number;

  crouching: boolean;
  sprinting: boolean;
  aiming: boolean;
  firstPerson: boolean;
  scoreboardOpen: boolean;

  level: number;
  levelName: string;
  localTeam: TeamId;
  localId: string;

  scoreboard: ScoreRow[];
  killFeed: KillFeedEntry[];
  teamScores: TeamScores;
  players: MinimapPlayer[];

  hitMarkerAt: number;
  damageFlashAt: number;
  fps: number;
  spectating: string | null;
}

export interface EngineOptions {
  container: HTMLElement;
  matchId: string;
  mode: GameMode;
  role: EngineRole;
  hostId: string;
  localProfile: Profile;
  players: LobbyPlayer[];
  settings: MatchSettings;
  graphics: Settings["graphics"];
  firstPerson: boolean;
  mouseSensitivity: number;
  audio: AudioManager;
  onHud: (hud: HudState) => void;
  onEvent: (event: EngineEvent) => void;
  onWorldReady?: (info: WorldInfo) => void;
  onNetwork?: (message: EngineNetMessage) => void;
  onMatchEnd: (results: MatchResults) => void;
  onFirstPersonChange?: (firstPerson: boolean) => void;
}

export type EngineEvent =
  | {
      type: "kill";
      kill: KillEvent;
      killerName: string;
      victimName: string;
      points: number;
      environment: boolean;
    }
  | { type: "hit"; hit: HitEvent }
  | {
      type: "notice";
      text: string;
      tone: "info" | "good" | "warn" | "danger";
    }
  | { type: "chat"; message: ChatMessage }
  | { type: "matchEnd"; results: MatchResults };

export interface ShotFx {
  shooterId: string;
  weapon: WeaponId;
  origin: { x: number; y: number; z: number };
  end: { x: number; y: number; z: number };
  hitPlayerId?: string;
  headshot?: boolean;
}

export type EngineNetMessage =
  | {
      t: "snapshot";
      players: PlayerSnapshot[];
      timeLeft: number;
      phase: MatchPhase;
    }
  | { t: "clientSnapshot"; snapshot: PlayerSnapshot }
  | { t: "shot"; shooterId: string; input: ShotInput; clientTime: number }
  | { t: "respawn"; playerId: string }
  | { t: "fall"; playerId: string; fallDistance: number }
  | { t: "hit"; hit: HitEvent }
  | {
      t: "kill";
      kill: KillEvent;
      killerName: string;
      victimName: string;
      points: number;
      environment: boolean;
    }
  | { t: "shotFx"; fx: ShotFx }
  | { t: "matchEnd"; results: MatchResults };
