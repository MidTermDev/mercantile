// DAMM v2 one-sided pool creation: 100 item tokens (token A) vs GP (token B),
// initSqrtPrice == sqrtMinPrice (single-sided invariant), range [P0, MAX_SQRT_PRICE).
// P0 = 0.9 * lowalch in GP per item.

import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import BN from 'bn.js';
import {
    CpAmm,
    MAX_SQRT_PRICE,
    ActivationType,
    BaseFeeMode,
    CollectFeeMode,
    getBaseFeeParams,
    getSqrtPriceFromPrice,
    getPriceFromSqrtPrice,
    deriveCustomizablePoolAddress,
} from '@meteora-ag/cp-amm-sdk';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { GP_DECIMALS, ITEM_DECIMALS, POOL_FEE_BPS } from './common';
import { p0String } from '../../registry/schema';

export { MAX_SQRT_PRICE, deriveCustomizablePoolAddress, getPriceFromSqrtPrice };

/** sqrtPrice (Q64.64) for P0 = lowalch*9/10 GP per item (0-dec items / 6-dec GP).
 *  Takes lowalch, not the float P0, so the price string is an exact decimal. */
export function p0SqrtPrice(la: number): BN {
    return getSqrtPriceFromPrice(p0String(la), ITEM_DECIMALS, GP_DECIMALS);
}

export interface OneSidedPoolPlan {
    pool: PublicKey;
    positionNft: Keypair;
    tx: Transaction;
    position: PublicKey;
    initSqrtPrice: BN;
}

export async function buildOneSidedPoolTx(
    cpAmm: CpAmm,
    payer: PublicKey,
    itemMint: PublicKey,
    gpMint: PublicKey,
    itemLowalch: number,
    itemAmount: bigint,
    tokenProgram: PublicKey = TOKEN_2022_PROGRAM_ID,
): Promise<OneSidedPoolPlan> {
    const initSqrtPrice = p0SqrtPrice(itemLowalch);
    const tokenAAmount = new BN(itemAmount.toString());
    const liquidityDelta = cpAmm.preparePoolCreationSingleSide({
        tokenAAmount,
        minSqrtPrice: initSqrtPrice,
        maxSqrtPrice: MAX_SQRT_PRICE,
        initSqrtPrice,
        collectFeeMode: CollectFeeMode.OnlyB,
    });

    const positionNft = Keypair.generate();
    const baseFee = getBaseFeeParams(
        {
            baseFeeMode: BaseFeeMode.FeeTimeSchedulerLinear,
            feeTimeSchedulerParam: {
                startingFeeBps: POOL_FEE_BPS,
                endingFeeBps: POOL_FEE_BPS,
                numberOfPeriod: 0,
                totalDuration: 0,
            },
        },
        GP_DECIMALS,
        ActivationType.Timestamp,
    );

    const { tx, pool, position } = await cpAmm.createCustomPool({
        payer,
        creator: payer,
        positionNft: positionNft.publicKey,
        tokenAMint: itemMint,
        tokenBMint: gpMint,
        tokenAAmount,
        tokenBAmount: new BN(0), // program pulls max(1) base unit of GP from the payer ATA
        sqrtMinPrice: initSqrtPrice,
        sqrtMaxPrice: MAX_SQRT_PRICE,
        liquidityDelta,
        initSqrtPrice,
        poolFees: {
            baseFee,
            compoundingFeeBps: 0,
            padding: 0,
            dynamicFee: null,
        },
        hasAlphaVault: false,
        activationType: ActivationType.Timestamp,
        collectFeeMode: CollectFeeMode.OnlyB,
        activationPoint: null,
        tokenAProgram: tokenProgram,
        tokenBProgram: tokenProgram,
    });

    return { pool, positionNft, tx, position, initSqrtPrice };
}
