// Mainnet (or any cluster) genesis for the RSGP bridge:
//   1. initialize config (admin + operator)
//   2. create the GP vanity mint (Metaplex metadata from registry uri)
//   3. set_gp_mint
//   4. fund vault (1B GP, owner = mint_authority PDA) + treasury (9B GP, owner = admin)
//   5. record program/config/authority/vault addresses into registry.json (registry.bridge, gp.*)
//
// Idempotent: every step checks on-chain state first, so a re-run after a partial
// failure resumes safely. Real money — nothing is minted twice.
//
//   RPC_URL=<mainnet> ADMIN=.keys/mainnet-admin.json OPERATOR=.keys/mainnet-operator.json bun program/genesis.ts

import { Connection, Keypair, PublicKey, Transaction, ComputeBudgetProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import { createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync, getMint, getAccount, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    BRIDGE_PROGRAM_ID, configPda, mintAuthorityPda,
    ixInitialize, ixCreateMint, ixSetGpMint, ixMintInitial,
} from './client';

const CHAIN = join(import.meta.dir, '..');
const REGISTRY = join(CHAIN, 'registry', 'registry.json');
const kp = (p: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p.startsWith('/') ? p : join(CHAIN, p), 'utf8'))));

const RPC = process.env.RPC_URL ?? 'https://api.mainnet-beta.solana.com';
const admin = kp(process.env.ADMIN ?? '.keys/mainnet-admin.json');
const operator = kp(process.env.OPERATOR ?? '.keys/mainnet-operator.json');
const CU_PRICE = parseInt(process.env.CU_PRICE ?? '50000', 10);

const conn = new Connection(RPC, 'confirmed');
const reg = JSON.parse(readFileSync(REGISTRY, 'utf8'));
const GP = (whole: bigint) => whole * 10n ** BigInt(reg.gp.decimals);
const gpKp = kp(join('.keys', 'rsgp', `${reg.gp.mint}.json`));

async function send(ixs: Parameters<typeof Transaction.prototype.add>, signers: Keypair[]): Promise<string> {
    const tx = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: CU_PRICE }),
        ...(ixs as never[])
    );
    return sendAndConfirmTransaction(conn, tx, signers, { commitment: 'confirmed' });
}
const exists = async (pk: PublicKey) => (await conn.getAccountInfo(pk)) !== null;

console.log(`genesis on ${RPC.split('?')[0]}\n program ${BRIDGE_PROGRAM_ID.toBase58()}\n admin ${admin.publicKey.toBase58()}\n operator ${operator.publicKey.toBase58()}\n gp mint ${gpKp.publicKey.toBase58()}`);

// 1. config
if (await exists(configPda())) {
    console.log('1. config already initialized — skip');
} else {
    console.log('1. initialize config:', await send([ixInitialize(admin.publicKey, operator.publicKey)], [admin]));
}

// 2. GP mint
if (await exists(gpKp.publicKey)) {
    console.log('2. GP mint already exists — skip');
} else {
    console.log('2. create GP mint:', await send([ixCreateMint(admin.publicKey, gpKp.publicKey, reg.gp.decimals, reg.gp.name, reg.gp.symbol, reg.gp.uri)], [admin, gpKp]));
}

// 3. set_gp_mint
console.log('3. set_gp_mint:', await send([ixSetGpMint(admin.publicKey, gpKp.publicKey)], [admin]));

// 4. vault + treasury (idempotent ATA creation + retried read — getOrCreate races on fast RPCs)
const authority = mintAuthorityPda();
const vaultAddr = getAssociatedTokenAddressSync(gpKp.publicKey, authority, true, TOKEN_PROGRAM_ID);
const treasuryAddr = getAssociatedTokenAddressSync(gpKp.publicKey, admin.publicKey, false, TOKEN_PROGRAM_ID);
console.log(`   vault ${vaultAddr.toBase58()}  treasury ${treasuryAddr.toBase58()}`);

const ataIxs = [];
if (!(await exists(vaultAddr))) ataIxs.push(createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, vaultAddr, authority, gpKp.publicKey, TOKEN_PROGRAM_ID));
if (!(await exists(treasuryAddr))) ataIxs.push(createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, treasuryAddr, admin.publicKey, gpKp.publicKey, TOKEN_PROGRAM_ID));
if (ataIxs.length) console.log('   create ATAs:', await send(ataIxs as never, [admin]));

async function balanceWithRetry(addr: PublicKey): Promise<bigint> {
    for (let i = 0; i < 10; i++) {
        try { return (await getAccount(conn, addr)).amount; } catch { await new Promise(r => setTimeout(r, 1500)); }
    }
    throw new Error(`ATA ${addr.toBase58()} not readable after retries`);
}
const vaultAta = { address: vaultAddr };
const treasuryAta = { address: treasuryAddr };
const vaultBal = await balanceWithRetry(vaultAddr);
const treasuryBal = await balanceWithRetry(treasuryAddr);
const vaultTarget = GP(BigInt(reg.gp.vaultSupply));
const treasuryTarget = GP(BigInt(reg.gp.totalSupply) - BigInt(reg.gp.vaultSupply));

if (vaultBal >= vaultTarget) console.log(`4. vault already funded (${vaultBal}) — skip`);
else console.log('4. fund vault:', await send([ixMintInitial(admin.publicKey, gpKp.publicKey, vaultAta.address, vaultTarget - vaultBal)], [admin]));

if (treasuryBal >= treasuryTarget) console.log(`4. treasury already funded (${treasuryBal}) — skip`);
else console.log('4. fund treasury:', await send([ixMintInitial(admin.publicKey, gpKp.publicKey, treasuryAta.address, treasuryTarget - treasuryBal)], [admin]));

// 5. record
const mintInfo = await getMint(conn, gpKp.publicKey);
reg.network = RPC.includes('mainnet') ? 'mainnet-beta' : reg.network;
reg.programId = reg.programId; // (Meteora program, unchanged)
reg.bridge = {
    programId: BRIDGE_PROGRAM_ID.toBase58(),
    configPda: configPda().toBase58(),
    mintAuthorityPda: authority.toBase58(),
    operator: operator.publicKey.toBase58(),
    admin: admin.publicKey.toBase58(),
    deployedAt: new Date().toISOString(),
};
reg.gp.vaultAta = vaultAta.address.toBase58();
reg.gp.treasuryAta = treasuryAta.address.toBase58();
writeFileSync(REGISTRY, JSON.stringify(reg, null, 2) + '\n');

console.log(`\nGENESIS COMPLETE`);
console.log(` GP mint:      ${gpKp.publicKey.toBase58()} (supply ${mintInfo.supply}, decimals ${mintInfo.decimals})`);
console.log(` vault:        ${vaultAta.address.toBase58()}`);
console.log(` treasury:     ${treasuryAta.address.toBase58()}`);
console.log(` config PDA:   ${configPda().toBase58()}`);
console.log(` mint auth PDA:${authority.toBase58()}`);
process.exit(0);
