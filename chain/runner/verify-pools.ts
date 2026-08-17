// Post-run assertions: every registry item with a recorded pool must exist on-chain
// at the derived address, hold the expected sqrtPrice/range/fees, and (untouched
// pools) still hold the full 100-token seed.
//
// Usage: bun runner/verify-pools.ts [--sample N]

import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { CpAmm, getPriceFromSqrtPrice, CollectFeeMode, MAX_SQRT_PRICE } from '@meteora-ag/cp-amm-sdk';
import { connection, loadRegistry, GP_DECIMALS, ITEM_DECIMALS, SEED_PER_ITEM } from './lib/common';
import { p0SqrtPrice, deriveCustomizablePoolAddress } from './lib/damm';

const sampleArg = process.argv.indexOf('--sample');
const sample = sampleArg !== -1 ? parseInt(process.argv[sampleArg + 1], 10) : Infinity;

const conn = connection();
const cpAmm = new CpAmm(conn);
const reg = loadRegistry();
const gpMint = new PublicKey(reg.gp.mint!);

let checked = 0;
let failures = 0;
const withPools = Object.entries(reg.items).filter(([, i]) => i.pool);

for (const [debugname, item] of withPools) {
    if (checked >= sample) break;
    checked++;

    const fail = (msg: string) => {
        failures++;
        console.error(`FAIL ${debugname}: ${msg}`);
    };

    const derived = deriveCustomizablePoolAddress(new PublicKey(item.mint!), gpMint);
    if (derived.toBase58() !== item.pool) {
        fail(`derived pool ${derived.toBase58()} != recorded ${item.pool}`);
        continue;
    }

    const state = await cpAmm.fetchPoolState(derived);
    const expectedSqrt = p0SqrtPrice(item.lowalch);

    // Tiny relative tolerance: a few early pools were created from float-derived
    // price strings one ULP off the exact decimal.
    const diff = state.sqrtMinPrice.sub(expectedSqrt).abs();
    const tolerance = expectedSqrt.div(new BN(1_000_000_000)); // 1e-9 relative
    if (diff.gt(tolerance)) fail(`sqrtMinPrice ${state.sqrtMinPrice} != expected P0 ${expectedSqrt}`);
    if (!state.sqrtMaxPrice.eq(MAX_SQRT_PRICE)) fail(`sqrtMaxPrice ${state.sqrtMaxPrice} != MAX`);
    if (state.sqrtPrice.lt(state.sqrtMinPrice)) fail(`sqrtPrice below range min`);
    if (state.collectFeeMode !== CollectFeeMode.OnlyB) fail(`collectFeeMode ${state.collectFeeMode} != OnlyB`);
    if (state.tokenAMint.toBase58() !== item.mint) fail(`tokenAMint mismatch`);
    if (state.tokenBMint.toBase58() !== reg.gp.mint) fail(`tokenBMint mismatch`);

    // Untouched pool: current price == P0 and full seed present.
    if (state.sqrtPrice.eq(expectedSqrt)) {
        const vaultBal = await conn.getTokenAccountBalance(state.tokenAVault);
        if (BigInt(vaultBal.value.amount) < SEED_PER_ITEM) {
            fail(`token A vault holds ${vaultBal.value.amount}, expected >= ${SEED_PER_ITEM}`);
        }
    }

    const price = getPriceFromSqrtPrice(state.sqrtPrice, ITEM_DECIMALS, GP_DECIMALS);
    console.log(`ok ${debugname.padEnd(16)} pool=${item.pool!.slice(0, 8)}… price=${Number(price).toFixed(4)} GP (P0=${item.p0GpPerItem})`);
}

console.log(`\n${checked} pools checked, ${failures} failures; ${withPools.length} pools recorded, ${Object.keys(reg.items).length} items in registry`);
process.exit(failures ? 1 : 0);
