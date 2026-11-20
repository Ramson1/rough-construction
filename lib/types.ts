export type Gender = "male" | "female" | "custom";

export type HatKind = "none" | "hardhat" | "cap" | "beanie";
export type FaceKind = "confident" | "happy" | "focused";

export interface Customization {
  body: Gender;
  skin: string;
  shirt: string;
  pants: string;
  shoes: string;
  hat: HatKind;
  hatColor: string;
  face: FaceKind;
}

export const DEFAULT_CUSTOMIZATION: Customization = {
  body: "male",
  skin: "#e8b589",
  shirt: "#ff7a1a",
  pants: "#394b66",
  shoes: "#22262e",
  hat: "hardhat",
  hatColor: "#ffc21c",
  face: "confident",
};

export interface Account {
  nickname: string;
  gender: Gender;
  customization: Customization;
  stats: PlayerStats;
  createdAt: number;
}

export interface StoredAccount extends Account {
  salt: string;
  passwordHash: string;
}

export interface PlayerStats {
  matches: number;
  wins: number;
  kills: number;
  deaths: number;
  bestScore: number;
}

export interface Profile {
  id: string;
  nickname: string;
  gender: Gender;
  customization: Customization;
  isBot?: boolean;
}

export type GameMode = "duel" | "lonewolf" | "team" | "training";
export type RoomStatus = "lobby" | "playing";
export type TeamId = "alpha" | "bravo" | "solo" | "bots";
export type WeaponId = "rifle" | "pistol" | "knife";
export type BotDifficulty = "easy" | "normal" | "hard";

export interface ModeInfo {
  id: GameMode;
  name: string;
  tagline: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  online: boolean;
}

export const GAME_MODES: ModeInfo[] = [
  {
    id: "training",
    name: "Site Training",
    tagline: "1 v Computer",
    description:
      "Warm up against a computer-controlled site rival. Learn the tower, the weapons and the cover.",
    minPlayers: 1,
    maxPlayers: 1,
    online: false,
  },
  {
    id: "duel",
    name: "Duel",
    tagline: "1 v 1",
    description:
      "Two players, one tower. Every elimination transfers a point. Last player standing wins.",
    minPlayers: 2,
    maxPlayers: 2,
    online: true,
  },
  {
    id: "lonewolf",
    name: "Lone Wolf",
    tagline: "1 v Hunters",
    description:
      "One buffed player against a hunter team. The lone wolf gets a bigger point pool and extra armour.",
    minPlayers: 3,
    maxPlayers: 6,
    online: true,
  },
  {
    id: "team",
    name: "Team Battle",
    tagline: "N v N",
    description:
      "Balanced construction crews fight for the tower. Friendly fire is off. Last crew standing wins.",
    minPlayers: 2,
    maxPlayers: 8,
    online: true,
  },
];

export interface ServerInfo {
  hostId: string;
  hostName: string;
  mode: GameMode;
  players: number;
  maxPlayers: number;
  status: RoomStatus;
  lastSeen: number;
  source?: "mqtt" | "backend" | "local";
}

export interface LobbyPlayer extends Profile {
  team: TeamId;
  ready: boolean;
  host: boolean;
}

export interface RoomState {
  hostId: string;
  hostName: string;
  mode: GameMode;
  settings: MatchSettings;
  maxPlayers: number;
  status: RoomStatus;
  players: LobbyPlayer[];
}

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  system?: boolean;
}

export interface MatchSettings {
  difficulty: BotDifficulty;
  botCount: number;
  timeLimitSec: number;
}

export interface MatchStart {
  matchId: string;
  mode: GameMode;
  hostId: string;
  players: LobbyPlayer[];
  settings: MatchSettings;
  startAt: number;
}

export interface PlayerSnapshot {
  id: string;
  nickname: string;
  team: TeamId;
  x: number;
  y: number;
  z: number;
  yaw: number;
  legRot: number;
  torsoYOffset: number;
  crouch: boolean;
  alive: boolean;
  health: number;
  points: number;
  kills: number;
  deaths: number;
  weapon: WeaponId;
  spawnProtect: number;
  isBot?: boolean;
  customization: Customization;
}

export interface ShotInput {
  origin: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
  weapon: WeaponId;
}

export interface HitEvent {
  shooterId: string;
  victimId: string;
  damage: number;
  headshot: boolean;
  victimHealth: number;
  killed: boolean;
  weapon: WeaponId;
  pointTransfer: number;
  victimPoints: number;
  shooterPoints: number;
  environment?: boolean;
}

export interface KillEvent {
  killerId: string;
  victimId: string;
  weapon: WeaponId;
  headshot: boolean;
  points: number;
  environment?: boolean;
}

export interface AmmoState {
  rifleMag: number;
  rifleReserve: number;
  pistolMag: number;
  pistolReserve: number;
  reloading: WeaponId | null;
  reloadEndsAt: number;
}

export interface MatchResults {
  mode: GameMode;
  winnerTeam: TeamId | "draw";
  players: PlayerSnapshot[];
  endedAt: number;
}

export type Screen =
  | "auth"
  | "character"
  | "menu"
  | "browser"
  | "lobby"
  | "game"
  | "results";

export type Settings = {
  graphics: "low" | "medium" | "high";
  musicVolume: number;
  sfxVolume: number;
  mouseSensitivity: number;
  firstPerson: boolean;
};
