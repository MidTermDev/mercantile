// Fulfils withdrawals: bridge_tx rows the ENGINE has already debited (state
// 'debited' — game-side debit is on disk before we ever see the row).
//
// Chain-side exactly-once: the signed tx's signature + last valid block height
// are recorded (state 'submitted') BEFORE broadcast. After a crash we check
// getSignatureStatuses first, and only rebuild+resend once the old tx is
// provably dead (blockhash expired with no status). Never two live txs per row.
//
// Items: mintTo the user's ATA (supply grows only when items leave the game).
// GP: transfer from the redemption vault; if the vault is short, MINT the
// shortfall to the user — per spec, that mint is the on-chain signal that the
// in-game economy is inflating.

import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import {
    TOKEN_2022_PROGRAM_ID,
    createAssociatedTokenAccountIdempotentInstruction,
    createMintToInstruction,
    createTransferCheckedInstruction,
    getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { db, toDbDate } from './db';
import { config, loadKeypair, makeConnection } from './config';
import { loadRegistryMaps, type RegistryMaps } from './verifier';

const GP_DECIMALS = 6;
const POLL_MS = 2000;
const MAX_BUILD_ATTEMPTS = 5;

interface WithdrawRow {
    id: number;
    account_id: number;
    username: string;
    wallet: string;
    obj_debugname: string;
    obj_id: number;
    count: number;
    state: string;
    sig: string | null;
    last_valid_height: number | null;
}

export class WithdrawWorker {
    private conn: Connection;
    private payer: Keypair;
    private vaultOwner: Keypair;
    private registry: RegistryMaps;
    private running = false;

    constructor() {
        this.conn = makeConnection();
        this.payer = loadKeypair(config.keypairPath);
        this.vaultOwner = loadKeypair(config.vaultKeypairPath);
        this.registry = loadRegistryMaps();
    }

    async start(): Promise<void> {
        await this.reconcile();
        this.running = true;
        while (this.running) {
            try {
                if (!config.paused) await this.tick();
            } catch (err) {
                console.error('[withdraw-worker] tick failed:', err);
            }
            await new Promise(r => setTimeout(r, POLL_MS));
        }
    }

    /** Startup: resolve every 'submitted' row before touching new work. */
    private async reconcile(): Promise<void> {
        const rows = (await db
            .selectFrom('bridge_tx')
            .where('direction', '=', 'withdraw')
            .where('state', '=', 'submitted')
            .selectAll()
            .orderBy('id', 'asc')
            .execute()) as unknown as WithdrawRow[];
        for (const row of rows) {
            console.log(`[withdraw-worker] reconciling submitted row ${row.id} (sig ${row.sig?.slice(0, 12)}…)`);
            await this.confirmOrResubmit(row);
        }
    }

    private async tick(): Promise<void> {
        const rows = (await db
            .selectFrom('bridge_tx')
            .where('direction', '=', 'withdraw')
            .where('state', '=', 'debited')
            .selectAll()
            .orderBy('id', 'asc')
            .limit(10)
            .execute()) as unknown as WithdrawRow[];
        for (const row of rows) {
            await this.fulfil(row);
        }
    }

    private async buildTx(row: WithdrawRow): Promise<{ tx: Transaction; lastValidBlockHeight: number } | { error: string }> {
        const user = new PublicKey(row.wallet);
        const tx = new Transaction();

        if (row.obj_debugname === 'gp') {
            const gpMint = new PublicKey(this.registry.gpMint);
            const userAta = getAssociatedTokenAddressSync(gpMint, user, false, TOKEN_2022_PROGRAM_ID);
            const vaultAta = new PublicKey(this.registry.vaultAta);
            const amount = BigInt(row.count) * 10n ** BigInt(GP_DECIMALS);

            const vaultBalance = BigInt((await this.conn.getTokenAccountBalance(vaultAta)).value.amount);
            tx.add(createAssociatedTokenAccountIdempotentInstruction(this.payer.publicKey, userAta, user, gpMint, TOKEN_2022_PROGRAM_ID));
            if (vaultBalance >= amount) {
                tx.add(createTransferCheckedInstruction(vaultAta, gpMint, userAta, this.vaultOwner.publicKey, amount, GP_DECIMALS, [], TOKEN_2022_PROGRAM_ID));
            } else {
                // vault dry (or short): drain what's there, mint the shortfall —
                // the explicit in-game-inflation signal from the spec.
                if (vaultBalance > 0n) {
                    tx.add(createTransferCheckedInstruction(vaultAta, gpMint, userAta, this.vaultOwner.publicKey, vaultBalance, GP_DECIMALS, [], TOKEN_2022_PROGRAM_ID));
                }
                const shortfall = amount - vaultBalance;
                tx.add(createMintToInstruction(gpMint, userAta, this.payer.publicKey, shortfall, [], TOKEN_2022_PROGRAM_ID));
                console.warn(`[withdraw-worker] INFLATION: vault short by ${Number(shortfall) / 10 ** GP_DECIMALS} GP for row ${row.id} — minting`);
            }
        } else {
            const item = this.registry.itemsByDebugname.get(row.obj_debugname);
            if (!item) return { error: `no mint for ${row.obj_debugname}` };
            const mint = new PublicKey(item.mint);
            const userAta = getAssociatedTokenAddressSync(mint, user, false, TOKEN_2022_PROGRAM_ID);
            tx.add(
                createAssociatedTokenAccountIdempotentInstruction(this.payer.publicKey, userAta, user, mint, TOKEN_2022_PROGRAM_ID),
                createMintToInstruction(mint, userAta, this.payer.publicKey, BigInt(row.count), [], TOKEN_2022_PROGRAM_ID)
            );
        }

        const { blockhash, lastValidBlockHeight } = await this.conn.getLatestBlockhash('finalized');
        tx.recentBlockhash = blockhash;
        tx.feePayer = this.payer.publicKey;
        const signers = row.obj_debugname === 'gp' ? [this.payer, this.vaultOwner] : [this.payer];
        tx.sign(...signers);
        return { tx, lastValidBlockHeight };
    }

    private async fulfil(row: WithdrawRow): Promise<void> {
        for (let attempt = 0; attempt < MAX_BUILD_ATTEMPTS; attempt++) {
            const built = await this.buildTx(row);
            if ('error' in built) {
                await this.fail(row, built.error);
                return;
            }
            const sig = built.tx.signatures[0].signature ? bs58.encode(built.tx.signatures[0].signature) : null;
            if (!sig) {
                await this.fail(row, 'failed to sign transaction');
                return;
            }

            // record BEFORE broadcast — exactly-once hinges on this ordering
            await db
                .updateTable('bridge_tx')
                .set({ state: 'submitted', sig, last_valid_height: built.lastValidBlockHeight, updated_at: toDbDate(new Date()) })
                .where('id', '=', row.id)
                .where('state', 'in', ['debited', 'submitted'])
                .execute();
            row.sig = sig;
            row.last_valid_height = built.lastValidBlockHeight;

            try {
                await this.conn.sendRawTransaction(built.tx.serialize(), { skipPreflight: false });
            } catch (err) {
                const msg = String(err);
                // "already processed" means an earlier broadcast landed — confirm below
                if (!msg.includes('already been processed')) {
                    console.warn(`[withdraw-worker] send failed for row ${row.id}: ${msg}`);
                }
            }

            const outcome = await this.confirmOrResubmit(row);
            if (outcome !== 'resubmit') return;
        }
        await this.fail(row, 'exhausted submission attempts');
    }

    /** Waits for the recorded sig to finalize or provably die. */
    private async confirmOrResubmit(row: WithdrawRow): Promise<'confirmed' | 'resubmit' | 'failed'> {
        if (!row.sig || row.last_valid_height === null) return 'resubmit';
        for (;;) {
            const status = (await this.conn.getSignatureStatuses([row.sig], { searchTransactionHistory: true })).value[0];
            if (status) {
                if (status.err) {
                    await this.fail(row, `transaction failed on-chain: ${JSON.stringify(status.err)}`);
                    return 'failed';
                }
                if (status.confirmationStatus === 'finalized') {
                    await db
                        .updateTable('bridge_tx')
                        .set({ state: 'confirmed', updated_at: toDbDate(new Date()) })
                        .where('id', '=', row.id)
                        .where('state', '=', 'submitted')
                        .execute();
                    console.log(`[withdraw-worker] row ${row.id} confirmed: ${row.count} x ${row.obj_debugname} -> ${row.wallet.slice(0, 8)}…`);
                    return 'confirmed';
                }
                // landed but not finalized yet — keep waiting
            } else {
                const height = await this.conn.getBlockHeight('finalized');
                if (height > row.last_valid_height) {
                    // provably dead: no status anywhere and its blockhash expired
                    return 'resubmit';
                }
            }
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    /**
     * Permanent failure: refund via a synthetic deposit row with a FRESH id
     * (never by reusing the withdraw row — per-player watermark varps require
     * ascending ids per direction). UNIQUE sig 'refund:<id>' makes the refund
     * itself exactly-once.
     */
    private async fail(row: WithdrawRow, error: string): Promise<void> {
        console.error(`[withdraw-worker] row ${row.id} failed permanently: ${error}`);
        try {
            await db
                .insertInto('bridge_tx')
                .values({
                    direction: 'deposit',
                    account_id: row.account_id,
                    username: row.username,
                    wallet: row.wallet,
                    obj_debugname: row.obj_debugname,
                    obj_id: row.obj_id,
                    count: row.count,
                    state: 'verified',
                    sig: `refund:${row.id}`,
                    error: `refund of failed withdraw ${row.id}`
                })
                .execute();
        } catch (err) {
            if (!String(err).includes('UNIQUE')) throw err; // already refunded
        }
        await db
            .updateTable('bridge_tx')
            .set({ state: 'refunded', error, updated_at: toDbDate(new Date()) })
            .where('id', '=', row.id)
            .where('state', 'in', ['debited', 'submitted'])
            .execute();
    }
}
