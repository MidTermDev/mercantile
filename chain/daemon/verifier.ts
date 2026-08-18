// Deposit verification: a notified signature is accepted only if the finalized
// transaction contains exactly one recognized deposit instruction —
//   - BurnChecked of a registry item mint (0 decimals), or
//   - TransferChecked of GP into the redemption vault ATA
// — authorized by a wallet with an account link. Amounts: items 1..2^31-1;
// GP must be whole (amount % 10^6 == 0). The bridge_tx UNIQUE(sig) makes a
// replayed notify a no-op forever.

import { Connection, ParsedInstruction } from '@solana/web3.js';
import { readFileSync } from 'node:fs';
import { config } from './config';

const GP_DECIMALS = 6;
const ITEM_DECIMALS = 1;
const STACK_LIMIT = 0x7fffffff;
// authentic, stable id from server/content/pack/obj.pack
export const COINS_OBJ_ID = 995;

// GP sink: a 1% deflationary tax on GP crossing the bridge in EITHER direction (GP-only, to fight
// in-game inflation). The taxed GP is destroyed — not minted on withdraw, not credited on deposit.
// Items are never taxed. Rounded down, so amounts < 100 GP are effectively untaxed.
export const GP_SINK_BPS = 100; // 1.00%
export function gpAfterSink(gp: number): number { return gp - Math.floor((gp * GP_SINK_BPS) / 10000); }

export interface RegistryMaps {
    gpMint: string;
    vaultAta: string;
    itemsByMint: Map<string, { debugname: string; objId: number }>;
    itemsByDebugname: Map<string, { mint: string; objId: number }>;
}

export function loadRegistryMaps(): RegistryMaps {
    const reg = JSON.parse(readFileSync(config.registryPath, 'utf8'));
    if (!reg.gp.mint || !reg.gp.vaultAta) throw new Error('registry missing gp mint/vault — run create-gp');
    const itemsByMint = new Map<string, { debugname: string; objId: number }>();
    const itemsByDebugname = new Map<string, { mint: string; objId: number }>();
    for (const [debugname, item] of Object.entries<{ mint: string | null; objId: number }>(reg.items)) {
        if (!item.mint) continue;
        itemsByMint.set(item.mint, { debugname, objId: item.objId });
        itemsByDebugname.set(debugname, { mint: item.mint, objId: item.objId });
    }
    return { gpMint: reg.gp.mint, vaultAta: reg.gp.vaultAta, itemsByMint, itemsByDebugname };
}

export interface VerifiedDeposit {
    wallet: string;
    obj_debugname: string;
    obj_id: number;
    /** items, or whole GP */
    count: number;
}

export type VerifyResult = { ok: true; deposit: VerifiedDeposit } | { ok: false; reason: string };

export async function verifyDepositTx(conn: Connection, registry: RegistryMaps, signature: string): Promise<VerifyResult> {
    const tx = await conn.getParsedTransaction(signature, { commitment: 'finalized', maxSupportedTransactionVersion: 0 });
    if (!tx) return { ok: false, reason: 'transaction not found at finalized commitment' };
    if (tx.meta?.err) return { ok: false, reason: 'transaction failed' };

    // Both items and GP bridge back by BURNING (program deposit_item/deposit_gp burn
    // via a token-program CPI). The burn appears as an INNER instruction, so scan
    // top-level + inner. A direct (non-program) burn of a registry/GP mint is also
    // honored — the tokens are destroyed either way. Amounts are whole items/GP.
    const deposits: VerifiedDeposit[] = [];
    const topLevel = tx.transaction.message.instructions;
    const inner = (tx.meta?.innerInstructions ?? []).flatMap(g => g.instructions);
    const all = [...topLevel, ...inner].filter((ix): ix is ParsedInstruction => 'parsed' in ix);
    for (const ix of all) {
        if (ix.program !== 'spl-token') continue;
        const { type, info } = ix.parsed as { type: string; info: Record<string, unknown> };
        if (type !== 'burnChecked' && type !== 'burn') continue;

        const mint = String(info.mint);
        const rawAmount = type === 'burnChecked'
            ? BigInt((info.tokenAmount as { amount: string }).amount)
            : BigInt(String(info.amount));

        if (mint === registry.gpMint) {
            if (rawAmount % 10n ** BigInt(GP_DECIMALS) !== 0n) return { ok: false, reason: 'GP deposit must be a whole number of GP' };
            const gp = rawAmount / 10n ** BigInt(GP_DECIMALS);
            if (gp < 1n || gp > BigInt(STACK_LIMIT)) return { ok: false, reason: `GP amount out of range: ${gp}` };
            // 1% GP sink: the wallet burned `gp`, but only the post-tax amount is credited in-game.
            const net = gpAfterSink(Number(gp));
            if (net < Number(gp)) console.log(`[verifier] GP sink: deposit of ${gp} GP credits ${net} in-game (${Number(gp) - net} burned, 1% tax)`);
            deposits.push({ wallet: String(info.authority), obj_debugname: 'gp', obj_id: COINS_OBJ_ID, count: net });
        } else {
            const item = registry.itemsByMint.get(mint);
            if (!item) continue;
            if (rawAmount % 10n ** BigInt(ITEM_DECIMALS) !== 0n) return { ok: false, reason: 'item deposit must be a whole number of items' };
            const items = rawAmount / 10n ** BigInt(ITEM_DECIMALS);
            if (items < 1n || items > BigInt(STACK_LIMIT)) return { ok: false, reason: `item amount out of range: ${items}` };
            deposits.push({ wallet: String(info.authority), obj_debugname: item.debugname, obj_id: item.objId, count: Number(items) });
        }
    }

    if (deposits.length === 0) return { ok: false, reason: 'no recognized burn (deposit) of a registry/GP mint' };
    if (deposits.length > 1) return { ok: false, reason: 'more than one deposit instruction (v1 accepts exactly one)' };
    if (!deposits[0].wallet || deposits[0].wallet === 'undefined') return { ok: false, reason: 'could not determine authority' };
    return { ok: true, deposit: deposits[0] };
}
