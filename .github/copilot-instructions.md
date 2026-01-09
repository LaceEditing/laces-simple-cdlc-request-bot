# Copilot instructions (laces-simple-cdlc-request-bot)

## Big picture
- This is an Electron desktop app that runs a Rocksmith song-request bot for Twitch + YouTube.
- The **Electron main process** owns bot lifecycle + persistence and exposes a minimal IPC surface to the renderer UI.
- Runtime flow: chat message (Twitch/YouTube) → `CommandProcessor` → `QueueManager` (+ optional `CustomsforgeService` search) → replies back to chat; queue is also served over HTTP for `!list`.

## Key components / boundaries
- Electron main process + IPC handlers: [src/electron/main.ts](src/electron/main.ts)
- Bot orchestration (connect clients, start web server, optional ngrok tunnel): [src/electron/BotManager.ts](src/electron/BotManager.ts)
- Renderer UI (plain JS/HTML/CSS) calls `window.electronAPI.*`: [public/renderer.js](public/renderer.js), [public/index.html](public/index.html)
- IPC bridge surface (keep in sync with `main.ts` handlers): [src/electron/preload.ts](src/electron/preload.ts)
- Command parsing + permission gates (user vs mod/broadcaster): [src/commands/CommandProcessor.ts](src/commands/CommandProcessor.ts)
- Queue persistence (writes `data/queue.json` under `process.cwd()`): [src/services/QueueManager.ts](src/services/QueueManager.ts)
- VIP Token persistence (writes `data/vip-tokens.json` under `process.cwd()`): [src/services/VIPTokenService.ts](src/services/VIPTokenService.ts)
- CustomsForge/Ignition search + auth (best-effort; can fail due to bot protection): [src/services/CustomsforgeService.ts](src/services/CustomsforgeService.ts)
- Chat clients:
  - Twitch via `tmi.js`: [src/clients/TwitchClient.ts](src/clients/TwitchClient.ts)
  - YouTube via `googleapis` polling: [src/clients/YouTubeClient.ts](src/clients/YouTubeClient.ts)
- Queue web page / API (`/queue`, `/api/queue`) served via Express: [src/web/WebServer.ts](src/web/WebServer.ts)

## Developer workflows (Windows)
- Install: `npm install`
- Build TS → `dist/`: `npm run build` (tsconfig: [tsconfig.json](tsconfig.json))
- Run Electron app: `npm run start`
- Dev loop: `npm run dev` (build then launch Electron)
- Watch TypeScript only: `npm run watch`
- Package installer:
  - Directory build: `npm run pack`
  - Full build: `npm run dist` / Windows NSIS: `npm run dist:win`

## Config & persistence conventions
- Electron app settings are stored in `electron-store` defaults and edited via UI (not via `.env`). See defaults in [src/electron/main.ts](src/electron/main.ts).
- `.env` is used by the non-Electron entrypoint [src/index.ts](src/index.ts) via [src/config/index.ts](src/config/index.ts); keep `.env.example` aligned if you change env keys.
- Queue state is persisted by `QueueManager` to `data/queue.json` (created if missing). If you change the schema, update both load/save paths.
- VIP token data is persisted by `VIPTokenService` to `data/vip-tokens.json` (created if missing). Stores user balances, transaction history, and configurable rates.

## Project-specific patterns to follow
- IPC: when adding/changing a capability, update all 3 layers together:
  1) `ipcMain.handle(...)` in [src/electron/main.ts](src/electron/main.ts)
  2) the `contextBridge.exposeInMainWorld(...)` wrapper in [src/electron/preload.ts](src/electron/preload.ts)
  3) the renderer calls in [public/renderer.js](public/renderer.js)
- Chat commands are centralized in `CommandProcessor.registerCommands()`; keep aliases together (e.g. `!sr` → `!request`, `!vip` → `!tokens`).
- Permissions: mod/broadcaster checks come from `ChatMessage.isMod` / `isBroadcaster` set in the platform clients.
- YouTube: API-key mode is read-only and requires a manual `liveChatId`; OAuth mode enables auto-detect and message sending. See [src/clients/YouTubeClient.ts](src/clients/YouTubeClient.ts).
- ngrok: public URL is optional and is used by `!list` via a `getPublicUrl()` callback passed into `CommandProcessor` from `BotManager`.

## VIP Token System
- Tokens are earned via Twitch subs/bits and YouTube memberships/Super Chats
- TwitchClient fires `onSubscription` and `onBits` events; YouTubeClient fires `onMembership` and `onSuperChat` events
- BotManager wires these events to VIPTokenService handlers
- Token rates are configurable via UI (VIP Tokens tab) and stored in the data file
- Default rates: Twitch Prime/T1 = 1, T2 = 2, T3 = 4, 250 bits = 1; YouTube member = 1, $2.50 Super Chat = 1

## Integration gotchas (avoid breaking)
- `CustomsforgeService.login()` is explicitly called by `BotManager.start()` (constructor should not auto-login).
- `WebServer` serves static assets from `public/` and also renders a server-side HTML queue page; keep route paths stable (`/queue`, `/api/queue`).
- VIPTokenService is instantiated by BotManager and passed to CommandProcessor for the `!tokens` command.
