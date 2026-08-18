// Reclaim position-NFT rent from the 44 abandoned 0-decimal pools (DAMM v2 pools
// themselves can't be closed, but the position can — recovers ~0.009 SOL each +
// returns the stranded seed tokens to admin). Reads registry/reclaim-positions.json
// ({mint,pool,position}[]). Idempotent: skips positions already closed.
//
//   RPC_URL=<mainnet> ADMIN=.keys/mainnet-admin.json bun runner/reclaim-positions.ts [--limit N]

import { Connection, Keypair, PublicKey, Transaction, ComputeBudgetProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import { CpAmm, derivePositionNftAccount } from '@meteora-ag/cp-amm-sdk';
import BN from 'bn.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CHAIN = join(import.meta.dir, '..');
const kp = (p: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p.startsWith('/') ? p : join(CHAIN, p), 'utf8'))));
const RPC = process.env.RPC_URL ?? 'https://api.mainnet-beta.solana.com';
const admin = kp(process.env.ADMIN ?? '.keys/mainnet-admin.json');
const limitArg = process.argv.indexOf('--limit');
const limit = limitArg !== -1 ? parseInt(process.argv[limitArg + 1], 10) : Infinity;

const conn = new Connection(RPC, 'confirmed');
const cpAmm = new CpAmm(conn);
const list: { mint: string; pool: string; position: string }[] = JSON.parse(readFileSync(join(CHAIN, 'registry', 'reclaim-positions.json'), 'utf8'));

let closed = 0, skipped = 0, failed = 0;
for (const { pool, position } of list.slice(0, limit === Infinity ? undefined : limit)) {
    const positionPk = new PublicKey(position);
    try {
        if (!(await conn.getAccountInfo(positionPk))) { skipped++; continue; } // already closed
        const positionState = await cpAmm.fetchPositionState(positionPk);
        const poolState = await cpAmm.fetchPoolState(new PublicKey(pool));
        const nftAccount = derivePositionNftAccount(positionState.nftMint);
        const txb = await cpAmm.removeAllLiquidityAndClosePosition({
            owner: admin.publicKey,
            position: positionPk,
            positionNftAccount: nftAccount,
            poolState,
            positionState,
            tokenAAmountThreshold: new BN(0),
            tokenBAmountThreshold: new BN(0),
            vestings: [],
            currentPoint: new BN(0),
        });
        const tx = await txb;
        const sig = await sendAndConfirmTransaction(conn,
            new Transaction().add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 }), ...tx.instructions),
            [admin], { commitment: 'confirmed' });
        closed++;
        console.log(`closed position ${position.slice(0, 8)}… (${closed}) ${sig.slice(0, 12)}`);
    } catch (err) {
        failed++;
        console.error(`FAILED ${position.slice(0, 8)}…: ${String(err).slice(0, 120)}`);
    }
    await new Promise(r => setTimeout(r, 200));
}
console.log(`done: ${closed} closed, ${skipped} already closed, ${failed} failed`);
process.exit(0);
