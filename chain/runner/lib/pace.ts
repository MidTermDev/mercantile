// Send pacing + confirmation helpers for batch runs.

import { Connection, Keypair, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';

const MIN_INTERVAL_MS = 250; // ~4 tx/s
let lastSend = 0;

export async function pacedSendAndConfirm(
    conn: Connection,
    tx: Transaction,
    signers: Keypair[],
): Promise<string> {
    const wait = lastSend + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastSend = Date.now();

    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            // sendAndConfirmTransaction fetches a fresh blockhash per attempt, so
            // retries never reuse an expired one. Each attempt is a NEW signature;
            // safe here only because every runner tx is guarded by an on-chain
            // existence check on resume (create ops fail loudly if already created).
            return await sendAndConfirmTransaction(conn, tx, signers, {
                commitment: 'confirmed',
                skipPreflight: false,
            });
        } catch (e: unknown) {
            lastErr = e;
            const msg = String(e);
            // "already in use" => the previous attempt actually landed.
            if (msg.includes('already in use')) throw e;
            if (attempt < 2) await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        }
    }
    throw lastErr;
}
