/** Runtime configuration. NEXT_PUBLIC_* values are inlined at build time. */

const DEFAULT_ICE =
  "stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302";

export const NETWORK_CONFIG = {
  mqttUrl:
    process.env.NEXT_PUBLIC_MQTT_URL || "wss://test.mosquitto.org:8081",
  topic:
    process.env.NEXT_PUBLIC_MQTT_TOPIC ||
    "rough_construction_servers_2026",
  localBusChannel: "rough_construction_local_bus",
  iceServers: (process.env.NEXT_PUBLIC_ICE_SERVERS || DEFAULT_ICE)
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean)
    .map((urls) => ({ urls })),
  enableBackendDiscovery:
    (process.env.NEXT_PUBLIC_ENABLE_BACKEND_DISCOVERY || "true") !== "false",
  maxPlayers: 8,
  hostPingIntervalMs: 2000,
  backendPollIntervalMs: 6000,
  serverStaleAfterMs: 15000,
  stateHz: 15,
  snapshotHz: 14,
  protocolVersion: 2,
} as const;

export const STORAGE_KEYS = {
  accounts: "rough_construction_accounts_v1",
  session: "rough_construction_session_v1",
  stats: "rough_construction_stats_v1",
  settings: "rough_construction_settings_v1",
  legacyAccount: "blackbox_tech_account",
} as const;

export const DEFAULT_SETTINGS = {
  graphics: "high" as const,
  musicVolume: 0.42,
  sfxVolume: 0.75,
  mouseSensitivity: 1,
  firstPerson: false,
};

export const MATCH_RULES = {
  startingPoints: 10,
  maxHealth: 100,
  respawnSeconds: 4,
  spawnProtectionSeconds: 2.2,
  matchTimeSeconds: 12 * 60,
  loneWolfHealth: 160,
  loneWolfPointMultiplier: 2,
  maxTimeLimitSec: 30 * 60,
} as const;
