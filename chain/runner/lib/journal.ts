// Append-only run journal. An *_attempt line is written BEFORE sending (with the
// planned address) and the completion line after confirmation, so a crash between
// send and confirm can be resolved on resume by checking the chain (chain is truth).

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { JOURNAL_PATH } from './common';

export type JournalStep =
    | 'gp_created'
    | 'mint_attempt'
    | 'mint_created'
    | 'pool_attempt'
    | 'pool_created';

export interface JournalLine {
    ts: string;
    step: JournalStep;
    debugname: string;
    mint?: string;
    pool?: string;
    position?: string;
    sig?: string;
}

export function appendJournal(line: Omit<JournalLine, 'ts'>): void {
    appendFileSync(JOURNAL_PATH, JSON.stringify({ ts: new Date().toISOString(), ...line }) + '\n');
}

export function readJournal(): JournalLine[] {
    if (!existsSync(JOURNAL_PATH)) return [];
    return readFileSync(JOURNAL_PATH, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map(l => JSON.parse(l));
}

/** Latest attempt per (step, debugname) without a matching completion. */
export function pendingAttempts(step: 'mint' | 'pool'): Map<string, JournalLine> {
    const pending = new Map<string, JournalLine>();
    for (const line of readJournal()) {
        if (line.step === `${step}_attempt`) pending.set(line.debugname, line);
        if (line.step === `${step}_created`) pending.delete(line.debugname);
    }
    return pending;
}
