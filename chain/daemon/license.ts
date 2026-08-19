// Bot-license pricing + burn verification.
//
// A bot license costs ~LICENSE_SOL worth of GP, priced live from the GP/SOL DAMM v2
// pool, and is paid by BURNING that GP on the website (a deflationary sink). The burn
// is verified here (mirrors verifier.ts), then the buyer's linked account is activated.

import { Connection, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { CpAmm, SwapMode } from '@meteora-ag/cp-amm-sdk';
import { getMint, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { ParsedInstruction } from '@solana/web3.js';
import { readFileSync } from 'node:fs';
import { config } from './config';

const GP_DECIMALS = 6;
const WSOL = new PublicKey('So11111111111111111111111111111111111111112');

// Target license value + guard rails so a volatile GP/SOL market can't make the license
// absurdly cheap or expensive. Tunable via env.
export const LICENSE_SOL = parseFloat(process.env.LICENSE_SOL ?? '0.1');
export const LICENSE_FLOOR_GP = parseInt(process.env.LICENSE_FLOOR_GP ?? '25000', 10);   // never cheaper than this
export const LICENSE_CAP_GP = parseInt(process.env.LICENSE_CAP_GP ?? '25000000', 10);    // never dearer than this
// A burn must cover at least this fraction of the current quote (tolerates a price tick
// between the website quote and on-chain confirmation).
const ACCEPT_FRACTION = 0.9;

function reg() {
    const r = JSON.parse(readFileSync(config.registryPath, 'utf8'));
    if (!r.gp?.mint || !r.gp?.solPool) throw new Error('registry missing gp.mint / gp.solPool');
    return { gpMint: r.gp.mint as string, solPool: r.gp.solPool as string };
}

/** Whole GP worth LICENSE_SOL right now, clamped to [floor, cap]. */
export async function quoteLicenseGp(conn: Connection): Promise<{ gp: number; sol: number; raw: number; clamped: boolean }> {
    const { gpMint, solPool } = reg();
    const cp = new CpAmm(conn);
    const pool = await cp.fetchPoolState(new PublicKey(solPool));
    const [gpInfo, solInfo] = await Promise.all([
        getMint(conn, new PublicKey(gpMint), 'confirmed', TOKEN_PROGRAM_ID),
        getMint(conn, WSOL, 'confirmed', TOKEN_PROGRAM_ID),
    ]);
    const epoch = (await conn.getEpochInfo()).epoch;
    // GP is tokenA (6dp), WSOL is tokenB (9dp). Quote 0.1 SOL in -> GP out (exact-in).
    const amountIn = new BN(Math.round(LICENSE_SOL * 1e9).toString());
    const quote = cp.getQuote2({
        inputTokenMint: WSOL, slippage: 1, currentPoint: new BN(Math.floor(Date.now() / 1000)), poolState: pool,
        inputTokenInfo: { mint: solInfo, currentEpoch: epoch }, outputTokenInfo: { mint: gpInfo, currentEpoch: epoch },
        tokenADecimal: GP_DECIMALS, tokenBDecimal: 9, hasReferral: false, swapMode: SwapMode.ExactIn, amountIn,
    });
    const rawGp = Number((quote.outputAmount ?? new BN(0)).toString()) / 10 ** GP_DECIMALS;
    const clampedGp = Math.max(LICENSE_FLOOR_GP, Math.min(LICENSE_CAP_GP, Math.round(rawGp)));
    return { gp: clampedGp, sol: LICENSE_SOL, raw: Math.round(rawGp), clamped: clampedGp !== Math.round(rawGp) };
}

export type LicenseVerify = { ok: true; wallet: string; gpBurned: number } | { ok: false; reason: string };

/** Verify `signature` is a finalized burn of >= (0.9 * current quote) GP. Returns the burner wallet. */
export async function verifyLicenseTx(conn: Connection, signature: string): Promise<LicenseVerify> {
    const { gpMint } = reg();
    const tx = await conn.getParsedTransaction(signature, { commitment: 'finalized', maxSupportedTransactionVersion: 0 });
    if (!tx) return { ok: false, reason: 'transaction not found at finalized commitment' };
    if (tx.meta?.err) return { ok: false, reason: 'transaction failed' };

    const all = [...tx.transaction.message.instructions, ...(tx.meta?.innerInstructions ?? []).flatMap(g => g.instructions)]
        .filter((ix): ix is ParsedInstruction => 'parsed' in ix);
    let burnedRaw = 0n; let wallet = '';
    for (const ix of all) {
        if (ix.program !== 'spl-token') continue;
        const { type, info } = ix.parsed as { type: string; info: Record<string, unknown> };
        if ((type !== 'burnChecked' && type !== 'burn') || String(info.mint) !== gpMint) continue;
        burnedRaw += type === 'burnChecked' ? BigInt((info.tokenAmount as { amount: string }).amount) : BigInt(String(info.amount));
        wallet = String(info.authority);
    }
    if (burnedRaw === 0n || !wallet || wallet === 'undefined') return { ok: false, reason: 'no GP burn found in transaction' };

    const gpBurned = Number(burnedRaw / 10n ** BigInt(GP_DECIMALS));
    const { gp: price } = await quoteLicenseGp(conn);
    if (gpBurned < Math.floor(price * ACCEPT_FRACTION)) {
        return { ok: false, reason: `burned ${gpBurned} GP, license needs ~${price} GP (${LICENSE_SOL} SOL)` };
    }
    return { ok: true, wallet, gpBurned };
}
