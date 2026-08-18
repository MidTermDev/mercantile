// Agent-facing swap CLI against an item's GP pool.
// Usage:
//   bun cli/swap.ts <debugname> buy  <count>   # spend GP, receive items
//   bun cli/swap.ts <debugname> sell <count>   # spend items, receive GP
// Flags: --keypair <path> (default: bridge key), --slippage <pct, default 1>, --json

import { Keypair, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { CpAmm, SwapMode } from '@meteora-ag/cp-amm-sdk';
import { getMint, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { readFileSync } from 'node:fs';
import { connection, bridgeKeypair, loadRegistry, GP_DECIMALS, ITEM_DECIMALS } from '../runner/lib/common';
import { ata } from '../runner/lib/token22';
import { pacedSendAndConfirm } from '../runner/lib/pace';

const [debugname, side, countStr] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const json = process.argv.includes('--json');
const kpArg = process.argv.indexOf('--keypair');
const slipArg = process.argv.indexOf('--slippage');
const slippagePct = slipArg !== -1 ? parseFloat(process.argv[slipArg + 1]) : 1;

if (!debugname || !['buy', 'sell'].includes(side) || !countStr) {
    console.error('usage: bun cli/swap.ts <debugname> buy|sell <count> [--keypair path] [--slippage pct] [--json]');
    process.exit(1);
}

const reg = loadRegistry();
const item = reg.items[debugname];
if (!item?.pool) { console.error(`${debugname} has no pool in the registry`); process.exit(1); }

const conn = connection();
const payer = kpArg !== -1
    ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(process.argv[kpArg + 1], 'utf8'))))
    : bridgeKeypair();

const cpAmm = new CpAmm(conn);
const pool = new PublicKey(item.pool);
const itemMint = new PublicKey(item.mint!);
const gpMint = new PublicKey(reg.gp.mint!);
const poolState = await cpAmm.fetchPoolState(pool);

const count = BigInt(countStr);
// buy = exact-out (receive exactly `count` whole items, cap GP spend at the
// quote's maximumAmountIn); sell = exact-in (spend exactly `count` items).
const isBuy = side === 'buy';
const inputMint = isBuy ? gpMint : itemMint;
const outputMint = isBuy ? itemMint : gpMint;

const [inputInfo, outputInfo] = await Promise.all([
    getMint(conn, inputMint, 'confirmed', TOKEN_PROGRAM_ID),
    getMint(conn, outputMint, 'confirmed', TOKEN_PROGRAM_ID),
]);
const epochInfo = await conn.getEpochInfo();
const slot = await conn.getSlot();
const blockTime = (await conn.getBlockTime(slot)) ?? Math.floor(Date.now() / 1000);

const common = {
    inputTokenMint: inputMint,
    slippage: slippagePct,
    currentPoint: new BN(blockTime), // pools use ActivationType.Timestamp
    poolState,
    inputTokenInfo: { mint: inputInfo, currentEpoch: epochInfo.epoch },
    outputTokenInfo: { mint: outputInfo, currentEpoch: epochInfo.epoch },
    tokenADecimal: ITEM_DECIMALS,
    tokenBDecimal: GP_DECIMALS,
    hasReferral: false,
} as const;

const swapCommon = {
    payer: payer.publicKey,
    pool,
    inputTokenMint: inputMint,
    outputTokenMint: outputMint,
    tokenAMint: poolState.tokenAMint,
    tokenBMint: poolState.tokenBMint,
    tokenAVault: poolState.tokenAVault,
    tokenBVault: poolState.tokenBVault,
    tokenAProgram: TOKEN_PROGRAM_ID,
    tokenBProgram: TOKEN_PROGRAM_ID,
    referralTokenAccount: null,
    poolState,
} as const;

let amountIn: BN;
let tx;
if (isBuy) {
    const amountOut = new BN(count.toString());
    const quote = cpAmm.getQuote2({ ...common, swapMode: SwapMode.ExactOut, amountOut });
    amountIn = quote.maximumAmountIn!;
    tx = await cpAmm.swap2({ ...swapCommon, swapMode: SwapMode.ExactOut, amountOut, maximumAmountIn: amountIn });
} else {
    amountIn = new BN(count.toString());
    const quote = cpAmm.getQuote2({ ...common, swapMode: SwapMode.ExactIn, amountIn });
    tx = await cpAmm.swap2({ ...swapCommon, swapMode: SwapMode.ExactIn, amountIn, minimumAmountOut: quote.minimumAmountOut! });
}

const before = await conn.getTokenAccountBalance(ata(outputMint, payer.publicKey)).catch(() => null);
const sig = await pacedSendAndConfirm(conn, tx, [payer]);
const after = await conn.getTokenAccountBalance(ata(outputMint, payer.publicKey));
const received = BigInt(after.value.amount) - BigInt(before?.value.amount ?? '0');

const summary = {
    item: debugname,
    side,
    requested: count.toString(),
    amountIn: amountIn.toString(),
    received: received.toString(),
    receivedUi: isBuy ? received.toString() : (Number(received) / 10 ** GP_DECIMALS).toFixed(6),
    sig,
};
if (json) console.log(JSON.stringify(summary));
else {
    console.log(`${side} ${debugname}: in=${isBuy ? (Number(amountIn) / 10 ** GP_DECIMALS).toFixed(6) + ' GP' : amountIn.toString() + ' items'}`
        + ` -> out=${isBuy ? received + ' items' : (Number(received) / 10 ** GP_DECIMALS).toFixed(6) + ' GP'}`);
    console.log(`sig: ${sig}`);
}
if (isBuy && received < count) {
    console.error(`WARNING: received ${received} < requested ${count} (slippage headroom too small)`);
    process.exit(2);
}
