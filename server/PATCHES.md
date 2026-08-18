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
