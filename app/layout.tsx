import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { BBT, GAME } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: `${GAME.shortName} — ${GAME.tagline}`,
  description: `${GAME.description} A ${BBT.name} game. ${BBT.philosophy} ${BBT.slogan}`,
  applicationName: GAME.shortName,
  authors: [{ name: BBT.name, url: BBT.website }],
  keywords: [
    GAME.shortName,
    "Rough Construction",
    "multiplayer shooter",
    "browser game",
    "3D multiplayer",
    "construction tower",
    "P2P",
    BBT.name,
    "Black-Box Tech",
  ],
  icons: [{ rel: "icon", url: "/icon.svg", type: "image/svg+xml" }],
  openGraph: {
    title: `${GAME.shortName} — ${GAME.tagline}`,
    description: GAME.description,
    url: BBT.website,
    siteName: BBT.name,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${GAME.shortName} — ${GAME.tagline}`,
    description: GAME.description,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0d11",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
