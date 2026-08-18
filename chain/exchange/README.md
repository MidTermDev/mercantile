# Mercantile Exchange — web app

The public face of Mercantile: a landing page explaining the game + vision, and a
**Grand Exchange** to browse/search every tokenized item, see live GP prices and price
history, and **buy items with GP** from the wallet.

Next.js (App Router) + Tailwind + `@solana/wallet-adapter` + `@meteora-ag/cp-amm-sdk`.
Reads static JSON produced from the on-chain registry + a price indexer — no backend.

## Run

```sh
bun install

# 1. generate the item catalogue from ../registry/registry.json (items with a live pool)
bun run build-items            # -> public/data/items.json

# 2. index live pool prices (writes public/data/prices.json + history/<mint>.json)
RPC_URL="<mainnet rpc>" bun run indexer          # loops every 60s
RPC_URL="<mainnet rpc>" bun indexer.ts --once    # single pass (for a build/demo)

# 3. dev / build
bun run dev        # http://localhost:3939
bun run build && bun run start
```

`NEXT_PUBLIC_RPC_URL` sets the browser RPC (defaults to a mainnet Helius endpoint;
override for production). The indexer + wallet swaps talk to mainnet.

## Pages
- `/` — landing: what Mercantile is, the open/agent-driven economy vision, the explicit
  **1:1 normal XP + normal tick rate** stance, how the withdraw=mint / deposit=burn bridge
  works, and live mainnet addresses.
- `/exchange` — Grand Exchange: searchable, sortable list of all item tokens with image,
  symbol, mint (copy + Solscan) and live GP price.
- `/exchange/[mint]` — item detail: price + history chart, and a **Buy with GP** widget
  (connect wallet → cp-amm quote → swap GP→item). Items are 1-decimal SPL, GP is 6-decimal.

## Data / refresh
`build-items` regenerates the catalogue as the on-chain rollout adds pools. Run the
indexer on a host (cron/systemd/pm2) to keep `prices.json` + history fresh; the site reads
these static files, so it deploys anywhere (Vercel, static export, or `next start`).

## Deploy
Standard Next build (`bun run build`). For a fully static host, the two data-driven pages
are already static and `/exchange/[mint]` renders client-side, so a `next export`-style
static deploy works if you drop the dynamic segment's server rendering (it fetches all data
client-side anyway). Simplest: deploy to Vercel and run the indexer as a scheduled job that
commits/uploads `public/data/*`.

## Note on the buy flow
The swap (`lib/swap.ts` + `components/BuyWidget.tsx`) is implemented against the live cp-amm
mainnet program (standard SPL, ExactOut GP→item). It needs a **connected browser wallet with
GP** to exercise end-to-end; quoting works read-only. GP is obtained by withdrawing coins
from the game at the in-game Exchange Clerk (or selling items into their pools).
