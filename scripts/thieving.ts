// Thieving trainer — pickpockets a target on a loop, handles stuns, eats to survive,
// banks non-coin loot when full, and reports live XP/hr. Battle-tested from level 1.
//
//   bun scripts/thieving.ts <botname>                        # men at Lumbridge castle (lvl 1+)
//   bun scripts/thieving.ts <botname> --to=40                # stop at Thieving 40
//   bun scripts/thieving.ts <botname> --target="al-kharid warrior" --spot=3293,3170 --food=kebab
//   bun scripts/thieving.ts <botname> --spot=3210,3430       # aim at a different pickpocket spot
//
// Flags:
//   --to=<level>       stop when Thieving reaches this level
//   --target=<regex>   NPC name to pickpocket (default: man|woman)
//   --spot=x,z         where to stand/return to if no target is nearby (default: Lumbridge 3222,3218)
//   --food=<regex>     inventory food to eat when HP is low (e.g. --food=kebab); default: none
//   --no-client        don't spawn the game client (you already have one running)

import { runTask } from './lib/harness';
import { depositAllExcept } from './lib/bank';
import { travelTo } from './lib/nav';
import { freeSlots, hasItem, hp, maxHp, distTo } from './lib/util';

function flag(name: string): string | undefined {
    const a = process.argv.find(x => x.startsWith(`--${name}=`));
    return a ? a.slice(name.length + 3) : undefined;
}

const goalLevel = flag('to') ? parseInt(flag('to')!, 10) : undefined;
const TARGET = new RegExp(flag('target') ? `^${flag('target')}$` : '^(man|woman)$', 'i');
const [spotX, spotZ] = (flag('spot') ?? '3222,3218').split(',').map(n => parseInt(n, 10));
const FOOD = flag('food') ? new RegExp(flag('food')!, 'i') : null;

// Keep these in the inventory when banking loot.
const KEEP = [/coins/i, ...(FOOD ? [FOOD] : [])];

await runTask(async ({ bot, sdk, log, stopping }) => {
    // 1) Survival first. Eat when low; never grind an unfed bot to death (that loses items).
    //    Guard on maxHp>0 so a transient HP-0 read at login (stats not loaded yet) isn't
    //    mistaken for a dying bot.
    const mh = maxHp(sdk);
    const curHp = hp(sdk);
    if (mh <= 0) { await sdk.waitForTicks(1).catch(() => {}); return 'continue'; } // state not ready
    const eatAt = Math.max(4, Math.floor(mh * 0.4));
    if (FOOD && curHp <= eatAt && hasItem(sdk, FOOD)) {
        const r = await bot.eatFood(FOOD);
        log(`ate ${FOOD} (+${r.hpGained ?? '?'} hp, now ${hp(sdk)})`);
    } else if (curHp > 0 && curHp <= 3 && !hasItem(sdk, FOOD)) {
        log(`HP ${curHp} and no food — stopping to avoid death.`);
        return 'stop';
    }

    // 2) Full inventory (from item loot) → bank everything but coins/food. Coins stack, so
    //    coin-only targets never trigger this.
    if (freeSlots(sdk) === 0) {
        log('inventory full — banking loot…');
        const ok = await depositAllExcept(bot, sdk, KEEP);
        if (!ok) { log('no bank reachable and inventory full — stopping.'); return 'stop'; }
        return 'continue';
    }

    // 3) Get to a target.
    const target = sdk.findNearbyNpc(TARGET, { reachable: true });
    if (!target) {
        if (distTo(sdk, spotX, spotZ) > 4) {
            const t = await travelTo(bot, sdk, spotX, spotZ, { arrive: 4 });
            if (!t.success) {
                log(`can't reach the spot (${spotX},${spotZ}): ${t.reason}. Set --spot=x,z to a walkable tile near your target.`);
                return 'stop';
            }
        } else {
            await sdk.waitForTicks(1).catch(() => {}); // targets wander — wait a tick and rescan
        }
        return 'continue';
    }

    // 4) Pickpocket.
    const r = await bot.pickpocketNpc(target);
    if (!r.success) {
        if (r.reason === 'stunned') {
            await sdk.waitForTicks(6).catch(() => {}); // ~3.6s: let the stun clear before retrying
        } else if (r.reason === 'cant_reach') {
            await bot.walkTo(spotX, spotZ);
        }
        // other reasons (npc moved, rejected) just retry next loop
    }
    return 'continue';
}, { skill: 'thieving', name: 'thieving', goalLevel, statusSec: 20 });
