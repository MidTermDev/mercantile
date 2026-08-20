// Robust travel. bot.walkTo pathfinds within the loaded scene and opens doors, but it
// gives up when the exact destination is blocked or out of the current scene — which
// strands bots in bank enclosures or across region seams. travelTo() drives toward a
// target in hops: it tries the direct path, and when that stalls it probes reachable
// stepping-stones (biased toward the target) to escape the local block, then continues.
import type { BotActions } from '../../sdk/actions';
import type { BotSDK } from '../../sdk/index';

function pos(sdk: BotSDK): [number, number] {
    const p = sdk.getState()?.player;
    return [p?.worldX ?? 0, p?.worldZ ?? 0];
}
const cheb = (x: number, z: number, tx: number, tz: number) => Math.max(Math.abs(x - tx), Math.abs(z - tz));

export interface TravelResult { success: boolean; reason?: string; x: number; z: number; }

/** Walk to (tx,tz). Returns success once within `arrive` tiles. Escapes local blocks by
 *  probing stepping-stones toward the target; gives up after `maxStalls` stuck hops. */
export async function travelTo(
    bot: BotActions, sdk: BotSDK, tx: number, tz: number,
    opts: { arrive?: number; maxHops?: number; maxStalls?: number; log?: (m: string) => void } = {},
): Promise<TravelResult> {
    const arrive = opts.arrive ?? 3;
    const maxHops = opts.maxHops ?? 40;
    const maxStalls = opts.maxStalls ?? 4;
    const log = opts.log ?? (() => {});
    let stalls = 0;
    // Track the best (closest) distance reached. Only NET progress past this resets the
    // stall counter — a 2-tile oscillation inside a pocket must not look like progress,
    // or the walk livelocks forever against a wall.
    let bestD = cheb(...pos(sdk), tx, tz);

    for (let hop = 0; hop < maxHops; hop++) {
        let [x, z] = pos(sdk);
        const d = cheb(x, z, tx, tz);
        if (d <= arrive) return { success: true, x, z };

        // 1) direct attempt — walkTo will path as far as it can this scene
        await bot.walkTo(tx, tz, arrive);
        let [nx, nz] = pos(sdk);
        log(`hop ${hop}: (${x},${z}) d=${d} -> direct -> (${nx},${nz})`);
        if (cheb(nx, nz, tx, tz) < bestD) { bestD = cheb(nx, nz, tx, tz); stalls = 0; continue; } // net progress

        // 2) stalled — probe stepping-stones ~6 tiles out, biased toward the target
        stalls++;
        const step = 6;
        const sx = Math.sign(tx - x) || 1;
        const sz = Math.sign(tz - z) || 1;
        const cands: [number, number][] = [
            [x + sx * step, z + sz * step],   // diagonal toward target
            [x + sx * step, z],               // horizontal toward
            [x, z + sz * step],               // vertical toward
            [x + sx * step, z - sz * step],   // splayed
            [x - sx * step, z + sz * step],
            [x, z - sz * step],               // backtrack to find an opening
            [x - sx * step, z],
        ];
        let progressed = false;
        for (const [cx, cz] of cands) {
            await bot.walkTo(cx, cz, 1);
            const [px, pz] = pos(sdk);
            const pd = cheb(px, pz, tx, tz);
            if (pd < bestD) { progressed = true; bestD = pd; log(`  probe ->(${cx},${cz}) advanced to (${px},${pz}) d=${pd}`); break; }
        }
        if (!progressed) {
            log(`  stall ${stalls + 1}: no probe made net progress from (${x},${z}) (bestD=${bestD})`);
            if (stalls >= maxStalls) {
                const [fx, fz] = pos(sdk);
                return { success: false, reason: `stuck near (${fx},${fz}) — can't reach (${tx},${tz})`, x: fx, z: fz };
            }
        } else {
            stalls = 0;
        }
    }
    const [fx, fz] = pos(sdk);
    return { success: false, reason: `did not arrive within ${maxHops} hops`, x: fx, z: fz };
}
