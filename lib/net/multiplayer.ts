import { NETWORK_CONFIG } from "@/lib/config";
import type {
  ChatMessage,
  GameMode,
  LobbyPlayer,
  MatchSettings,
  MatchStart,
  Profile,
  RoomState,
  ServerInfo,
  TeamId,
} from "@/lib/types";
import { GAME_MODES } from "@/lib/types";
import type { EngineNetMessage } from "@/lib/game/engineTypes";

/**
 * Room transport seam.
 *
 * The browser build uses peer-to-peer WebRTC (PeerJS) with MQTT/backend/Bus
 * discovery. A dedicated server build can implement this same interface and
 * keep `GameClient` and the match engine unchanged.
 */
export interface RoomTransport {
  readonly peerId: string;
  start(): Promise<void>;
  hostRoom(options: HostRoomOptions): void;
  joinRoom(hostId: string, profile: Profile): void;
  leaveRoom(): void;
  updateRoomSettings(patch: RoomSettingsPatch): void;
  startMatch(matchId: string, settings?: MatchSettings): void;
  sendEngineMessage(message: EngineNetMessage): void;
  sendChat(sender: string, text: string): void;
  refresh(): void;
  stop(): void;
}

export interface HostRoomOptions {
  profile: Profile;
  mode: GameMode;
  settings: MatchSettings;
  hostName?: string;
}

export interface RoomSettingsPatch {
  mode?: GameMode;
  settings?: Partial<MatchSettings>;
}

export interface MultiplayerCallbacks {
  onReady: (peerId: string) => void;
  onServers: (servers: ServerInfo[]) => void;
  onRoom: (room: RoomState | null) => void;
  onRoomClosed: (reason: string) => void;
  onMatchStart: (start: MatchStart) => void;
  onEngineMessage: (message: EngineNetMessage) => void;
  onChat: (message: ChatMessage) => void;
  onPeerGone?: (playerId: string) => void;
  onError: (message: string) => void;
  onStatus?: (status: string, detail?: string) => void;
}

type Role = "idle" | "host" | "client";
type GuestTransport = "peer" | "bus";

interface PeerLike {
  open?: boolean;
  peer?: string;
  send?: (data: unknown) => void;
  close?: () => void;
  on?: (event: string, handler: (...args: any[]) => void) => void;
}

interface Guest {
  peerId: string;
  playerId: string;
  transport: GuestTransport;
  connection: PeerLike | null;
}

interface BusEnvelope {
  rc: number;
  kind: "bus";
  to: string;
  from: string;
  body: any;
}

const PEER_PREFIX = "rc-";
let chatSeq = 0;

function randomCode(length = 7): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let code = "";
  const cryptoApi = typeof crypto !== "undefined" ? crypto : null;
  if (cryptoApi?.getRandomValues) {
    const bytes = new Uint8Array(length);
    cryptoApi.getRandomValues(bytes);
    for (const byte of bytes) code += alphabet[byte % alphabet.length];
    return code;
  }
  for (let i = 0; i < length; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export function newPeerId(): string {
  return `${PEER_PREFIX}${randomCode()}`;
}

export function normalizeRoomCode(input: string): string {
  const clean = (input || "").trim().toLowerCase().replace(/\s+/g, "");
  if (!clean) return "";
  return clean.startsWith(PEER_PREFIX) ? clean : `${PEER_PREFIX}${clean}`;
}

export function roomCodeOf(hostId: string): string {
  return hostId.startsWith(PEER_PREFIX)
    ? hostId.slice(PEER_PREFIX.length).toUpperCase()
    : hostId.toUpperCase();
}

function defaultSettings(): MatchSettings {
  return { difficulty: "normal", botCount: 0, timeLimitSec: 12 * 60 };
}

function maxPlayersFor(mode: GameMode): number {
  return GAME_MODES.find((entry) => entry.id === mode)?.maxPlayers ?? 8;
}

function teamFor(mode: GameMode, players: LobbyPlayer[]): TeamId {
  if (mode === "lonewolf") return players.length === 0 ? "solo" : "bravo";
  if (mode === "team") {
    const alpha = players.filter((player) => player.team === "alpha").length;
    const bravo = players.filter((player) => player.team === "bravo").length;
    return alpha <= bravo ? "alpha" : "bravo";
  }
  return players.length === 0 ? "alpha" : "bravo";
}

function rebalanceTeams(room: RoomState): void {
  const players = [...room.players].sort((a, b) => Number(b.host) - Number(a.host));
  players.forEach((player, index) => {
    if (room.mode === "lonewolf") {
      player.team = index === 0 ? "solo" : "bravo";
    } else if (room.mode === "duel") {
      player.team = index === 0 ? "alpha" : "bravo";
    } else {
      player.team = index % 2 === 0 ? "alpha" : "bravo";
    }
    player.ready = true;
  });
  room.players = players;
}

function trimSettings(settings: Partial<MatchSettings> | undefined): MatchSettings {
  const base = defaultSettings();
  return {
    difficulty:
      settings?.difficulty === "easy" ||
      settings?.difficulty === "hard" ||
      settings?.difficulty === "normal"
        ? settings.difficulty
        : base.difficulty,
    botCount: Math.max(0, Math.min(8, Math.floor(settings?.botCount ?? base.botCount))),
    timeLimitSec: Math.max(
      60,
      Math.min(30 * 60, Math.floor(settings?.timeLimitSec ?? base.timeLimitSec)),
    ),
  };
}

function sanitizeText(value: string, max = 140): string {
  return (value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Peer-to-peer room client. The host owns the room roster, match start and
 * authoritative match messages; guests send movement/shots through the host.
 */
export class MultiplayerClient implements RoomTransport {
  peerId = newPeerId();
  role: Role = "idle";
  room: RoomState | null = null;

  private callbacks: MultiplayerCallbacks;
  private peer: any = null;
  private mqtt: any = null;
  private bus: BroadcastChannel | null = null;
  private started = false;
  private stopped = false;
  private peerOpen = false;
  private peerAttempts = 0;

  private hostId: string | null = null;
  private hostConnection: PeerLike | null = null;
  private hostTransport: GuestTransport | null = null;
  private pendingJoin: Profile | null = null;
  private joinTimeout: number | null = null;

  private guests = new Map<string, Guest>();
  private guestByPlayer = new Map<string, Guest>();
  private discovered = new Map<string, ServerInfo>();
  private timers: number[] = [];
  private lastDiscoveryAt = 0;

  private hostName = "";
  private localProfile: Profile | null = null;

  constructor(callbacks: MultiplayerCallbacks) {
    this.callbacks = callbacks;
  }

  async start(): Promise<void> {
    if (this.started || typeof window === "undefined") return;
    this.started = true;

    if ("BroadcastChannel" in window) {
      this.bus = new BroadcastChannel(NETWORK_CONFIG.localBusChannel);
      this.bus.onmessage = (event) => this.handleBusMessage(event.data);
    }

    this.callbacks.onReady(this.peerId);
    this.callbacks.onStatus?.("online", "Peer ID ready");

    this.connectPeer();
    this.connectDiscovery();

    this.timers.push(
      window.setInterval(() => this.heartbeat(), NETWORK_CONFIG.hostPingIntervalMs),
    );
    this.timers.push(
      window.setInterval(() => this.pruneServers(), 4000),
    );
    if (NETWORK_CONFIG.enableBackendDiscovery) {
      this.timers.push(
        window.setInterval(
          () => this.pollBackend(),
          NETWORK_CONFIG.backendPollIntervalMs,
        ),
      );
      this.pollBackend();
    }
  }

  // ---------------------------------------------------------------------
  // Public room API
  // ---------------------------------------------------------------------

  hostRoom(options: HostRoomOptions): void {
    if (!options.profile?.nickname) {
      this.callbacks.onError("A profile is required to host.");
      return;
    }
    this.closeGuestConnections();
    this.role = "host";
    this.hostId = this.peerId;
    this.localProfile = { ...options.profile, id: this.peerId };
    this.hostName = options.hostName || `${options.profile.nickname}'s site`;
    const mode = options.mode === "training" ? "team" : options.mode;
    const hostPlayer: LobbyPlayer = {
      ...this.localProfile,
      id: this.peerId,
      team: mode === "lonewolf" ? "solo" : "alpha",
      ready: true,
      host: true,
    };
    this.room = {
      hostId: this.peerId,
      hostName: this.hostName,
      mode,
      settings: trimSettings(options.settings),
      maxPlayers: maxPlayersFor(mode),
      status: "lobby",
      players: [hostPlayer],
    };
    this.publishRoom();
    this.heartbeat();
    this.registerBackend();
    this.callbacks.onStatus?.("hosting", roomCodeOf(this.peerId));
  }

  joinRoom(hostId: string, profile: Profile): void {
    const target = normalizeRoomCode(hostId);
    if (!target) {
      this.callbacks.onError("Enter a room code to join.");
      return;
    }
    if (target === this.peerId) {
      this.callbacks.onError("That is your own room code.");
      return;
    }
    this.role = "client";
    this.hostId = target;
    this.localProfile = { ...profile, id: this.peerId };
    this.room = null;
    this.hostTransport = null;
    this.pendingJoin = this.localProfile;
    this.callbacks.onStatus?.("connecting", roomCodeOf(target));
    this.clearJoinTimeout();
    this.joinTimeout = window.setTimeout(() => {
      if (this.role === "client" && !this.room) {
        this.callbacks.onError(
          "No host answered. Check the room code, or try again once PeerJS is online.",
        );
        this.role = "idle";
        this.hostId = null;
        this.pendingJoin = null;
      }
    }, 9000);

    this.sendHello("bus");
    if (this.peerOpen) this.connectToHost();
  }

  leaveRoom(): void {
    if (this.role === "host") {
      this.broadcastToGuests({ kind: "roomClosed", reason: "The host closed the room." });
      this.callbacks.onRoomClosed("You closed the room.");
    } else if (this.role === "client") {
      this.sendToHost({ kind: "leave" });
      this.callbacks.onRoomClosed("You left the room.");
    }
    this.clearJoinTimeout();
    this.closeGuestConnections();
    this.role = "idle";
    this.room = null;
    this.hostId = null;
    this.hostConnection = null;
    this.hostTransport = null;
    this.pendingJoin = null;
    this.localProfile = null;
    this.callbacks.onRoom(null);
    this.callbacks.onStatus?.("online");
  }

  updateRoomSettings(patch: RoomSettingsPatch): void {
    if (this.role !== "host" || !this.room) return;
    if (patch.mode && patch.mode !== "training") {
      this.room.mode = patch.mode;
      this.room.maxPlayers = maxPlayersFor(patch.mode);
      if (this.room.players.length > this.room.maxPlayers) {
        this.room.players = this.room.players.slice(0, this.room.maxPlayers);
      }
      rebalanceTeams(this.room);
    }
    if (patch.settings) {
      this.room.settings = trimSettings({ ...this.room.settings, ...patch.settings });
    }
    this.publishRoom();
    this.heartbeat();
  }

  startMatch(matchId: string, settings?: MatchSettings): void {
    if (this.role !== "host" || !this.room) return;
    if (settings) this.room.settings = trimSettings({ ...this.room.settings, ...settings });
    this.room.status = "playing";
    const start: MatchStart = {
      matchId,
      mode: this.room.mode,
      hostId: this.peerId,
      players: this.room.players.map((player) => ({ ...player })),
      settings: { ...this.room.settings },
      startAt: Date.now(),
    };
    this.broadcastToGuests({ kind: "start", start });
    this.publishRoom();
    this.heartbeat();
    this.callbacks.onMatchStart(start);
  }

  returnToLobby(): void {
    if (this.role !== "host" || !this.room) return;
    this.room.status = "lobby";
    rebalanceTeams(this.room);
    this.publishRoom();
    this.heartbeat();
  }

  sendEngineMessage(message: EngineNetMessage): void {
    if (!message) return;
    if (this.role === "host") {
      this.broadcastToGuests({ kind: "engine", message });
    } else if (this.role === "client") {
      this.sendToHost({ kind: "engine", message });
    }
  }

  sendChat(_sender: string, text: string): void {
    const clean = sanitizeText(text);
    if (!clean) return;
    if (this.role === "host") {
      this.publishChat({
        id: `chat_${Date.now()}_${++chatSeq}`,
        sender: this.localProfile?.nickname || "Host",
        text: clean,
      });
    } else if (this.role === "client") {
      this.sendToHost({ kind: "chat", text: clean });
    }
  }

  refresh(): void {
    this.pingDiscovery();
    this.pollBackend();
    this.pruneServers();
    this.emitServers();
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.role === "host" && this.room) {
      this.broadcastToGuests({ kind: "roomClosed", reason: "The host went offline." });
      if (NETWORK_CONFIG.enableBackendDiscovery) {
        void fetch(`/api/servers?hostId=${encodeURIComponent(this.peerId)}`, {
          method: "DELETE",
        }).catch(() => undefined);
      }
    } else if (this.role === "client") {
      this.sendToHost({ kind: "leave" });
    }
    this.clearJoinTimeout();
    this.timers.forEach((id) => window.clearInterval(id));
    this.timers = [];
    this.closeGuestConnections();
    try {
      this.bus?.close();
      this.mqtt?.end?.(true);
      this.peer?.destroy?.();
    } catch {
      /* ignore teardown errors */
    }
    this.bus = null;
    this.mqtt = null;
    this.peer = null;
    this.discovered.clear();
    this.role = "idle";
    this.room = null;
  }

  getLocalPlayerId(): string {
    return this.peerId;
  }

  getRoomCode(): string {
    return roomCodeOf(this.hostId || this.peerId);
  }

  // ---------------------------------------------------------------------
  // PeerJS
  // ---------------------------------------------------------------------

  private async connectPeer(): Promise<void> {
    try {
      const peerModule: any = await import("peerjs");
      const PeerCtor = peerModule.default || peerModule.Peer || peerModule;
      if (!PeerCtor) throw new Error("PeerJS unavailable");
      this.createPeer(PeerCtor, this.peerId);
    } catch {
      this.callbacks.onStatus?.("degraded", "WebRTC unavailable — local bus only");
    }
  }

  private createPeer(PeerCtor: any, id: string): void {
    try {
      this.peer?.destroy?.();
    } catch {
      /* ignore */
    }
    this.peerOpen = false;
    this.peer = new PeerCtor(id, {
      config: { iceServers: NETWORK_CONFIG.iceServers },
    });

    this.peer.on("open", (openId: string) => {
      this.peerOpen = true;
      if (openId) this.peerId = openId;
      this.callbacks.onReady(this.peerId);
      this.callbacks.onStatus?.("online", "WebRTC ready");
      if (this.role === "client" && this.pendingJoin) this.connectToHost();
      if (this.role === "host" && this.room) {
        this.room.hostId = this.peerId;
        this.publishRoom();
      }
    });
    this.peer.on("connection", (connection: any) => this.acceptConnection(connection));
    this.peer.on("error", (error: any) => {
      const type = error?.type || "";
      if (type === "unavailable-id" && this.peerAttempts < 2 && !this.room) {
        this.peerAttempts += 1;
        this.peerId = newPeerId();
        this.connectPeer();
        return;
      }
      if (type === "peer-unavailable" && this.role === "client" && !this.room) {
        this.callbacks.onStatus?.("searching", "Room not found over WebRTC");
        return;
      }
      if (type === "network" || type === "server-error") {
        this.callbacks.onStatus?.("degraded", "WebRTC server unreachable");
      }
    });
  }

  private acceptConnection(connection: any): void {
    if (this.role !== "host") {
      try {
        connection.close?.();
      } catch {
        /* ignore */
      }
      return;
    }
    connection.on?.("open", () => {
      // The hello packet decides whether this connection becomes a guest.
    });
    connection.on?.("data", (data: any) => {
      const peerId = connection.peer || data?.fromPeerId || "";
      if (peerId) this.handleHostData(peerId, data, "peer", connection);
    });
    connection.on?.("close", () => this.handleGuestDisconnect(connection.peer));
    connection.on?.("error", () => this.handleGuestDisconnect(connection.peer));
  }

  private connectToHost(): void {
    if (!this.peerOpen || !this.hostId || !this.pendingJoin) return;
    if (this.hostConnection?.open) return;
    try {
      const connection = this.peer.connect(this.hostId, { reliable: true });
      if (!connection) return;
      this.hostConnection = connection;
      this.hostTransport = "peer";
      connection.on?.("open", () => {
        this.hostConnection = connection;
        this.hostTransport = "peer";
        this.sendHello("peer");
      });
      connection.on?.("data", (data: any) => this.handleClientData(data, "peer"));
      connection.on?.("close", () => this.handleHostDisconnect());
      connection.on?.("error", () => {
        if (this.room) this.handleHostDisconnect();
      });
    } catch {
      this.callbacks.onStatus?.("degraded", "Could not open WebRTC channel");
    }
  }

  private sendHello(transport: GuestTransport): void {
    if (!this.pendingJoin || !this.hostId) return;
    const body = {
      kind: "hello",
      profile: this.pendingJoin,
      fromPeerId: this.peerId,
      protocol: NETWORK_CONFIG.protocolVersion,
    };
    if (transport === "peer") {
      this.hostConnection?.send?.(body);
    } else {
      this.postBus(this.hostId, body);
    }
  }

  // ---------------------------------------------------------------------
  // Room protocol
  // ---------------------------------------------------------------------

  private handleHostData(
    peerId: string,
    data: any,
    transport: GuestTransport,
    connection: PeerLike | null,
  ): void {
    if (!data || typeof data !== "object") return;
    if (data.kind === "hello") {
      this.handleHello(peerId, data, transport, connection);
      return;
    }
    if (data.kind === "leave") {
      this.removeGuest(peerId, "left the room");
      return;
    }
    if (data.kind === "chat") {
      const text = sanitizeText(String(data.text || ""));
      if (!text) return;
      const guest = this.guestByPlayer.get(peerId);
      if (!guest) return;
      const message: ChatMessage = {
        id: `chat_${Date.now()}_${++chatSeq}`,
        sender: this.room?.players.find((player) => player.id === guest.playerId)?.nickname || "Player",
        text,
      };
      this.publishChat(message);
      return;
    }
    if (data.kind === "engine" && data.message) {
      if (!this.room || !this.guestByPlayer.has(peerId)) return;
      this.callbacks.onEngineMessage(data.message as EngineNetMessage);
    }
  }

  private handleHello(
    peerId: string,
    data: any,
    transport: GuestTransport,
    connection: PeerLike | null,
  ): void {
    if (this.role !== "host" || !this.room) {
      this.replyTo(peerId, transport, {
        kind: "reject",
        reason: "No room is open on this code.",
      }, connection);
      return;
    }
    if (data.protocol !== NETWORK_CONFIG.protocolVersion) {
      this.replyTo(peerId, transport, {
        kind: "reject",
        reason: "Version mismatch — refresh the page.",
      }, connection);
      return;
    }
    const profile = data.profile as Profile | undefined;
    if (!profile?.nickname) {
      this.replyTo(peerId, transport, { kind: "reject", reason: "Invalid profile." }, connection);
      return;
    }
    if (this.room.status !== "lobby") {
      this.replyTo(peerId, transport, {
        kind: "reject",
        reason: "That match has already started.",
      }, connection);
      return;
    }

    const existing = this.guests.get(peerId);
    if (existing) {
      existing.transport = transport;
      if (connection) existing.connection = connection;
      this.replyTo(peerId, transport, { kind: "welcome", room: this.room }, connection);
      return;
    }
    if (this.room.players.length >= this.room.maxPlayers) {
      this.replyTo(peerId, transport, { kind: "reject", reason: "That room is full." }, connection);
      return;
    }

    const team = teamFor(this.room.mode, this.room.players);
    const player: LobbyPlayer = {
      id: peerId,
      nickname: sanitizeText(String(profile.nickname), 16) || "Player",
      gender: profile.gender || "male",
      customization: profile.customization,
      team,
      ready: true,
      host: false,
    };
    this.room.players.push(player);
    rebalanceTeams(this.room);
    this.guests.set(peerId, {
      peerId,
      playerId: peerId,
      transport,
      connection,
    });
    this.guestByPlayer.set(peerId, this.guests.get(peerId)!);
    this.replyTo(peerId, transport, { kind: "welcome", room: this.room }, connection);
    this.publishRoom();
    this.heartbeat();
    this.callbacks.onStatus?.(`${player.nickname} joined`, roomCodeOf(this.peerId));
  }

  private handleClientData(data: any, transport: GuestTransport): void {
    if (!data || typeof data !== "object") return;
    if (data.kind === "welcome" && data.room) {
      this.hostTransport = transport;
      this.room = data.room as RoomState;
      this.pendingJoin = null;
      this.clearJoinTimeout();
      this.callbacks.onRoom(this.room);
      this.callbacks.onStatus?.("lobby", roomCodeOf(this.hostId || ""));
      return;
    }
    if (data.kind === "room" && data.room) {
      if (this.role !== "client") return;
      this.room = data.room as RoomState;
      this.callbacks.onRoom(this.room);
      return;
    }
    if (data.kind === "start" && data.start) {
      if (this.role !== "client") return;
      const start = data.start as MatchStart;
      if (this.room) this.room.status = "playing";
      this.callbacks.onRoom(this.room);
      this.callbacks.onMatchStart(start);
      return;
    }
    if (data.kind === "reject") {
      if (this.role !== "client" || this.room) return;
      this.pendingJoin = null;
      this.clearJoinTimeout();
      this.role = "idle";
      this.callbacks.onError(String(data.reason || "The host refused the connection."));
      this.callbacks.onStatus?.("online");
      return;
    }
    if (data.kind === "roomClosed") {
      const reason = String(data.reason || "The host closed the room.");
      this.room = null;
      this.role = "idle";
      this.pendingJoin = null;
      this.clearJoinTimeout();
      this.callbacks.onRoom(null);
      this.callbacks.onRoomClosed(reason);
      return;
    }
    if (data.kind === "engine" && data.message) {
      if (this.role !== "client") return;
      this.callbacks.onEngineMessage(data.message as EngineNetMessage);
      return;
    }
    if (data.kind === "chat" && data.message) {
      if (this.role !== "client") return;
      this.callbacks.onChat(data.message as ChatMessage);
    }
  }

  private replyTo(
    peerId: string,
    transport: GuestTransport,
    body: unknown,
    connection?: PeerLike | null,
  ): void {
    if (transport === "bus") {
      this.postBus(peerId, body);
      return;
    }
    const target = connection || this.guests.get(peerId)?.connection;
    target?.send?.(body);
  }

  private publishChat(message: ChatMessage): void {
    this.callbacks.onChat(message);
    this.broadcastToGuests({ kind: "chat", message });
  }

  private publishRoom(): void {
    if (!this.room) {
      this.callbacks.onRoom(null);
      return;
    }
    this.callbacks.onRoom({ ...this.room, players: this.room.players.map((p) => ({ ...p })) });
    if (this.role === "host") {
      this.broadcastToGuests({ kind: "room", room: this.room });
    }
  }

  private broadcastToGuests(body: unknown): void {
    this.guests.forEach((guest) => {
      if (guest.transport === "bus") {
        this.postBus(guest.peerId, body);
      } else {
        guest.connection?.send?.(body);
      }
    });
  }

  private sendToHost(body: unknown): void {
    if (!this.hostId) return;
    if (this.hostTransport === "bus") {
      this.postBus(this.hostId, body);
      return;
    }
    if (this.hostConnection?.open) {
      this.hostConnection.send?.(body);
      return;
    }
    this.postBus(this.hostId, body);
  }

  private handleGuestDisconnect(peerId: string): void {
    if (this.role !== "host" || !peerId) return;
    const guest = this.guests.get(peerId);
    if (!guest) return;
    this.removeGuest(peerId, "disconnected");
  }

  private removeGuest(peerId: string, reason: string): void {
    if (this.role !== "host" || !this.room) return;
    const guest = this.guests.get(peerId);
    if (!guest) return;
    this.guests.delete(peerId);
    this.guestByPlayer.delete(peerId);
    this.room.players = this.room.players.filter((player) => player.id !== peerId);
    rebalanceTeams(this.room);
    try {
      guest.connection?.close?.();
    } catch {
      /* ignore */
    }
    this.publishRoom();
    this.heartbeat();
    this.callbacks.onPeerGone?.(peerId);
    this.callbacks.onStatus?.(`A player ${reason}`, roomCodeOf(this.peerId));
  }

  private handleHostDisconnect(): void {
    if (this.role !== "client") return;
    this.room = null;
    this.role = "idle";
    this.hostConnection = null;
    this.hostTransport = null;
    this.pendingJoin = null;
    this.callbacks.onRoom(null);
    this.callbacks.onRoomClosed("The host connection was lost.");
    this.callbacks.onStatus?.("online");
  }

  private closeGuestConnections(): void {
    this.guests.forEach((guest) => {
      try {
        guest.connection?.close?.();
      } catch {
        /* ignore */
      }
    });
    this.guests.clear();
    this.guestByPlayer.clear();
    try {
      this.hostConnection?.close?.();
    } catch {
      /* ignore */
    }
    this.hostConnection = null;
  }

  private clearJoinTimeout(): void {
    if (this.joinTimeout !== null) {
      window.clearTimeout(this.joinTimeout);
      this.joinTimeout = null;
    }
  }

  // ---------------------------------------------------------------------
  // Discovery
  // ---------------------------------------------------------------------

  private connectDiscovery(): void {
    try {
      const mqttModule: any = import("mqtt");
      void mqttModule
        .then((module: any) => {
          if (this.stopped) return;
          const connect = module.connect || module.default?.connect;
          if (!connect) return;
          this.mqtt = connect(NETWORK_CONFIG.mqttUrl, {
            connectTimeout: 6000,
            reconnectPeriod: 8000,
          });
          this.mqtt.on("connect", () => {
            try {
              this.mqtt.subscribe(NETWORK_CONFIG.topic);
            } catch {
              /* ignore */
            }
            this.pingDiscovery();
          });
          this.mqtt.on("message", (_topic: string, payload: Uint8Array) => {
            try {
              const raw = new TextDecoder().decode(payload);
              const data = JSON.parse(raw);
              if (data?.type === "rc_discovery" && data.server?.hostId !== this.peerId) {
                this.mergeServer({ ...data.server, lastSeen: Date.now(), source: "mqtt" });
              } else if (data?.type === "rc_ping" && this.role === "host") {
                this.mqtt?.publish(
                  NETWORK_CONFIG.topic,
                  JSON.stringify({ type: "rc_discovery", server: this.serverInfo() }),
                );
              }
            } catch {
              /* ignore malformed discovery packets */
            }
          });
          this.mqtt.on("error", () => {
            this.callbacks.onStatus?.("degraded", "Discovery broker unavailable");
          });
        })
        .catch(() => undefined);
    } catch {
      /* MQTT is an optional discovery channel */
    }
  }

  private handleBusMessage(envelope: BusEnvelope): void {
    if (!envelope || envelope.kind !== "bus") return;
    if (envelope.from === this.peerId) return;
    if (envelope.to !== "*" && envelope.to !== this.peerId) return;
    const body = envelope.body;
    if (!body || typeof body !== "object") return;

    if (body.kind === "discovery" && body.server?.hostId !== this.peerId) {
      this.mergeServer({ ...body.server, lastSeen: Date.now(), source: "local" });
      return;
    }
    if (body.kind === "ping") {
      if (this.role === "host") {
        this.postBus(envelope.from, { kind: "discovery", server: this.serverInfo() });
      }
      return;
    }
    if (body.kind === "pingRequest" && this.role === "host") {
      this.postBus("*", { kind: "discovery", server: this.serverInfo() });
      return;
    }
    if (this.role === "host") {
      this.handleHostData(envelope.from, body, "bus", null);
    } else if (this.role === "client" && envelope.from === this.hostId) {
      this.handleClientData(body, "bus");
    }
  }

  private postBus(to: string, body: unknown): void {
    if (!this.bus) return;
    const envelope: BusEnvelope = {
      rc: NETWORK_CONFIG.protocolVersion,
      kind: "bus",
      to,
      from: this.peerId,
      body,
    };
    try {
      this.bus.postMessage(envelope);
    } catch {
      /* channel may be closing */
    }
  }

  private heartbeat(): void {
    if (this.role !== "host" || !this.room) return;
    const server = this.serverInfo();
    this.postBus("*", { kind: "discovery", server });
    if (this.mqtt?.connected) {
      this.mqtt.publish(
        NETWORK_CONFIG.topic,
        JSON.stringify({ type: "rc_discovery", server }),
      );
    }
    this.registerBackend();
  }

  private pingDiscovery(): void {
    this.postBus("*", { kind: "pingRequest" });
    if (this.mqtt?.connected) {
      this.mqtt.publish(
        NETWORK_CONFIG.topic,
        JSON.stringify({ type: "rc_ping", from: this.peerId }),
      );
    }
  }

  private serverInfo(): ServerInfo {
    return {
      hostId: this.peerId,
      hostName: this.room?.hostName || this.hostName || "Rough Construction room",
      mode: this.room?.mode || "team",
      players: this.room?.players.length || 1,
      maxPlayers: this.room?.maxPlayers || NETWORK_CONFIG.maxPlayers,
      status: this.room?.status || "lobby",
      lastSeen: Date.now(),
      source: "local",
    };
  }

  private mergeServer(server: ServerInfo): void {
    if (!server?.hostId || server.hostId === this.peerId) return;
    if (!server.mode || !server.status) return;
    this.discovered.set(server.hostId, {
      ...server,
      source: server.source || "local",
      lastSeen: Date.now(),
    });
    this.emitServers();
  }

  private pruneServers(): void {
    const cutoff = Date.now() - NETWORK_CONFIG.serverStaleAfterMs;
    let changed = false;
    for (const [id, server] of this.discovered) {
      if (server.lastSeen < cutoff) {
        this.discovered.delete(id);
        changed = true;
      }
    }
    if (changed) this.emitServers();
    if (this.role === "client" && !this.room) this.emitServers();
    else if (this.role === "idle") this.emitServers();
  }

  private emitServers(): void {
    this.callbacks.onServers(
      [...this.discovered.values()].sort((a, b) => {
        if (a.status !== b.status) return a.status === "lobby" ? -1 : 1;
        return b.lastSeen - a.lastSeen;
      }),
    );
  }

  private registerBackend(): void {
    if (!NETWORK_CONFIG.enableBackendDiscovery || this.role !== "host" || !this.room) return;
    const server = this.serverInfo();
    void fetch("/api/servers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(server),
    }).catch(() => undefined);
  }

  private async pollBackend(): Promise<void> {
    if (!NETWORK_CONFIG.enableBackendDiscovery) return;
    try {
      const response = await fetch("/api/servers", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      const servers: ServerInfo[] = Array.isArray(data.servers) ? data.servers : [];
      for (const server of servers) {
        if (server.hostId !== this.peerId) {
          this.mergeServer({ ...server, lastSeen: Date.now(), source: "backend" });
        }
      }
    } catch {
      /* backend discovery is optional */
    }
    if (this.role === "host") this.registerBackend();
  }
}
