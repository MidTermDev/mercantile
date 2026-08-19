// M2 — abuse-report review pipeline.
//
// In-game "Report Abuse" writes rows to the `report` table (offender, reason, reporter
// session, location). This module sweeps new reports, sends the operator a Telegram alert
// per offender with Ban 7d / Ban perm / Dismiss buttons, and applies the chosen action:
// a ban goes through the engine's loopback /admin/ban (kick + banned_until), falling back
// to a direct DB write if the engine is unreachable. Report rows are marked so nothing is
// re-alerted or double-actioned. Reports are advisory — a human presses the button.
//
// The Telegram button presses are dispatched from the single getUpdates poller in
// review.ts (one consumer for the whole bot); handleReportCallback() is called there.

import { db, toDbDate } from './db';
import { config } from './config';

const REASONS = [
    'Offensive language', 'Item scamming', 'Password scamming', 'Bug abuse',
    'Staff impersonation', 'Account sharing', 'MACROING (botting)', 'Multiple logging in',
    'Encouraging rule-breaking', 'Misusing customer support', 'Advertising a website', 'Real-world trading',
];
const reasonName = (r: number) => REASONS[r] ?? `reason ${r}`;

// Self-contained TG helper (plain text — MarkdownV2 is brittle). Mirrors review.ts.
async function tg(method: string, body: unknown): Promise<any> {
    if (!config.tgBotToken) return null;
    try {
        const r = await fetch(`https://api.telegram.org/bot${config.tgBotToken}/${method}`, {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
        });
        const j = await r.json();
        if (j && j.ok === false) console.error(`[reports] telegram ${method} failed: ${j.description}`);
        return j;
    } catch (e) {
        console.error('[reports] telegram error:', String(e));
        return null;
    }
}

function decodeCoord(coord: number): string {
    const level = (coord >> 28) & 0x3;
    const x = (coord >> 14) & 0x3fff;
    const z = coord & 0x3fff;
    return `${x}, ${z}${level ? ` (plane ${level})` : ''}`;
}

async function reporterName(sessionUuid: string): Promise<string> {
    try {
        const row = await db
            .selectFrom('session')
            .innerJoin('account', 'account.id', 'session.account_id')
            .where('session.uuid', '=', sessionUuid)
            .select(['account.username'])
            .executeTakeFirst();
        return row?.username ?? '(unknown)';
    } catch {
        return '(unknown)';
    }
}

/** Sweep `report` rows still 'pending', alert the operator once per offender, mark them 'alerted'. */
export async function alertNewReports(): Promise<void> {
    let rows;
    try {
        rows = await db
            .selectFrom('report')
            .where('status', '=', 'pending')
            .select(['id', 'session_uuid', 'coord', 'offender', 'reason', 'timestamp'])
            .orderBy('id', 'asc')
            .execute();
    } catch (e) {
        console.error('[reports] sweep failed:', String(e));
        return;
    }
    if (!rows.length) return;

    // group by offender
    const byOffender = new Map<string, typeof rows>();
    for (const r of rows) {
        const arr = byOffender.get(r.offender) ?? [];
        arr.push(r);
        byOffender.set(r.offender, arr);
    }

    for (const [offender, group] of byOffender) {
        const ids = group.map((r) => r.id);
        // reason breakdown
        const counts = new Map<number, number>();
        for (const r of group) counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
        const reasons = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([r, c]) => `${reasonName(r)} ×${c}`).join(', ');
        const reporters = [...new Set(await Promise.all(group.slice(0, 5).map((r) => reporterName(r.session_uuid))))].join(', ');
        const last = group[group.length - 1];
        const macro = group.some((r) => r.reason === 6);

        const text =
            `${macro ? '🤖' : '🚩'} Abuse report — ${offender}\n\n` +
            `Reports:   ${group.length} (${reasons})\n` +
            `Reported by: ${reporters}\n` +
            `Last seen: ${decodeCoord(last.coord)}\n\n` +
            `Ban to kick + block login (human and bot), or dismiss.`;

        const res = await tg('sendMessage', {
            chat_id: config.tgChatId,
            text,
            reply_markup: { inline_keyboard: [[
                { text: '⛔ Ban 7d', callback_data: `rban7:${offender}` },
                { text: '🔨 Ban perm', callback_data: `rbanperm:${offender}` },
                { text: '✖ Dismiss', callback_data: `rdismiss:${offender}` },
            ]] },
        });

        // mark alerted (only rows we just described) so they aren't re-sent
        try {
            await db.updateTable('report').set({ status: 'alerted' }).where('id', 'in', ids).execute();
        } catch (e) { console.error('[reports] mark alerted failed:', String(e)); }
        console.log(`[reports] alerted ${group.length} report(s) vs ${offender} → ${res?.ok ? 'sent' : 'FAILED (marked alerted anyway)'}`);
    }
}

/** Ban an offender via the engine (kick + banned_until); fall back to a direct DB write. */
async function banOffender(offender: string, minutes: number): Promise<{ ok: boolean; via: string }> {
    if (config.adminToken) {
        try {
            const r = await fetch(`${config.engineWebUrl}/admin/ban`, {
                method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ username: offender, minutes, token: config.adminToken }),
            });
            if (r.ok) return { ok: true, via: 'engine' };
            console.error(`[reports] engine /admin/ban ${r.status}: ${(await r.text()).slice(0, 120)}`);
        } catch (e) {
            console.error('[reports] engine /admin/ban unreachable:', String(e));
        }
    }
    // fallback: write banned_until directly (applies on next login; no instant kick)
    try {
        const until = toDbDate(new Date(Date.now() + minutes * 60 * 1000));
        const res = await db.updateTable('account').set({ banned_until: until }).where('username', '=', offender.toLowerCase()).executeTakeFirst();
        return { ok: Number(res.numUpdatedRows) > 0, via: 'db' };
    } catch (e) {
        console.error('[reports] fallback ban write failed:', String(e));
        return { ok: false, via: 'none' };
    }
}

async function markOffenderReports(offender: string, status: 'banned' | 'dismissed'): Promise<void> {
    try {
        await db.updateTable('report')
            .set({ status, reviewed_at: toDbDate(new Date()) })
            .where('offender', '=', offender)
            .where('status', 'in', ['pending', 'alerted'])
            .execute();
    } catch (e) { console.error('[reports] mark offender reports failed:', String(e)); }
}

/** Dispatch a report-review button press from review.ts's poller. Returns true if handled. */
export async function handleReportCallback(cq: any): Promise<boolean> {
    const m = /^(rban7|rbanperm|rdismiss):(.+)$/.exec(cq.data ?? '');
    if (!m) return false;
    const action = m[1];
    const offender = m[2];

    let note: string;
    if (action === 'rdismiss') {
        await markOffenderReports(offender, 'dismissed');
        note = 'Dismissed ✖';
    } else {
        const minutes = action === 'rbanperm' ? 100 * 365 * 24 * 60 : 7 * 24 * 60;
        const r = await banOffender(offender, minutes);
        if (r.ok) {
            await markOffenderReports(offender, 'banned');
            note = `Banned ${action === 'rbanperm' ? 'permanently' : '7 days'} 🔨 (${r.via})`;
        } else {
            note = 'Ban FAILED — check daemon logs';
        }
    }

    await tg('answerCallbackQuery', { callback_query_id: cq.id, text: note });
    if (cq.message) {
        await tg('editMessageText', {
            chat_id: cq.message.chat.id, message_id: cq.message.message_id,
            text: (cq.message.text ?? `Report vs ${offender}`) + `\n\n— ${note} by operator`,
        });
    }
    console.log(`[reports] ${offender}: ${note}`);
    return true;
}

/** Periodic sweep for new reports. */
export function startReportPolling(): void {
    if (config.reportPollMs <= 0) { console.log('[reports] polling disabled (REPORT_POLL_MS=0)'); return; }
    if (!config.tgBotToken || !config.tgChatId) {
        console.log('[reports] no Telegram configured — reports still recorded; review them in the report table');
        return;
    }
    const loop = async () => {
        try { await alertNewReports(); } catch (e) { console.error('[reports] poll error:', String(e)); }
        setTimeout(loop, config.reportPollMs);
    };
    setTimeout(loop, 3000);
    console.log(`[reports] review polling every ${config.reportPollMs}ms`);
}
