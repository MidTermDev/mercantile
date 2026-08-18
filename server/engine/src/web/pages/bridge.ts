// rs-sdk bridge web surface (see server/PATCHES.md and chain/README.md):
//
//   GET  /bridge/link                  - wallet-link page (Phantom signMessage)
//   POST /bridge/link                  - {username, code, address, signature} -> account_wallet upsert
//   GET  /bridge/linked/:address       - {linked: boolean} (no username leak)
//   GET  /bridge/pending/:address      - {pending:[{obj_debugname,count,state}]} for that wallet (no username)
//   GET  /bridge/token/:debugname.json - Token-2022 offchain metadata from the registry
//   POST /bridge/deposit/notify        - proxied to the bridge daemon on loopback
//   GET  /bridge/status/:username      - pending/failed rows; requires BRIDGE_ADMIN_TOKEN
//
// The link POST is self-authenticating: a valid in-game code (10-min TTL, issued
// to that username) plus an ed25519 signature over the canonical message by the
// wallet being linked. An IP rate limit backstops brute force.

import fs from 'fs';

import nacl from 'tweetnacl';
import bs58 from 'bs58';

import { db, toDbDate } from '#/db/query.js';
import { BridgeService } from '#/engine/bridge/BridgeService.js';
import Environment from '#/util/Environment.js';

const JSON_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
};

const MAX_BODY_BYTES = 4 * 1024;
const RATE_LIMIT_PER_MIN = 10;

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
    const now = Date.now();
    let bucket = rateBuckets.get(ip);
    if (!bucket || bucket.resetAt < now) {
        bucket = { count: 0, resetAt: now + 60_000 };
        rateBuckets.set(ip, bucket);
        if (rateBuckets.size > 10_000) rateBuckets.clear(); // crude memory backstop
    }
    return ++bucket.count > RATE_LIMIT_PER_MIN;
}

function json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

const LINK_MESSAGE_VERSION = 'v1';

export function linkMessage(username: string, code: string): string {
    return `rs-bridge-link|${LINK_MESSAGE_VERSION}|${username.toLowerCase()}|${code.toUpperCase()}`;
}

// Unlinking needs only proof of the wallet (it's the caller's own wallet being removed) — a
// signature over this canonical message by the linked address.
export function unlinkMessage(address: string): string {
    return `rs-bridge-unlink|${LINK_MESSAGE_VERSION}|${address}`;
}

// Decode a base64- or base58-encoded 64-byte ed25519 signature.
function decodeSig(signature: string): Uint8Array | null {
    try {
        let sig = /^[A-Za-z0-9+/=]+$/.test(signature) && signature.includes('=')
            ? Uint8Array.from(Buffer.from(signature, 'base64'))
            : bs58.decode(signature);
        if (sig.length !== 64) sig = Uint8Array.from(Buffer.from(signature, 'base64'));
        return sig.length === 64 ? sig : null;
    } catch {
        return null;
    }
}

let registryCache: { items: Record<string, { name: string; desc?: string; symbol: string }>; gp: { name: string; symbol: string } } | null = null;

function loadRegistryJson() {
    if (registryCache) return registryCache;
    const path = Environment.BRIDGE_REGISTRY_PATH;
    if (!path || !fs.existsSync(path)) return null;
    try {
        registryCache = JSON.parse(fs.readFileSync(path, 'utf8'));
    } catch {
        return null;
    }
    return registryCache;
}

const LINK_PAGE = `<!DOCTYPE html>
<html><head><title>Link Solana Wallet</title>
<style>body{font-family:monospace;max-width:640px;margin:40px auto;background:#111;color:#ddd;padding:0 16px}
input,button{font-family:monospace;font-size:14px;padding:8px;margin:4px 0;width:100%;box-sizing:border-box}
button{background:#2a6;border:0;color:#fff;cursor:pointer}#out{white-space:pre-wrap;color:#8f8}</style></head>
<body>
<h2>Link your Solana wallet</h2>
<p>1. In game, type <b>::linkwallet</b> to get a code.<br>2. Enter your username + code, connect Phantom, sign.</p>
<input id="username" placeholder="username">
<input id="code" placeholder="link code (e.g. 7Q3KMPXZ)">
<button id="go">Connect wallet &amp; sign</button>
<div id="out"></div>
<script>
document.getElementById('go').onclick = async () => {
  const out = document.getElementById('out');
  try {
    const username = document.getElementById('username').value.trim().toLowerCase();
    const code = document.getElementById('code').value.trim().toUpperCase();
    if (!username || !code) throw new Error('enter username and code');
    const provider = window.phantom?.solana ?? window.solana;
    if (!provider) throw new Error('no Solana wallet extension found');
    const conn = await provider.connect();
    const address = conn.publicKey.toString();
    const message = 'rs-bridge-link|v1|' + username + '|' + code;
    const signed = await provider.signMessage(new TextEncoder().encode(message), 'utf8');
    const signature = btoa(String.fromCharCode(...signed.signature));
    const res = await fetch('/bridge/link', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ username, code, address, signature })
    });
    const body = await res.json();
    out.textContent = res.ok ? 'Linked! ' + JSON.stringify(body) : 'Failed: ' + JSON.stringify(body);
  } catch (err) { out.textContent = 'Error: ' + err.message; }
};
</script></body></html>`;

export async function handleBridge(req: Request, url: URL): Promise<Response | undefined> {
    if (!url.pathname.startsWith('/bridge/')) return undefined;
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';

    // GET /bridge/link — static page
    if (url.pathname === '/bridge/link' && req.method === 'GET') {
        return new Response(LINK_PAGE, { headers: { 'Content-Type': 'text/html' } });
    }

    // POST /bridge/link
    if (url.pathname === '/bridge/link' && req.method === 'POST') {
        if (rateLimited(ip)) return json(429, { error: 'rate limited' });

        let body: { username?: string; code?: string; address?: string; signature?: string };
        try {
            const raw = await req.text();
            if (raw.length > MAX_BODY_BYTES) return json(413, { error: 'too large' });
            body = JSON.parse(raw);
        } catch {
            return json(400, { error: 'bad json' });
        }
        const { username, code, address, signature } = body;
        if (!username || !code || !address || !signature) return json(400, { error: 'missing fields' });
        if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return json(400, { error: 'bad address' });

        // signature: base64 or base58 encoded 64-byte ed25519 sig
        let sigBytes: Uint8Array;
        try {
            sigBytes = /^[A-Za-z0-9+/=]+$/.test(signature) && signature.includes('=')
                ? Uint8Array.from(Buffer.from(signature, 'base64'))
                : bs58.decode(signature);
            if (sigBytes.length !== 64) sigBytes = Uint8Array.from(Buffer.from(signature, 'base64'));
        } catch {
            return json(400, { error: 'bad signature encoding' });
        }
        if (sigBytes.length !== 64) return json(400, { error: 'bad signature length' });

        const message = new TextEncoder().encode(linkMessage(username, code));
        let pubkey: Uint8Array;
        try {
            pubkey = bs58.decode(address);
        } catch {
            return json(400, { error: 'bad address' });
        }
        if (!nacl.sign.detached.verify(message, sigBytes, pubkey)) {
            return json(401, { error: 'signature verification failed' });
        }

        // consumeLinkCode also enforces the ::linkwallet <address> pre-binding
        if (!BridgeService.consumeLinkCode(username, code, address)) {
            return json(401, { error: 'invalid or expired code' });
        }

        const account = await db.selectFrom('account').where('username', '=', username.toLowerCase()).select(['id']).executeTakeFirst();
        if (!account) return json(404, { error: 'unknown account' });

        const held = await db.selectFrom('account_wallet').where('address', '=', address).select(['account_id']).executeTakeFirst();
        if (held && held.account_id !== account.id) {
            return json(409, { error: 'address already linked to another account' });
        }

        await db.deleteFrom('account_wallet').where('account_id', '=', account.id).execute();
        await db
            .insertInto('account_wallet')
            .values({ account_id: account.id, address, linked_at: toDbDate(new Date()), link_ip: ip })
            .execute();

        BridgeService.onWalletLinked(username, account.id, address);
        return json(200, { linked: true, username: username.toLowerCase(), address });
    }

    // POST /bridge/unlink — {address, signature}. Removes the wallet↔account link. Self-authenticating:
    // an ed25519 signature over unlinkMessage(address) by the wallet being unlinked. Idempotent.
    if (url.pathname === '/bridge/unlink' && req.method === 'POST') {
        if (rateLimited(ip)) return json(429, { error: 'rate limited' });
        let body: { address?: string; signature?: string };
        try {
            const raw = await req.text();
            if (raw.length > MAX_BODY_BYTES) return json(413, { error: 'too large' });
            body = JSON.parse(raw);
        } catch {
            return json(400, { error: 'bad json' });
        }
        const { address, signature } = body;
        if (!address || !signature) return json(400, { error: 'missing fields' });
        if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return json(400, { error: 'bad address' });
        const sigBytes = decodeSig(signature);
        if (!sigBytes) return json(400, { error: 'bad signature' });
        let pubkey: Uint8Array;
        try { pubkey = bs58.decode(address); } catch { return json(400, { error: 'bad address' }); }
        const message = new TextEncoder().encode(unlinkMessage(address));
        if (!nacl.sign.detached.verify(message, sigBytes, pubkey)) {
            return json(401, { error: 'signature verification failed' });
        }
        const row = await db.selectFrom('account_wallet').where('address', '=', address).select(['account_id']).executeTakeFirst();
        if (row) {
            await db.deleteFrom('account_wallet').where('address', '=', address).execute();
            const acct = await db.selectFrom('account').where('id', '=', row.account_id).select(['username']).executeTakeFirst();
            if (acct) BridgeService.onWalletUnlinked(acct.username, address);
        }
        return json(200, { unlinked: true, address });
    }

    // GET /bridge/linked/:address
    if (url.pathname.startsWith('/bridge/linked/') && req.method === 'GET') {
        const address = url.pathname.slice('/bridge/linked/'.length);
        if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return json(400, { error: 'bad address' });
        const row = await db.selectFrom('account_wallet').where('address', '=', address).select(['account_id']).executeTakeFirst();
        return json(200, { linked: !!row });
    }

    // GET /bridge/pending/:address — wallet-scoped, public. Non-terminal withdrawals
    // for this wallet so the site can show status and, for 'awaiting_account' rows,
    // prompt the user to create (and self-fund) the token account we mint into. No
    // username is returned (privacy) — only the wallet's own item/count/state.
    if (url.pathname.startsWith('/bridge/pending/') && req.method === 'GET') {
        const address = url.pathname.slice('/bridge/pending/'.length);
        if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return json(400, { error: 'bad address' });
        const rows = await db
            .selectFrom('bridge_tx')
            .where('wallet', '=', address)
            .where('direction', '=', 'withdraw')
            .where('state', 'in', ['debited', 'submitted', 'awaiting_account', 'claimable', 'review', 'approved'])
            .select(['obj_debugname', 'count', 'state'])
            .orderBy('id', 'asc')
            .limit(100)
            .execute();
        return json(200, { pending: rows });
    }

    // GET /bridge/token/:debugname.json
    if (url.pathname.startsWith('/bridge/token/') && req.method === 'GET') {
        const name = url.pathname.slice('/bridge/token/'.length).replace(/\.json$/, '');
        const reg = loadRegistryJson();
        if (!reg) return json(404, { error: 'registry not loaded' });
        if (name === 'gp') {
            return json(200, { name: reg.gp.name, symbol: reg.gp.symbol, description: 'The currency of Gielinor, bridged on-chain. 1 GP = 1 in-game coin.' });
        }
        const item = reg.items[name];
        if (!item) return json(404, { error: 'unknown item' });
        return json(200, { name: item.name, symbol: item.symbol, description: item.desc || `${item.name} — a tradeable item, redeemable in-game via the Exchange Clerk.` });
    }

    // POST /bridge/deposit/notify — proxy to the daemon (single public surface)
    if (url.pathname === '/bridge/deposit/notify' && req.method === 'POST') {
        if (rateLimited(ip)) return json(429, { error: 'rate limited' });
        try {
            const raw = await req.text();
            if (raw.length > MAX_BODY_BYTES) return json(413, { error: 'too large' });
            const res = await fetch(`http://127.0.0.1:${Environment.BRIDGE_DAEMON_PORT}/deposit/notify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: raw,
                signal: AbortSignal.timeout(30_000)
            });
            return new Response(await res.text(), { status: res.status, headers: JSON_HEADERS });
        } catch {
            return json(502, { error: 'bridge daemon unavailable' });
        }
    }

    // GET /bridge/status/:username — admin only
    if (url.pathname.startsWith('/bridge/status/') && req.method === 'GET') {
        const token = Environment.BRIDGE_ADMIN_TOKEN;
        if (!token || req.headers.get('authorization') !== `Bearer ${token}`) {
            return json(401, { error: 'unauthorized' });
        }
        const username = url.pathname.slice('/bridge/status/'.length).toLowerCase();
        const rows = await db
            .selectFrom('bridge_tx')
            .where('username', '=', username)
            .select(['id', 'direction', 'obj_debugname', 'count', 'state', 'sig', 'error', 'created_at', 'updated_at'])
            .orderBy('id', 'desc')
            .limit(50)
            .execute();
        return json(200, { username, rows });
    }

    return undefined;
}
