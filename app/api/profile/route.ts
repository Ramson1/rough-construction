import { NextRequest, NextResponse } from "next/server";
import { GAME } from "@/lib/brand";
import { DEFAULT_CUSTOMIZATION, type Customization, type Gender } from "@/lib/types";

export const dynamic = "force-dynamic";

const HEX = /^#[0-9a-fA-F]{6}$/;

const CUSTOMIZATION_FIELDS = [
  "skin",
  "shirt",
  "pants",
  "shoes",
  "hatColor",
] as const;

/**
 * POST /api/profile — server-side validation seam for operator data.
 *
 * Today it validates and echoes. Swap the body of this handler for a real
 * database write (Neon / PostgreSQL / Supabase) when you add cloud accounts,
 * inventory, achievements or moderation.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const nickname =
    typeof body.nickname === "string" ? body.nickname.trim().slice(0, 16) : "";
  if (nickname.length < 3) {
    return NextResponse.json(
      { error: "nickname must be at least 3 characters" },
      { status: 400 },
    );
  }

  const gender: Gender =
    body.gender === "female" || body.gender === "custom" ? body.gender : "male";

  const incoming =
    body.customization && typeof body.customization === "object"
      ? (body.customization as Partial<Customization>)
      : {};
  const customization: Customization = { ...DEFAULT_CUSTOMIZATION, body: gender };
  for (const field of CUSTOMIZATION_FIELDS) {
    const value = incoming[field];
    if (typeof value === "string" && HEX.test(value)) customization[field] = value;
  }
  if (
    incoming.hat === "hardhat" ||
    incoming.hat === "cap" ||
    incoming.hat === "beanie" ||
    incoming.hat === "none"
  ) {
    customization.hat = incoming.hat;
  }
  if (
    incoming.face === "confident" ||
    incoming.face === "focused" ||
    incoming.face === "happy"
  ) {
    customization.face = incoming.face;
  }

  return NextResponse.json({
    ok: true,
    product: GAME.shortName,
    profile: { nickname, gender, customization },
    note: "Validation-only endpoint. Persist to Neon/Postgres/Supabase here.",
  });
}

export async function GET() {
  return NextResponse.json({
    endpoint: "/api/profile",
    method: "POST",
    accepts: ["nickname", "gender", "customization"],
    product: GAME.shortName,
  });
}
