// Raw-instruction client for the RSGP bridge program (Anchor v2-rc).
//
// The v2-rc IDL uses SINGLE-BYTE instruction discriminators (#[discrim = N]),
// not Anchor's 8-byte scheme, so the legacy @coral-xyz/anchor Program client
// cannot drive it. We build TransactionInstructions by hand: 1 disc byte +
// borsh-encoded args, with account metas in the IDL's declared order.

import {
    Connection, Keypair, PublicKey, SystemProgram, Transaction,
    TransactionInstruction, sendAndConfirmTransaction, SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

export const BRIDGE_PROGRAM_ID = new PublicKey('H5C6RKWQzUdfS8tVzZb3uVcRw3EHCzghv7kWdMBTD2bS');
export const METAPLEX_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

// Single-byte discriminators from target/idl/bridge.json
const DISC = {
    initialize: 0, set_operator: 1, set_paused: 2, set_gp_mint: 3,
    create_mint: 4, mint_initial: 5, withdraw_item: 6, withdraw_gp: 7,
    deposit_item: 8, deposit_gp: 9,
} as const;

// ── borsh-ish arg encoders ────────────────────────────────────────────────
function u8(n: number): Buffer { return Buffer.from([n & 0xff]); }
function boolByte(b: boolean): Buffer { return Buffer.from([b ? 1 : 0]); }
function u64(n: bigint): Buffer { const b = Buffer.alloc(8); b.writeBigUInt64LE(n); return b; }
function pubkey(pk: PublicKey): Buffer { return Buffer.from(pk.toBytes()); }
function str(s: string): Buffer { const utf8 = Buffer.from(s, 'utf8'); const len = Buffer.alloc(4); len.writeUInt32LE(utf8.length); return Buffer.concat([len, utf8]); }
function data(disc: number, ...parts: Buffer[]): Buffer { return Buffer.concat([Buffer.from([disc]), ...parts]); }

// ── PDAs ──────────────────────────────────────────────────────────────────
export function configPda(): PublicKey {
    return PublicKey.findProgramAddressSync([Buffer.from('config')], BRIDGE_PROGRAM_ID)[0];
}
export function mintAuthorityPda(): PublicKey {
    return PublicKey.findProgramAddressSync([Buffer.from('mint_authority')], BRIDGE_PROGRAM_ID)[0];
}
export function eventAuthorityPda(): PublicKey {
    return PublicKey.findProgramAddressSync([Buffer.from('__event_authority')], BRIDGE_PROGRAM_ID)[0];
}
export function metadataPda(mint: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
        [Buffer.from('metadata'), METAPLEX_PROGRAM_ID.toBytes(), mint.toBytes()],
        METAPLEX_PROGRAM_ID,
    )[0];
}

const meta = (pubkey: PublicKey, isSigner: boolean, isWritable: boolean) => ({ pubkey, isSigner, isWritable });

// ── instruction builders ──────────────────────────────────────────────────
export function ixInitialize(admin: PublicKey, operator: PublicKey): TransactionInstruction {
    return new TransactionInstruction({
        programId: BRIDGE_PROGRAM_ID,
        keys: [meta(admin, true, true), meta(configPda(), false, true), meta(SystemProgram.programId, false, false)],
        data: data(DISC.initialize, pubkey(operator)),
    });
}
export function ixSetOperator(admin: PublicKey, newOperator: PublicKey): TransactionInstruction {
    return new TransactionInstruction({
        programId: BRIDGE_PROGRAM_ID,
        keys: [meta(configPda(), false, true), meta(admin, true, false)],
        data: data(DISC.set_operator, pubkey(newOperator)),
    });
}
export function ixSetPaused(admin: PublicKey, paused: boolean): TransactionInstruction {
    return new TransactionInstruction({
        programId: BRIDGE_PROGRAM_ID,
        keys: [meta(configPda(), false, true), meta(admin, true, false)],
        data: data(DISC.set_paused, boolByte(paused)),
    });
}
export function ixSetGpMint(admin: PublicKey, gpMint: PublicKey): TransactionInstruction {
    return new TransactionInstruction({
        programId: BRIDGE_PROGRAM_ID,
        keys: [meta(configPda(), false, true), meta(admin, true, false)],
        data: data(DISC.set_gp_mint, pubkey(gpMint)),
    });
}
export function ixCreateMint(admin: PublicKey, mint: PublicKey, decimals: number, name: string, symbol: string, uri: string): TransactionInstruction {
    return new TransactionInstruction({
        programId: BRIDGE_PROGRAM_ID,
        keys: [
            meta(configPda(), false, false),
            meta(admin, true, true),
            meta(mint, true, true),
            meta(mintAuthorityPda(), false, false),
            meta(metadataPda(mint), false, true),
            meta(METAPLEX_PROGRAM_ID, false, false),
            meta(TOKEN_PROGRAM_ID, false, false),
            meta(SystemProgram.programId, false, false),
            meta(eventAuthorityPda(), false, false),
            meta(BRIDGE_PROGRAM_ID, false, false),
        ],
        data: data(DISC.create_mint, u8(decimals), str(name), str(symbol), str(uri)),
    });
}
export function ixMintInitial(admin: PublicKey, mint: PublicKey, recipientAta: PublicKey, amount: bigint): TransactionInstruction {
    return new TransactionInstruction({
        programId: BRIDGE_PROGRAM_ID,
        keys: [
            meta(configPda(), false, false),
            meta(admin, true, false),
            meta(mint, false, true),
            meta(mintAuthorityPda(), false, false),
            meta(recipientAta, false, true),
            meta(TOKEN_PROGRAM_ID, false, false),
        ],
        data: data(DISC.mint_initial, u64(amount)),
    });
}
export function ixWithdrawItem(operator: PublicKey, mint: PublicKey, recipientAta: PublicKey, amount: bigint): TransactionInstruction {
    return new TransactionInstruction({
        programId: BRIDGE_PROGRAM_ID,
        keys: [
            meta(configPda(), false, false),
            meta(operator, true, false),
            meta(mint, false, true),
            meta(mintAuthorityPda(), false, false),
            meta(recipientAta, false, true),
            meta(TOKEN_PROGRAM_ID, false, false),
            meta(eventAuthorityPda(), false, false),
            meta(BRIDGE_PROGRAM_ID, false, false),
        ],
        data: data(DISC.withdraw_item, u64(amount)),
    });
}
// GP now bridges like items: withdraw_gp MINTS (no vault).
export function ixWithdrawGp(operator: PublicKey, mint: PublicKey, recipientAta: PublicKey, amount: bigint): TransactionInstruction {
    return new TransactionInstruction({
        programId: BRIDGE_PROGRAM_ID,
        keys: [
            meta(configPda(), false, false),
            meta(operator, true, false),
            meta(mint, false, true),
            meta(mintAuthorityPda(), false, false),
            meta(recipientAta, false, true),
            meta(TOKEN_PROGRAM_ID, false, false),
            meta(eventAuthorityPda(), false, false),
            meta(BRIDGE_PROGRAM_ID, false, false),
        ],
        data: data(DISC.withdraw_gp, u64(amount)),
    });
}
export function ixDepositItem(owner: PublicKey, mint: PublicKey, ownerAta: PublicKey, amount: bigint): TransactionInstruction {
    return new TransactionInstruction({
        programId: BRIDGE_PROGRAM_ID,
        keys: [
            meta(mint, false, true),
            meta(ownerAta, false, true),
            meta(owner, true, false),
            meta(TOKEN_PROGRAM_ID, false, false),
            meta(eventAuthorityPda(), false, false),
            meta(BRIDGE_PROGRAM_ID, false, false),
        ],
        data: data(DISC.deposit_item, u64(amount)),
    });
}
// GP now bridges like items: deposit_gp BURNS (no vault), gated to the GP mint.
export function ixDepositGp(owner: PublicKey, mint: PublicKey, ownerAta: PublicKey, amount: bigint): TransactionInstruction {
    return new TransactionInstruction({
        programId: BRIDGE_PROGRAM_ID,
        keys: [
            meta(configPda(), false, false),
            meta(mint, false, true),
            meta(ownerAta, false, true),
            meta(owner, true, false),
            meta(TOKEN_PROGRAM_ID, false, false),
            meta(eventAuthorityPda(), false, false),
            meta(BRIDGE_PROGRAM_ID, false, false),
        ],
        data: data(DISC.deposit_gp, u64(amount)),
    });
}

/** convenience send */
export async function send(conn: Connection, ixs: TransactionInstruction[], signers: Keypair[]): Promise<string> {
    const tx = new Transaction().add(...ixs);
    return sendAndConfirmTransaction(conn, tx, signers, { commitment: 'confirmed' });
}

export { SYSVAR_RENT_PUBKEY };
