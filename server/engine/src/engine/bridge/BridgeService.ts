// rs-sdk bridge: moves items/GP between the game world and their on-chain SPL
// tokens. This service is the game-side half — it owns the bridge_tx state
// machine's engine transitions; the chain-side daemon (chain/daemon) owns the
// rest. See chain/README.md and server/PATCHES.md.
//
// Correctness model (exactly-once across the game/chain boundary):
// - Two scope=perm varps (bridge_debit_ack / bridge_credit_ack) hold the highest
//   completed bridge_tx id per player, per direction. Varps and inventory persist
//   atomically in the same .sav write, so a crash rolls both back together.
// - A transition that releases chain-side action (requested->debited) or is
//   terminal (claiming->credited) commits only AFTER a synchronous player save
//   is confirmed written (player_save_sync -> player_save_ack). Until then a
//   crash safely rolls the whole operation back.
// - Recovery reads varps only when they provably reflect disk: after a process
//   restart or a re-login, loaded varps ARE the persisted state. While the
//   original session is alive, the in-flight entry tracks progress instead.
// - Per player: at most one in-flight debit and one in-flight credit, processed
//   in ascending bridge_tx id, keeping the watermark varps monotonic.

import fs from 'fs';

import { db, toDbDate } from '#/db/query.js';
import ObjType from '#/cache/config/ObjType.js';
import VarPlayerType from '#/cache/config/VarPlayerType.js';
import ScriptProvider from '#/engine/script/ScriptProvider.js';
import Player from '#/engine/entity/Player.js';
import Environment from '#/util/Environment.js';
import { printError, printInfo } from '#/util/Logger.js';

const STACK_LIMIT = 0x7fffffff;
// GP withdrawals >= this are held by the daemon for a manual (Telegram) review before
// crediting on-chain. Keep in sync with the daemon's REVIEW_THRESHOLD_GP; used here only
// to tell the player their withdrawal is flagged.
const REVIEW_THRESHOLD_GP = parseInt(process.env.REVIEW_THRESHOLD_GP ?? '10000000', 10);
const LINK_CODE_TTL_MS = 10 * 60 * 1000;
const FLUSH_INTERVAL_MS = 500;
const RECOVERY_EVERY_N_FLUSHES = 20;
const SAVE_ACK_TIMEOUT_MS = 10_000;
const SAVE_RETRIES = 5;

export const enum BridgeWithdrawResult {
    OK = 0,
    NO_WALLET = 1,
    NOT_BRIDGEABLE = 2,
    IN_FLIGHT = 3,
    BAD_COUNT = 4,
    CLOSED = 5
}

interface RegistryEntry {
    debugname: string;
    objId: number;
    certObjId: number | null;
    stackable: boolean;
}

interface WalletLink {
    accountId: number;
    address: string | null; // null = account exists, no wallet linked
}

interface InFlight {
    id: number; // bridge_tx id; -1 until the insert lands
    session: string; // player session uuid the queue script was enqueued into
    phase: 'queued' | 'saving';
    objId: number;
    count: number;
}

type Command =
    | { kind: 'withdraw'; usernameLower: string; username: string; session: string; debugname: string; objId: number; count: number }
    | { kind: 'debit_ack'; usernameLower: string; username: string; id: number; ok: boolean }
    | { kind: 'claim'; usernameLower: string; username: string; session: string; id: number }
    | { kind: 'credit_ack'; usernameLower: string; username: string; id: number; ok: boolean };

interface DepositRow {
    id: number;
    account_id: number;
    obj_id: number;
    count: number;
}

// World is typed structurally to avoid a circular import at module load.
type WorldLike = {
    getPlayerByUsername(username: string): Player | undefined | null;
    requestPlayerSave(username: string, requestId: number): boolean;
    playerLoop: { all(): IterableIterator<Player> };
};

class BridgeServiceImpl {
    private world: WorldLike | null = null;
    private timer: ReturnType<typeof setInterval> | null = null;
    private flushCount = 0;
    private flushing = false;

    registryLoaded = false;
    private registryByObj = new Map<number, RegistryEntry>();
    private certToBase = new Map<number, number>();
    private coinsId = -1;
    private varpDebitAck = -1;
    private varpCreditAck = -1;

    private walletCache = new Map<string, WalletLink>(); // usernameLower ->
    private linkCodes = new Map<string, { code: string; expires: number; boundAddress?: string }>();
    private pendingDeposits = new Map<number, DepositRow[]>(); // accountId -> verified rows, ascending id
    private inFlightDebit = new Map<string, InFlight>();
    private inFlightCredit = new Map<string, InFlight>();
    private commandQueue: Command[] = [];

    private saveWaiters = new Map<number, (ok: boolean) => void>();
    private nextSaveRequestId = 1;

    start(world: WorldLike): void {
        this.world = world;
        this.loadRegistry();
        this.varpDebitAck = VarPlayerType.getId('bridge_debit_ack');
        this.varpCreditAck = VarPlayerType.getId('bridge_credit_ack');
        this.coinsId = ObjType.getId('coins');
        if (this.varpDebitAck === -1 || this.varpCreditAck === -1) {
            printError('[bridge] watermark varps missing from pack — bridge disabled');
            this.registryLoaded = false;
        }
        if (this.timer) clearInterval(this.timer);
        this.timer = setInterval(() => {
            this.flush().catch(err => printError(`[bridge] flush failed: ${err}`));
        }, FLUSH_INTERVAL_MS);
        if (this.registryLoaded) {
            printInfo(`[bridge] exchange open: ${this.registryByObj.size} bridgeable items`);
        } else {
            printInfo('[bridge] exchange closed (no registry)');
        }
    }

    private loadRegistry(): void {
        const path = Environment.BRIDGE_REGISTRY_PATH;
        this.registryByObj.clear();
        this.certToBase.clear();
        this.registryLoaded = false;
        if (!path || !fs.existsSync(path)) return;
        try {
            const reg = JSON.parse(fs.readFileSync(path, 'utf8'));
            for (const [debugname, item] of Object.entries<{ objId: number; certObjId: number | null; mint: string | null; stackable: boolean }>(reg.items)) {
                if (!item.mint) continue; // only items that actually exist on-chain
                this.registryByObj.set(item.objId, { debugname, objId: item.objId, certObjId: item.certObjId, stackable: item.stackable });
                if (item.certObjId !== null) this.certToBase.set(item.certObjId, item.objId);
            }
            this.registryLoaded = this.registryByObj.size > 0;
        } catch (err) {
            printError(`[bridge] failed to parse registry at ${path}: ${err}`);
        }
    }

    // ── sync API for script op handlers (no DB, no awaits) ──────────────────

    /** Normalizes a cert id to its base id; passes base/coins ids through. */
    normalizeObj(objId: number): number {
        return this.certToBase.get(objId) ?? objId;
    }

    isBridgeable(objId: number): boolean {
        const base = this.normalizeObj(objId);
        return base === this.coinsId || this.registryByObj.has(base);
    }

    isWalletLinked(player: Player): boolean {
        return !!this.walletCache.get(player.username.toLowerCase())?.address;
    }

    pendingCount(player: Player): number {
        const link = this.walletCache.get(player.username.toLowerCase());
        if (!link) return 0;
        return this.pendingDeposits.get(link.accountId)?.length ?? 0;
    }

    issueLinkCode(player: Player, boundAddress?: string): string {
        const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
        let code = '';
        for (let i = 0; i < 8; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
        this.linkCodes.set(player.username.toLowerCase(), { code, expires: Date.now() + LINK_CODE_TTL_MS, boundAddress });
        return code;
    }

    /** Web-side: validate a link code for a username. Consumes the code on success. */
    consumeLinkCode(username: string, code: string, address: string): boolean {
        const key = username.toLowerCase();
        const entry = this.linkCodes.get(key);
        if (!entry || entry.expires < Date.now()) return false;
        if (entry.code !== code.toUpperCase()) return false;
        if (entry.boundAddress && entry.boundAddress !== address) return false;
        this.linkCodes.delete(key);
        return true;
    }

    /** Web-side: called after account_wallet upsert commits. */
    onWalletLinked(username: string, accountId: number, address: string): void {
        this.walletCache.set(username.toLowerCase(), { accountId, address });
        const player = this.world?.getPlayerByUsername(username);
        player?.messageGame(`Wallet linked: ${address.slice(0, 4)}...${address.slice(-4)}`);
    }

    /** Web-side: called after account_wallet row is deleted. */
    onWalletUnlinked(username: string, address: string): void {
        this.walletCache.delete(username.toLowerCase());
        const player = this.world?.getPlayerByUsername(username);
        player?.messageGame(`Wallet unlinked: ${address.slice(0, 4)}...${address.slice(-4)}`);
    }

    requestWithdraw(player: Player, objId: number, count: number): BridgeWithdrawResult {
        if (!this.registryLoaded) return BridgeWithdrawResult.CLOSED;
        const usernameLower = player.username.toLowerCase();
        const base = this.normalizeObj(objId);
        const entry = base === this.coinsId ? { debugname: 'gp', objId: base, certObjId: null, stackable: true } : this.registryByObj.get(base);
        if (!entry) return BridgeWithdrawResult.NOT_BRIDGEABLE;
        if (count < 1 || count > STACK_LIMIT) return BridgeWithdrawResult.BAD_COUNT;
        const link = this.walletCache.get(usernameLower);
        if (!link?.address) return BridgeWithdrawResult.NO_WALLET;
        if (this.inFlightDebit.has(usernameLower)) return BridgeWithdrawResult.IN_FLIGHT;

        this.inFlightDebit.set(usernameLower, { id: -1, session: player.session, phase: 'queued', objId: base, count });
        this.commandQueue.push({ kind: 'withdraw', usernameLower, username: player.username, session: player.session, debugname: entry.debugname, objId: base, count });
        // Large GP withdrawals are held for manual review by the daemon — tell the player up front.
        if (base === this.coinsId && REVIEW_THRESHOLD_GP > 0 && count >= REVIEW_THRESHOLD_GP) {
            player.messageGame(`This withdrawal of ${count.toLocaleString()} coins is large, so it has been flagged for a quick manual review before it's released on-chain. You'll be able to claim it once approved.`);
        }
        return BridgeWithdrawResult.OK;
    }

    /** Returns total claimable rows (including the one now being claimed); 0 = none. */
    beginClaim(player: Player): number {
        if (!this.registryLoaded) return 0;
        const usernameLower = player.username.toLowerCase();
        const link = this.walletCache.get(usernameLower);
        if (!link?.address) return 0;
        const rows = this.pendingDeposits.get(link.accountId);
        if (!rows?.length) return 0;
        if (this.inFlightCredit.has(usernameLower)) return rows.length;

        const row = rows[0]; // lowest id — keeps the credit watermark monotonic
        this.inFlightCredit.set(usernameLower, { id: row.id, session: player.session, phase: 'queued', objId: row.obj_id, count: row.count });
        this.commandQueue.push({ kind: 'claim', usernameLower, username: player.username, session: player.session, id: row.id });
        return rows.length;
    }

    ackDebit(player: Player, id: number, ok: boolean): void {
        const usernameLower = player.username.toLowerCase();
        const inFlight = this.inFlightDebit.get(usernameLower);
        // only honor acks for the id we actually have in flight for this player
        if (!inFlight || inFlight.id !== id || inFlight.session !== player.session) return;
        this.commandQueue.push({ kind: 'debit_ack', usernameLower, username: player.username, id, ok });
    }

    ackCredit(player: Player, id: number, ok: boolean): void {
        const usernameLower = player.username.toLowerCase();
        const inFlight = this.inFlightCredit.get(usernameLower);
        if (!inFlight || inFlight.id !== id || inFlight.session !== player.session) return;
        this.commandQueue.push({ kind: 'credit_ack', usernameLower, username: player.username, id, ok });
    }

    onSaveAck(requestId: number, success: boolean): void {
        const waiter = this.saveWaiters.get(requestId);
        if (waiter) {
            this.saveWaiters.delete(requestId);
            waiter(success);
        }
    }

    // ── async flush loop ─────────────────────────────────────────────────────

    private async flush(): Promise<void> {
        if (this.flushing || !this.registryLoaded || !this.world) return;
        this.flushing = true;
        try {
            await this.primeWalletCache();
            await this.refreshPendingDeposits();
            await this.processCommands();
            if (++this.flushCount % RECOVERY_EVERY_N_FLUSHES === 1) {
                await this.recoveryScan();
            }
        } finally {
            this.flushing = false;
        }
    }

    private onlinePlayers(): Player[] {
        return [...this.world!.playerLoop.all()];
    }

    private async primeWalletCache(): Promise<void> {
        const missing = this.onlinePlayers()
            .map(p => p.username.toLowerCase())
            .filter(u => !this.walletCache.has(u));
        if (!missing.length) return;
        const rows = await db
            .selectFrom('account')
            .leftJoin('account_wallet', 'account_wallet.account_id', 'account.id')
            .where('account.username', 'in', missing)
            .select(['account.username', 'account.id', 'account_wallet.address'])
            .execute();
        for (const row of rows) {
            this.walletCache.set(row.username.toLowerCase(), { accountId: row.id, address: row.address ?? null });
        }
    }

    private async refreshPendingDeposits(): Promise<void> {
        const rows = await db
            .selectFrom('bridge_tx')
            .where('direction', '=', 'deposit')
            .where('state', '=', 'verified')
            .select(['id', 'account_id', 'obj_id', 'count'])
            .orderBy('id', 'asc')
            .execute();
        this.pendingDeposits.clear();
        for (const row of rows) {
            let list = this.pendingDeposits.get(row.account_id);
            if (!list) this.pendingDeposits.set(row.account_id, (list = []));
            list.push(row);
        }
    }

    private async processCommands(): Promise<void> {
        const commands = this.commandQueue;
        this.commandQueue = [];
        for (const cmd of commands) {
            try {
                if (cmd.kind === 'withdraw') await this.processWithdraw(cmd);
                else if (cmd.kind === 'claim') await this.processClaim(cmd);
                else if (cmd.kind === 'debit_ack') await this.processDebitAck(cmd);
                else if (cmd.kind === 'credit_ack') await this.processCreditAck(cmd);
            } catch (err) {
                printError(`[bridge] command ${cmd.kind} failed: ${err}`);
                // conservative: clear the in-flight slot so the player isn't wedged;
                // the row (if inserted) resolves through the recovery scan.
                if (cmd.kind === 'withdraw' || cmd.kind === 'debit_ack') this.inFlightDebit.delete(cmd.usernameLower);
                else this.inFlightCredit.delete(cmd.usernameLower);
            }
        }
    }

    private enqueuePlayerScript(username: string, session: string, scriptName: string, args: (number | string)[]): boolean {
        const player = this.world!.getPlayerByUsername(username);
        if (!player || player.session !== session) return false;
        const script = ScriptProvider.getByName(`[queue,${scriptName}]`);
        if (!script) {
            printError(`[bridge] missing content script [queue,${scriptName}]`);
            return false;
        }
        player.enqueueScript(script, undefined, 0, args);
        return true;
    }

    private async processWithdraw(cmd: Command & { kind: 'withdraw' }): Promise<void> {
        const link = this.walletCache.get(cmd.usernameLower);
        if (!link?.address) {
            this.inFlightDebit.delete(cmd.usernameLower);
            return;
        }
        const inserted = await db
            .insertInto('bridge_tx')
            .values({
                direction: 'withdraw',
                account_id: link.accountId,
                username: cmd.usernameLower,
                wallet: link.address,
                obj_debugname: cmd.debugname,
                obj_id: cmd.objId,
                count: cmd.count,
                state: 'requested'
            })
            .returning('id')
            .executeTakeFirstOrThrow();
        const inFlight = this.inFlightDebit.get(cmd.usernameLower);
        if (!inFlight) return; // cleared by an error path; recovery resolves the row
        inFlight.id = inserted.id;
        if (!this.enqueuePlayerScript(cmd.username, cmd.session, 'bridge_debit', [inserted.id, cmd.objId, cmd.count])) {
            // player logged out between request and insert: no debit happened
            await db.updateTable('bridge_tx').set({ state: 'cancelled', updated_at: toDbDate(new Date()) }).where('id', '=', inserted.id).where('state', '=', 'requested').execute();
            this.inFlightDebit.delete(cmd.usernameLower);
        }
    }

    private async processClaim(cmd: Command & { kind: 'claim' }): Promise<void> {
        const updated = await db
            .updateTable('bridge_tx')
            .set({ state: 'claiming', updated_at: toDbDate(new Date()) })
            .where('id', '=', cmd.id)
            .where('state', '=', 'verified')
            .executeTakeFirst();
        if (Number(updated.numUpdatedRows) === 0) {
            this.inFlightCredit.delete(cmd.usernameLower);
            return;
        }
        const inFlight = this.inFlightCredit.get(cmd.usernameLower)!;
        // deliver noted form for non-stackables that have one (single inventory slot)
        const entry = this.registryByObj.get(inFlight.objId);
        const grantObj = entry && !entry.stackable && entry.certObjId !== null ? entry.certObjId : inFlight.objId;
        if (!this.enqueuePlayerScript(cmd.username, cmd.session, 'bridge_credit', [cmd.id, grantObj, inFlight.count])) {
            await db.updateTable('bridge_tx').set({ state: 'verified', updated_at: toDbDate(new Date()) }).where('id', '=', cmd.id).where('state', '=', 'claiming').execute();
            this.inFlightCredit.delete(cmd.usernameLower);
        }
    }

    private async processDebitAck(cmd: Command & { kind: 'debit_ack' }): Promise<void> {
        if (!cmd.ok) {
            await db.updateTable('bridge_tx').set({ state: 'cancelled', error: 'debit failed (missing items)', updated_at: toDbDate(new Date()) }).where('id', '=', cmd.id).where('state', '=', 'requested').execute();
            this.inFlightDebit.delete(cmd.usernameLower);
            return;
        }
        const inFlight = this.inFlightDebit.get(cmd.usernameLower);
        if (!inFlight || inFlight.id !== cmd.id) return;
        inFlight.phase = 'saving';
        // Durability rule: the daemon may only act once the debit is on disk.
        const saved = await this.savePlayerSync(cmd.username);
        if (saved) {
            await db.updateTable('bridge_tx').set({ state: 'debited', updated_at: toDbDate(new Date()) }).where('id', '=', cmd.id).where('state', '=', 'requested').execute();
            this.inFlightDebit.delete(cmd.usernameLower);
        }
        // not saved: stay in 'saving'; a later flush retries via recoverInFlightSaves,
        // or (post-logout/crash) the recovery scan resolves from disk-loaded varps.
    }

    private async processCreditAck(cmd: Command & { kind: 'credit_ack' }): Promise<void> {
        if (!cmd.ok) {
            await db.updateTable('bridge_tx').set({ state: 'verified', updated_at: toDbDate(new Date()) }).where('id', '=', cmd.id).where('state', '=', 'claiming').execute();
            this.inFlightCredit.delete(cmd.usernameLower);
            return;
        }
        const inFlight = this.inFlightCredit.get(cmd.usernameLower);
        if (!inFlight || inFlight.id !== cmd.id) return;
        inFlight.phase = 'saving';
        const saved = await this.savePlayerSync(cmd.username);
        if (saved) {
            const row = await db
                .updateTable('bridge_tx')
                .set({ state: 'credited', updated_at: toDbDate(new Date()) })
                .where('id', '=', cmd.id)
                .where('state', '=', 'claiming')
                .executeTakeFirst();
            if (Number(row.numUpdatedRows) > 0) {
                // drop from the local cache immediately so pendingCount is fresh
                for (const [accountId, rows] of this.pendingDeposits) {
                    const idx = rows.findIndex(r => r.id === cmd.id);
                    if (idx !== -1) {
                        rows.splice(idx, 1);
                        if (!rows.length) this.pendingDeposits.delete(accountId);
                        break;
                    }
                }
            }
            this.inFlightCredit.delete(cmd.usernameLower);
        }
    }

    private savePlayerSync(username: string): Promise<boolean> {
        return new Promise(resolve => {
            const attempt = (remaining: number) => {
                const requestId = this.nextSaveRequestId++;
                const timer = setTimeout(() => {
                    this.saveWaiters.delete(requestId);
                    if (remaining > 0) attempt(remaining - 1);
                    else resolve(false);
                }, SAVE_ACK_TIMEOUT_MS);
                this.saveWaiters.set(requestId, ok => {
                    clearTimeout(timer);
                    if (ok) resolve(true);
                    else if (remaining > 0) attempt(remaining - 1);
                    else resolve(false);
                });
                if (!this.world!.requestPlayerSave(username, requestId)) {
                    // player offline — resolve later through recovery
                    clearTimeout(timer);
                    this.saveWaiters.delete(requestId);
                    resolve(false);
                }
            };
            attempt(SAVE_RETRIES);
        });
    }

    // ── crash / relog recovery ───────────────────────────────────────────────
    //
    // Varps are only trusted when they provably reflect disk: the in-flight map
    // distinguishes "this process enqueued the script into this session" (wait)
    // from "the session that ran the script is gone" (the player's current varps
    // were loaded from disk at login, so they ARE the persisted outcome).

    private async recoveryScan(): Promise<void> {
        const rows = await db
            .selectFrom('bridge_tx')
            .where('state', 'in', ['requested', 'claiming'])
            .select(['id', 'username', 'state', 'direction'])
            .orderBy('id', 'asc')
            .execute();
        for (const row of rows) {
            const usernameLower = row.username.toLowerCase();
            const player = this.world!.getPlayerByUsername(usernameLower);
            if (!player) continue; // offline: resolve on next login

            if (row.state === 'requested') {
                const inFlight = this.inFlightDebit.get(usernameLower);
                if (inFlight && inFlight.id === row.id && inFlight.session === player.session) {
                    if (inFlight.phase === 'saving') {
                        // save never confirmed (thread hiccup) — retry now
                        this.commandQueue.push({ kind: 'debit_ack', usernameLower, username: player.username, id: row.id, ok: true });
                    }
                    continue; // same session still working on it
                }
                // session that owned the queue script is gone: current varps came from disk.
                // SECURITY: match the watermark EXACTLY, not `>=`. %bridge_debit_ack is a single
                // running max set to $id atomically with the inv_del in one .sav — so `== id` proves
                // THIS row's coins were removed. A `>=` test could be satisfied by a *later* withdraw
                // that bumped the watermark past a crash-orphaned lower-id row (whose coins were never
                // removed), marking that orphan 'debited' and minting on-chain tokens for nothing.
                const watermark = player.getVar(this.varpDebitAck) as number;
                if (watermark === row.id) {
                    await db.updateTable('bridge_tx').set({ state: 'debited', updated_at: toDbDate(new Date()) }).where('id', '=', row.id).where('state', '=', 'requested').execute();
                } else {
                    await db.updateTable('bridge_tx').set({ state: 'cancelled', error: 'recovered: debit never persisted', updated_at: toDbDate(new Date()) }).where('id', '=', row.id).where('state', '=', 'requested').execute();
                }
                this.inFlightDebit.delete(usernameLower);
            } else if (row.state === 'claiming') {
                const inFlight = this.inFlightCredit.get(usernameLower);
                if (inFlight && inFlight.id === row.id && inFlight.session === player.session) {
                    if (inFlight.phase === 'saving') {
                        this.commandQueue.push({ kind: 'credit_ack', usernameLower, username: player.username, id: row.id, ok: true });
                    }
                    continue;
                }
                // SECURITY: exact match (see debit side). `>=` here would mark a crash-orphaned lower-id
                // claim 'credited' after a later claim bumped the watermark — the player never received
                // those items but the deposit is consumed (player loss). `== id` reverts it to 'verified'
                // so it stays re-claimable.
                const watermark = player.getVar(this.varpCreditAck) as number;
                if (watermark === row.id) {
                    await db.updateTable('bridge_tx').set({ state: 'credited', updated_at: toDbDate(new Date()) }).where('id', '=', row.id).where('state', '=', 'claiming').execute();
                } else {
                    await db.updateTable('bridge_tx').set({ state: 'verified', updated_at: toDbDate(new Date()) }).where('id', '=', row.id).where('state', '=', 'claiming').execute();
                }
                this.inFlightCredit.delete(usernameLower);
            }
        }
    }
}

export const BridgeService = new BridgeServiceImpl();
