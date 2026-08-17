// Link a Solana wallet to a game account by signing the canonical link message
// with a local keypair. Get a code in game first: type ::linkwallet
//
// Usage: bun cli/link-wallet.ts <username> <code> [--keypair path] [--server url]
//   --server defaults to the engine web (ENGINE_WEB_URL or http://localhost:8888)

import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { Keypair } from '@solana/web3.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const positional = process.argv.slice(2).filter(a => !a.startsWith('--'));
const [username, code] = positional;
const kpArg = process.argv.indexOf('--keypair');
const serverArg = process.argv.indexOf('--server');

if (!username || !code) {
    console.error('usage: bun cli/link-wallet.ts <username> <code> [--keypair path] [--server url]');
    process.exit(1);
}

const keypairPath = kpArg !== -1 ? process.argv[kpArg + 1] : join(import.meta.dir, '..', '.keys', 'bridge.json');
const server = serverArg !== -1 ? process.argv[serverArg + 1] : (process.env.ENGINE_WEB_URL ?? 'http://localhost:8888');

const keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keypairPath, 'utf8'))));
const address = keypair.publicKey.toBase58();
const message = `rs-bridge-link|v1|${username.toLowerCase()}|${code.toUpperCase()}`;
const signature = Buffer.from(nacl.sign.detached(new TextEncoder().encode(message), keypair.secretKey)).toString('base64');

const res = await fetch(`${server}/bridge/link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: username.toLowerCase(), code: code.toUpperCase(), address, signature })
});
const body = await res.json();
if (res.ok) {
    console.log(`linked: ${body.username} <-> ${body.address}`);
} else {
    console.error(`failed (${res.status}): ${body.error}`);
    process.exit(1);
}
