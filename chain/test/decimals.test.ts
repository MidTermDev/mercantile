import { describe, expect, test } from 'bun:test';
import BN from 'bn.js';
import { getPriceFromSqrtPrice } from '@meteora-ag/cp-amm-sdk';
import { p0SqrtPrice } from '../runner/lib/damm';
import { lowalch, p0String } from '../registry/schema';

const GP_DECIMALS = 6;
const ITEM_DECIMALS = 0;

describe('P0 sqrt price math (0-decimal item vs 6-decimal GP)', () => {
    test('lowalch formula mirrors alchemy.rs2 scale(4,10,cost) with floor 1', () => {
        expect(lowalch(1)).toBe(1);
        expect(lowalch(2)).toBe(1); // trunc(0.8) = 0 -> floored to 1
        expect(lowalch(150)).toBe(60);
        expect(lowalch(25600)).toBe(10240);
        expect(lowalch(65000)).toBe(26000);
        expect(lowalch(4)).toBe(1);
    });

    test('p0String is an exact decimal (no float artifacts)', () => {
        expect(p0String(1)).toBe('0.9');
        expect(p0String(52)).toBe('46.8'); // 0.9*52 in floats is 46.800000000000004
        expect(p0String(10)).toBe('9');
        expect(p0String(10240)).toBe('9216');
        expect(p0String(26000)).toBe('23400');
    });

    test('lowalch=1 -> sqrtPrice ~= sqrt(0.9 * 10^6) << 64', () => {
        const sqrtPrice = p0SqrtPrice(1);
        // price in base units = 0.9 * 10^(6-0); sqrtPrice is Q64.64
        const expected = Math.sqrt(0.9e6) * 2 ** 64;
        const actual = Number(sqrtPrice.toString());
        expect(Math.abs(actual - expected) / expected).toBeLessThan(1e-9);
    });

    test('round-trips through getPriceFromSqrtPrice for every price tier', () => {
        for (const la of [1, 2, 18, 52, 60, 10240, 26000]) {
            const p0 = Number(p0String(la));
            const sqrtPrice = p0SqrtPrice(la);
            const back = Number(getPriceFromSqrtPrice(sqrtPrice, ITEM_DECIMALS, GP_DECIMALS));
            expect(Math.abs(back - p0) / p0).toBeLessThan(1e-9);
        }
    });

    test('sqrtPrice is monotonic in lowalch', () => {
        let prev = new BN(0);
        for (const la of [1, 2, 5, 60, 500, 26000]) {
            const s = p0SqrtPrice(la);
            expect(s.gt(prev)).toBe(true);
            prev = s;
        }
    });
});
