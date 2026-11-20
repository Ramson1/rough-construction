/**
 * Black-Box Tech brand identity, kept as the studio/publisher of Rough Construction.
 */
export const BBT = {
  name: "Black-Box Tech",
  industry: "Technology & Software Development",
  slogan: "GO DIGITAL.",
  philosophy: "Discover. Design. Deliver.",
  positioning: "Turning Ideas Into Digital Solutions",
  expression: "Idea • Innovation • Impact",
  website: "https://blackboxtech.online",
  email: "info@blackboxtech.online",
  whatsapp: "https://wa.me/2348050205349",
  whatsappLabel: "+234 805 020 5349",
  location: "Ottawa, ON, Canada",
  primaryMarket: "Nigeria",
  product: "Rough Construction",
} as const;

export const GAME = {
  name: "ROUGH CONSTRUCTION",
  shortName: "Rough Construction",
  tagline: "BUILD. HIDE. STRIKE.",
  description:
    "A fast, blocky multiplayer shooter set inside an unfinished high-rise. Claim the tower, use the site for cover, and take a point every time you drop a rival.",
  version: "1.0.0",
} as const;

export const BBT_LINKS = {
  website: BBT.website,
  email: `mailto:${BBT.email}`,
  whatsapp: BBT.whatsapp,
} as const;

/** Rotating studio announcements — kept for the menu ticker, never spammed in-match. */
export const BBT_CHAT_PROMOS: string[] = [
  "Rough Construction is a Black-Box Tech game. Go Digital.",
  "Built by Black-Box Tech — custom software, web, mobile, AI and game development.",
  "Discover. Design. Deliver. blackboxtech.online",
];
