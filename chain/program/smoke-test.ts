// End-to-end smoke test of the RSGP bridge program against a local validator.
// Gate before mainnet. Run: bun program/smoke-test.ts   (needs localnet + deploy)

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import {
    getMint, getOrCreateAssociatedTokenAccount, getAssociatedTokenAddressSync,
    getAccount, TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    ixInitialize, ixSetGpMint, ixSetPaused, ixCreateMint, ixMintInitial,
    ixWithdrawItem, ixWithdrawGp, ixDepositItem, send,
    configPda, mintAuthorityPda, metadataPda, METAPLEX_PROGRAM_ID,
} from './client';

const RPC = process.env.RPC_URL ?? 'http://127.0.0.1:8899';
const CHAIN = join(import.meta.dir, '..');
const conn = new Connection(RPC, 'confirmed');
const kp = (p: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, 'utf8'))));

const admin = kp(join(CHAIN, '.keys', 'devnet-admin.json'));
const operator = kp(join(CHAIN, '.keys', 'devnet-operator.json'));
const reg = JSON.parse(readFileSync(join(CHAIN, 'registry', 'registry.json'), 'utf8'));
const rsgpKey = (mint: string) => kp(join(CHAIN, '.keys', 'rsgp', `${mint}.json`));

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = '') => {
    console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
    cond ? pass++ : fail++;
};
const expectThrows = async (name: string, fn: () => Promise<unknown>) => {
    try { await fn(); check(name, false, 'expected failure but succeeded'); }
    catch { check(name, true, 'correctly rejected'); }
};

async function metaName(mint: PublicKey): Promise<{ name: string; symbol: string; uri: string } | null> {
    const acc = await conn.getAccountInfo(metadataPda(mint));
    if (!acc) return null;
    // Metaplex metadata: 1 key + 32 update_auth + 32 mint + (name/symbol/uri borsh strings)
    let o = 1 + 32 + 32;
    const readStr = () => { const len = acc.data.readUInt32LE(o); o += 4; const s = acc.data.slice(o, o + len).toString('utf8').replace(/\0+$/, ''); o += len; return s; };
    return { name: readStr().replace(/\0+$/, '').trim(), symbol: readStr().replace(/\0+$/, '').trim(), uri: readStr().replace(/\0+$/, '').trim() };
}

console.log(`RPC ${RPC}\nadmin ${admin.publicKey.toBase58()}\noperator ${operator.publicKey.toBase58()}\n`);

// STEP 1: initialize
await send(conn, [ixInitialize(admin.publicKey, operator.publicKey)], [admin]);
check('1 initialize config', !!(await conn.getAccountInfo(configPda())));

// STEP 2: create GP mint (vanity), decimals 6
const gpMint = rsgpKey(reg.gp.mint);
await send(conn, [ixCreateMint(admin.publicKey, gpMint.publicKey, 6, reg.gp.name, reg.gp.symbol, reg.gp.uri)], [admin, gpMint]);
{
    const info = await getMint(conn, gpMint.publicKey);
    check('2 GP mint address ends RSGP', gpMint.publicKey.toBase58().endsWith('RSGP'), gpMint.publicKey.toBase58());
    check('2 GP mint authority == PDA', info.mintAuthority?.equals(mintAuthorityPda()) ?? false);
    check('2 GP decimals == 6', info.decimals === 6);
    const m = await metaName(gpMint.publicKey);
    check('2 GP Metaplex metadata', !!m && m.name === reg.gp.name && m.symbol === reg.gp.symbol, m ? `${m.name}/${m.symbol}` : 'none');
}

// STEP 3: set_gp_mint
await send(conn, [ixSetGpMint(admin.publicKey, gpMint.publicKey)], [admin]);
check('3 set_gp_mint', true);

// STEP 4: vault + treasury ATAs, mint_initial split
const vaultAta = await getOrCreateAssociatedTokenAccount(conn, admin, gpMint.publicKey, mintAuthorityPda(), true);
const treasuryAta = await getOrCreateAssociatedTokenAccount(conn, admin, gpMint.publicKey, admin.publicKey);
const GP = (n: bigint) => n * 1_000_000n;
await send(conn, [ixMintInitial(admin.publicKey, gpMint.publicKey, vaultAta.address, GP(1_000_000_000n))], [admin]);
await send(conn, [ixMintInitial(admin.publicKey, gpMint.publicKey, treasuryAta.address, GP(9_000_000_000n))], [admin]);
{
    const v = await getAccount(conn, vaultAta.address);
    const t = await getAccount(conn, treasuryAta.address);
    check('4 vault = 1B GP', v.amount === GP(1_000_000_000n), v.amount.toString());
    check('4 treasury = 9B GP', t.amount === GP(9_000_000_000n), t.amount.toString());
}

// STEP 5: create lobster item mint (vanity), decimals 0
const lob = reg.items.lobster;
const lobMint = rsgpKey(lob.mint);
await send(conn, [ixCreateMint(admin.publicKey, lobMint.publicKey, 0, lob.name, lob.symbol, lob.uri)], [admin, lobMint]);
{
    const info = await getMint(conn, lobMint.publicKey);
    check('5 lobster mint ends RSGP', lobMint.publicKey.toBase58().endsWith('RSGP'), lobMint.publicKey.toBase58());
    check('5 lobster authority == PDA', info.mintAuthority?.equals(mintAuthorityPda()) ?? false);
    check('5 lobster decimals == 0', info.decimals === 0);
    const m = await metaName(lobMint.publicKey);
    check('5 lobster Metaplex metadata', !!m && m.name === lob.name, m ? `${m.name}/${m.symbol}` : 'none');
}

// STEP 6: withdraw round trip + pause
const user = Keypair.generate();
await conn.confirmTransaction(await conn.requestAirdrop(user.publicKey, 1_000_000_000));
const userLobAta = await getOrCreateAssociatedTokenAccount(conn, admin, lobMint.publicKey, user.publicKey);
await send(conn, [ixWithdrawItem(operator.publicKey, lobMint.publicKey, userLobAta.address, 5n)], [operator]);
check('6 withdraw_item minted 5', (await getAccount(conn, userLobAta.address)).amount === 5n);
await send(conn, [ixSetPaused(admin.publicKey, true)], [admin]);
await expectThrows('6 withdraw blocked while paused', () =>
    send(conn, [ixWithdrawItem(operator.publicKey, lobMint.publicKey, userLobAta.address, 1n)], [operator]));
await send(conn, [ixSetPaused(admin.publicKey, false)], [admin]);

// STEP 7: non-operator cannot withdraw
const attacker = Keypair.generate();
await conn.confirmTransaction(await conn.requestAirdrop(attacker.publicKey, 1_000_000_000));
await expectThrows('7 non-operator withdraw rejected', () =>
    send(conn, [ixWithdrawItem(attacker.publicKey, lobMint.publicKey, userLobAta.address, 1n)], [attacker]));

// STEP 8: deposit (burn) round trip
const supplyBefore = (await getMint(conn, lobMint.publicKey)).supply;
await send(conn, [ixDepositItem(user.publicKey, lobMint.publicKey, userLobAta.address, 2n)], [user]);
{
    const bal = (await getAccount(conn, userLobAta.address)).amount;
    const supplyAfter = (await getMint(conn, lobMint.publicKey)).supply;
    check('8 deposit_item burned 2 (bal 5->3)', bal === 3n, bal.toString());
    check('8 supply decreased by 2', supplyBefore - supplyAfter === 2n, `${supplyBefore}->${supplyAfter}`);
}

// STEP 9: withdraw_gp from vault, then inflation mint on shortfall
const userGpAta = await getOrCreateAssociatedTokenAccount(conn, admin, gpMint.publicKey, user.publicKey);
await send(conn, [ixWithdrawGp(operator.publicKey, gpMint.publicKey, vaultAta.address, userGpAta.address, GP(500n))], [operator]);
check('9 withdraw_gp 500 from vault', (await getAccount(conn, userGpAta.address)).amount === GP(500n));
{
    // drain vault: request more than remaining vault balance → shortfall minted
    const vaultBal = (await getAccount(conn, vaultAta.address)).amount;
    const req = vaultBal + GP(1000n); // 1000 GP beyond vault
    const gpSupplyBefore = (await getMint(conn, gpMint.publicKey)).supply;
    const userGpBefore = (await getAccount(conn, userGpAta.address)).amount;
    await send(conn, [ixWithdrawGp(operator.publicKey, gpMint.publicKey, vaultAta.address, userGpAta.address, req)], [operator]);
    const gpSupplyAfter = (await getMint(conn, gpMint.publicKey)).supply;
    const userGpAfter = (await getAccount(conn, userGpAta.address)).amount;
    const vaultAfter = (await getAccount(conn, vaultAta.address)).amount;
    check('9 vault drained to 0', vaultAfter === 0n, vaultAfter.toString());
    check('9 user received full request', userGpAfter - userGpBefore === req, (userGpAfter - userGpBefore).toString());
    check('9 inflation minted shortfall (1000 GP)', gpSupplyAfter - gpSupplyBefore === GP(1000n), `${gpSupplyAfter - gpSupplyBefore}`);
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
