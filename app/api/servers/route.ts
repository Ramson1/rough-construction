import { NextRequest, NextResponse } from "next/server";
import { GAME } from "@/lib/brand";
import { NETWORK_CONFIG } from "@/lib/config";
import { serverRegistry } from "@/lib/server-registry";
import type { GameMode, RoomStatus, ServerInfo } from "@/lib/types";

export const dynamic = "force-dynamic";

const MODES: GameMode[] = ["duel", "lonewolf", "team", "training"];
const STATUSES: RoomStatus[] = ["lobby", "playing"];

function cleanMode(value: unknown): GameMode {
  return MODES.includes(value as GameMode) ? (value as GameMode) : "team";
}

function cleanStatus(value: unknown): RoomStatus {
  return STATUSES.includes(value as RoomStatus) ? (value as RoomStatus) : "lobby";
}

/** GET /api/servers — list currently registered Rough Construction rooms. */
export async function GET() {
  const servers = await serverRegistry.list();
  return NextResponse.json({
    product: GAME.shortName,
    count: servers.length,
    servers,
    generatedAt: new Date().toISOString(),
  });
}

/**
 * POST /api/servers — host heartbeat.
 * Body: { hostId, hostName, mode, players, maxPlayers, status }.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const hostId = typeof body.hostId === "string" ? body.hostId.slice(0, 80) : "";
  if (!hostId) {
    return NextResponse.json({ error: "hostId is required" }, { status: 400 });
  }

  const mode = cleanMode(body.mode);
  const maxPlayers =
    typeof body.maxPlayers === "number" && Number.isFinite(body.maxPlayers)
      ? Math.max(2, Math.min(NETWORK_CONFIG.maxPlayers, Math.floor(body.maxPlayers)))
      : NETWORK_CONFIG.maxPlayers;
  const players =
    typeof body.players === "number" && Number.isFinite(body.players)
      ? Math.max(1, Math.min(maxPlayers, Math.floor(body.players)))
      : 1;

  const hostName =
    typeof body.hostName === "string" && body.hostName.trim()
      ? body.hostName.trim().slice(0, 80)
      : `${GAME.shortName} room`;

  const entry: ServerInfo = {
    hostId,
    hostName,
    mode,
    players,
    maxPlayers,
    status: cleanStatus(body.status),
    lastSeen: Date.now(),
    source: "backend",
  };

  const servers = await serverRegistry.upsert(entry);
  return NextResponse.json({ ok: true, servers }, { status: 201 });
}

/** DELETE /api/servers?hostId=... — remove a host when it shuts down. */
export async function DELETE(request: NextRequest) {
  const hostId = request.nextUrl.searchParams.get("hostId");
  if (!hostId) {
    return NextResponse.json({ error: "hostId is required" }, { status: 400 });
  }
  await serverRegistry.remove(hostId);
  return NextResponse.json({ ok: true });
}
