// Tutorial Island — gets a fresh character off the island and onto the mainland.
//
//   bun scripts/tutorial.ts <botname>
//
// A new account spawns on Tutorial Island, which blocks normal play. This accepts the
// character-design screen, talks to the RuneScape Guide, and takes the "skip the tutorial"
// option — landing you in Lumbridge with the starter kit. Run it once on a new bot, then
// run any of the skill scripts. (Already on the mainland? It exits immediately.)

import { runTask } from './lib/harness';

// Tutorial Island sits around x 3050-3140; the mainland (Lumbridge) is east at ~3222.
const OFF_ISLAND_X = 3150;

let announced = false;
await runTask(async ({ bot, sdk, log }) => {
    const s = sdk.getState();
    const p = s?.player;
    if (!announced && p) { announced = true; log(`start pos (${p.worldX},${p.worldZ}), modal=${s?.modalInterface ?? 'none'}, dialog=${s?.dialog?.isOpen ?? false}`); }

    // Done: skipped + teleported to the mainland.
    if (p && p.worldX >= OFF_ISLAND_X) {
        log(`on the mainland at (${p.worldX},${p.worldZ}) — tutorial complete.`);
        return 'stop';
    }

    // 1) Character-design screen (interface 3559): randomise + accept.
    if (s?.modalOpen && s?.modalInterface === 3559) {
        log('accepting character design…');
        await sdk.sendRandomizeCharacterDesign().catch(() => {});
        await sdk.waitForTicks(1).catch(() => {});
        await sdk.sendAcceptCharacterDesign().catch(() => {});
        await sdk.waitForTicks(1).catch(() => {});
        return 'continue';
    }

    // 2) Any dialog: take "Yes please." on the skip prompt; otherwise advance.
    if (s?.dialog?.isOpen) {
        const opts = s.dialog.options ?? [];
        if (opts.some(o => /yes please|skip/i.test(o.text))) {
            log('taking the skip option…');
            await sdk.clickDialogByText(/yes please|skip/i).catch(() => {});
        } else if (opts.length > 0) {
            const pick = opts.find(o => /yes|continue|proceed|ok/i.test(o.text)) ?? opts[0];
            await sdk.sendClickDialog(pick.index).catch(() => {});
        } else {
            await sdk.sendClickDialog(0).catch(() => {}); // continue to the next page
        }
        await sdk.waitForTicks(1).catch(() => {});
        return 'continue';
    }

    // 3) No dialog: talk to the RuneScape Guide to open the skip prompt.
    const guide = sdk.findNearbyNpc(/runescape guide|newbie.*instructor|guide/i);
    if (guide) {
        log(`talking to the ${guide.name} to reach the skip option…`);
        await bot.talkTo(guide).catch(() => {});
        await sdk.waitForTicks(2).catch(() => {});
        return 'continue';
    }

    // Guide not in range yet (just logged in / mid-teleport) — wait and rescan.
    await sdk.waitForTicks(1).catch(() => {});
    return 'continue';
}, { name: 'tutorial', skipTutorial: false, statusSec: 15 });
