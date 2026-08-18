// Agent self-serve API keys (rs-sdk; see server/PATCHES.md).
//
//   POST /agent/register  -> { username, apiKey, server }  (rate-limited per IP)
//
// Creates a fresh game account whose password IS the issued apiKey, and records the
// issuance in data/agent-keys.jsonl (for visibility / future revocation). Agents put
// { BOT_USERNAME=username, PASSWORD=apiKey, SERVER=<host> } in bot.env and drive the
// bot through the gateway with the rs-sdk. When the gateway runs in AGENT_KEY_MODE it
// authenticates strictly (no auto-create), so only issued accounts can connect.

import fs from 'fs';
import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt-ts';
import { db, toDbDate } from '#/db/query.js';
import Environment from '#/util/Environment.js';
import World from '#/engine/World.js';

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
const MAX_PER_MIN = 5;                         // registrations per IP per minute
const buckets = new Map<string, { count: number; resetAt: number }>();
function rateLimited(ip: string): boolean {
    const now = Date.now();
    let b = buckets.get(ip);
    if (!b || b.resetAt < now) { b = { count: 0, resetAt: now + 60_000 }; buckets.set(ip, b); if (buckets.size > 10_000) buckets.clear(); }
    return ++b.count > MAX_PER_MIN;
}
function json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

const KEYLOG = 'data/agent-keys.jsonl';

export async function handleAgent(req: Request, url: URL): Promise<Response | undefined> {
    // The browser client's "N online" counter polls this.
    if (url.pathname === '/playercount' && req.method === 'GET') {
        return json(200, { count: World.getTotalPlayers() });
    }

    if (!url.pathname.startsWith('/agent/')) return undefined;

    // public live stats for the site: players online now + accounts ever registered
    if (url.pathname === '/agent/stats' && req.method === 'GET') {
        let registered = 0;
        try {
            const r = await db.selectFrom('account').select((eb) => eb.fn.countAll().as('n')).executeTakeFirst();
            registered = Number((r as { n?: number | bigint } | undefined)?.n ?? 0);
        } catch { /* best-effort */ }
        return json(200, { online: World.getTotalPlayers(), registered });
    }

    if (url.pathname === '/agent/register' && req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: { ...JSON_HEADERS, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
    }

    if (url.pathname === '/agent/register' && req.method === 'POST') {
        if (Environment.AGENT_KEYS_ENABLED === false) return json(403, { error: 'agent registration disabled' });
        const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
        if (rateLimited(ip)) return json(429, { error: 'rate limited — try again in a minute' });

        // Optional caller-chosen name. RS usernames are 1–12 chars, letters/digits/
        // spaces/underscores, case-insensitive. If given, honor it (409 if taken);
        // otherwise allocate a random one.
        const body = await req.json().catch(() => ({})) as { username?: unknown; name?: unknown };
        const requested = (typeof body.username === 'string' ? body.username : typeof body.name === 'string' ? body.name : '').trim();

        let username = '';
        if (requested) {
            if (!/^[a-zA-Z0-9_ ]{1,12}$/.test(requested)) {
                return json(400, { error: 'name must be 1–12 chars: letters, digits, spaces or underscores' });
            }
            const taken = await db.selectFrom('account').where('username', '=', requested).select(['id']).executeTakeFirst();
            if (taken) return json(409, { error: `“${requested}” is taken — pick another name` });
            username = requested;
        } else {
            for (let attempt = 0; attempt < 5; attempt++) {
                const cand = 'a' + randomBytes(5).toString('hex');   // 11 chars, <=12, alphanumeric
                const exists = await db.selectFrom('account').where('username', '=', cand).select(['id']).executeTakeFirst();
                if (!exists) { username = cand; break; }
            }
        }
        if (!username) return json(500, { error: 'could not allocate a username, retry' });

        // The apiKey doubles as the game-account password, which the RS login caps at
        // 1–20 chars — so keep it ≤20 (20 hex chars ≈ 80 bits, plenty for a bot key).
        const apiKey = randomBytes(10).toString('hex');
        try {
            await db.insertInto('account').values({
                username,
                password: bcrypt.hashSync(apiKey, 10),
                registration_ip: ip.slice(0, 45),
                registration_date: toDbDate(new Date()),
            }).executeTakeFirst();
        } catch (e) {
            console.error('[agent] register insert failed:', e);
            return json(500, { error: 'registration failed' });
        }

        try { fs.appendFileSync(KEYLOG, JSON.stringify({ username, ip, at: toDbDate(new Date()) }) + '\n'); } catch {}
        console.log(`[agent] issued key for ${username} (ip ${ip})`);
        return json(200, { username, apiKey, server: url.host });
    }

    return undefined;
}
