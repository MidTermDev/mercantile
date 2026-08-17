// Own Kysely connection to the engine's sqlite. Same pragmas as the engine
// (server/engine/src/db/query.ts): WAL + busy_timeout so multiple processes
// coexist. The daemon only ever touches bridge_tx and account_wallet, with
// short guarded single-row transactions.

import { Kysely } from 'kysely';
import { BunSqliteDialect } from '../../server/engine/src/db/dialect/BunSqliteDialect';
import { Database } from 'bun:sqlite';
import type { DB } from '../../server/engine/src/db/types';
import { config } from './config';

const database = new Database(config.dbPath, { create: false, strict: false });
database.exec('PRAGMA journal_mode = WAL;');
database.exec('PRAGMA synchronous = NORMAL;');
database.exec('PRAGMA busy_timeout = 10000;');

export const db = new Kysely<DB>({
    dialect: new BunSqliteDialect({ database })
});

// matches server/engine/src/db/query.ts toDbDate
export function toDbDate(date: Date): string {
    return date.toISOString().slice(0, 19).replace('T', ' ');
}
