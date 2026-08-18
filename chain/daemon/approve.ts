// Manually approve (or reject) a large withdrawal held for review — a CLI fallback
// for when Telegram isn't set up, or as a backup to the buttons.
//
//   bun daemon/approve.ts <bridge_tx_id>            # approve -> credits on-chain
//   bun daemon/approve.ts <bridge_tx_id> reject     # reject  -> held (no credit)
//   bun daemon/approve.ts                           # list rows awaiting review

import { db, toDbDate } from './db';

const id = Number(process.argv[2]);
const reject = process.argv[3] === 'reject';

if (!id) {
    const rows = await db.selectFrom('bridge_tx')
        .where('direction', '=', 'withdraw').where('state', '=', 'review')
        .select(['id', 'username', 'obj_debugname', 'count', 'wallet']).orderBy('id', 'asc').execute();
    if (!rows.length) console.log('no withdrawals awaiting review.');
    else for (const r of rows) console.log(`#${r.id}  ${Number(r.count).toLocaleString()} ${r.obj_debugname}  ${r.username}  ${r.wallet}`);
    process.exit(0);
}

const res = await db.updateTable('bridge_tx')
    .set({ state: reject ? 'held' : 'approved', updated_at: toDbDate(new Date()) })
    .where('id', '=', id).where('state', '=', 'review')
    .executeTakeFirst();

console.log(Number(res.numUpdatedRows) > 0
    ? `row ${id} -> ${reject ? 'held (rejected)' : 'approved (will credit on-chain)'}`
    : `row ${id} is not awaiting review (already handled, or wrong id)`);
process.exit(0);
