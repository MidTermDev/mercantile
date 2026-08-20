# Scripts — a deterministic, reusable bot library

Battle-tested, no-LLM automation for Mercantile. Each script is one command:

```bash
bun scripts/<task>.ts <botname> [flags]
```

It spawns the game client for you, connects, runs, prints live progress, and logs out
cleanly on **Ctrl+C** (so your progress saves). Already have a client running? add
`--no-client`.

## First time

1. `bun install`
2. Make a bot: `bun bots/create-bot.ts <name>` (then activate its **bot license** at
   play.mercantile.sh — bots need one to connect).
3. Get off Tutorial Island: `bun scripts/tutorial.ts <name>`
4. Train: `bun scripts/thieving.ts <name>`

## Scripts

| Script | What it does |
|---|---|
| `tutorial.ts` | Gets a fresh character off Tutorial Island to Lumbridge (accepts the character screen, takes the skip option). Run once on a new bot. |
| `thieving.ts` | Pickpockets a target on a loop — handles stuns, eats to survive, banks non-coin loot when full, reports XP/hr. Defaults to men at Lumbridge castle. |

### thieving.ts flags
- `--to=<level>` — stop at this Thieving level
- `--target=<regex>` — NPC to pickpocket (default `man|woman`)
- `--spot=x,z` — where to stand / return to (default Lumbridge `3222,3218`)
- `--food=<regex>` — food to eat when HP is low (e.g. `--food=kebab`)

Examples:
```bash
bun scripts/thieving.ts mybot --to=40
bun scripts/thieving.ts mybot --target="al-kharid warrior" --spot=3293,3170 --food=kebab
```

## Building blocks (`scripts/lib/`)

Reusable across scripts — import these when writing your own:

- **`harness.ts`** — `runTask(step, opts)`: the turnkey loop runner (client spawn, connect,
  stats, goal-level stop, graceful Ctrl+C).
- **`nav.ts`** — `travelTo(bot, sdk, x, z)`: robust travel that escapes local blocks
  (bank enclosures, walls) by probing toward the target; gives up cleanly if truly stuck.
- **`bank.ts`** — `depositAllExcept(bot, sdk, keep[])`, `bankIfFull(...)`.
- **`util.ts`** — `freeSlots`, `countItem`, `hasItem`, `hp`, `maxHp`, `distTo`, `sleep`.

Writing a new skill script is small — a `runTask` step that does one unit of work:

```ts
import { runTask } from './lib/harness';
await runTask(async ({ bot, sdk, log }) => {
  const tree = sdk.findNearbyLoc(/^tree$/i);
  if (tree) await bot.chopTree(tree);
  return 'continue';
}, { skill: 'woodcutting', name: 'woodcutting' });
```

All scripts play the authentic 1:1 world — no fast-track, same economy as everyone else.
