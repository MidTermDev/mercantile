// Loopback HTTP listener for deposit notifications. The engine web server
// proxies public POST /bridge/deposit/notify here; the CLI can also hit it
// directly on the same host. Self-authenticating: a signature either is a
// valid finalized deposit from a linked wallet or it isn't.

import { Connection } from '@solana/web3.js';
import { db, toDbDate } from './db';
import { config, makeConnection } from './config';
import { loadRegistryMaps, verifyDepositTx, COINS_OBJ_ID, type RegistryMaps } from './verifier';
import { quoteLicenseGp, verifyLicenseTx } from './license';

const SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{64,120}$/;

export class DepositListener {
    private conn: Connection;
    private registry: RegistryMaps;

    constructor() {
        this.conn = makeConnection();
        this.registry = loadRegistryMaps();
    }

    start(): void {
        Bun.serve({
            hostname: '127.0.0.1',
            port: config.daemonPort,
            fetch: async req => {
                const url = new URL(req.url);
                if (url.pathname === '/health') {
                    return Response.json({ ok: true, paused: config.paused });
                }
                if (url.pathname === '/deposit/notify' && req.method === 'POST') {
                    return this.handleNotify(req);
                }
                if (url.pathname === '/license/quote' && req.method === 'GET') {
                    try { return Response.json(await quoteLicenseGp(this.conn)); }
                    catch (e) { return Response.json({ error: String(e).slice(0, 120) }, { status: 502 }); }
                }
                if (url.pathname === '/license/notify' && req.method === 'POST') {
                    return this.handleLicense(req);
                }
                return new Response('not found', { status: 404 });
            }
        });
        console.log(`[deposit-listener] on 127.0.0.1:${config.daemonPort}`);
    }

    private async handleNotify(req: Request): Promise<Response> {
        if (config.paused) return Response.json({ error: 'bridge paused' }, { status: 503 });

        let signature: string; let wantUser: string;
        try {
            const body = await req.json();
            signature = String(body.signature ?? '');
            wantUser = String(body.username ?? '').toLowerCase().trim();
        } catch {
            return Response.json({ error: 'bad json' }, { status: 400 });
        }
        if (!SIG_RE.test(signature)) return Response.json({ error: 'bad signature format' }, { status: 400 });

        // replay short-circuit (UNIQUE(sig) is the real guard; this is just polite)
        const existing = await db.selectFrom('bridge_tx').where('sig', '=', signature).select(['id', 'state']).executeTakeFirst();
        if (existing) return Response.json({ ok: true, state: existing.state, replay: true });

        const result = await verifyDepositTx(this.conn, this.registry, signature);
        if (!result.ok) {
            // Audit row for real burns that fail policy (tokens are gone either way).
            // Rows with unknown wallets are recorded too, unclaimable, for ops review.
            console.warn(`[deposit-listener] rejected ${signature.slice(0, 12)}…: ${result.reason}`);
            return Response.json({ error: result.reason }, { status: 422 });
        }

        const { deposit } = result;
        // A wallet may link several accounts; the deposit picks which one to credit.
        const links = await db
            .selectFrom('account_wallet')
            .innerJoin('account', 'account.id', 'account_wallet.account_id')
            .where('account_wallet.address', '=', deposit.wallet)
            .select(['account.id as id', 'account.username as username'])
            .execute();
        if (!links.length) {
            console.warn(`[deposit-listener] deposit from unlinked wallet ${deposit.wallet} (${signature.slice(0, 12)}…)`);
            return Response.json({ error: 'wallet not linked to any account' }, { status: 404 });
        }
        let link: { id: number; username: string } | undefined;
        if (wantUser) {
            link = links.find(l => l.username.toLowerCase() === wantUser);
            if (!link) return Response.json({ error: `this wallet isn't linked to '${wantUser}'` }, { status: 409 });
        } else if (links.length === 1) {
            link = links[0];
        } else {
            return Response.json({ error: 'multiple accounts linked to this wallet — specify which to credit (username)' }, { status: 400 });
        }

        try {
            await db
                .insertInto('bridge_tx')
                .values({
                    direction: 'deposit',
                    account_id: link.id,
                    username: link.username.toLowerCase(),
                    wallet: deposit.wallet,
                    obj_debugname: deposit.obj_debugname,
                    obj_id: deposit.obj_id,
                    count: deposit.count,
                    state: 'verified',
                    sig: signature,
                    created_at: toDbDate(new Date())
                })
                .execute();
        } catch (err) {
            if (String(err).includes('UNIQUE')) {
                return Response.json({ ok: true, replay: true });
            }
            throw err;
        }

        console.log(`[deposit-listener] verified: ${deposit.count} x ${deposit.obj_debugname} from ${link.username} (${signature.slice(0, 12)}…)`);
        return Response.json({ ok: true, username: link.username, item: deposit.obj_debugname, count: deposit.count });
    }

    // Bot-license activation: verify a GP burn worth ~0.1 SOL from a linked wallet, then
    // set the account's bot_license_until. Idempotent via bridge_tx UNIQUE(sig).
    private async handleLicense(req: Request): Promise<Response> {
        if (config.paused) return Response.json({ error: 'bridge paused' }, { status: 503 });
        let signature: string; let wantUser: string;
        try { const b = await req.json(); signature = String(b.signature ?? ''); wantUser = String(b.username ?? '').toLowerCase().trim(); }
        catch { return Response.json({ error: 'bad json' }, { status: 400 }); }
        if (!SIG_RE.test(signature)) return Response.json({ error: 'bad signature format' }, { status: 400 });

        const existing = await db.selectFrom('bridge_tx').where('sig', '=', signature).select(['id', 'state', 'username']).executeTakeFirst();
        if (existing) return Response.json({ ok: true, state: existing.state, username: existing.username, replay: true });

        const result = await verifyLicenseTx(this.conn, signature);
        if (!result.ok) { console.warn(`[license] rejected ${signature.slice(0, 12)}…: ${result.reason}`); return Response.json({ error: result.reason }, { status: 422 }); }

        // a wallet may link several accounts; license the one named (or the sole one)
        const links = await db.selectFrom('account_wallet')
            .innerJoin('account', 'account.id', 'account_wallet.account_id')
            .where('account_wallet.address', '=', result.wallet)
            .select(['account.id as id', 'account.username as username']).execute();
        if (!links.length) return Response.json({ error: 'wallet not linked to any account — link it at /wallet first' }, { status: 404 });
        let link: { id: number; username: string } | undefined;
        if (wantUser) {
            link = links.find(l => l.username.toLowerCase() === wantUser);
            if (!link) return Response.json({ error: `this wallet isn't linked to '${wantUser}'` }, { status: 409 });
        } else if (links.length === 1) {
            link = links[0];
        } else {
            return Response.json({ error: 'multiple accounts linked to this wallet — specify which to license (username)' }, { status: 400 });
        }

        // permanent one-time activation (far-future date; DateTime supports renewals later)
        const until = new Date(Date.now() + 100 * 365 * 24 * 3600 * 1000);
        await db.updateTable('account').set({ bot_license_until: toDbDate(until) }).where('id', '=', link.id).execute();
        try {
            await db.insertInto('bridge_tx').values({
                direction: 'license', account_id: link.id, username: link.username.toLowerCase(), wallet: result.wallet,
                obj_debugname: 'license', obj_id: COINS_OBJ_ID, count: result.gpBurned, state: 'confirmed',
                sig: signature, created_at: toDbDate(new Date())
            }).execute();
        } catch (err) { if (!String(err).includes('UNIQUE')) throw err; }

        console.log(`[license] ACTIVATED ${link.username} (${result.gpBurned} GP burned, ${signature.slice(0, 12)}…)`);
        return Response.json({ ok: true, username: link.username, gpBurned: result.gpBurned, licensed: true });
    }
}
