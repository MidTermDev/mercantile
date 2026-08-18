// Permanently drop the freeze authority on every mint (GP + all items). We never
// freeze holders' accounts; this removes the ability entirely. Mint authority is
// left intact (the bridge needs it). Idempotent: skips mints whose freeze authority
// is already null. Batched + journaled.
//
//   RPC_URL=<mainnet> bun runner/revoke-freeze.ts [--only <name>] [--limit N] [--dry]

import { Keypair, PublicKey, Connection, Transaction } from '@solana/web3.js';
import { getMint, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { ixRevokeFreeze } from '../program/client';
import { pacedSendAndConfirm } from './lib/pace';

const CHAIN = join(import.meta.dir, '..');
const reg = JSON.parse(readFileSync(join(CHAIN, 'registry', 'registry.json'), 'utf8'));
const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(CHAIN, '.keys', 'mainnet-admin.json'), 'utf8'))));
const conn = new Connection(process.env.RPC_URL!, 'confirmed');
const JOURNAL = join(CHAIN, 'runner', 'revoke-freeze.jsonl');
const argv = process.argv.slice(2);
const flag = (n: string) => { const i = argv.indexOf(n); return i !== -1 ? argv[i + 1] : undefined; };
const ONLY = flag('--only'); const LIMIT = flag('--limit') ? parseInt(flag('--limit')!) : Infinity;
const DRY = argv.includes('--dry');
const BATCH = 8;

const mints: { name: string; mint: string }[] = [];
if (reg.gp?.mint) mints.push({ name: 'gp', mint: reg.gp.mint });
for (const [dn, it] of Object.entries(reg.items) as [string, any][]) if (it.mint) mints.push({ name: dn, mint: it.mint });

let list = ONLY ? mints.filter((m) => m.name === ONLY) : mints;
list = list.slice(0, LIMIT);

async function hasFreeze(mint: string): Promise<boolean> {
    try { return (await getMint(conn, new PublicKey(mint), 'confirmed', TOKEN_PROGRAM_ID)).freezeAuthority !== null; }
    catch { return false; }
}

console.log(`checking ${list.length} mint(s) for a freeze authority…`);
const pending: { name: string; mint: string }[] = [];
let skipped = 0;
for (const m of list) { if (await hasFreeze(m.mint)) pending.push(m); else skipped++; }
console.log(`to revoke: ${pending.length}  already-null: ${skipped}`);
if (DRY) { console.log('(dry-run)'); process.exit(0); }

let revoked = 0, failed = 0;
for (let i = 0; i < pending.length; i += BATCH) {
    const chunk = pending.slice(i, i + BATCH);
    const tx = new Transaction();
    for (const m of chunk) tx.add(ixRevokeFreeze(admin.publicKey, new PublicKey(m.mint)));
    try {
        const sig = await pacedSendAndConfirm(conn, tx, [admin]);
        for (const m of chunk) appendFileSync(JOURNAL, JSON.stringify({ name: m.name, mint: m.mint, sig }) + '\n');
        revoked += chunk.length;
        if (revoked % 80 === 0) console.log(`… ${revoked}/${pending.length} revoked`);
    } catch (e: any) { failed += chunk.length; console.warn(`batch @${i} failed: ${String(e.message ?? e).slice(0, 90)}`); }
}
console.log(`done: revoked=${revoked} skipped=${skipped} failed=${failed}`);
