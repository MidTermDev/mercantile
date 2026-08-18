// Focused localnet validation of the revised behavior:
//   - GP withdraw = MINT (supply grows), GP deposit = BURN (supply shrinks) — no vault
//   - item mints are 1 decimal (fungible), withdraw/deposit round-trip in base units
// Reuses the already-initialized config on the running localnet.
//
//   RPC_URL=http://127.0.0.1:8899 bun program/test-v2.ts

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getMint, getAccount, getOrCreateAssociatedTokenAccount, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    configPda, mintAuthorityPda, send,
    ixCreateMint, ixMintInitial, ixWithdrawItem, ixWithdrawGp, ixDepositItem, ixDepositGp,
} from './client';

const CHAIN = join(import.meta.dir, '..');
const kp = (p: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(CHAIN, p), 'utf8'))));
const conn = new Connection(process.env.RPC_URL ?? 'http://127.0.0.1:8899', 'confirmed');
const admin = kp('.keys/devnet-admin.json');
const operator = kp('.keys/devnet-operator.json');
const reg = JSON.parse(readFileSync(join(CHAIN, 'registry', 'registry.json'), 'utf8'));

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); c ? pass++ : fail++; };
const rsgp = (mint: string) => kp(join('.keys', 'rsgp', `${mint}.json`));

// GP mint on localnet (created by the earlier run; config.gp_mint points at it)
const gpMint = new PublicKey(reg.gp.mint);
const user = Keypair.generate();
await conn.requestAirdrop(user.publicKey, 2_000_000_000).then(s => conn.confirmTransaction(s));

// --- GP: withdraw mints, deposit burns ---
const userGp = await getOrCreateAssociatedTokenAccount(conn, admin, gpMint, user.publicKey);
const gpSupply0 = (await getMint(conn, gpMint)).supply;
await send(conn, [ixWithdrawGp(operator.publicKey, gpMint, userGp.address, 1000n)], [operator]);
const gpSupply1 = (await getMint(conn, gpMint)).supply;
const userGpBal1 = (await getAccount(conn, userGp.address)).amount;
ok(userGpBal1 === 1000n, `GP withdraw credited user 1000 (got ${userGpBal1})`);
ok(gpSupply1 === gpSupply0 + 1000n, `GP withdraw MINTED (supply ${gpSupply0} -> ${gpSupply1})`);

await send(conn, [ixDepositGp(user.publicKey, gpMint, userGp.address, 400n)], [user]);
const gpSupply2 = (await getMint(conn, gpMint)).supply;
const userGpBal2 = (await getAccount(conn, userGp.address)).amount;
ok(userGpBal2 === 600n, `GP deposit debited user to 600 (got ${userGpBal2})`);
ok(gpSupply2 === gpSupply1 - 400n, `GP deposit BURNED (supply ${gpSupply1} -> ${gpSupply2})`);

// --- Item: 1 decimal, withdraw/deposit ---
// Use a mainnet-burned vanity key (unused on localnet) for a fresh 1-dec test mint.
const burned = readFileSync(join(CHAIN, 'registry', 'burned-mints.txt'), 'utf8').split(/\s+/).filter(Boolean);
const itemKp = rsgp(burned[0]);
const itemMint = itemKp.publicKey;
await send(conn, [ixCreateMint(admin.publicKey, itemMint, 1, 'Test Item', 'TESTRSGP', 'https://ipfs.io/ipfs/x')], [admin, itemKp]);
const dec = (await getMint(conn, itemMint)).decimals;
ok(dec === 1, `item mint has 1 decimal (got ${dec})`);

const userItem = await getOrCreateAssociatedTokenAccount(conn, admin, itemMint, user.publicKey);
// withdraw 5 whole items = 50 base units (1 decimal)
await send(conn, [ixWithdrawItem(operator.publicKey, itemMint, userItem.address, 50n)], [operator]);
const itemBal1 = (await getAccount(conn, userItem.address)).amount;
ok(itemBal1 === 50n, `item withdraw minted 50 base (5.0 items) (got ${itemBal1})`);
// deposit 2 whole items = 20 base units
await send(conn, [ixDepositItem(user.publicKey, itemMint, userItem.address, 20n)], [user]);
const itemBal2 = (await getAccount(conn, userItem.address)).amount;
ok(itemBal2 === 30n, `item deposit burned 20 base (2.0 items) -> 30 (got ${itemBal2})`);

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
