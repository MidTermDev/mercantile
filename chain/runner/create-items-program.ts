// Create item tokens via the on-chain bridge program + their single-sided DAMM v2
// pools. Per item: program create_mint (vanity kp, PDA authority, Metaplex metadata
// from IPFS uri) -> mint_initial 100 seed to admin's item ATA -> DAMM pool
// (100 items vs GP at P0 = 0.9*lowalch, standard SPL). Idempotent + journaled.
//
//   RPC_URL=<mainnet> ADMIN=.keys/mainnet-admin.json bun runner/create-items-program.ts \
//        --only-file registry/staples.txt [--limit N] [--dry-run]

import { Connection, Keypair, PublicKey, Transaction, ComputeBudgetProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import {
    TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync,
    createAssociatedTokenAccountIdempotentInstruction, getAccount,
} from '@solana/spl-token';
import { CpAmm } from '@meteora-ag/cp-amm-sdk';
import BN from 'bn.js';
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ixCreateMint, ixMintInitial } from '../program/client';
import { buildOneSidedPoolTx, deriveCustomizablePoolAddress } from './lib/damm';
import { ITEM_DECIMALS, SEED_BASE_UNITS } from './lib/common';

const CHAIN = join(import.meta.dir, '..');
const REGISTRY = join(CHAIN, 'registry', 'registry.json');
const JOURNAL = join(CHAIN, 'registry', 'journal-mainnet.jsonl');
const kp = (p: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p.startsWith('/') ? p : join(CHAIN, p), 'utf8'))));

const RPC = process.env.RPC_URL ?? 'https://api.mainnet-beta.solana.com';
const admin = kp(process.env.ADMIN ?? '.keys/mainnet-admin.json');
const CU_PRICE = parseInt(process.env.CU_PRICE ?? '60000', 10);
const SEED = SEED_BASE_UNITS; // 100 whole items in base units (accounts for ITEM_DECIMALS)

const dryRun = process.argv.includes('--dry-run');
const limitArg = process.argv.indexOf('--limit');
const limit = limitArg !== -1 ? parseInt(process.argv[limitArg + 1], 10) : Infinity;
const onlyFileArg = process.argv.indexOf('--only-file');
const onlyArg = process.argv.indexOf('--only');
const only = onlyFileArg !== -1
    ? new Set(readFileSync(process.argv[onlyFileArg + 1], 'utf8').split(/\s+/).map(s => s.trim()).filter(Boolean))
    : onlyArg !== -1 ? new Set(process.argv[onlyArg + 1].split(',')) : null;

const conn = new Connection(RPC, 'confirmed');
const cpAmm = new CpAmm(conn);
const reg = JSON.parse(readFileSync(REGISTRY, 'utf8'));
const gpMint = new PublicKey(reg.gp.mint);
const rsgpKp = (mint: string) => kp(join('.keys', 'rsgp', `${mint}.json`));
const save = () => writeFileSync(REGISTRY, JSON.stringify(reg, null, 2) + '\n');
const journal = (o: object) => appendFileSync(JOURNAL, JSON.stringify({ ts: new Date().toISOString(), ...o }) + '\n');
const exists = async (pk: PublicKey) => (await conn.getAccountInfo(pk)) !== null;

async function send(ixs: unknown[], signers: Keypair[]): Promise<string> {
    const tx = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: CU_PRICE }),
        ...(ixs as never[])
    );
    return sendAndConfirmTransaction(conn, tx, signers, { commitment: 'confirmed' });
}
async function balance(ata: PublicKey): Promise<bigint> {
    try { return (await getAccount(conn, ata)).amount; } catch { return 0n; }
}
// Poll until the ATA reads >= want at 'finalized' (Helius nodes lag across a
// mint->pool tx pair; the pool tx simulates on a node that must see the seed).
async function waitBalance(ata: PublicKey, want: bigint): Promise<void> {
    for (let i = 0; i < 20; i++) {
        try { if ((await getAccount(conn, ata, 'finalized')).amount >= want) return; } catch { /* not yet */ }
        await new Promise(r => setTimeout(r, 1500));
    }
    throw new Error(`ATA ${ata.toBase58()} never reached ${want} tokens`);
}

let created = 0, skipped = 0, processed = 0;

for (const [debugname, item] of Object.entries<Record<string, unknown>>(reg.items)) {
    if (processed >= limit) break;
    if (only && !only.has(debugname)) continue;
    if (item.mint && item.pool) { skipped++; continue; }
    processed++;
    try {

    const mintKp = rsgpKp(item.mint as string);
    const mint = mintKp.publicKey;
    if (dryRun) { console.log(`[dry] ${debugname}: mint ${mint.toBase58()} P0=${item.p0GpPerItem} uri=${item.uri ? 'yes' : 'MISSING'}`); continue; }
    if (!item.uri) { console.warn(`${debugname}: no metadata uri, skipping`); continue; }

    // 1. create_mint (skip if the mint account already exists)
    if (!(await exists(mint))) {
        journal({ step: 'create_mint_attempt', debugname, mint: mint.toBase58() });
        const sig = await send([ixCreateMint(admin.publicKey, mint, ITEM_DECIMALS, item.name as string, item.symbol as string, item.uri as string)], [admin, mintKp]);
        journal({ step: 'create_mint', debugname, mint: mint.toBase58(), sig });
        console.log(`${debugname}: mint ${mint.toBase58()}`);
    }

    // 2. seed 100 to admin item ATA (idempotent: only top up while the pool isn't made yet)
    const adminItemAta = getAssociatedTokenAddressSync(mint, admin.publicKey, false, TOKEN_PROGRAM_ID);
    const poolAddr = deriveCustomizablePoolAddress(mint, gpMint);
    const poolLive = await exists(poolAddr);
    if (!poolLive) {
        const bal = await balance(adminItemAta);
        if (bal < SEED) {
            const ixs: unknown[] = [];
            if (!(await exists(adminItemAta))) ixs.push(createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, adminItemAta, admin.publicKey, mint, TOKEN_PROGRAM_ID));
            ixs.push(ixMintInitial(admin.publicKey, mint, adminItemAta, SEED - bal));
            await send(ixs, [admin]);
        }
        await waitBalance(adminItemAta, SEED); // ensure the pool tx's node sees the seed
    }

    // 3. DAMM pool (skip if already on-chain)
    if (poolLive) {
        (item as { pool?: string }).pool = poolAddr.toBase58();
        save();
        created++;
        continue;
    }
    journal({ step: 'pool_attempt', debugname, mint: mint.toBase58(), pool: poolAddr.toBase58() });
    const plan = await buildOneSidedPoolTx(cpAmm, admin.publicKey, mint, gpMint, item.lowalch as number, SEED, TOKEN_PROGRAM_ID);
    const sig = await sendAndConfirmTransaction(conn,
        new Transaction().add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: CU_PRICE }), ...plan.tx.instructions),
        [admin, plan.positionNft], { commitment: 'confirmed' });
    (item as { pool?: string; position?: string }).pool = plan.pool.toBase58();
    (item as { position?: string }).position = plan.position.toBase58();
    journal({ step: 'pool', debugname, pool: plan.pool.toBase58(), position: plan.position.toBase58(), sig });
    save();
    created++;
    console.log(`${debugname}: pool ${plan.pool.toBase58()} @ P0=${item.p0GpPerItem} GP`);
    await new Promise(r => setTimeout(r, 250));
    } catch (err) {
        console.error(`FAILED ${debugname}: ${String(err).slice(0, 160)} — continuing, resume later`);
        journal({ step: 'error', debugname, error: String(err).slice(0, 300) });
    }
}

console.log(`done: ${created} created/verified, ${skipped} already complete, ${processed} processed`);
process.exit(0);
