// Small shared helpers for the script library.
import type { BotSDK } from '../../sdk/index';

/** Occupied inventory slots. */
export function usedSlots(sdk: BotSDK): number {
    return sdk.getInventory().length;
}
/** Free inventory slots (28 total). */
export function freeSlots(sdk: BotSDK): number {
    return 28 - usedSlots(sdk);
}
/** Total count of items matching a pattern (sums stacks). */
export function countItem(sdk: BotSDK, pattern: RegExp): number {
    return sdk.getInventory().filter(i => pattern.test(i.name)).reduce((n, i) => n + i.count, 0);
}
export function hasItem(sdk: BotSDK, pattern: RegExp): boolean {
    return sdk.getInventory().some(i => pattern.test(i.name));
}
/** Current HP (0 if unknown). */
export function hp(sdk: BotSDK): number {
    return sdk.getState()?.player?.hp ?? 0;
}
export function maxHp(sdk: BotSDK): number {
    return sdk.getSkill('hitpoints')?.level ?? 10;
}
/** Chebyshev distance from the player to (x,z); Infinity if no state. */
export function distTo(sdk: BotSDK, x: number, z: number): number {
    const p = sdk.getState()?.player;
    if (!p) return Infinity;
    return Math.max(Math.abs(p.worldX - x), Math.abs(p.worldZ - z));
}
export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
