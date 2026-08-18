// One-shot Telegram setup for withdrawal-review alerts.
//
// Prereqs (you do these; the token never passes through chat):
//   1. Put your bot token in chain/.env  ->  TG_BOT_TOKEN=123456:ABC...
//   2. In Telegram, open your bot and send it any message (e.g. "hi").
//      (Bots can't DM you until you've messaged them first.)
// Then run:  cd chain && bun daemon/tg-setup.ts   [preferred_username]
//
// It reads the token from chain/.env, finds your chat via getUpdates, writes
// TG_CHAT_ID back into chain/.env, and sends you a confirmation DM. The token is
// never printed.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { config, CHAIN_ROOT } from './config';

const preferred = (process.argv[2] ?? 'midtermdev').replace(/^@/, '').toLowerCase();
const token = config.tgBotToken;
if (!token) {
    console.error('TG_BOT_TOKEN is not set. Add it to chain/.env first:\n  TG_BOT_TOKEN=123456:ABC...');
    process.exit(1);
}
const api = (m: string) => `https://api.telegram.org/bot${token}/${m}`;

const r = await fetch(api('getUpdates?timeout=2'));
const j: any = await r.json();
if (!j?.ok) { console.error('getUpdates failed:', j?.description ?? 'unknown'); process.exit(1); }

// collect private chats seen (from messages or callbacks)
const chats = new Map<string, { id: number; username: string; name: string }>();
for (const u of j.result as any[]) {
    const msg = u.message ?? u.edited_message ?? u.callback_query?.message;
    const chat = msg?.chat ?? u.callback_query?.from;
    if (chat && (chat.type === 'private' || chat.first_name || u.callback_query)) {
        chats.set(String(chat.id), {
            id: chat.id,
            username: (chat.username ?? '').toLowerCase(),
            name: [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.title || '',
        });
    }
}

if (chats.size === 0) {
    console.error('No chats found. Open your bot in Telegram and send it a message, then run this again.');
    process.exit(1);
}

const list = [...chats.values()];
const picked = list.find((c) => c.username === preferred) ?? list[list.length - 1];
console.log(`found ${list.length} chat(s):`);
for (const c of list) console.log(`  - ${c.name}${c.username ? ' (@' + c.username + ')' : ''}  id=${c.id}${c === picked ? '   <- using' : ''}`);

// write TG_CHAT_ID into chain/.env (replace or append)
const envPath = join(CHAIN_ROOT, '.env');
let env = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
env = env.split('\n').filter((l) => !l.startsWith('TG_CHAT_ID=')).join('\n').replace(/\n+$/, '');
env = (env ? env + '\n' : '') + `TG_CHAT_ID=${picked.id}\n`;
writeFileSync(envPath, env);
console.log(`\nwrote TG_CHAT_ID=${picked.id} to chain/.env`);

// send a confirmation DM
const send = await fetch(api('sendMessage'), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: picked.id, text: '✅ Mercantile withdrawal-review alerts are set up. Large withdrawals (≥ 10,000,000 GP) will be sent here with Approve / Reject buttons.' }),
});
const sj: any = await send.json();
console.log(sj?.ok ? 'sent you a confirmation DM ✓' : `could not DM you: ${sj?.description ?? 'unknown'}`);
console.log('\nNow restart the daemon:  bash /tmp/restart-daemon.sh');
process.exit(0);
