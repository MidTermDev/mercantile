// Reusable task harness for the deterministic script library.
//
// Turnkey: `bun scripts/<task>.ts <botname>` spawns the game client (the lite runner)
// AND the controller, runs your step loop, prints live XP/hr stats, and stops cleanly on
// Ctrl+C (the client logs out → progress saves). Pass --no-client if you already have a
// client running (browser or `bun server/webclient/src/lite/runner.ts <name>`).
//
// A "task" is one function that does a single unit of work and returns 'continue' or
// 'stop'. The harness owns the loop, the connection, stats, the goal-level check, and
// graceful shutdown so each skill script stays tiny.

import { spawn, type Subprocess } from 'bun';
import { join } from 'node:path';
import { runScript } from '../../sdk/runner';
import type { BotActions } from '../../sdk/actions';
import type { BotSDK } from '../../sdk/index';

const REPO = join(import.meta.dir, '..', '..');

export interface TaskCtx {
    bot: BotActions;
    sdk: BotSDK;
    log: (msg: string) => void;
    stopping: () => boolean; // true once Ctrl+C was pressed — let long routines bail early
}

export type Step = (ctx: TaskCtx) => Promise<'continue' | 'stop' | void>;

export interface TaskOpts {
    /** Skill to track for the live stats line + goal level (e.g. 'thieving'). */
    skill?: string;
    /** Stop when this level in `skill` is reached. */
    goalLevel?: number;
    /** Seconds between status lines (default 30). */
    statusSec?: number;
    /** Auto-spawn the lite game client (default true; --no-client overrides). */
    spawnClient?: boolean;
    /** Call bot.skipTutorial() once before the loop (default true; set false for the tutorial script). */
    skipTutorial?: boolean;
    /** Label shown in logs (default = the task file name). */
    name?: string;
}

function resolveUsername(): string {
    const arg = process.argv.slice(2).find(a => !a.startsWith('-'));
    if (!arg) {
        console.error('usage: bun scripts/<task>.ts <botname> [options]');
        console.error('  create a bot first:  bun bots/create-bot.ts <botname>');
        process.exit(1);
    }
    return arg;
}

function fmt(n: number): string {
    return Math.round(n).toLocaleString();
}
function hms(ms: number): string {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
}

/** Spawn the lite game client for `username` and return the subprocess (killed on exit). */
function startClient(username: string): Subprocess {
    const proc = spawn(['bun', 'src/lite/runner.ts', username], {
        cwd: join(REPO, 'server', 'webclient'),
        stdout: 'ignore',
        stderr: 'ignore',
    });
    const kill = () => { try { proc.kill(); } catch { /* already gone */ } };
    process.on('exit', kill);
    return proc;
}

export async function runTask(step: Step, opts: TaskOpts = {}): Promise<void> {
    const username = resolveUsername();
    const label = opts.name ?? 'task';
    const useClient = opts.spawnClient !== false && !process.argv.includes('--no-client');
    const statusMs = (opts.statusSec ?? 30) * 1000;

    let client: Subprocess | undefined;
    if (useClient) {
        console.log(`[${label}] starting game client for '${username}'…`);
        client = startClient(username);
    }

    try {
        await runScript(async ({ bot, sdk }) => {
            const log = (m: string) => console.log(`[${label}] ${m}`);

            // Wait for the client to actually be in-world (up to 45s).
            log('connecting…');
            const ready = await sdk.waitForCondition(s => !!s?.player, 45_000).then(() => true).catch(() => false);
            if (!ready) {
                log('no game state — is the client logged in? check bots/' + username + '/bot.env (SERVER, PASSWORD) and that the account is licensed.');
                return;
            }
            if (opts.skipTutorial !== false) await bot.skipTutorial().catch(() => {});

            const skill = opts.skill;
            const startXp = skill ? (sdk.getSkillXp(skill) ?? 0) : 0;
            const startLvl = skill ? (sdk.getSkill(skill)?.level ?? 0) : 0;
            const t0 = Date.now();

            let stop = false;
            const onSig = () => {
                if (!stop) { stop = true; log('Ctrl+C — finishing the current action, then logging out to save…'); }
            };
            process.on('SIGINT', onSig);

            const status = () => {
                const dt = Date.now() - t0;
                if (skill) {
                    const cur = sdk.getSkill(skill);
                    const xp = (sdk.getSkillXp(skill) ?? 0) - startXp;
                    const rate = dt > 0 ? (xp / (dt / 3_600_000)) : 0;
                    log(`${skill} ${cur?.level ?? '?'} (+${cur ? cur.level - startLvl : 0} lvls) | +${fmt(xp)} xp | ${fmt(rate)} xp/hr | ${hms(dt)}`);
                } else {
                    log(`running… ${hms(dt)}`);
                }
            };

            const ctx: TaskCtx = { bot, sdk, log, stopping: () => stop };
            let lastStatus = Date.now();

            while (!stop) {
                if (opts.goalLevel && skill && (sdk.getSkill(skill)?.level ?? 0) >= opts.goalLevel) {
                    log(`reached ${skill} ${opts.goalLevel} — done.`);
                    break;
                }
                try {
                    const r = await step(ctx);
                    if (r === 'stop') { log('task requested stop.'); break; }
                } catch (e: any) {
                    log(`step error: ${String(e?.message ?? e).slice(0, 120)}`);
                    await sdk.waitForTicks(2).catch(() => {});
                }
                if (Date.now() - lastStatus >= statusMs) { status(); lastStatus = Date.now(); }
            }

            process.off('SIGINT', onSig);
            status();
            log('stopped.');
        }, { timeout: 0, disconnectAfter: true });
    } finally {
        if (client) { try { client.kill(); } catch { /* noop */ } }
    }
}
