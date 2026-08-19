// Admin actions for the report-review pipeline (rs-sdk; see server/PATCHES.md).
//
//   POST /admin/ban   { username, minutes, token }  -> ban (kick + banned_until)
//   POST /admin/unban { username, token }           -> clear the ban
//
// The bridge daemon (which drives Telegram report review) calls these on loopback.
// Gated by BRIDGE_ADMIN_TOKEN and not routed publicly (nginx doesn't proxy /admin/,
// and :8888 isn't exposed) — token check is defence-in-depth.

import World from '#/engine/World.js';
import Environment from '#/util/Environment.js';
import { toSafeName } from '#/util/JString.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
function json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export async function handleAdmin(req: Request, url: URL): Promise<Response | undefined> {
    if (!url.pathname.startsWith('/admin/')) return undefined;

    const isBan = url.pathname === '/admin/ban';
    const isUnban = url.pathname === '/admin/unban';
    if ((!isBan && !isUnban) || req.method !== 'POST') return undefined;

    // fail closed: no configured token = no admin actions
    if (!Environment.BRIDGE_ADMIN_TOKEN) return json(503, { error: 'admin token not configured' });

    let body: { username?: string; minutes?: number; token?: string };
    try {
        body = await req.json();
    } catch {
        return json(400, { error: 'bad json' });
    }
    if (String(body.token ?? '') !== Environment.BRIDGE_ADMIN_TOKEN) return json(401, { error: 'unauthorized' });

    const username = toSafeName(String(body.username ?? ''));
    if (!username) return json(400, { error: 'missing username' });

    if (isUnban) {
        // until in the past => not banned; kicks nothing, just clears the flag on next login check
        World.notifyPlayerBan('report-review', username, Date.now() - 1000);
        console.log(`[admin] unban ${username}`);
        return json(200, { ok: true, username, banned: false });
    }

    // ban
    const minutes = Math.max(0, Math.floor(Number(body.minutes ?? 0)));
    const until = Date.now() + minutes * 60 * 1000;
    World.notifyPlayerBan('report-review', username, until);
    console.log(`[admin] ban ${username} for ${minutes} min (until ${new Date(until).toISOString()})`);
    return json(200, { ok: true, username, minutes, until });
}
