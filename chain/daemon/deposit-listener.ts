// Loopback HTTP listener for deposit notifications. The engine web server
// proxies public POST /bridge/deposit/notify here; the CLI can also hit it
// directly on the same host. Self-authenticating: a signature either is a
// valid finalized deposit from a linked wallet or it isn't.

import { Connection } from '@solana/web3.js';
import { db, toDbDate } from './db';
import { config, makeConnection } from './config';
import { loadRegistryMaps, verifyDepositTx, type RegistryMaps } from './verifier';

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
                return new Response('not found', { status: 404 });
            }
        });
        console.log(`[deposit-listener] on 127.0.0.1:${config.daemonPort}`);
    }

    private async handleNotify(req: Request): Promise<Response> {
        if (config.paused) return Response.json({ error: 'bridge paused' }, { status: 503 });

        let signature: string;
        try {
            const body = await req.json();
            signature = String(body.signature ?? '');
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
        const link = await db
            .selectFrom('account_wallet')
            .innerJoin('account', 'account.id', 'account_wallet.account_id')
            .where('account_wallet.address', '=', deposit.wallet)
            .select(['account.id', 'account.username'])
            .executeTakeFirst();
        if (!link) {
            console.warn(`[deposit-listener] deposit from unlinked wallet ${deposit.wallet} (${signature.slice(0, 12)}…)`);
            return Response.json({ error: 'wallet not linked to any account' }, { status: 404 });
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
}
