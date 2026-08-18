import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import BN from "bn.js";
import { CpAmm, SwapMode, getPriceFromSqrtPrice } from "@meteora-ag/cp-amm-sdk";
import {
  TOKEN_PROGRAM_ID,
  getMint,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { GP_DECIMALS, ITEM_DECIMALS, GP_MINT } from "./constants";

// Current on-chain model: standard SPL, item mints = 1 decimal, GP = 6 decimals.
// Pools are itemA / gpB. Buying items = GP in, items out.

export interface BuyQuote {
  itemsOut: number;
  gpIn: number;       // UI GP (with slippage headroom / maximumAmountIn)
  spotPrice: number;  // GP per item at current pool price
  priceImpactPct: number;
}

export async function poolSpotPrice(conn: Connection, poolAddr: string): Promise<number> {
  const cpAmm = new CpAmm(conn);
  const st = await cpAmm.fetchPoolState(new PublicKey(poolAddr));
  return Number(getPriceFromSqrtPrice(st.sqrtPrice, ITEM_DECIMALS, GP_DECIMALS));
}

export async function quoteBuy(
  conn: Connection,
  poolAddr: string,
  itemMint: string,
  items: number,
  slippagePct = 1,
): Promise<BuyQuote> {
  const cpAmm = new CpAmm(conn);
  const pool = new PublicKey(poolAddr);
  const poolState = await cpAmm.fetchPoolState(pool);
  const gp = new PublicKey(GP_MINT);
  const [gpInfo, itemInfo] = await Promise.all([
    getMint(conn, gp, "confirmed", TOKEN_PROGRAM_ID),
    getMint(conn, new PublicKey(itemMint), "confirmed", TOKEN_PROGRAM_ID),
  ]);
  const epoch = (await conn.getEpochInfo()).epoch;
  const slot = await conn.getSlot();
  const blockTime = (await conn.getBlockTime(slot)) ?? Math.floor(Date.now() / 1000);
  const amountOut = new BN(BigInt(Math.round(items) * 10 ** ITEM_DECIMALS).toString());
  const q = cpAmm.getQuote2({
    inputTokenMint: gp,
    slippage: slippagePct,
    currentPoint: new BN(blockTime),
    poolState,
    inputTokenInfo: { mint: gpInfo, currentEpoch: epoch },
    outputTokenInfo: { mint: itemInfo, currentEpoch: epoch },
    tokenADecimal: ITEM_DECIMALS,
    tokenBDecimal: GP_DECIMALS,
    hasReferral: false,
    swapMode: SwapMode.ExactOut,
    amountOut,
  });
  const spot = Number(getPriceFromSqrtPrice(poolState.sqrtPrice, ITEM_DECIMALS, GP_DECIMALS));
  const maxIn = q.maximumAmountIn!;
  return {
    itemsOut: items,
    gpIn: Number(maxIn.toString()) / 10 ** GP_DECIMALS,
    spotPrice: spot,
    priceImpactPct: Number(q.priceImpact ?? 0),
  };
}

export async function buildBuyTx(
  conn: Connection,
  poolAddr: string,
  itemMint: string,
  buyer: PublicKey,
  items: number,
  slippagePct = 1,
): Promise<Transaction> {
  const cpAmm = new CpAmm(conn);
  const pool = new PublicKey(poolAddr);
  const poolState = await cpAmm.fetchPoolState(pool);
  const gp = new PublicKey(GP_MINT);
  const item = new PublicKey(itemMint);
  const [gpInfo, itemInfo] = await Promise.all([
    getMint(conn, gp, "confirmed", TOKEN_PROGRAM_ID),
    getMint(conn, item, "confirmed", TOKEN_PROGRAM_ID),
  ]);
  const epoch = (await conn.getEpochInfo()).epoch;
  const slot = await conn.getSlot();
  const blockTime = (await conn.getBlockTime(slot)) ?? Math.floor(Date.now() / 1000);
  const amountOut = new BN(BigInt(Math.round(items) * 10 ** ITEM_DECIMALS).toString());
  const q = cpAmm.getQuote2({
    inputTokenMint: gp, slippage: slippagePct, currentPoint: new BN(blockTime), poolState,
    inputTokenInfo: { mint: gpInfo, currentEpoch: epoch },
    outputTokenInfo: { mint: itemInfo, currentEpoch: epoch },
    tokenADecimal: ITEM_DECIMALS, tokenBDecimal: GP_DECIMALS, hasReferral: false,
    swapMode: SwapMode.ExactOut, amountOut,
  });
  const swapTx = await cpAmm.swap2({
    payer: buyer, pool, inputTokenMint: gp, outputTokenMint: item,
    tokenAMint: poolState.tokenAMint, tokenBMint: poolState.tokenBMint,
    tokenAVault: poolState.tokenAVault, tokenBVault: poolState.tokenBVault,
    tokenAProgram: TOKEN_PROGRAM_ID, tokenBProgram: TOKEN_PROGRAM_ID,
    referralTokenAccount: null, poolState,
    swapMode: SwapMode.ExactOut, amountOut, maximumAmountIn: q.maximumAmountIn!,
  });
  // ensure the buyer's item ATA exists (idempotent, prepend)
  const itemAta = getAssociatedTokenAddressSync(item, buyer, false, TOKEN_PROGRAM_ID);
  const tx = new Transaction();
  tx.add(createAssociatedTokenAccountIdempotentInstruction(buyer, itemAta, buyer, item, TOKEN_PROGRAM_ID));
  tx.add(...swapTx.instructions);
  return tx;
}

export async function gpBalance(conn: Connection, owner: PublicKey): Promise<number> {
  try {
    const ata = getAssociatedTokenAddressSync(new PublicKey(GP_MINT), owner, false, TOKEN_PROGRAM_ID);
    const bal = await conn.getTokenAccountBalance(ata);
    return Number(bal.value.amount) / 10 ** GP_DECIMALS;
  } catch {
    return 0;
  }
}
