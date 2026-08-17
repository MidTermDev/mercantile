# chain/ — On-Chain Economy (Solana devnet)

Every tradeable item in the game is an SPL token (Token-2022, 0 decimals) paired
against **Gielinor GP** (Token-2022, 6 decimals) in a Meteora DAMM v2 pool, seeded
single-sided with 100 items at **P0 = 0.9 × lowalch** (lowalch = max(⌊cost×0.4⌋, 1),
mirroring the in-game alchemy formula). Pools span [P0, ∞): free price discovery
upward, permanent bid floor at 90% of alch value. Pool fees: flat 1%, collected in GP.

GP supply: 10B minted at genesis — 1B in a redemption vault (in-game GP → on-chain GP),
the rest in treasury. If the vault runs dry, the bridge mints the shortfall: an
on-chain signal that the in-game economy is inflating.

## Layout

| Path | Purpose |
|---|---|
| `registry/build-registry.ts` | Parse game item configs → `registry.json` (`--pilot`, `--diff`) |
| `registry/registry.json` | Source of truth: debugname → objId/cost/lowalch/mint/pool. Committed. |
| `registry/journal.jsonl` | Append-only run journal (attempt/created pairs). Committed. |
| `runner/create-gp.ts` | One-time GP mint + vault/treasury split |
| `runner/create-items.ts` | Idempotent batch: mint + one-sided pool per item (`--limit N`, `--dry-run`) |
| `runner/verify-pools.ts` | Assert on-chain state matches registry (`--sample N`) |
| `cli/swap.ts` | `bun cli/swap.ts <item> buy\|sell <count>` — buy is exact-out (whole items) |
| `cli/balances.ts` | Wallet holdings resolved through the registry |
| `.keys/` | bridge.json (mint authority + payer), vault.json (vault owner). **Gitignored — back these up.** |

## Setup

```sh
cp .env.example .env   # set RPC_URL; put a funded keypair at .keys/bridge.json
bun install
bun test test/
bun registry/build-registry.ts --pilot   # or full
bun runner/create-gp.ts
bun runner/create-items.ts               # resumable; safe to Ctrl-C and re-run
bun runner/verify-pools.ts
```

## Crash safety

`create-items` journals a `*_attempt` line (with the planned address) before every
send and a `*_created` line after confirmation. On resume it adopts mints/pools that
landed but weren't recorded (chain is truth), so a killed run never double-creates.
One customizable pool can exist per token pair (PDA), which backstops duplicates at
the program level too.

## Devnet state (M1 pilot, 2026-08-17)

- GP mint `DTiGCZw8VEM7F3xeM9TMvkxJy8J55TtPhYpzBqNQSUJx`, treasury+vault funded
- 28 item mints + pools live (20-item pilot + crash-drill extras); `verify-pools` clean
- Swap round-trip proven (exact-out buy / exact-in sell vs the lobster pool)
