// Seed GP bid-liquidity into item pools so items become SELLABLE.
//
// The pools were created single-sided (items only) → buy-only, no bids. The only
// way to inject GP into an existing pool is a taker buy (GP in). So the treasury
// (admin key, holds 9B GP + the item ATAs from seeding) buys a small GP-denominated
// tranche into each pool via ExactIn: that deposits GP as a bid down to the floor,
// making sells work, and lifts the price modestly off the bottom.
//
//   RPC_URL=<mainnet> bun runner/seed-liquidity.ts [--limit N] [--only name] [--mult M] [--dry]
//
// Idempotent: a pool that already holds >= half the target GP is skipped. Journaled.

import { Keypair, PublicKey, Connection } from '@solana/web3.js';
import BN from 'bn.js';
import { CpAmm, SwapMode } from '@meteora-ag/cp-amm-sdk';
import { getMint, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadRegistry, GP_DECIMALS, ITEM_DECIMALS } from './lib/common';
import { pacedSendAndConfirm } from './lib/pace';

// Discontinued rares are repriced separately (fresh high-price pools), not here.
const RARES = new Set([
    'red_partyhat', 'blue_partyhat', 'green_partyhat', 'yellow_partyhat', 'purple_partyhat', 'white_partyhat',
    'christmas_cracker', 'santa_hat', 'halloweenmask_red', 'halloweenmask_green', 'halloweenmask_blue',
]);

const argv = process.argv.slice(2);
const flag = (n: string) => { const i = argv.indexOf(n); return i !== -1 ? argv[i + 1] : undefined; };
const LIMIT = flag('--limit') ? parseInt(flag('--limit')!) : Infinity;
const ONLY = flag('--only');
const MULT = flag('--mult') ? parseFloat(flag('--mult')!) : 10;   // GP bid ≈ MULT × unit price
const MIN_GP = 5, MAX_GP = 20_000;                                // clamp per-pool GP spend
const DRY = argv.includes('--dry');

const RPC = process.env.RPC_URL!;
if (!RPC) { console.error('set RPC_URL'); process.exit(1); }
const conn = new Connection(RPC, 'confirmed');
const cpAmm = new CpAmm(conn);
const reg = loadRegistry();
const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(import.meta.dir, '..', '.keys', 'mainnet-admin.json'), 'utf8'))));
const gpMint = new PublicKey(reg.gp.mint!);
const JOURNAL = join(import.meta.dir, 'seed-liquidity.jsonl');

async function poolGp(vaultB: PublicKey): Promise<number> {
    const b = await conn.getTokenAccountBalance(vaultB).catch(() => null);
    return b ? Number(b.value.amount) / 10 ** GP_DECIMALS : 0;
}

async function seed(debugname: string, item: any): Promise<'seeded' | 'skip' | 'fail'> {
    const pool = new PublicKey(item.pool);
    const itemMint = new PublicKey(item.mint);
    const bidGp = Math.min(MAX_GP, Math.max(MIN_GP, Math.round((item.p0GpPerItem ?? 1) * MULT)));

    const poolState = await cpAmm.fetchPoolState(pool);
    const have = await poolGp(poolState.tokenBVault);
    if (have >= bidGp * 0.5) return 'skip';           // already has a bid

    if (DRY) { console.log(`[dry] ${debugname}: would spend ${bidGp} GP (has ${have})`); return 'seeded'; }

    const [gpInfo, itemInfo] = await Promise.all([
        getMint(conn, gpMint, 'confirmed', TOKEN_PROGRAM_ID),
        getMint(conn, itemMint, 'confirmed', TOKEN_PROGRAM_ID),
    ]);
    const epoch = (await conn.getEpochInfo()).epoch;
    const blockTime = (await conn.getBlockTime(await conn.getSlot())) ?? Math.floor(Date.now() / 1000);
    const amountIn = new BN((BigInt(bidGp) * 10n ** BigInt(GP_DECIMALS)).toString());  // spend exactly bidGp GP
    const q = cpAmm.getQuote2({
        inputTokenMint: gpMint, slippage: 50, currentPoint: new BN(blockTime), poolState,
        inputTokenInfo: { mint: gpInfo, currentEpoch: epoch },
        outputTokenInfo: { mint: itemInfo, currentEpoch: epoch },
        tokenADecimal: ITEM_DECIMALS, tokenBDecimal: GP_DECIMALS, hasReferral: false,
        swapMode: SwapMode.ExactIn, amountIn,
    });
    const tx = await cpAmm.swap2({
        payer: admin.publicKey, pool, inputTokenMint: gpMint, outputTokenMint: itemMint,
        tokenAMint: poolState.tokenAMint, tokenBMint: poolState.tokenBMint,
        tokenAVault: poolState.tokenAVault, tokenBVault: poolState.tokenBVault,
        tokenAProgram: TOKEN_PROGRAM_ID, tokenBProgram: TOKEN_PROGRAM_ID,
        referralTokenAccount: null, poolState,
        swapMode: SwapMode.ExactIn, amountIn, minimumAmountOut: q.minimumAmountOut!,
    });
    // ensure the admin's item ATA exists (it should, from seeding; idempotent + admin pays)
    const { createAssociatedTokenAccountIdempotentInstruction } = await import('@solana/spl-token');
    const itemAta = getAssociatedTokenAddressSync(itemMint, admin.publicKey, false, TOKEN_PROGRAM_ID);
    tx.instructions.unshift(createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, itemAta, admin.publicKey, itemMint, TOKEN_PROGRAM_ID));

    const sig = await pacedSendAndConfirm(conn, tx, [admin]);
    appendFileSync(JOURNAL, JSON.stringify({ debugname, bidGp, sig, t: Math.floor(Date.now() / 1000) }) + '\n');
    return 'seeded';
}

let seeded = 0, skipped = 0, failed = 0, n = 0;
for (const [debugname, item] of Object.entries(reg.items) as [string, any][]) {
    if (!item.pool || !item.mint) continue;
    if (RARES.has(debugname)) continue;
    if (ONLY && debugname !== ONLY) continue;
    if (n >= LIMIT) break;
    n++;
    try {
        const r = await seed(debugname, item);
        if (r === 'seeded') { seeded++; if (seeded % 25 === 0) console.log(`… ${seeded} seeded (${skipped} skipped)`); }
        else if (r === 'skip') skipped++;
    } catch (e: any) {
        failed++;
        console.warn(`[seed] ${debugname} failed: ${String(e.message ?? e).slice(0, 80)}`);
    }
}
console.log(`\ndone: seeded=${seeded} skipped=${skipped} failed=${failed}`);
