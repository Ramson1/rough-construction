import { NETWORK_CONFIG } from "./config";
import type { ServerInfo } from "./types";

/**
 * Backend seam for server discovery.
 *
 * The default adapter is in-process memory (fine for `next dev` and a single
 * long-lived Node process). On serverless platforms each instance has its own
 * memory, so replace `MemoryServerRegistry` with a Neon / PostgreSQL /
 * Supabase implementation of `ServerRegistry` before production — no other
 * file needs to change.
 */
export interface ServerRegistry {
  list(): Promise<ServerInfo[]>;
  upsert(server: ServerInfo): Promise<ServerInfo[]>;
  remove(hostId: string): Promise<void>;
}

class MemoryServerRegistry implements ServerRegistry {
  private servers = new Map<string, ServerInfo>();

  private prune(): void {
    const cutoff = Date.now() - NETWORK_CONFIG.serverStaleAfterMs;
    for (const [id, server] of this.servers) {
      if (server.lastSeen < cutoff) this.servers.delete(id);
    }
  }

  async list(): Promise<ServerInfo[]> {
    this.prune();
    return [...this.servers.values()].sort((a, b) => b.lastSeen - a.lastSeen);
  }

  async upsert(server: ServerInfo): Promise<ServerInfo[]> {
    this.servers.set(server.hostId, { ...server, lastSeen: Date.now() });
    return this.list();
  }

  async remove(hostId: string): Promise<void> {
    this.servers.delete(hostId);
  }
}

// Reuse the store across dev-server hot reloads.
const globalForRegistry = globalThis as unknown as {
  __bbtServerRegistry?: ServerRegistry;
};

export const serverRegistry: ServerRegistry =
  globalForRegistry.__bbtServerRegistry ?? new MemoryServerRegistry();

if (process.env.NODE_ENV !== "production") {
  globalForRegistry.__bbtServerRegistry = serverRegistry;
}
