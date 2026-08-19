# Vendored-Tree Monkeypatch Checklist

`server/{engine,content,webclient}` are vendored copies of upstream LostCity (rev 274).
Every local modification ("monkeypatch") is listed here with a verification step.
**Walk this checklist after every vendor sync/rebase** — history shows patches don't get
dropped wholesale, they get subtly severed (see "Cross-boundary invariants" below).

How the vendoring works: upstream clones with remotes live at `../repos/{engine,content,webclient}`;
each `vendor-274` branch = upstream tip + ONE squashed "rs-sdk local mods" commit. The systematic
audit (compare the mods commits between old and new vendor branches, file-level + added-line
survival) is described in the project memory; this file is the human-readable checklist.

---

## Engine (`server/engine/`)

### Protocol / custom packets
- [ ] **Global chat broadcast** — `MessagePublicHandler.ts` broadcasts public chat to all
      players outside the 14-tile overhead range via custom `MESSAGE_PUBLIC` packet
      (opcode **255**, variable length). Pieces: `ServerGameProt.ts` (opcode),
      `ServerGameProtRepository.ts` (binding), `codec/MessagePublicEncoder.ts` (p8 userhash +
      WordPack), `model/MessagePublic.ts`.
      Verify: `grep -n "MESSAGE_PUBLIC = new ServerGameProt(255" src/network/game/server/ServerGameProt.ts`
      **⚠ MUST pair with the webclient receive branch (see webclient section). An engine-side
      packet with no client handler causes a T1 LOGOUT on the receiving client.**

### Config / environment
- [ ] **`Environment.ts`** — flat back-compat aliases over 274's nested `WorldConfig`, plus
      `migrateFromLegacyEnv(loadWorldConfig(), process.env)` overlay so fly.io `[env]` vars win
      over `world.json`. Also `NODE_WS_ONDEMAND` **defaults true** (274 client streams assets
      over the game WS; false ⇒ stalls at ~60% "Connecting to update server").
- [ ] **`WorldConfig.ts`** — default `web.port = 8888` on all platforms; `xpRate = 25`.
- [ ] **400-char chat** — `WorldConfig.ts` default `node.maxMessageLength = 400` (classic 80).
      Paired pieces, all required: `wordenc/WordPack.ts` caps follow
      `Environment.node.maxMessageLength` (not hardcoded 80) AND clamps packed output to
      240 bytes (`truncateToByteBudget` — all chat frames carry a 1-byte length; 2-nibble
      chars would overflow it and corrupt the stream); `MessagePublicHandler.ts` /
      `MessagePrivateHandler.ts` use `Packet.alloc(1)` not `alloc(0)` (packed chat can be
      ~250 bytes; the 100-byte tier throws RangeError mid-cycle and kicks the player).
      Mirrors in webclient (see below) and SDK chunking (`sdk/index.ts` packedNibbles).
      Verify: `grep -n "maxMessageLength: 400" src/util/WorldConfig.ts && grep -n "alloc(1)" src/network/game/client/handler/MessagePublicHandler.ts`
- [ ] **`World.ts`** — connection timeouts relaxed for bot background tabs
      (`TIMEOUT_NO_CONNECTION` 5m / `TIMEOUT_NO_RESPONSE` 10m, gated by `NODE_DEBUG_SOCKET`).
- [ ] **`World.ts` tick drift cap** — `cycle()` clamps `nextTick` to at most 2 ticks of
      backlog before computing `drift`, so the world resumes normal pacing after sustained
      overload instead of sprinting through the whole backlog at max speed.
      Verify: `grep -n "start - this.tickRate \* 2" src/engine/World.ts`

### Database
- [ ] **Bun sqlite dialect** — `src/db/dialect/BunSqliteDialect*.ts` (3 files) + runtime chooser
      in `src/db/query.ts` (`typeof Bun !== 'undefined'` → bun:sqlite, else upstream's
      `node:sqlite`). Upstream is node-primary; **Bun does not implement `node:sqlite`** —
      without this the engine won't boot under bun.
- [ ] **SQLite WAL + busy_timeout** — `src/db/query.ts` runs
      `journal_mode=WAL; synchronous=NORMAL; busy_timeout=10000` on every connection.
      Each worker thread has its own connection; without WAL a logger write burst
      (telemetry compaction) blocked login queries and took prod logins down after the
      2026-08-03 deploy. Paired: LoggerServer first-compaction delay 15min
      (past the reconnect storm) + 10ms pause between compaction groups, and the
      gateway auth timeout is 15s (must outlast busy_timeout). WAL adds
      `db.sqlite-wal/-shm`; file-copy backups must checkpoint first.

### Web layer (mostly rs-sdk-only files, but `src/web.ts` is a 3-line shim — on conflict keep the shim)
- [ ] **`src/web/`** modular split: `websocket.ts` (`/gateway` WS proxy → gateway on :7780,
      `isAgentProxy`), `pages/api.ts` (`/api/exportCollision` — must read the in-engine TS
      routefinder, NOT the removed WASM; discovers mapsquares from maps **zip ∪ dir**;
      `/api/screenshot`), `pages/client.ts` (serves `view/bot.ejs` at `/` and `/bot`),
      `pages/hiscores.ts` + `src/web/hiscoresServer.ts` + `src/hiscores.ts` (custom hiscores;
      **profile query param XSS-sanitized**), `pages/screenshots.ts`, `pages/static.ts`.
- [ ] **`view/bot.ejs`** — the entire bot UI page (rs-sdk-only): reads `?bot=`/`?password=`
      (auto-login), **writes both back to the URL on login/field-change**, cache-busted
      `client.js?v=<%= cachebust %>` import, quick-login/create/skip-tutorial controls.
- [ ] **Login server** — `LoginServer.ts`: `sdk_auth` message handler (gateway auth path,
      username normalized to match engine); `LoginThread.ts`: **no auto-grant of dev
      staffmodlevel on non-production worlds** (public server safety).

### Gameplay / safety
- [ ] **XP curve** — `entity/Player.ts` `getExpByLevel` table: delta uses `level/10.0`
      (custom curve), table stored in ×10 "fine" units (`Math.floor(acc/4) * 10`), L99 =
      10,701,400. **Duplicated in webclient — keep in sync (see below).**
- [ ] **`PlayerLoading.ts`** — clamp loaded levels to base levels.
- [ ] **Anti-grief removals** — `MessagePrivateHandler.ts` / `ReportAbuseHandler.ts`: upstream's
      automated 2-day bans REMOVED (bots trip them).
- [ ] **Random events toggle** — `ScriptOpcode.ts` + `DebugOps.ts`: `MAP_RANDOM_EVENTS` opcode
      backed by `NODE_RANDOM_EVENTS` env (paired with content `engine.rs2`, see content section).
- [ ] **`[LOGOUT DEBUG]` instrumentation** — console.warn breadcrumbs in
      `NetworkPlayer.ts`, `IdleTimerHandler.ts`, `ClientCheatHandler.ts`, `PlayerOps.ts`,
      `World.ts` (and webclient `Client.ts`). Low-stakes but useful; fine to re-add lazily.
- [ ] **King of the Hill (Demonic Ruins)** — `src/engine/Koth.ts` (rs-sdk-only file; wall
      polygon traced from `m51_60.jm2`, one capture per wall-clock minute) + hook in
      `World.ts` `cycle()` (`Koth.cycle` → `koth_capture` postMessage), relay cases in
      `LoggerThread.ts`/`LoggerClient.ts`/`LoggerServer.ts`, `koth_capture` table (both
      prisma schemas + `db/types.ts`), `/hiscores/koth` page in `web/pages/hiscores.ts`
      (registered in `web/index.ts` + `web/hiscoresServer.ts`), player-sprite renderer in
      webclient `src/viewer/ItemViewer.ts` (`renderPlayerSpriteAsImageData`). Depends on
      the logger pipeline (EASY_STARTUP or a standalone `bun run logger`) — events are
      silently dropped without it.
- [ ] **Worker-thread crash hardening** — `src/server/InternalClient.ts` uses persistent
      `.on('close'/'error')` handlers instead of `.once()` (a second ws error after a
      successful open was an unhandled EventEmitter 'error' that killed the worker → every
      later `postMessage` threw mid-cycle → whole world shut down; this was the "engine
      dies ~40s into a bot session" local failure). `World.ts` constructor and `app.ts`
      easyStartup block attach 'error'/'exit' listeners to every Worker so the dying
      thread is named in the log.
- [ ] **Choice-dialog resume guard** — `handler/ResumePauseButtonHandler.ts` ignores a bare
      RESUME_PAUSEBUTTON while `player.resumeButtons` is non-empty (a pending `p_choice`
      would otherwise resolve from stale `last_com`, silently re-picking the player's last
      clicked option — bots re-declined the Al Kharid toll forever);
      `handler/IfButtonHandler.ts` clears `resumeButtons` when a registered option resumes
      the script. Verify: `HEADLESS=true bun sdk/test/alkharid-gate-choice-resume.ts`.

### Bridge (on-chain exchange — chain/README.md is the system doc)
- [ ] **`src/engine/bridge/BridgeService.ts`** (wholly added) — game-side half of the
      bridge_tx state machine: registry/wallet caches, link codes, per-player in-flight
      serialization, save-before-release durability rule, crash/relog recovery from
      disk-loaded watermark varps. Wired in `World.ts` (`BridgeService.start(this)` in
      `start()`, `player_save_ack` routing at the top of `onLoginMessage`, public
      `requestPlayerSave()` next to `savePlayers()`).
- [ ] **Bridge script ops** — `ScriptOpcode.ts` `BRIDGE_*` = 10100-10106 (+ map entries),
      `handlers/BridgeOps.ts` (wholly added), spread in `ScriptRunner.ts`,
      `data/symbols/commands.sym` ids 10100-10106. Pairs with `engine.rs2` declarations
      (content section) — both sides or scripts fail to compile.
- [ ] **`player_save_sync`/`player_save` save-with-ack** — `LoginThread.ts` new case posts
      `player_save_ack {requestId, success}`; `LoginClient.ts` `playerSaveSync()` (fetchSync);
      `LoginServer.ts` `player_save` handler (verify + wouldResetSaveFile + write + reply,
      NO account_login mutation); `login/index.d.ts` `SaveAckResponse` in the union.
- [ ] **`ClientCheatHandler.ts` `::linkwallet`** — ungated player command placed BEFORE the
      staff gates; re-splits raw input (the lowercased args would corrupt base58).
- [ ] **`FriendServer.ts` bind host** — `Environment.FRIEND_HOST`, default `127.0.0.1`
      (RELAY_* is unauthenticated remote control; loopback unless multi-host).
- [ ] **`Environment.ts` bridge keys** — `BRIDGE_REGISTRY_PATH`, `BRIDGE_ADMIN_TOKEN`,
      `BRIDGE_DAEMON_PORT`, `FRIEND_HOST` in the rs-sdk-only block.
- [ ] **`web/pages/bridge.ts`** (wholly added, wired in `web/index.ts`) — /bridge/link
      (page + ed25519-verified POST), /bridge/linked/:address, /bridge/token/:name.json,
      /bridge/deposit/notify (loopback proxy to the daemon), /bridge/status/:username
      (Bearer BRIDGE_ADMIN_TOKEN), /bridge/pending/:address (public, wallet-scoped:
      non-terminal withdrawals so the web wallet can prompt account creation for
      'awaiting_account' rows — no username returned). Deps added to engine
      package.json: `tweetnacl`, `bs58`.
- [ ] **Prisma `account_wallet` + `bridge_tx`** — both schemas + `migrations/20260817000000_bridge`
      (sqlite + mysql), kysely regen of `src/db/types.ts`. The daemon (chain/daemon) opens the
      same sqlite with its own connection and owns the chain-side transitions.

### Assets
- [ ] `public/img/skill/*` (19 files), `public/img/*`, favicons, hiscores images —
      restored after upstream website migrations deleted them. Verify pages render with images.
- [ ] `tools/pack/PackAll.ts` `packOnDemandZip()` — regenerates `data/pack/ondemand.zip`
      (snapshot of cache idx1–4) at the end of `packAll()`. Existed upstream in the 254 era,
      dropped in 274. Serves the hiscores ItemViewer at `/ondemand.zip`; without it, newly
      packed item models render as blank hiscores icons. Verify: after `bun run build`,
      `unzip -l data/pack/ondemand.zip` includes the highest model id in `content/pack/model.pack`.

---

## Webclient (`server/webclient/`)

### Lite client (wholly added — `src/lite/`, headless bot client; see `src/lite/README.md`)
- [ ] `src/lite/**` is rs-sdk-only and has no upstream counterpart — it should survive
      a sync untouched. It **consumes** vendored modules though (`config/*Type`,
      `dash3d/Client{Player,Npc,Obj}`, `dash3d/CollisionMap`, `io/{Packet,Isaac,JagFile,
      ClientStream,ServerProt,ClientProt}`, `wordfilter/*`), so a decode change upstream
      lands in both clients — which is the point.
      Verify: `bun src/lite/bench.ts 2` logs in and reports live sessions.
- [ ] **`src/io/ClientStream.ts` `isClosed` getter** — 3 added lines exposing
      `dummy || remoteClosed`. The browser client learns a socket is dead by reading from
      it and taking the throw; the lite session loop only reads when `available > 0`,
      which a remotely-closed stream reports as 0 *forever* — so without this the loop
      spins on a dead socket and the session never ends. Consumed by
      `lite/net/GameConnection.isClosed` → `LiteClient.isInGame()`.
      Verify: `grep -n "get isClosed" src/io/ClientStream.ts src/lite/net/GameConnection.ts`
- [ ] **`src/client/LoopCycle.ts` + the `Client.loopCycle` accessor pair** — `loopCycle`
      moved out of Client into a one-field module, and `Client.ts` now exposes it as
      `static get/set loopCycle` over that box. Reason: `ClientPlayer.ts` read
      `Client.loopCycle` for one line in `getSequencedModel()`, and that import drags the
      whole 14k-line Client (plus Pix3D, MapView, WebAudio, localStorage) into anything
      touching a ClientPlayer — 212MB of imports for the headless client, vs 21MB after.
      The box stays browser-only state: the lite client keeps a `cycle` counter per
      `LiteClient`, since one counter shared by N bots in a process runs N× fast.
      On conflict: keep the accessor, re-point `ClientPlayer.ts` at `LoopCycle.value`.
      Verify: `grep -n "LoopCycle" src/dash3d/ClientPlayer.ts src/client/Client.ts`
      **⚠ `ClientPlayer.ts` must NOT import `#/client/Client.js`.** An upstream sync that
      restores that import silently re-bloats the lite client; it still runs, so nothing
      fails loudly. Cheap check:
      `bun -e 'import("./src/dash3d/ClientPlayer.js")'` must not need a DOM shim.

- [ ] **400-char chat (webclient half)** — `wordfilter/WordPack.ts` internal clamps raised to
      `MAX_CHARS = 512` (safety bound above the ~509 wire ceiling; the real cap is enforced
      at call sites from the server-configured value) plus the same 240-byte
      `truncateToByteBudget` as the engine copy. `lite/LiteClient.ts` default
      `maxMessageLength` is 400 (lite has no config-injection channel — keep in sync with
      the engine `WorldConfig` default). `lite/runner.ts` honors a `GATEWAY_URL` override
      (bot.env or process env) because SERVER doubles as game origin + gateway address and
      that breaks for `localhost:8888`.
      Verify: `grep -n "MAX_CHARS = 512" src/wordfilter/WordPack.ts && grep -n "?? 400" src/lite/LiteClient.ts`

### Bot bridge (wholly added — `src/bot/`, 8 files + `src/client/BotClient.ts`, `src/viewer/ItemViewer.ts`)
- [ ] `StateCollector.ts`, `BotOverlay.ts`, `ActionExecutor.ts`, `GatewayConnection.ts`,
      `OverlayUI.ts`, `formatters.ts`, `types.ts`, `index.ts`.
      Note: **gateway state messages come from `BotOverlay.sendState()`** (includes
      `allComponents`/`componentId`), not `StateCollector.collectDialogState` (basic fallback).
      `GatewayConnection` reads `?bot=`/`?password=` **at page load** for gateway registration.

- [ ] **`src/dash3d/LoopCycle.ts`** (rs-sdk-only) — the frame counter split out of Client;
      `Client.loopCycle` is now a static getter/setter over it and
      `ClientPlayer.ts` reads `LoopCycle.value` instead of importing Client. Required so
      the viewer bundle (which imports ClientPlayer for KOTH character sprites) doesn't
      drag the whole game client (and its node-only `open` dep) in and fail to build.

### Client.ts bot SDK surface (~1,450 added lines inside upstream's `src/client/Client.ts`)
- [ ] Bot methods: `autoLogin`, `getDialogOptions`/`getDialogText`/`getChatInterface`/
      `captureDialogToHistory`/`debugDialogComponents`, `findNpcByName`, `talkToNpc`,
      `interactNpc/Loc/Player`, `acceptCharacterDesign` (**must send IDK_SAVEDESIGN AND the
      CC_ACCEPT_DESIGN IF_BUTTON**), `setTargetedFramerate`, etc.
- [ ] **Walk-before-op**: `interactLoc`, `talkToNpc`, `interactNpc`, `interactPlayer` ALL call
      `tryMove(..., type=2)` before writing OPLOC/OPNPC/OPPLAYER. 274's
      `clientRoutefinder=true` means the SERVER DOES NOT PATHFIND to interaction targets —
      a missing tryMove = "I can't reach that!" from 2+ tiles.
- [ ] **`MESSAGE_PUBLIC` receive branch** (pairs with engine broadcast): `ptype ===
      ServerProt.MESSAGE_PUBLIC` → g8 userhash + `WordPack.unpack(psize - 8)` →
      `addChat(2, ...)`. Plus `src/io/ServerProt.ts`: `MESSAGE_PUBLIC = 255` and size-table
      entry `-1` at index 255.
      Verify: `grep -n "ServerProt.MESSAGE_PUBLIC" src/client/Client.ts` (a receive `if`, not
      just the enum).
- [ ] **`mapFlagUnsetCount`** — the `UNSET_MAP_FLAG` receive branch increments a counter
      beside `this.minimapFlagX = 0`. It is the only wire evidence that the server refused
      an op (every `Op*Handler` refusal answers with this packet and nothing else), and
      `bot/StateCollector.collectOpFeedback` turns it into `state.opFeedback`. Upstream
      just clears the flag, so a sync silently reverts it — and nothing fails, the signal
      merely goes quiet and bots go back to waiting out timeouts.
      **Pairs with `src/lite/protocol/incoming.ts`**, which must increment the same field.
      Verify: `grep -n "mapFlagUnsetCount" src/client/Client.ts src/lite/protocol/incoming.ts`
      (two files, one increment each), plus `bun test src/bot/StateCollector.test.ts`.
- [ ] **XP table** — `Client.ts` `levelExperience`: same `level/10.0` curve but **NO ×10**
      (client receives real xp; engine stores fine xp). Verify both formulas side-by-side after
      any sync touching `Player.ts` or `Client.ts`.
- [ ] **AFK logout extended** to 10 minutes (upstream 90s logs idle bots out).
- [ ] **Renamed-field adaptations** (274): `chatModalId`, `redrawChat`, `sideIcon`,
      `activeIcon`, `redrawSide`, `redrawIcons`, static `Client.loopCycle` — the bot bridge
      accesses some via `as any`, so **`bunx tsc --noEmit` does NOT catch all of these**;
      grep-audit `(client as any).X` accesses after a sync.

### Build / shell
- [ ] **`bundle.ts`** — `BUILD_MODE` standard/bot/both; **terser property mangling OFF**
      (mangling breaks bot.ejs/Puppeteer accessing client members by name).
- [ ] **`GameShell.ts`** — `deltime = 14` (≈30% faster client loop).
- [ ] **`MapView.ts`** — live player-position tracking (`playerPositions`,
      `shouldDrawPlayers`) for the `/mapview/` page; pairs with engine `/playerpositions`.
- [ ] `src/3rdparty/tinymidipcm.js` tweak; `package.json` (bun scripts, deps).
- [ ] **Filename casing**: `src/io/JagFile.ts` (capital F) in webclient vs `src/io/Jagfile.ts`
      in engine. macOS hides case-only renames from git — after a sync run:
      `comm -23 <(git ls-files | sort) <(find . -type f -not -path './.git/*' | sed 's|^\./||' | sort)`
      (the 2 submodule gitlinks are expected hits).

---

## Content (`server/content/`)

- [ ] **`scripts/engine.rs2`** — `[command,map_random_events]` declaration (pairs with engine
      `MAP_RANDOM_EVENTS` opcode — both sides or scripts fail to compile).
- [ ] **`scripts/login_logout/login.rs2`** — random-event timer gated on `map_random_events`.
- [ ] **`scripts/macro events/scripts/macro_events.rs2`** — macro events disabled when off.
- [ ] **`scripts/shop/configs/shop.varp`** — `transmit=yes` on shop varps (bot shop state).
- [x] **README art** — moved out of the vendored tree to `docs/media/` (promo.gif, discord.svg,
      hiscores.svg, task_length.svg); nothing in `content/title/` is locally modified anymore.
- [ ] Smithing arrowheads + telegrab + nails fixes live in content history; they're additive
      and survive rebases, but re-run a smoke test if smithing/magic behaves oddly.

### Bridge (on-chain exchange — chain/README.md is the system doc)
- [ ] **`scripts/bridge/`** (wholly added) — `configs/exchange_clerk.npc`, `configs/bridge.varp`
      (2 × `scope=perm` watermark varps — the exactly-once protocol depends on varp+inv
      persisting atomically in the same `.sav`), `configs/bridge.constant`
      (`^wealth_bridge_withdraw = 11`, `^wealth_bridge_deposit = 12`),
      `scripts/exchange_clerk.rs2`, `scripts/bridge_queues.rs2`.
- [ ] **`scripts/engine.rs2`** — 7 `[command,bridge_*]` declarations (pairs with engine
      `BRIDGE_*` opcodes 10100-10106 — both sides or scripts fail to compile).
- [ ] **`pack/npc.pack`** — `1359=exchange_clerk`; **`pack/varp.pack`** — `359=bridge_debit_ack`,
      `360=bridge_credit_ack`. Committed ids; must not drift between environments.
- [ ] **`maps/m49_53.jm2`** — NPC spawn line `0 53 49: 1359` (Exchange Clerk, Varrock west
      bank public floor, world 3189,3441,0). Map edits need a restart, not `::reload`.
- [ ] **Custom content breaks cache-authenticity checksums** — any build of this tree needs
      `BUILD_VERIFY=false` (set in `server/Dockerfile`; required locally too).

---

## Cross-boundary invariants (how things actually break)

These are the rules derived from every severed-wire bug found so far:

1. **A custom `ServerGameProt` packet MUST ship with its webclient `ptype` receive branch in
   the same commit.** Unhandled game packets hit the client's T1 path → **logout**. (Global
   chat shipped engine-only in `47af85ff7` and silently kicked every out-of-range player on
   chat for a month.) Gateway messages / bot actions / state fields degrade silently;
   game packets do not.
2. **XP curve is duplicated** engine `Player.ts` ↔ webclient `Client.ts` (units differ ×10).
   Change one ⇒ change both.
3. **`MAP_RANDOM_EVENTS`** is duplicated engine opcode ↔ content rs2 command.
4. **BotAction unions are duplicated** `sdk/types.ts` ↔ `server/webclient/src/bot/types.ts`,
   and every action needs an `ActionExecutor` case.
5. **tsc is necessary but not sufficient**: run `bunx tsc --noEmit` in BOTH engine and
   webclient after every sync (esbuild bundles despite TS errors), but `as any` client-field
   accesses and bot.ejs `clientInstance.*` references are invisible to it — grep-audit those.

## Post-sync verification (5 minutes)

```bash
# typecheck both (esbuild hides TS errors)
(cd server/engine && bunx tsc --noEmit) && (cd server/webclient && bunx tsc --noEmit)

# case-only rename check (macOS hides these from git)
comm -23 <(git ls-files | sort) <(find . -type f -not -path './.git/*' | sed 's|^\./||' | sort)

# custom packet pairing
grep -n "MESSAGE_PUBLIC = new ServerGameProt(255" server/engine/src/network/game/server/ServerGameProt.ts
grep -n "ptype === ServerProt.MESSAGE_PUBLIC" server/webclient/src/client/Client.ts

# XP curve parity (compare by eye: same formula, engine has *10, client doesn't)
grep -A2 "Math.pow(2.0, level / 10.0)" server/engine/src/engine/entity/Player.ts server/webclient/src/client/Client.ts

# boot + live endpoints after deploy
curl -so /dev/null -w "%{http_code}\n" https://rs-sdk-demo.fly.dev/{playercount,hiscores,mapview/}

# end-to-end: login a bot, chop a tree 3+ tiles away (exercises walk-before-op),
# have a second distant bot chat (exercises MESSAGE_PUBLIC both directions)
```

If content map files changed: regenerate `sdk/collision-data.json` from the MEMBERS prod server:
`curl https://rs-sdk-demo.fly.dev/api/exportCollision > sdk/collision-data.json`

### Mercantile client branding
- [ ] `server/engine/view/client.ejs` + `view/bot.ejs`: footer social links changed from
      Discord/`MaxBittker/rs-sdk` GitHub to X (`x.com/MercantileRS`) + `MidTermDev/mercantile`
      GitHub. ejs renders per-request, so no rebuild needed.

### Exchange Clerk at every bank
- [ ] `server/content/place-clerks.ts` clusters banker spawns into banks and places a
      reachable Exchange Clerk (npc 1359) on the walkable lobby tile of each (21 banks),
      using sdk/pathfinding collision data (openness≥14/25 so it's never behind the
      counter). Edits `maps/*.jm2` NPC sections. Re-run `--apply` + repack after vendor sync.

### Agent self-serve API keys
- [ ] `web/pages/agent.ts` (+ wired in `web/index.ts`): `POST /agent/register` (rate-limited)
      issues a fresh game account whose password is the apiKey; logs to data/agent-keys.jsonl.
      Optional body `{username}` (1–12 chars `[a-zA-Z0-9_ ]`, 409 if taken); omitted → random.
      `Environment.AGENT_KEYS_ENABLED` (default true). Also `GET /agent/stats` → `{online,registered}`
      for the site's live player count.
- [ ] `LoginServer.ts` `sdk_auth` honors a `strict` flag → no auto-create (reject unknown accounts).
- [ ] `gateway.ts` `AGENT_KEY_MODE=true` → passes `strict:true` so only issued keys can drive bots
      (humans via the browser game-login path are unaffected). Site: /agents page.
- [ ] Public deploy must proxy the gateway WebSocket to it (e.g. nginx `/gateway` → :7780);
      both the lite runner and the SDK controller derive `wss://<host>/gateway`.
- [ ] `agent/agent.ts` (repo root): turnkey LLM harness — spawns the lite game client, connects the
      SDK, skips the tutorial, and serves a local watch/prompt console (DeepSeek by default; BYO key).

### Browser AI player (webclient) — `?ai=1`
- [ ] `webclient/src/bot/AiBrain.ts` (new): in-browser LLM agent. Reads BotOverlay's collected world
      state, calls the player's chosen provider (Anthropic `/v1/messages` w/ `anthropic-dangerous-direct-browser-access`,
      or OpenAI/DeepSeek/custom `/chat/completions`) with a key held in localStorage (never sent to us),
      resolves the decision (name → nearby npc/loc/item) into a BotAction, and feeds the SAME ActionExecutor
      the gateway uses. Self-contained floating panel (provider/model dropdown, key, prompt, start/stop, log).
- [ ] `webclient/src/bot/BotOverlay.ts`: added `getWorldStateForAi()`, `enqueueAiAction()`, `isIdle()`.
- [ ] `webclient/src/bot/index.ts`: export `AiBrain`.
- [ ] `webclient/src/client/Client.ts`: `AI_MODE = ENABLE_BOT_SDK && ?ai=1`; after `new BotOverlay(this)`,
      `new AiBrain(this.botOverlay)` in a try/catch (bot bundle only; standard build tree-shakes it out).
- [ ] Requires the bot bundle: served at `/bot` (out/bot). Public deploy must proxy `/bot/*` assets to the
      engine (nginx `bot/` in the asset regex). AI page: `/bot?ai=1`. Site framing at `/ai`.

### Security fixes
- [ ] `content/scripts/player/scripts/death.rs2` `[queue,player_death]` (issue #55): the duel-death branch was
      gated on the challenged OPPONENT's coord + a sticky `%duel2accept` varp, letting a player die anywhere and
      skip `~player_death` (no item loss, no respawn) if an accomplice stood in a fight-pit. Now gated on the
      DYING player's OWN state — `~in_duel_arena(coord) = true & %duelstatus < ^duelstatus_lost` — matching
      `[label,player_death_duel]`'s own guard. Needs a content repack (BUILD_STARTUP=true).
- [ ] `engine/src/engine/bridge/BridgeService.ts` recoveryScan (MONEY-PRINTING; found in the GP-integrity audit):
      the withdraw/claim recovery used `watermark >= row.id` to declare a debit/credit durable. `%bridge_debit_ack`
      is a single running max set to `$id` atomically with the inv_del, so a crash-orphaned lower-id `requested`
      row (coins never removed) could be marked `debited` after a LATER legit withdraw bumped the watermark past it
      → the daemon minted real SPL tokens for nothing. Fixed to `watermark === row.id` on BOTH the debit and credit
      sides (exact match proves THIS row's op persisted; a later op sets the watermark to a different id). Engine
      code — a normal restart picks it up.
- [ ] `content/scripts/areas/area_lostcity/configs/lostcity.npc` cheapringshop (upstream issue #56): Irksol's ring
      shop sold `ruby_ring` at 50% (1012gp) — below its high-alch value (1215) and Grum's goldshop buy (1417),
      a net-GP alch/arbitrage faucet. Raised `shop_sell_multiplier` 500 → 1000 (authentic). Content repack.
- [ ] `engine/view/bot.ejs` (upstream #57 + #59): the `/bot` login form defaulted the password to `test`,
      fell back to `test` in quickLogin, and wrote the password into the URL (`updateUrlWithPassword` via
      replaceState). On a value-bearing server that meant takeover-able accounts + credential leakage into
      history/logs. Fixed: removed the `test` default/fallback (require a password), neutralized
      `updateUrlWithPassword` to a no-op, and persist the password to localStorage only. bot.ejs is
      server-rendered (ejs.renderFile) so this is live with no restart/rebuild.
- [ ] `engine/src/web/pages/api.ts` `handleScreenshotUpload` (upstream #58, defense-in-depth): added a 2 MiB
      cap (checked before decode + on decoded bytes), `data:image/png;base64` + PNG-signature validation, and a
      collision-resistant filename. NOTE: `/api/*` is NOT exposed through our nginx (routes to the site → 404)
      and 8888 isn't public, so this endpoint is not externally reachable on our deploy — this is hardening for
      if that ever changes; deploys on the next engine restart.
### Safe restarts (2026-08-18)
- [ ] `app.ts` `safeExit` (SIGINT/SIGTERM): now `World.rebootTimer(REBOOT_NOTICE_TICKS ?? 100)` —
      a ~60s in-game "System update" countdown before shutdown (was `rebootTimer(0)` = instant, no
      notice). The engine already only `process.exit(0)`s once every player is logged out AND their
      save is confirmed on disk (`online===0 && logoutRequests.size===0`), so a graceful stop loses
      nothing. OPS: NEVER `pkill -9` the engine (SIGKILL bypasses the save → up to 15m lost); use
      SIGTERM + wait (host `/tmp/stop-engine.sh`; restart scripts patched to call it and abort rather
      than force-kill). `content/scripts/bridge/scripts/exchange_clerk.rs2`: link-code mesbox text
      `@gre@`→`@bla@` (green was unreadable on parchment) + updated to the Wallet-page link flow.

### Cheat/spawn lockdown (2026-08-18, value-bearing world)
- [ ] `network/game/client/handler/ClientCheatHandler.ts`: item/GP/stat spawn commands
      (`give`, `giveother`, `givemany`, `givecrap`, `setstat`, `advancestat`, `setlevel`, `addxp`)
      are now hard-disabled for EVERYONE regardless of staffModLevel — on a bridged world any of
      these = counterfeiting real tokens. Refused at the handler entry with "That command is
      disabled on this world." Override with `ALLOW_SPAWN_COMMANDS=true` (throwaway dev worlds only).
- [ ] Also demoted the one elevated account (`bridgetest`, was level 4) to 0 (DB), and set
      `NODE_PRODUCTION=true` (disables the `>=4` debug procs + enables login attempt throttling).
      Result: 0 accounts with staffmodlevel > 0; no reachable spawner.

### Bridge features (2026-08-18)
- [ ] `engine/src/web/pages/bridge.ts` + `BridgeService.ts`: **wallet unlink**. `POST /bridge/unlink`
      {address, signature} — self-authenticating ed25519 sig over `unlinkMessage(address)` by the linked
      wallet; deletes the `account_wallet` row and calls `BridgeService.onWalletUnlinked` (clears walletCache,
      messages the player). Idempotent. Site: Unlink button on /wallet (WalletPanel), `unlinkWallet` in lib/bridge.
- [ ] **GP sink tax (1%, GP-only, both directions)** — chain-side (chain/daemon): `verifier.gpAfterSink` =
      `gp - floor(gp*100/10000)`. Withdraw (game→chain) mints only the post-tax amount (withdraw-worker.ts);
      deposit (chain→game) credits only the post-tax amount (verifier.ts). Taxed GP is destroyed (a deflationary
      sink). Items untaxed; rounded down (<100 GP untaxed). Announced in the site changelog (/changelog).

- [ ] NOT PATCHED (assessed): #60 `/api/exportCollision` (recomputes on the tick thread, ~seconds) — also NOT
      exposed through our nginx (internal build tool used to regen sdk/collision-data.json). Caching it risks the
      dev regen workflow, so left for upstream. #59 deeper items (unthrottled `sdk_auth`, NODE_PRODUCTION=false
      disabling login attempt-counters) — mitigated for us by AGENT_KEY_MODE (unknown accounts rejected) + 20-char
      keys; NODE_PRODUCTION=true recommended before wide launch (enables the game-login throttle).

### Swarm bots — server-side tutorial skip (2026-08-19)
- [ ] `engine/src/engine/entity/Player.ts` (`onLogin`) + `engine/src/util/Environment.ts`: opt-in
      **server-side tutorial skip** for the bot swarm. When `SWARM_SKIP_PREFIX` is set (e.g. `swrm`) and a
      logging-in account's username starts with it AND `%tutorial < 1000` (^tutorial_complete), onLogin sets
      the tutorial varp complete (before the LOGIN trigger runs, so `login.rs2` falls through the tutorial
      branch), then teleJumps to Lumbridge (3222,3222,0 — matches content's `p_telejump(0_50_50_22_22)`) and
      grants the tutorial-complete starter kit (bronze axe/pickaxe/sword/dagger, net, tinderbox, wooden shield,
      shrimp, bread) so each role has its tool. Runs once (saved %tutorial is then complete). Empty prefix =
      disabled → real players are never affected. No content/pack change; pure engine + env. Used by the swarm
      provisioner (`chain/swarm/provision.ts` → names accounts `swrm…`) and runner
      (`server/webclient/src/lite/economy-swarm.ts`).

### QoL: Lumbridge Castle top-floor bank (2026-08-19)
- [ ] `content/maps/m50_50.jm2`: added the later-RS **Lumbridge Castle bank** on the keep's top
      floor (plane 2), anchored on OSRS coords (booths at ~x3208/x3209, z3221, plane 2). Built as a
      proper counter so it reads as a bank: **5 bank booths** `2 6..10 21: 2213 10 0` (loc 2213 =
      bankbooth, angle 0 = south-facing toward the player; opens via existing `[oploc,bankbooth]`);
      the **blue bank rug** `2 6..10 19: 942 22 0` + `2 6..10 20: 942 22 0` (loc 942 = bluerugmiddle);
      and **2 bankers** in the NPC section `2 7 22: 494` + `2 9 22: 494` (banker1) behind the counter.
      Cleared 3 conflicting decorations to make room: removed `2 7 20: 825`, `2 10 20: 869`,
      `2 9 21: 1248`. Not in authentic 2004 — deliberate QoL add per request.
      **IMPORTANT (map repack):** BUILD_STARTUP=true does NOT reliably rebuild the map cache (stale
      `data/pack/.cache/maps.manifest.json`). To apply a map edit: `rm data/pack/.cache/maps-*.zip
      data/pack/.cache/maps.manifest.json` then `bun run tools/pack/Build.ts`, then restart. Engine
      loads maps from `data/pack/.cache/maps-server.zip` (binary), not the `.jm2` source.

### Bot licensing — storage + bot-auth gating (2026-08-19, M1 layer)
- [ ] `prisma/{singleworld,multiworld}/schema.prisma` + `src/db/types.ts` + migrations
      `20260819000000_bot_license`: new `account.bot_license_until DATETIME?` (NULL = no license;
      future date = licensed). Applied to live db.sqlite via ALTER.
- [ ] `src/util/Environment.ts`: `BOT_LICENSE_REQUIRED` (default false).
- [ ] `src/server/login/LoginServer.ts` `sdk_auth`: selects now include `bot_license_until`; after the
      ban check, if `BOT_LICENSE_REQUIRED` and no active license → reject bot login with
      "Activate one at play.mercantile.sh/license". Normal player_login unaffected. `player_ban`
      (sets banned_until) is the programmatic ban path for M2 auto-ban.

### Bot licensing M1.5 — agent-link + enforcement cutover (2026-08-19, ENFORCED LIVE)
- [ ] `src/web/pages/bridge.ts`: new `POST /bridge/agent-link` {username, apiKey, address, signature}.
      Links a wallet to an API-key (agent) account WITHOUT an in-game code — the apiKey (bcrypt-compared
      vs account.password) proves the account, an ed25519 sig over `agentLinkMessage()` proves the wallet.
      Same one-wallet-per-account upsert as `/bridge/link`. Fixes the chicken/egg: an unlicensed bot can't
      reach the in-game Clerk to get a link code, so it couldn't otherwise be licensed. Added `bcrypt-ts`
      import + exported `agentLinkMessage(username,address)` = `rs-agent-link|v1|<user>|<addr>`.
- [ ] `src/util/Environment.ts`: `BOT_LICENSE_EXEMPT` (comma-sep usernames, case-insensitive) — dev/demo
      bots skip the gate. `src/server/login/LoginServer.ts` gate now `if (BOT_LICENSE_REQUIRED && !EXEMPT.includes(username))`.
- [ ] CUTOVER: engine relaunched with `BOT_LICENSE_REQUIRED=true` + `BOT_LICENSE_EXEMPT=bridgetest,tutbot01,tutbot02,mercbot01`.
      Verified via ws://localhost:43500 sdk_auth: unlicensed rejected (license msg), licensed passes, exempt skips;
      agent-link ok, wrong apiKey→401. Browser play (rs2.cgi/vanilla/bot, incl. /ai) is unaffected — it never
      sends sdk_auth (only server/gateway/gateway.ts does), so it's the reports/ban bucket, not the hard gate.

### M2 — abuse-report review → ban pipeline + unlicensed-attempt handling (2026-08-19)
- [ ] `report` table: added `status` (default 'pending') + `reviewed_at` (prisma ×2 + `src/db/types.ts` +
      migration `20260820000000_report_review` + ALTER live db.sqlite). Engine logger still writes reports
      unchanged (status defaults to pending). In-game Report Abuse → `World.notifyPlayerReport` → logger → `report`.
- [ ] `src/web/pages/admin.ts` (wired in `src/web/index.ts`): `POST /admin/ban` + `/admin/unban`
      {username, minutes, token}. Gated by `BRIDGE_ADMIN_TOKEN` (fail-closed if unset); calls
      `World.notifyPlayerBan` (kick + banned_until via loginThread). Loopback-only in practice (nginx doesn't
      route /admin/, :8888 not public → public returns 404) + token = defence-in-depth.
- [ ] `src/util/Environment.ts`: `BOT_AUTOBAN_UNLICENSED` (0=off default). `src/server/login/LoginServer.ts`
      sdk_auth gate now logs every unlicensed bot attempt (per-account counter) and, if the env>0, auto-bans
      the account (7d, direct banned_until write) after that many strikes.
- [ ] daemon: `chain/daemon/reports.ts` sweeps `report` (status='pending') every REPORT_POLL_MS (20s),
      groups by offender, DMs the operator via Telegram (reason breakdown, reporters, location) with
      Ban 7d / Ban perm / Dismiss buttons; marks rows alerted→banned|dismissed. Buttons dispatched from the
      SINGLE getUpdates poller in `review.ts` (added `handleReportCallback(cq)` after the withdrawal regex —
      one TG consumer, no offset race). Ban → engine `/admin/ban` (config.engineWebUrl + config.adminToken),
      fallback to direct banned_until write. `config.ts`: engineWebUrl/adminToken/reportPollMs. Shared token in
      chain/.env (BRIDGE_ADMIN_TOKEN, gitignored) + engine env.
- [ ] VERIFIED (TG disabled in test to avoid a real DM): pending report→alerted; "Ban 7d" callback→engine
      ban→banned_until +7d + report→banned+reviewed_at; banned account rejected at sdk_auth; /admin/ban
      401 without/with wrong token, 404 publicly. Reports are ADVISORY — a human presses the ban button
      (no auto-ban from reports), so false-positive reports never mass-ban.
