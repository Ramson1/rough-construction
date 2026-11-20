import { DEFAULT_SETTINGS, STORAGE_KEYS } from "./config";
import type {
  Account,
  Customization,
  PlayerStats,
  Settings,
  StoredAccount,
} from "./types";
import { DEFAULT_CUSTOMIZATION } from "./types";

function safeGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage may be blocked; the session keeps working in memory */
  }
}

function safeRemove(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

const EMPTY_STATS: PlayerStats = {
  matches: 0,
  wins: 0,
  kills: 0,
  deaths: 0,
  bestScore: 0,
};

function normalizeCustomization(value: Partial<Customization> | undefined): Customization {
  return {
    ...DEFAULT_CUSTOMIZATION,
    ...value,
    body:
      value?.body === "female" || value?.body === "custom"
        ? value.body
        : "male",
  };
}

export function normalizeAccount(raw: Partial<StoredAccount> | null): Account | null {
  if (!raw || typeof raw.nickname !== "string" || !raw.nickname.trim()) {
    return null;
  }
  return {
    nickname: raw.nickname.trim(),
    gender:
      raw.gender === "female" || raw.gender === "custom" ? raw.gender : "male",
    customization: normalizeCustomization(raw.customization),
    stats: { ...EMPTY_STATS, ...(raw.stats || {}) },
    createdAt: raw.createdAt || Date.now(),
  };
}

function loadAccountStore(): Record<string, StoredAccount> {
  const raw = safeGet(STORAGE_KEYS.accounts);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, StoredAccount>) : {};
  } catch {
    return {};
  }
}

function persistAccountStore(store: Record<string, StoredAccount>): void {
  safeSet(STORAGE_KEYS.accounts, JSON.stringify(store));
}

function fallbackHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv_${(hash >>> 0).toString(16)}`;
}

async function hashPassword(password: string, salt: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    try {
      const bytes = new TextEncoder().encode(`${salt}:${password}`);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    } catch {
      /* fall through */
    }
  }
  return fallbackHash(`${salt}:${password}`);
}

function makeSalt(): string {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function signUp(input: {
  nickname: string;
  gender: Account["gender"];
  password: string;
  customization: Customization;
}): Promise<{ account: Account } | { error: string }> {
  const nickname = input.nickname.trim();
  if (!/^[a-zA-Z0-9_]{3,16}$/.test(nickname)) {
    return {
      error: "Nickname must be 3–16 characters and use only letters, numbers or underscores.",
    };
  }
  if (input.password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }
  const store = loadAccountStore();
  const key = nickname.toLowerCase();
  if (store[key]) return { error: "That nickname is already registered on this device." };

  const salt = makeSalt();
  const passwordHash = await hashPassword(input.password, salt);
  const stored: StoredAccount = {
    nickname,
    gender: input.gender,
    customization: normalizeCustomization(input.customization),
    stats: { ...EMPTY_STATS },
    createdAt: Date.now(),
    salt,
    passwordHash,
  };
  store[key] = stored;
  persistAccountStore(store);
  safeSet(STORAGE_KEYS.session, JSON.stringify({ nickname }));
  return { account: normalizeAccount(stored)! };
}

export async function login(
  nickname: string,
  password: string,
): Promise<{ account: Account } | { error: string }> {
  const store = loadAccountStore();
  const stored = store[nickname.trim().toLowerCase()];
  if (!stored) return { error: "No account with that nickname on this device." };
  const passwordHash = await hashPassword(password, stored.salt);
  if (passwordHash !== stored.passwordHash) return { error: "Incorrect password." };
  safeSet(STORAGE_KEYS.session, JSON.stringify({ nickname: stored.nickname }));
  return { account: normalizeAccount(stored)! };
}

export function loadSessionAccount(): Account | null {
  const raw = safeGet(STORAGE_KEYS.session);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as { nickname?: string };
    if (!session?.nickname) return null;
    const store = loadAccountStore();
    return normalizeAccount(store[session.nickname.toLowerCase()] || null);
  } catch {
    return null;
  }
}

export function logOut(): void {
  safeRemove(STORAGE_KEYS.session);
}

export function updateAccount(account: Account): void {
  const store = loadAccountStore();
  const key = account.nickname.toLowerCase();
  const existing = store[key];
  if (!existing) return;
  store[key] = {
    ...existing,
    gender: account.gender,
    customization: normalizeCustomization(account.customization),
    stats: account.stats,
  };
  persistAccountStore(store);
}

export function loadStats(): PlayerStats {
  const raw = safeGet(STORAGE_KEYS.stats);
  if (!raw) return { ...EMPTY_STATS };
  try {
    return { ...EMPTY_STATS, ...(JSON.parse(raw) as Partial<PlayerStats>) };
  } catch {
    return { ...EMPTY_STATS };
  }
}

export function saveStats(stats: PlayerStats): void {
  safeSet(STORAGE_KEYS.stats, JSON.stringify(stats));
}

export function loadSettings(): Settings {
  const raw = safeGet(STORAGE_KEYS.settings);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  safeSet(STORAGE_KEYS.settings, JSON.stringify(settings));
}

export function generatePlayerId(nickname: string): string {
  return `${nickname.toLowerCase().replace(/[^a-z0-9_]/g, "")}_${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}
