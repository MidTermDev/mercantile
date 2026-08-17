// Token-2022 mint creation with MetadataPointer + TokenMetadata ONLY.
// (Any other extension — including MintCloseAuthority — makes DAMM v2 reject the
// mint permissionlessly; metadata-in-mint also avoids Metaplex's 0.01 SOL fee.)

import {
    Connection,
    Keypair,
    PublicKey,
    SystemProgram,
    Transaction,
} from '@solana/web3.js';
import {
    ExtensionType,
    TOKEN_2022_PROGRAM_ID,
    getMintLen,
    createInitializeMetadataPointerInstruction,
    createInitializeMint2Instruction,
    createAssociatedTokenAccountIdempotentInstruction,
    createMintToInstruction,
    getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import {
    createInitializeInstruction,
    pack,
    type TokenMetadata,
} from '@solana/spl-token-metadata';

export interface CreateMintParams {
    name: string;
    symbol: string;
    uri: string;
    decimals: number;
    /** Amount minted to the payer's ATA in base units (0n to skip). */
    mintAmount: bigint;
    mintKeypair: Keypair;
}

/** Builds the create-mint transaction; caller signs with payer + mintKeypair. */
export async function buildCreateMintTx(
    conn: Connection,
    payer: PublicKey,
    p: CreateMintParams,
): Promise<Transaction> {
    const mint = p.mintKeypair.publicKey;
    const metadata: TokenMetadata = {
        updateAuthority: payer,
        mint,
        name: p.name,
        symbol: p.symbol,
        uri: p.uri,
        additionalMetadata: [],
    };
    const mintLen = getMintLen([ExtensionType.MetadataPointer]);
    // TokenMetadata is a variable-length TLV appended by a realloc during initialize;
    // rent for it must be pre-funded on the account (TYPE_SIZE + LENGTH_SIZE = 4).
    const metadataLen = 4 + pack(metadata).length;
    const lamports = await conn.getMinimumBalanceForRentExemption(mintLen + metadataLen);

    const tx = new Transaction().add(
        SystemProgram.createAccount({
            fromPubkey: payer,
            newAccountPubkey: mint,
            space: mintLen,
            lamports,
            programId: TOKEN_2022_PROGRAM_ID,
        }),
        createInitializeMetadataPointerInstruction(mint, payer, mint, TOKEN_2022_PROGRAM_ID),
        createInitializeMint2Instruction(mint, p.decimals, payer, null, TOKEN_2022_PROGRAM_ID),
        createInitializeInstruction({
            programId: TOKEN_2022_PROGRAM_ID,
            mint,
            metadata: mint,
            name: metadata.name,
            symbol: metadata.symbol,
            uri: metadata.uri,
            mintAuthority: payer,
            updateAuthority: payer,
        }),
    );
    if (p.mintAmount > 0n) {
        const ata = getAssociatedTokenAddressSync(mint, payer, false, TOKEN_2022_PROGRAM_ID);
        tx.add(
            createAssociatedTokenAccountIdempotentInstruction(payer, ata, payer, mint, TOKEN_2022_PROGRAM_ID),
            createMintToInstruction(mint, ata, payer, p.mintAmount, [], TOKEN_2022_PROGRAM_ID),
        );
    }
    return tx;
}

export function ata(mint: PublicKey, owner: PublicKey): PublicKey {
    return getAssociatedTokenAddressSync(mint, owner, false, TOKEN_2022_PROGRAM_ID);
}
