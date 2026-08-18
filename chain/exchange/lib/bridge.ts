// Client-side bridge helpers: talk to the game host's /bridge/* endpoints and build
// the user-signed on-chain transactions (create token account, deposit=burn).
//
// Funding model: the OPERATOR never funds a user's token account (that would be a
// drain vector — the user owns it and could close it to reclaim the rent). So the
// USER creates + pays for their own token accounts here, and pays their own fees on
// deposits/swaps. Receiving a withdrawal only requires the account to already exist.

import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import type { Connection } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { GAME_URL, LOCAL_GAME_URL, GP_MINT, GP_DECIMALS, ITEM_DECIMALS, PROGRAM_ID } from "./constants";

// ── game host origin (never hard-coded; comes from NEXT_PUBLIC_GAME_URL) ──────
export function gameOrigin(): string {
  const src = GAME_URL || LOCAL_GAME_URL;
  try {
    return new URL(src).origin;
  } catch {
    return src.replace(/\/rs2\.cgi.*$/, "");
  }
}

export const linkPageUrl = () => `${gameOrigin()}/bridge/link`;

// ── agent self-serve API keys ────────────────────────────────────────────────
export interface AgentKey { username: string; apiKey: string; server: string; }
export async function registerAgent(): Promise<AgentKey> {
  const r = await fetch(`${gameOrigin()}/agent/register`, { method: "POST" });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
  return r.json();
}

// ── /bridge/* REST calls (CORS is open on the engine) ─────────────────────────
export async function isLinked(address: string): Promise<boolean> {
  const r = await fetch(`${gameOrigin()}/bridge/linked/${address}`);
  if (!r.ok) return false;
  return (await r.json()).linked === true;
}

export interface PendingRow {
  obj_debugname: string;
  count: number;
  state: string;
}
export async function pendingWithdrawals(address: string): Promise<PendingRow[]> {
  const r = await fetch(`${gameOrigin()}/bridge/pending/${address}`);
  if (!r.ok) return [];
  return (await r.json()).pending ?? [];
}

export async function linkWallet(
  username: string,
  code: string,
  address: string,
  signature: string,
): Promise<{ ok: boolean; error?: string }> {
  const r = await fetch(`${gameOrigin()}/bridge/link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, code, address, signature }),
  });
  const body = await r.json().catch(() => ({}));
  return r.ok ? { ok: true } : { ok: false, error: body.error ?? `HTTP ${r.status}` };
}

// Canonical link message — MUST match server/engine/src/web/pages/bridge.ts linkMessage()
export function linkMessage(username: string, code: string): string {
  return `rs-bridge-link|v1|${username.toLowerCase()}|${code.toUpperCase()}`;
}

export async function notifyDeposit(signature: string): Promise<{ ok: boolean; error?: string }> {
  const r = await fetch(`${gameOrigin()}/bridge/deposit/notify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signature }),
  });
  const body = await r.json().catch(() => ({}));
  return r.ok ? { ok: true } : { ok: false, error: body.error ?? `HTTP ${r.status}` };
}

// ── on-chain program: deposit (burn) instruction builders (ported from
//    chain/program/client.ts — single-byte discriminators, v2-rc IDL order) ────
const BRIDGE_PROGRAM_ID = new PublicKey(PROGRAM_ID);
const DISC = { deposit_item: 8, deposit_gp: 9, redeem_claim: 12 } as const;
const seed = (s: string) => new TextEncoder().encode(s);

function configPda(): PublicKey {
  return PublicKey.findProgramAddressSync([seed("config")], BRIDGE_PROGRAM_ID)[0];
}
function eventAuthorityPda(): PublicKey {
  return PublicKey.findProgramAddressSync([seed("__event_authority")], BRIDGE_PROGRAM_ID)[0];
}
function mintAuthorityPda(): PublicKey {
  return PublicKey.findProgramAddressSync([seed("mint_authority")], BRIDGE_PROGRAM_ID)[0];
}
function claimPda(owner: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([seed("claim"), owner.toBytes(), mint.toBytes()], BRIDGE_PROGRAM_ID)[0];
}
function ixData(disc: number, amount: bigint): Buffer {
  const buf = new Uint8Array(9);
  buf[0] = disc;
  new DataView(buf.buffer).setBigUint64(1, amount, true); // u64 little-endian
  return Buffer.from(buf);
}
const meta = (pubkey: PublicKey, isSigner: boolean, isWritable: boolean) => ({ pubkey, isSigner, isWritable });

function ixDepositItem(owner: PublicKey, mint: PublicKey, ownerAta: PublicKey, amount: bigint): TransactionInstruction {
  return new TransactionInstruction({
    programId: BRIDGE_PROGRAM_ID,
    keys: [
      meta(mint, false, true),
      meta(ownerAta, false, true),
      meta(owner, true, false),
      meta(TOKEN_PROGRAM_ID, false, false),
      meta(eventAuthorityPda(), false, false),
      meta(BRIDGE_PROGRAM_ID, false, false),
    ],
    data: ixData(DISC.deposit_item, amount),
  });
}
function ixDepositGp(owner: PublicKey, mint: PublicKey, ownerAta: PublicKey, amount: bigint): TransactionInstruction {
  return new TransactionInstruction({
    programId: BRIDGE_PROGRAM_ID,
    keys: [
      meta(configPda(), false, false),
      meta(mint, false, true),
      meta(ownerAta, false, true),
      meta(owner, true, false),
      meta(TOKEN_PROGRAM_ID, false, false),
      meta(eventAuthorityPda(), false, false),
      meta(BRIDGE_PROGRAM_ID, false, false),
    ],
    data: ixData(DISC.deposit_gp, amount),
  });
}

// ── tx builders the wallet UI signs ──────────────────────────────────────────

// ── claim (withdrawals): the user redeems their on-chain balance themselves ──
function ixRedeemClaim(owner: PublicKey, mint: PublicKey, recipientAta: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: BRIDGE_PROGRAM_ID,
    keys: [
      meta(owner, true, false),
      meta(mint, false, true),
      meta(mintAuthorityPda(), false, false),
      meta(claimPda(owner, mint), false, true),
      meta(recipientAta, false, true),
      meta(TOKEN_PROGRAM_ID, false, false),
      meta(eventAuthorityPda(), false, false),
      meta(BRIDGE_PROGRAM_ID, false, false),
    ],
    data: Buffer.from([DISC.redeem_claim]),
  });
}

/** On-chain claimable balance (base units) for (owner, mint). 0 if none. */
export async function claimBalanceBase(conn: Connection, owner: PublicKey, mintStr: string): Promise<bigint> {
  const info = await conn.getAccountInfo(claimPda(owner, new PublicKey(mintStr)));
  if (!info || info.data.length < 16) return 0n;
  return info.data.readBigUInt64LE(8); // [8-byte discriminator][amount u64]
}

/** Redeem a withdrawal: mint the claimable balance to the user's own account (they
 *  create the account + pay the rent + fee). One tx per mint redeems its full balance. */
export function buildRedeemTx(owner: PublicKey, mintStr: string): Transaction {
  const mint = new PublicKey(mintStr);
  const ata = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_PROGRAM_ID);
  return new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(owner, ata, owner, mint, TOKEN_PROGRAM_ID),
    ixRedeemClaim(owner, mint, ata),
  );
}

/** Create (and self-fund) the user's token account for `mint`. Owner pays the rent. */
export function buildCreateAccountTx(owner: PublicKey, mintStr: string): Transaction {
  const mint = new PublicKey(mintStr);
  const ata = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_PROGRAM_ID);
  return new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(owner, ata, owner, mint, TOKEN_PROGRAM_ID),
  );
}

/** Deposit = burn `whole` tokens (items or GP) back into the game. Owner signs + pays. */
export function buildDepositTx(owner: PublicKey, mintStr: string, whole: number, isGp: boolean): Transaction {
  const mint = new PublicKey(mintStr);
  const decimals = isGp ? GP_DECIMALS : ITEM_DECIMALS;
  const amount = BigInt(Math.round(whole * 10 ** decimals));
  const ownerAta = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_PROGRAM_ID);
  const ix = isGp
    ? ixDepositGp(owner, new PublicKey(GP_MINT), ownerAta, amount)
    : ixDepositItem(owner, mint, ownerAta, amount);
  return new Transaction().add(ix);
}

/** Does the user's token account for this mint exist yet? */
export async function accountExists(conn: Connection, owner: PublicKey, mintStr: string): Promise<boolean> {
  const ata = getAssociatedTokenAddressSync(new PublicKey(mintStr), owner, false, TOKEN_PROGRAM_ID);
  return (await conn.getAccountInfo(ata)) !== null;
}

export interface Holding { mint: string; amountBase: bigint; }
/** All SPL token balances the wallet holds (mint -> base-unit amount). */
export async function walletHoldings(conn: Connection, owner: PublicKey): Promise<Holding[]> {
  const resp = await conn.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID });
  const out: Holding[] = [];
  for (const { account } of resp.value) {
    const info = account.data.parsed.info;
    const amt = BigInt(info.tokenAmount.amount);
    if (amt > 0n) out.push({ mint: info.mint, amountBase: amt });
  }
  return out;
}

export { SystemProgram };
