// One-time: create the GP mint (Token-2022, 6 decimals), mint 10B to the treasury
// ATA, move ~1B to the redemption vault ATA. One owner can only have one ATA per
// mint, so the vault is the ATA of a dedicated vault keypair (.keys/vault.json);
// in v1 both keys live with the bridge service. Vault balance = on-chain-visible
// redemption capacity; the daemon mints the shortfall when it runs dry (per spec).

import { Keypair, Transaction } from '@solana/web3.js';
import {
    TOKEN_2022_PROGRAM_ID,
    createAssociatedTokenAccountIdempotentInstruction,
    createTransferCheckedInstruction,
    getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { connection, bridgeKeypair, loadRegistry, saveRegistry, GP_DECIMALS, CHAIN_ROOT } from './lib/common';
import { buildCreateMintTx } from './lib/token22';
import { pacedSendAndConfirm } from './lib/pace';
import { appendJournal } from './lib/journal';

const conn = connection();
const payer = bridgeKeypair();
const reg = loadRegistry();

if (reg.gp.mint) {
    console.log(`GP mint already exists: ${reg.gp.mint} — nothing to do.`);
    process.exit(0);
}

const totalBase = BigInt(reg.gp.totalSupply) * 10n ** BigInt(GP_DECIMALS);
const vaultBase = BigInt(reg.gp.vaultSupply) * 10n ** BigInt(GP_DECIMALS);

const vaultKeyPath = join(CHAIN_ROOT, '.keys', 'vault.json');
let vaultOwner: Keypair;
if (existsSync(vaultKeyPath)) {
    vaultOwner = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(vaultKeyPath, 'utf8'))));
} else {
    vaultOwner = Keypair.generate();
    writeFileSync(vaultKeyPath, JSON.stringify([...vaultOwner.secretKey]));
}

const mintKeypair = Keypair.generate();
const mint = mintKeypair.publicKey;
console.log(`Creating GP mint ${mint.toBase58()} (${reg.gp.totalSupply} GP, ${GP_DECIMALS} decimals)`);

const tx = await buildCreateMintTx(conn, payer.publicKey, {
    name: reg.gp.name,
    symbol: reg.gp.symbol,
    uri: `${process.env.ENGINE_WEB_URL ?? 'http://localhost:8888'}/bridge/token/gp.json`,
    decimals: GP_DECIMALS,
    mintAmount: totalBase,
    mintKeypair,
});
const sig = await pacedSendAndConfirm(conn, tx, [payer, mintKeypair]);
console.log(`GP mint created: ${sig}`);

const treasuryAta = getAssociatedTokenAddressSync(mint, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
const vaultAta = getAssociatedTokenAddressSync(mint, vaultOwner.publicKey, false, TOKEN_2022_PROGRAM_ID);

const tx2 = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, vaultAta, vaultOwner.publicKey, mint, TOKEN_2022_PROGRAM_ID),
    createTransferCheckedInstruction(treasuryAta, mint, vaultAta, payer.publicKey, vaultBase, GP_DECIMALS, [], TOKEN_2022_PROGRAM_ID),
);
const sig2 = await pacedSendAndConfirm(conn, tx2, [payer]);
console.log(`Vault funded with ${reg.gp.vaultSupply} GP: ${sig2}`);

reg.gp.mint = mint.toBase58();
reg.gp.treasuryAta = treasuryAta.toBase58();
reg.gp.vaultAta = vaultAta.toBase58();
saveRegistry(reg);
appendJournal({ step: 'gp_created', debugname: 'gp', mint: reg.gp.mint, sig });
console.log(`treasury ATA: ${reg.gp.treasuryAta}`);
console.log(`vault ATA:    ${reg.gp.vaultAta} (owner key: chain/.keys/vault.json)`);
