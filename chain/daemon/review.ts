// Manual-review gate for large withdrawals.
//
// Large GP withdrawals (>= config.reviewThresholdGp) are parked in bridge_tx state
// 'review' instead of being credited on-chain. A Telegram alert (player, amount,
// recent deposits) with Approve/Reject buttons is sent to the operator; pressing
// Approve flips the row to 'approved' and the withdraw-worker credits it, Reject
// flips it to 'held' (parked — the in-game debit already happened; handle manually).
//
// No Telegram configured? Rows are still held; approve from the CLI:
//   bun daemon/approve.ts <id> [reject]
//
// Setup: create a bot with @BotFather (TG_BOT_TOKEN), message it once, and set
// TG_CHAT_ID to your chat id (e.g. from @userinfobot). Only that chat may approve.

import { db, toDbDate } from './db';
import { config } from './config';
import { handleReportCallback } from './reports';

const api = () => `https://api.telegram.org/bot${config.tgBotToken}`;

export interface ReviewRow {
    id: number;
    account_id: number;
    username: string;
    wallet: string;
    obj_debugname: string;
    count: number;
}

/** GP-only gate (the 10M threshold is a GP amount). Items are not held. */
export function needsReview(objDebugname: string, count: number): boolean {
    return config.reviewThresholdGp > 0 && objDebugname === 'gp' && count >= config.reviewThresholdGp;
}

// Plain text only — no parse_mode. MarkdownV2 is brittle (a stray '-' or '.' makes
// Telegram silently reject the whole message), which is exactly what dropped the
// first real alert. We log any non-ok response so a failure is never silent again.
async function tg(method: string, body: unknown): Promise<any> {
    if (!config.tgBotToken) return null;
    try {
        const r = await fetch(`${api()}/${method}`, {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
        });
        const j = await r.json();
        if (j && j.ok === false) console.error(`[review] telegram ${method} failed: ${j.description}`);
        return j;
    } catch (e) {
        console.error('[review] telegram error:', String(e));
        return null;
    }
}

async function recentDeposits(accountId: number): Promise<string> {
    try {
        const rows = await db
            .selectFrom('bridge_tx')
            .where('direction', '=', 'deposit')
            .where('account_id', '=', accountId)
            .select(['obj_debugname', 'count', 'state', 'created_at'])
            .orderBy('id', 'desc')
            .limit(6)
            .execute();
        if (!rows.length) return '(none on record)';
        return rows.map((r) => `• ${Number(r.count).toLocaleString()} ${r.obj_debugname} (${r.state})`).join('\n');
    } catch {
        return '(n/a)';
    }
}

/** Send the operator a review alert with Approve/Reject buttons (or log if no TG). */
export async function alertReview(row: ReviewRow): Promise<void> {
    if (!config.tgBotToken || !config.tgChatId) {
        console.warn(`[review] row ${row.id} HELD (${row.count.toLocaleString()} ${row.obj_debugname}, ${row.username}) — no Telegram configured; approve with: bun daemon/approve.ts ${row.id}`);
        return;
    }
    const deps = await recentDeposits(row.account_id);
    const text =
        `🏦 Withdrawal review  (#${row.id})\n\n` +
        `Player:   ${row.username}\n` +
        `Amount:   ${row.count.toLocaleString()} ${row.obj_debugname.toUpperCase()}\n` +
        `Wallet:   ${row.wallet}\n\n` +
        `Recent deposits:\n${deps}\n\n` +
        `Approve to credit it on-chain, or reject to hold.`;
    const res = await tg('sendMessage', {
        chat_id: config.tgChatId,
        text,
        reply_markup: { inline_keyboard: [[
            { text: '✅ Approve', callback_data: `approve:${row.id}` },
            { text: '⛔ Reject', callback_data: `reject:${row.id}` },
        ]] },
    });
    console.log(`[review] alert for row ${row.id} (${row.count} ${row.obj_debugname}, ${row.username}) → ${res?.ok ? 'sent' : 'FAILED'}`);
}

async function decide(id: number, action: 'approve' | 'reject'): Promise<boolean> {
    const res = await db
        .updateTable('bridge_tx')
        .set({ state: action === 'approve' ? 'approved' : 'held', updated_at: toDbDate(new Date()) })
        .where('id', '=', id)
        .where('state', '=', 'review')   // only a row still awaiting review can be decided
        .executeTakeFirst();
    return Number(res.numUpdatedRows) > 0;
}

/** On boot, re-send an alert for every withdrawal still awaiting review (so a restart
 *  — or a previously-failed send — never leaves a held withdrawal silently stuck). */
export async function reAlertPending(): Promise<void> {
    if (!config.tgBotToken || !config.tgChatId) return;
    try {
        const rows = await db
            .selectFrom('bridge_tx')
            .where('direction', '=', 'withdraw').where('state', '=', 'review')
            .select(['id', 'account_id', 'username', 'wallet', 'obj_debugname', 'count'])
            .orderBy('id', 'asc').execute();
        for (const r of rows) await alertReview(r as ReviewRow);
        if (rows.length) console.log(`[review] re-alerted ${rows.length} pending review(s) on boot`);
    } catch (e) {
        console.error('[review] reAlertPending failed:', String(e));
    }
}

/** Long-poll Telegram for Approve/Reject button presses. Only the configured chat is honored. */
export function startApprovalListener(): void {
    if (!config.tgBotToken) {
        console.log('[review] no TG_BOT_TOKEN — large withdrawals still held; approve via: bun daemon/approve.ts <id>');
        return;
    }
    let offset = 0;
    const loop = async () => {
        for (;;) {
            try {
                const r = await fetch(`${api()}/getUpdates?timeout=50&offset=${offset}&allowed_updates=%5B%22callback_query%22%5D`);
                const j: any = await r.json();
                if (j?.ok) {
                    for (const u of j.result) {
                        offset = u.update_id + 1;
                        const cq = u.callback_query;
                        if (!cq) continue;
                        const chat = String(cq.message?.chat?.id ?? cq.from?.id ?? '');
                        if (config.tgChatId && chat !== String(config.tgChatId)) {
                            await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'not authorized' });
                            continue;
                        }
                        const m = /^(approve|reject):(\d+)$/.exec(cq.data ?? '');
                        if (!m) { await handleReportCallback(cq); continue; }  // report-review buttons
                        const action = m[1] as 'approve' | 'reject';
                        const id = Number(m[2]);
                        const ok = await decide(id, action);
                        await tg('answerCallbackQuery', {
                            callback_query_id: cq.id,
                            text: ok ? (action === 'approve' ? 'Approved ✅ — crediting now' : 'Rejected ⛔ — held') : 'already handled',
                        });
                        if (ok && cq.message) {
                            await tg('editMessageText', {
                                chat_id: cq.message.chat.id, message_id: cq.message.message_id,
                                text: (cq.message.text ?? `Withdrawal #${id}`) + `\n\n— ${action === 'approve' ? '✅ APPROVED' : '⛔ REJECTED'} by operator`,
                            });
                        }
                        console.log(`[review] row ${id} ${action} via Telegram (applied=${ok})`);
                    }
                } else if (j && j.ok === false) {
                    console.error('[review] getUpdates error:', j.description);
                    await new Promise((r) => setTimeout(r, 5000));
                }
            } catch (e) {
                console.error('[review] listener error:', String(e));
                await new Promise((r) => setTimeout(r, 3000));
            }
        }
    };
    loop();
    console.log('[review] Telegram approval listener started');
}
