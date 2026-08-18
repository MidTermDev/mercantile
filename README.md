<div align="center">
  <img src="docs/media/mercantile-logo.png" alt="Mercantile" width="240">

  # Mercantile

  **An on-chain, agent-played RuneScape economy.**

  [![Play](https://img.shields.io/badge/▶_Play_now-play.mercantile.sh-eeb92e?labelColor=1c1408)](https://play.mercantile.sh)
  [![X / Twitter](https://img.shields.io/badge/X-@MercantileRS-1c3327?logo=x)](https://x.com/MercantileRS/)

  ### ▶ Play now at **[play.mercantile.sh](https://play.mercantile.sh)**
</div>

Every tradeable item in a 2004-era RuneScape world is a token on Solana, priced against a
tokenized in-game currency (**GP**) in automated market-maker pools. Players and AI agents
move items and GP between the game and the chain — withdraw to trade on-chain, deposit to
bring value back in-game — through an in-game **Exchange Clerk**. It's a **1:1, normal-rate**
world (standard XP, standard tick rate — no fast-track), so the on-chain economy reflects a
real Gielinor grind.

> Play in your browser at **[play.mercantile.sh](https://play.mercantile.sh)** · trade on the [**Grand Exchange**](https://play.mercantile.sh/exchange) · read the [**wiki**](https://play.mercantile.sh/wiki) · follow [**@MercantileRS**](https://x.com/MercantileRS/).

---

## How it works

```
   in-game world  ⇄  Exchange Clerk  ⇄  bridge daemon  ⇄  Solana program  ⇄  Meteora pools
   (Lost City RS2)     (link wallet,       (operator,        (mint / burn,      (item ⇄ GP,
                        withdraw/deposit)   exactly-once)      PDA authority)     price discovery)
```

- **Withdraw (game → chain):** the game debits your items/GP; the on-chain program
  **mints** the matching tokens to your linked wallet.
- **Deposit (chain → game):** you **burn** tokens through the program; the game credits
  you the items/GP in-world.
- The game server is the source of truth. An on-chain program (PDA mint/burn authority,
  admin/operator split, pause switch) enforces *who* can mint and emits auditable events;
  a colocated daemon bridges the two with an exactly-once protocol (debit persisted before
  chain-side mint; unique-signature replay guards; per-player watermark).

Every token — items and GP — has a **vanity mint address ending in `RSGP`**, standard SPL
with Metaplex metadata, and its **actual in-game sprite** as the token image (pinned to
IPFS). Items are paired single-sided to GP in **Meteora DAMM v2** pools starting at
**0.9 × the item's in-game low-alch value**, so the market discovers price from a permanent
bid floor.

## Live on Solana mainnet

| | Address |
|---|---|
| Bridge program | [`H5C6RKWQzUdfS8tVzZb3uVcRw3EHCzghv7kWdMBTD2bS`](https://solscan.io/account/H5C6RKWQzUdfS8tVzZb3uVcRw3EHCzghv7kWdMBTD2bS) |
| GP token (10B supply) | [`123B7bdJzDYGkrAg7i3JUi5TaHYP47dqmSiR5qPRSGP`](https://solscan.io/token/123B7bdJzDYGkrAg7i3JUi5TaHYP47dqmSiR5qPRSGP) |
| Config PDA | `35M99wCeVKefazYKw1oQ45rF4MjVULXxp9onLkpkE9RY` |
| Mint-authority PDA | `7idpyqXCKEtwXhxXkRrF2aqtASSqtRFmxi2nGkKddyKd` |

Item tokens (each `…RSGP`, paired to GP) are rolling out — see `chain/registry/registry.json`.

## Repo layout

| Path | What |
|---|---|
| `chain/bridge/` | The Solana program (Anchor v2, standard SPL + Metaplex) |
| `chain/program/` | TypeScript client, genesis, and localnet validation |
| `chain/runner/` | Mint + DAMM v2 pool creation runners |
| `chain/images/` | Headless item-sprite renderer + Pinata/IPFS metadata pipeline |
| `chain/daemon/` | Off-chain bridge daemon (withdraw/deposit) |
| `chain/registry/` | `registry.json` — the item ↔ mint ↔ pool source of truth |
| `chain/README.md` | On-chain system details |
| `server/`, `sdk/`, `bots/` | The game engine, bot SDK, and agents (see below) |

## The game underneath

Mercantile is built on **[rs-sdk](https://github.com/MaxBittker/rs-sdk)** — a research kit
pairing a reverse-engineered 2004-era RuneScape server ([Lost City](https://lostcity.rs))
with a TypeScript bot SDK, so the world can be played by AI agents. Mercantile adds the
on-chain economy on top. See the original project for the game engine, bot framework, and
agent tooling; it's MIT-licensed and its documentation lives throughout `server/`, `sdk/`,
and `learnings/`.

## License

MIT (inherits the rs-sdk / Lost City license). See [LICENSE](LICENSE).
