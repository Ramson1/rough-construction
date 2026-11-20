# Project Memory — bluebell secondary game

**Current build (since 2026-11-12): Next.js App Router + TypeScript app at the workspace root.** `npm run dev` / `npm run build` / `npm run start`. Pinned: Next 15.5.29, React 19.3.1, three 0.187.0, peerjs 1.5.5, mqtt 5.16.1, TS 5.9.3. `strict: false` deliberately (ported dynamic engine code). Original single-file build archived at `legacy/roblox game.html` (a copy also remains in Downloads).

**Branding rule (Boss, 2026-11-12):** Everything in this build must point to **Black-Box Tech** and self-advertise the company. Canonical company context:
`C:\Users\Black-Box\.workbuddy-ai\user-0def037e-2137-49cd-9e9b-883bab28884c-personal\BLACKBOX-TECH-CONTEXT.md`
Never use unverified claims (R50M+ revenue, 150K+ users, awards). Contact: https://blackboxtech.online · info@blackboxtech.online · +234 805 020 5349. Slogans: GO DIGITAL. / Discover. Design. Deliver. / Turning Ideas Into Digital Solutions. Brand constants: `lib/brand.ts`; marketing copy arrays: `lib/content.ts`.

**Architecture ( seams for adding features ):**
- `app/page.tsx` client-only dynamic import (`ssr:false`) of `components/GameClient.tsx` — WebGL/WebRTC/localStorage never SSR.
- `components/` — Brand, AccountScreen, Dashboard (Home/Avatar/Company/Inbox), ServerBrowser, GameHud, SettingsModal, GameClient (state owner).
- `lib/game/engine.ts` — `BaseplateEngine` class owns the entire Three.js scene; React calls setAccount / applyRemoteState / removeRemote / showChatBubble / setGraphicsQuality. Add physics, items, buildings, NPCs here.
- `lib/game/avatars.ts` (2D headshots + 3D mesh), `geometry.ts`, `textures.ts` (studs, faces, brand boards, chat bubbles).
- `lib/net/multiplayer.ts` — `MultiplayerClient`: PeerJS + MQTT + BroadcastChannel + backend discovery. Transport-agnostic callback interface; swap transports here.
- `lib/storage.ts` — localStorage + legacy key migration. `lib/config.ts` — env-driven network config. `lib/types.ts` — shared types.
- Backend: `app/api/health`, `app/api/servers` (GET/POST/DELETE registry), `app/api/profile` (validation seam). `lib/server-registry.ts` exports a `ServerRegistry` interface + in-memory adapter — swap for Neon/Postgres/Supabase before production (serverless memory is per-instance). Add auth (Clerk/Supabase Auth) here.
- `app/globals.css` is the original CSS ported verbatim; `app/icon.svg` is the favicon.
- `next.config.mjs` sets `experimental.webpackBuildWorker: false` — required on this Windows machine, otherwise `next build` fails with EPERM on `.next/trace`.

**Flow:** signup → dashboard (Home / Avatar / Company / Inbox) → server browser → create/join → 3D world with HUD, chat, player list → settings (now functional: graphics quality + leave to dashboard).

**Fixed during the port:** head face texture (separate +Z plane instead of a 6-material array on ExtrudeGeometry), remote `targetRotY` now applied, stale server pruning (15s), `sunLight.target` added to scene, chat sender escaped, no inline onclick string interpolation, graphics-quality setting wired, chat dedupe via senderPeerId filter.

**Verified:** `npm run build` passes; all API routes tested; headless Chrome end-to-end smoke test (signup → dashboard → Company tab → server browser w/ backend-listed server → WebGL canvas + HUD + brand chat) passed with zero console errors.

Full study notes: `2026-11-12.md` in this folder.
