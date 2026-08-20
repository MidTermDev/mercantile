// Banking flows for the script library. Built on bot.openBank/depositItem/closeBank,
// which already find the nearest bank, handle the modal, and dismiss level-ups.
import type { BotActions } from '../../sdk/actions';
import type { BotSDK } from '../../sdk/index';
import { freeSlots } from './util';

/** Deposit everything EXCEPT items matching any `keep` pattern. Opens + closes the bank.
 *  Returns true if the bank opened (whether or not there was anything to deposit). */
export async function depositAllExcept(bot: BotActions, sdk: BotSDK, keep: RegExp[] = []): Promise<boolean> {
    const open = await bot.openBank();
    if (!open.success) return false;

    // Deposit in passes: slots renumber after each deposit, so re-read every time.
    // Bounded by inventory size so a stubborn item can't loop forever.
    for (let guard = 0; guard < 30; guard++) {
        const item = sdk.getInventory().find(i => !keep.some(k => k.test(i.name)));
        if (!item) break;
        const res = await bot.depositItem(item, -1);
        if (!res.success && !res.partial) break; // couldn't move it — avoid a spin
    }
    await bot.closeBank();
    return true;
}

/** Bank (deposit all except `keep`) only when free slots drop below `minFree`.
 *  Returns true if a bank trip happened. */
export async function bankIfFull(bot: BotActions, sdk: BotSDK, keep: RegExp[], minFree = 1): Promise<boolean> {
    if (freeSlots(sdk) >= minFree) return false;
    return depositAllExcept(bot, sdk, keep);
}
