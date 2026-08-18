# Deploying Mercantile

Mercantile has two deployable pieces:

1. **The game world** — the RS engine + gateway + on-chain bridge daemon, in one
   container (`server/Dockerfile`, launched by `fly.mercantile.toml`). Runs at
   authentic 2004 rates and mints/burns tokens on Solana mainnet in lock-step
   with in-game withdrawals/deposits.
2. **The Exchange website** — the Next.js Grand Exchange + Play page in
   `chain/exchange/` (static-ish; deploys to Vercel or any Node host). See
   `chain/exchange/README.md` for that half.

Both need your accounts/keys — nothing here provisions infrastructure for you.

---

## 1. The game world (fly.io)

### What runs in the container

The entrypoint (baked into `server/Dockerfile`) starts three processes:

- **engine** (`bun src/app.ts`) as PID 1 — the game world + web client + `/bridge/*` endpoints.
- **gateway** (`bun gateway.ts`) — SDK/bot connectivity, supervised (auto-restart).
- **bridge daemon** (`bun daemon/index.ts`) — only when `RUN_BRIDGE_DAEMON=true`;
  supervised, mints/burns on mainnet. Reads the same sqlite as the engine.

The engine serves the playable client at `/rs2.cgi` and `/vanilla`, the bot client
at `/`, and the wallet-link page at `/bridge/link`.

### Prerequisites

- A [fly.io](https://fly.io) account + `flyctl` installed and logged in.
- Your **operator** keypair (the hot key that signs withdrawals/mints):
  `9YYZqNwWmkVP41x1ZHqE5QPVEerj2tGAPsou5ZFNJ4dz`. The **admin/cold** key never
  goes near the server — it's only for `create_mint`/config/upgrades from your
  workstation.
- A mainnet RPC URL (Helius or similar).

> The registry (`chain/registry/registry.json`, 1374 items) is baked into the image
> and seeded onto the volume on first boot — no manual upload needed. The admin key,
> `.env`, the Next app, and rendered icons are excluded from the image by
> `server/.dockerignore`.

### Steps

Run from the repo root.

```bash
# 1. Create the app + a volume for persistent data (db.sqlite, player saves, registry)
fly apps create mercantile-game
fly volumes create mercantile_data --region iad --size 3 -a mercantile-game

# 2. Set secrets (NOT in fly.toml — these are sensitive)
#    Operator key: pass the JSON byte array from the keypair file, or a base58 string.
fly secrets set -a mercantile-game \
  RPC_URL="https://mainnet.helius-rpc.com/?api-key=YOUR_KEY" \
  OPERATOR_SECRET_KEY="$(cat chain/.keys/mainnet-operator.json)"

# 3. Deploy using the mercantile config
fly deploy -a mercantile-game -c fly.mercantile.toml
```

`fly.mercantile.toml` already sets the authentic-rate + bridge env:
`NODE_TICKRATE=600`, `NODE_XPRATE=1`, `NODE_PRODUCTION=true` (disables
`::give`/`::setstat` so items can't be counterfeited on a value world),
`NODE_MEMBERS=true`, `RUN_BRIDGE_DAEMON=true`, and the registry/DB paths.

### After deploy

The real game host is intentionally NOT written down in this repo (don't leak it
before launch — keep it in gitignored env/secrets only). With `<GAME_HOST>` as your
deployed hostname:

- Play: `https://<GAME_HOST>/rs2.cgi`
- Link wallet page: `https://<GAME_HOST>/bridge/link`
- Point the website's Play page at the world by setting
  `NEXT_PUBLIC_GAME_URL=https://<GAME_HOST>/rs2.cgi` in `chain/exchange/.env.local`
  (gitignored) when you build/deploy `chain/exchange/`.

### Operating notes

- **Pause the bridge** without downtime: `fly secrets set -a mercantile-game BRIDGE_PAUSED=1`
  (the daemon stops minting/burning; the engine keeps running). Unset to resume.
- **Rotate the operator** on-chain from your admin key (program `set_operator`), then
  update the `OPERATOR_SECRET_KEY` secret.
- **Backups**: snapshot the volume (`fly volumes snapshots`) — it holds `db.sqlite`
  (including the `bridge_tx` ledger + `account_wallet` links) and player saves.
- The deposit listener binds `127.0.0.1:7781` inside the container; the engine proxies
  `/bridge/deposit/notify` to it, so it's never exposed publicly.

---

## 2. The Exchange website

See `chain/exchange/README.md`. In short: `bun run build`, deploy to Vercel (or
`next start`), run `indexer.ts` on a schedule to refresh `prices.json`, and set
`NEXT_PUBLIC_GAME_URL` (Play page) + `NEXT_PUBLIC_RPC_URL` (swaps/indexer).

---

## Local dry-run (whole stack)

`/tmp/start-mercantile.sh` (or the commands in it) brings up the engine + gateway +
mainnet daemon locally at authentic rates against `chain/registry/registry.json`.
The Play page defaults to `http://localhost:8888/rs2.cgi` when `NEXT_PUBLIC_GAME_URL`
is unset, so `bun run dev` in `chain/exchange/` gives you the full site pointed at the
local world.
