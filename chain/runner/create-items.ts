// Batch: per registry item, create a 0-decimal Token-2022 mint (mint 100 to the
// payer's ATA) and a one-sided DAMM v2 pool at P0 = 0.9 * lowalch.
// Idempotent + resumable: mint_attempt journal lines let a crashed run adopt a
// mint that landed but wasn't recorded; pool existence is checked on-chain.
//
// Usage: bun runner/create-items.ts [--limit N] [--dry-run]

import { Keypair, PublicKey } from '@solana/web3.js';
import { CpAmm } from '@meteora-ag/cp-amm-sdk';
import { connection, bridgeKeypair, loadRegistry, saveRegistry, SEED_PER_ITEM, ITEM_DECIMALS } from './lib/common';
import { buildCreateMintTx } from './lib/token22';
import { buildOneSidedPoolTx, deriveCustomizablePoolAddress } from './lib/damm';
import { pacedSendAndConfirm } from './lib/pace';
import { appendJournal, pendingAttempts } from './lib/journal';

const limitArg = process.argv.indexOf('--limit');
const limit = limitArg !== -1 ? parseInt(process.argv[limitArg + 1], 10) : Infinity;
const dryRun = process.argv.includes('--dry-run');

const conn = connection();
const payer = bridgeKeypair();
const cpAmm = new CpAmm(conn);
const reg = loadRegistry();

if (!reg.gp.mint) {
    console.error('FATAL: GP mint not created yet — run create-gp first.');
    process.exit(1);
}
const gpMint = new PublicKey(reg.gp.mint);

// Adopt mints from interrupted runs: attempt logged, completion missing, account exists.
const pendingMints = pendingAttempts('mint');
for (const [debugname, attempt] of pendingMints) {
    const item = reg.items[debugname];
    if (!item || item.mint || !attempt.mint) continue;
    const info = await conn.getAccountInfo(new PublicKey(attempt.mint));
    if (info) {
        console.log(`adopting mint from interrupted run: ${debugname} -> ${attempt.mint}`);
        item.mint = attempt.mint;
        appendJournal({ step: 'mint_created', debugname, mint: attempt.mint, sig: 'adopted' });
        saveRegistry(reg);
    }
}

let processed = 0;
let created = 0;
let skipped = 0;

for (const [debugname, item] of Object.entries(reg.items)) {
    if (processed >= limit) break;

    const poolDone = item.pool !== null;
    if (item.mint && poolDone) { skipped++; continue; }
    processed++;

    if (dryRun) {
        console.log(`[dry-run] ${debugname}: mint=${item.mint ?? 'NEW'} P0=${item.p0GpPerItem} GP`);
        continue;
    }

    // 1. Mint (skip if adopted/recorded)
    if (!item.mint) {
        const mintKeypair = Keypair.generate();
        appendJournal({ step: 'mint_attempt', debugname, mint: mintKeypair.publicKey.toBase58() });
        const tx = await buildCreateMintTx(conn, payer.publicKey, {
            name: item.name,
            symbol: item.symbol,
            uri: item.uri,
            decimals: ITEM_DECIMALS,
            mintAmount: SEED_PER_ITEM,
            mintKeypair,
        });
        const sig = await pacedSendAndConfirm(conn, tx, [payer, mintKeypair]);
        item.mint = mintKeypair.publicKey.toBase58();
        appendJournal({ step: 'mint_created', debugname, mint: item.mint, sig });
        saveRegistry(reg);
        console.log(`${debugname}: mint ${item.mint}`);
    }

    // 2. Pool (check chain — a previous run may have created it without recording)
    const itemMint = new PublicKey(item.mint);
    const poolAddr = deriveCustomizablePoolAddress(itemMint, gpMint);
    const poolInfo = await conn.getAccountInfo(poolAddr);
    if (poolInfo) {
        if (!item.pool) {
            item.pool = poolAddr.toBase58();
            appendJournal({ step: 'pool_created', debugname, pool: item.pool, sig: 'adopted' });
            saveRegistry(reg);
            console.log(`${debugname}: pool already on-chain, recorded ${item.pool}`);
        }
        created++;
        continue;
    }

    appendJournal({ step: 'pool_attempt', debugname, mint: item.mint, pool: poolAddr.toBase58() });
    const plan = await buildOneSidedPoolTx(cpAmm, payer.publicKey, itemMint, gpMint, item.lowalch, SEED_PER_ITEM);
    const sig = await pacedSendAndConfirm(conn, plan.tx, [payer, plan.positionNft]);
    item.pool = plan.pool.toBase58();
    item.position = plan.position.toBase58();
    appendJournal({ step: 'pool_created', debugname, pool: item.pool, position: item.position, sig });
    saveRegistry(reg);
    created++;
    console.log(`${debugname}: pool ${item.pool} @ P0=${item.p0GpPerItem} GP`);
}

console.log(`done: ${created} created/verified, ${skipped} already complete, ${processed} processed`);
