// Reprice the discontinued rares to a high floor. A single-sided pool's floor is
// fixed at creation and there's one pool per token pair, so we can't lift the
// existing 0.9-GP pools. Instead we mint a FRESH token (new vanity …RSGP key) with
// the SAME name/symbol/image, create its pool at the target floor, seed a GP bid so
// it's sellable, and repoint the registry. Nobody holds the old rare tokens yet, so
// the address change is clean. Old low pools are left orphaned (like prior abandons).
//
//   RPC_URL=<mainnet> bun runner/reprice-rares.ts [--only <debugname>] [--dry]

import { Keypair, PublicKey, Connection, Transaction } from '@solana/web3.js';
import BN from 'bn.js';
import { CpAmm, SwapMode } from '@meteora-ag/cp-amm-sdk';
import {
    TOKEN_PROGRAM_ID, getMint, getAccount, getAssociatedTokenAddressSync,
    createAssociatedTokenAccountIdempotentInstruction,
} from '@solana/spl-token';
import { readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ixCreateMint, ixMintInitial, send } from '../program/client';
import { buildOneSidedPoolTx, deriveCustomizablePoolAddress } from './lib/damm';
import { ITEM_DECIMALS, GP_DECIMALS, SEED_BASE_UNITS } from './lib/common';
import { pacedSendAndConfirm } from './lib/pace';

// Target GP floor per rare.
const TARGETS: Record<string, number> = {
    red_partyhat: 10_000_000, blue_partyhat: 10_000_000, green_partyhat: 10_000_000,
    yellow_partyhat: 10_000_000, purple_partyhat: 10_000_000, white_partyhat: 10_000_000,
    christmas_cracker: 10_000_000,
    santa_hat: 2_500_000,
    halloweenmask_red: 1_000_000, halloweenmask_green: 1_000_000, halloweenmask_blue: 1_000_000,
};

const CHAIN = join(import.meta.dir, '..');
const REGISTRY = join(CHAIN, 'registry', 'registry.json');
const JOURNAL = join(CHAIN, 'runner', 'reprice-rares.jsonl');
const RSGP_DIR = join(CHAIN, '.keys', 'rsgp');
const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : undefined;
const DRY = process.argv.includes('--dry');

const conn = new Connection(process.env.RPC_URL!, 'confirmed');
const cpAmm = new CpAmm(conn);
const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(CHAIN, '.keys', 'mainnet-admin.json'), 'utf8'))));
const reg = JSON.parse(readFileSync(REGISTRY, 'utf8'));
const gpMint = new PublicKey(reg.gp.mint);
const save = () => writeFileSync(REGISTRY, JSON.stringify(reg, null, 2) + '\n');
const journal = (o: any) => appendFileSync(JOURNAL, JSON.stringify(o) + '\n');

// spare vanity keys = rsgp keys not used as any mint AND not previously burned/abandoned
const used = new Set<string>(Object.values(reg.items).map((i: any) => i.mint).filter(Boolean));
if (reg.gp.mint) used.add(reg.gp.mint);
const BURNED = join(CHAIN, 'registry', 'burned-mints.txt');
const burned = new Set(existsSync(BURNED) ? readFileSync(BURNED, 'utf8').split('\n').map(s => s.trim()).filter(Boolean) : []);
const spare = readdirSync(RSGP_DIR).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).filter(k => !used.has(k) && !burned.has(k));
// which new mints we've already assigned (from journal) so re-runs are idempotent
const assigned: Record<string, string> = {};
if (existsSync(JOURNAL)) for (const l of readFileSync(JOURNAL, 'utf8').split('\n')) {
    if (!l.trim()) continue; const j = JSON.parse(l); if (j.step === 'assign') assigned[j.debugname] = j.mint;
}
let spareIdx = 0;
async function nextSpare(debugname: string): Promise<Keypair> {
    let mint = assigned[debugname];
    if (!mint) {
        // pick the next spare that does NOT already exist on-chain (truly fresh)
        while (spareIdx < spare.length) {
            const cand = spare[spareIdx++];
            if (await conn.getAccountInfo(new PublicKey(cand)) === null) { mint = cand; break; }
        }
        if (!mint) throw new Error('out of fresh spare vanity keys');
        assigned[debugname] = mint; journal({ step: 'assign', debugname, mint });
    }
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(RSGP_DIR, `${mint}.json`), 'utf8'))));
}

async function balance(ata: PublicKey): Promise<bigint> {
    try { return (await getAccount(conn, ata, 'confirmed')).amount; } catch { return 0n; }
}
async function waitBalance(ata: PublicKey, want: bigint): Promise<void> {
    for (let i = 0; i < 8; i++) { if (await balance(ata) >= want) return; await new Promise(r => setTimeout(r, 1000)); }
    throw new Error(`ATA ${ata.toBase58()} never reached ${want}`);
}

async function reprice(debugname: string, target: number): Promise<void> {
    const item = reg.items[debugname];
    if (!item) { console.warn(`${debugname}: not in registry`); return; }
    const mintKp = await nextSpare(debugname);
    const mint = mintKp.publicKey;
    console.log(`${debugname}: new mint ${mint.toBase58()} @ floor ${target.toLocaleString()} GP`);
    if (DRY) return;

    // 1. create_mint (skip if it already exists) — same name/symbol/uri (image reused)
    const info = await conn.getAccountInfo(mint);
    if (!info) {
        const sig = await send(conn, [ixCreateMint(admin.publicKey, mint, ITEM_DECIMALS, item.name, item.symbol, item.uri)], [admin, mintKp]);
        journal({ step: 'create_mint', debugname, mint: mint.toBase58(), sig });
    }
    // 2. mint_initial 100 items to admin's ATA
    const adminAta = getAssociatedTokenAddressSync(mint, admin.publicKey, false, TOKEN_PROGRAM_ID);
    const bal = await balance(adminAta);
    if (bal < SEED_BASE_UNITS) {
        const tx = new Transaction();
        tx.add(createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, adminAta, admin.publicKey, mint, TOKEN_PROGRAM_ID));
        tx.add(ixMintInitial(admin.publicKey, mint, adminAta, SEED_BASE_UNITS - bal));
        const sig = await pacedSendAndConfirm(conn, tx, [admin]);
        journal({ step: 'mint_initial', debugname, sig });
    }
    await waitBalance(adminAta, SEED_BASE_UNITS);

    // 3. one-sided pool at the target floor (idempotent: skip if it already exists)
    const poolAddr = deriveCustomizablePoolAddress(mint, gpMint);
    let position: string | undefined;
    if (!(await conn.getAccountInfo(poolAddr))) {
        const plan = await buildOneSidedPoolTx(cpAmm, admin.publicKey, mint, gpMint, item.lowalch, SEED_BASE_UNITS, TOKEN_PROGRAM_ID, String(target));
        const poolSig = await pacedSendAndConfirm(conn, plan.tx, [admin, plan.positionNft]);
        position = plan.position.toBase58();
        journal({ step: 'pool', debugname, pool: poolAddr.toBase58(), position, sig: poolSig });
    }
    // wait for the pool account to be visible (Helius lags across nodes)
    let poolState: any = null;
    for (let i = 0; i < 15 && !poolState; i++) { try { poolState = await cpAmm.fetchPoolState(poolAddr); } catch { await new Promise(r => setTimeout(r, 2000)); } }
    if (!poolState) throw new Error('pool not visible after creation');

    // 4. seed a GP bid (~5 items of sell depth) so the rare is sellable. Skip only if a
    // REAL bid already exists (pool creation leaves ~1 base-unit of GP dust, not 0).
    const BID_MULT = 5n;
    const wantBidBase = Number(BigInt(target) * BID_MULT * 10n ** BigInt(GP_DECIMALS));
    const gpInVault = await conn.getTokenAccountBalance(poolState.tokenBVault).then(b => Number(b.value.amount)).catch(() => 0);
    if (gpInVault < wantBidBase * 0.5) {
    const [gpInfo, itemInfo] = await Promise.all([getMint(conn, gpMint, 'confirmed', TOKEN_PROGRAM_ID), getMint(conn, mint, 'confirmed', TOKEN_PROGRAM_ID)]);
    const epoch = (await conn.getEpochInfo()).epoch;
    const bt = (await conn.getBlockTime(await conn.getSlot())) ?? 0;
    const amountIn = new BN((BigInt(target) * BID_MULT * 10n ** BigInt(GP_DECIMALS)).toString());  // spend ~5×target GP
    const q = cpAmm.getQuote2({
        inputTokenMint: gpMint, slippage: 50, currentPoint: new BN(bt), poolState,
        inputTokenInfo: { mint: gpInfo, currentEpoch: epoch }, outputTokenInfo: { mint: itemInfo, currentEpoch: epoch },
        tokenADecimal: ITEM_DECIMALS, tokenBDecimal: GP_DECIMALS, hasReferral: false, swapMode: SwapMode.ExactIn, amountIn,
    });
    const bidTx = await cpAmm.swap2({
        payer: admin.publicKey, pool: poolAddr, inputTokenMint: gpMint, outputTokenMint: mint,
        tokenAMint: poolState.tokenAMint, tokenBMint: poolState.tokenBMint, tokenAVault: poolState.tokenAVault, tokenBVault: poolState.tokenBVault,
        tokenAProgram: TOKEN_PROGRAM_ID, tokenBProgram: TOKEN_PROGRAM_ID, referralTokenAccount: null, poolState,
        swapMode: SwapMode.ExactIn, amountIn, minimumAmountOut: q.minimumAmountOut!,
    });
    const bidSig = await pacedSendAndConfirm(conn, bidTx, [admin]);
    journal({ step: 'bid', debugname, sig: bidSig });
    }

    // 5. repoint the registry (keep name/symbol/uri/image)
    item.mint = mint.toBase58();
    item.pool = poolAddr.toBase58();
    if (position) item.position = position;
    item.p0GpPerItem = target;
    save();
    console.log(`${debugname}: DONE -> ${mint.toBase58()} pool ${poolAddr.toBase58()}`);
}

const list = ONLY ? [ONLY] : Object.keys(TARGETS);
console.log(`repricing ${list.length} rare(s); spare keys available: ${spare.length}`);
for (const dn of list) {
    try { await reprice(dn, TARGETS[dn]); }
    catch (e: any) { console.error(`${dn} FAILED: ${String(e.message ?? e).slice(0, 120)}`); }
}
console.log('done.');
