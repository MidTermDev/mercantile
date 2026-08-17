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
const STACK_LIMIT = 0x7fffffff;
// authentic, stable id from server/content/pack/obj.pack
export const COINS_OBJ_ID = 995;

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

    const deposits: VerifiedDeposit[] = [];
    const instructions = tx.transaction.message.instructions.filter((ix): ix is ParsedInstruction => 'parsed' in ix);
    for (const ix of instructions) {
        if (ix.program !== 'spl-token') continue;
        const { type, info } = ix.parsed as { type: string; info: Record<string, unknown> };

        if (type === 'burnChecked' || type === 'burn') {
            const mint = String(info.mint);
            const item = registry.itemsByMint.get(mint);
            if (!item) continue;
            const rawAmount = type === 'burnChecked'
                ? BigInt((info.tokenAmount as { amount: string }).amount)
                : BigInt(String(info.amount));
            if (rawAmount < 1n || rawAmount > BigInt(STACK_LIMIT)) return { ok: false, reason: `burn amount out of range: ${rawAmount}` };
            deposits.push({ wallet: String(info.authority), obj_debugname: item.debugname, obj_id: item.objId, count: Number(rawAmount) });
        } else if (type === 'transferChecked' || type === 'transfer') {
            if (String(info.destination) !== registry.vaultAta) continue;
            if (type === 'transferChecked' && String(info.mint) !== registry.gpMint) return { ok: false, reason: 'vault transfer of a non-GP mint' };
            const rawAmount = type === 'transferChecked'
                ? BigInt((info.tokenAmount as { amount: string }).amount)
                : BigInt(String(info.amount));
            if (rawAmount % 10n ** BigInt(GP_DECIMALS) !== 0n) return { ok: false, reason: 'GP deposit must be a whole number of GP' };
            const gp = rawAmount / 10n ** BigInt(GP_DECIMALS);
            if (gp < 1n || gp > BigInt(STACK_LIMIT)) return { ok: false, reason: `GP amount out of range: ${gp}` };
            deposits.push({ wallet: String(info.authority), obj_debugname: 'gp', obj_id: COINS_OBJ_ID, count: Number(gp) });
        }
    }

    if (deposits.length === 0) return { ok: false, reason: 'no recognized deposit instruction' };
    if (deposits.length > 1) return { ok: false, reason: 'more than one deposit instruction (v1 accepts exactly one)' };
    if (!deposits[0].wallet || deposits[0].wallet === 'undefined') return { ok: false, reason: 'could not determine authority' };
    return { ok: true, deposit: deposits[0] };
}
