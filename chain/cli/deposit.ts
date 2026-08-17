// Deposit on-chain tokens back into the game: burn item tokens (or transfer GP
// into the redemption vault), wait for finality, then notify the bridge.
// Claim in game afterwards at the Exchange Clerk (Varrock west bank).
//
// Usage:
//   bun cli/deposit.ts <debugname> <count> [--keypair path] [--server url]
//   bun cli/deposit.ts gp <wholeGp>  [--keypair path] [--server url]

import { Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import {
    TOKEN_2022_PROGRAM_ID,
    createBurnCheckedInstruction,
    createTransferCheckedInstruction,
    getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { connection, loadRegistry, GP_DECIMALS } from '../runner/lib/common';

const positional = process.argv.slice(2).filter(a => !a.startsWith('--'));
const [debugname, countStr] = positional;
const kpArg = process.argv.indexOf('--keypair');
const serverArg = process.argv.indexOf('--server');

if (!debugname || !countStr || !/^\d+$/.test(countStr)) {
    console.error('usage: bun cli/deposit.ts <debugname|gp> <count> [--keypair path] [--server url]');
    process.exit(1);
}
const count = BigInt(countStr);
if (count < 1n || count > 0x7fffffffn) {
    console.error('count must be 1..2147483647');
    process.exit(1);
}

const keypairPath = kpArg !== -1 ? process.argv[kpArg + 1] : join(import.meta.dir, '..', '.keys', 'bridge.json');
const server = serverArg !== -1 ? process.argv[serverArg + 1] : (process.env.ENGINE_WEB_URL ?? 'http://localhost:8888');

const keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keypairPath, 'utf8'))));
const conn = connection();
const reg = loadRegistry();

// Guard: burning from an unlinked wallet destroys tokens with no game credit.
const linked = await fetch(`${server}/bridge/linked/${keypair.publicKey.toBase58()}`).then(r => r.json()).catch(() => null);
if (!linked?.linked) {
    console.error(`wallet ${keypair.publicKey.toBase58()} is not linked to any game account — link it first (::linkwallet in game). Refusing to burn.`);
    process.exit(1);
}

const tx = new Transaction();
if (debugname === 'gp') {
    const gpMint = new PublicKey(reg.gp.mint!);
    const from = getAssociatedTokenAddressSync(gpMint, keypair.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const amount = count * 10n ** BigInt(GP_DECIMALS);
    tx.add(createTransferCheckedInstruction(from, gpMint, new PublicKey(reg.gp.vaultAta!), keypair.publicKey, amount, GP_DECIMALS, [], TOKEN_2022_PROGRAM_ID));
} else {
    const item = reg.items[debugname];
    if (!item?.mint) {
        console.error(`${debugname} has no mint in the registry`);
        process.exit(1);
    }
    const mint = new PublicKey(item.mint);
    const from = getAssociatedTokenAddressSync(mint, keypair.publicKey, false, TOKEN_2022_PROGRAM_ID);
    tx.add(createBurnCheckedInstruction(from, mint, keypair.publicKey, count, 0, [], TOKEN_2022_PROGRAM_ID));
}

console.log(`submitting ${debugname === 'gp' ? `${count} GP -> vault` : `burn ${count} x ${debugname}`}…`);
const sig = await sendAndConfirmTransaction(conn, tx, [keypair], { commitment: 'finalized' });
console.log(`finalized: ${sig}`);

// The RPC's parsed-transaction index can lag a beat behind our own finality
// confirmation, so a "transaction not found" is retried before giving up.
async function notify(): Promise<{ ok: boolean; status: number; body: any }> {
    const res = await fetch(`${server}/bridge/deposit/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature: sig })
    });
    return { ok: res.ok, status: res.status, body: await res.json() };
}

let result = await notify();
for (let attempt = 0; !result.ok && attempt < 5 && String(result.body?.error ?? '').includes('not found'); attempt++) {
    await new Promise(r => setTimeout(r, 4000));
    result = await notify();
}

if (result.ok) {
    console.log(`bridge accepted: ${JSON.stringify(result.body)}`);
    console.log('claim it in game at the Exchange Clerk (Varrock west bank).');
} else {
    console.error(`bridge rejected (${result.status}): ${result.body.error}`);
    console.error(`re-notify later with this signature: ${sig}`);
    process.exit(1);
}
