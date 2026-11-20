import { NextResponse } from "next/server";
import { BBT, GAME } from "@/lib/brand";
import { NETWORK_CONFIG } from "@/lib/config";

export const dynamic = "force-dynamic";

/** GET /api/health — liveness check and public runtime configuration. */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    company: BBT.name,
    product: GAME.shortName,
    title: GAME.name,
    tagline: GAME.tagline,
    slogan: BBT.slogan,
    philosophy: BBT.philosophy,
    website: BBT.website,
    features: {
      p2p: "peerjs",
      discovery: ["mqtt", "broadcast-channel", "backend-registry"],
      backendDiscovery: NETWORK_CONFIG.enableBackendDiscovery,
      audio: "procedural-web-audio",
      persistence: "localStorage + in-memory registry (swap for Neon/Postgres)",
    },
    timestamp: new Date().toISOString(),
  });
}
