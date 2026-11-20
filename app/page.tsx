"use client";

import dynamic from "next/dynamic";
import { BrandMark } from "@/components/BrandMark";

/**
 * The game touches WebGL, WebRTC, WebSocket and localStorage, so it is mounted
 * client-only. Everything else (metadata, branding, API routes) stays on the
 * server side of the App Router.
 */
const GameClient = dynamic(() => import("@/components/GameClient"), {
  ssr: false,
  loading: () => (
    <div className="boot-screen">
      <BrandMark size="lg" />
      <div className="loader-ring" />
      <span>OPENING SITE 07</span>
    </div>
  ),
});

export default function Page() {
  return <GameClient />;
}
