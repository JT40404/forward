import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import {
  ActivationType,
  BaseFeeMode,
  CollectFeeMode,
  CpAmm,
  MAX_SQRT_PRICE,
  MIN_SQRT_PRICE,
  getBaseFeeParams,
  getDynamicFeeParams,
  getSqrtPriceFromPrice,
  type PoolFeesParams,
} from "@meteora-ag/cp-amm-sdk";
import BN from "bn.js";
import Decimal from "decimal.js";
import { POOL_FEES, TOKEN_DECIMALS } from "./config";
import type { TokenInfo } from "./solana";

export function poolFees(): PoolFeesParams {
  return {
    // Anti-snipe: fee starts high and decays to the ending fee over the schedule.
    baseFee: getBaseFeeParams({
      baseFeeMode: BaseFeeMode.FeeTimeSchedulerExponential,
      feeTimeSchedulerParam: {
        startingFeeBps: POOL_FEES.startingFeeBps,
        endingFeeBps: POOL_FEES.endingFeeBps,
        numberOfPeriod: POOL_FEES.numberOfPeriod,
        totalDuration: POOL_FEES.totalDuration,
      },
    }),
    compoundingFeeBps: 0,
    padding: 0,
    dynamicFee: getDynamicFeeParams(POOL_FEES.endingFeeBps),
  };
}

/** Starting price in pair tokens per coin, as a plain decimal string. */
export function startingPrice(coinAmount: BN, pairAmount: BN, pairDecimals: number): Decimal {
  const coinUi = new Decimal(coinAmount.toString()).div(new Decimal(10).pow(TOKEN_DECIMALS));
  const pairUi = new Decimal(pairAmount.toString()).div(new Decimal(10).pow(pairDecimals));
  return pairUi.div(coinUi);
}

/**
 * Builds a Meteora DAMM v2 customizable pool: token A = the new coin, token B = ANY pair token.
 * CollectFeeMode.OnlyB means every trading fee the creator earns is paid in the pair token,
 * which is what makes Fee Forward clean (no dumping your own coin to recycle fees).
 */
export async function buildCreatePoolTx(
  connection: Connection,
  creator: PublicKey,
  args: {
    coinMint: PublicKey;
    coinAmount: BN;
    pair: TokenInfo;
    pairAmount: BN;
    lockLiquidity: boolean;
  }
): Promise<{ tx: Transaction; positionNft: Keypair; pool: PublicKey; position: PublicKey }> {
  const cpAmm = new CpAmm(connection);
  const price = startingPrice(args.coinAmount, args.pairAmount, args.pair.decimals);
  const initSqrtPrice = getSqrtPriceFromPrice(
    price.toFixed(Math.min(40, TOKEN_DECIMALS + args.pair.decimals + 20)),
    TOKEN_DECIMALS,
    args.pair.decimals
  );

  const liquidityDelta = cpAmm.getLiquidityDelta({
    maxAmountTokenA: args.coinAmount,
    maxAmountTokenB: args.pairAmount,
    sqrtPrice: initSqrtPrice,
    sqrtMinPrice: MIN_SQRT_PRICE,
    sqrtMaxPrice: MAX_SQRT_PRICE,
    collectFeeMode: CollectFeeMode.OnlyB,
  });

  const positionNft = Keypair.generate();
  const { tx, pool, position } = await cpAmm.createCustomPool({
    payer: creator,
    creator,
    positionNft: positionNft.publicKey,
    tokenAMint: args.coinMint,
    tokenBMint: args.pair.mint,
    tokenAAmount: args.coinAmount,
    tokenBAmount: args.pairAmount,
    sqrtMinPrice: MIN_SQRT_PRICE,
    sqrtMaxPrice: MAX_SQRT_PRICE,
    liquidityDelta,
    initSqrtPrice,
    poolFees: poolFees(),
    hasAlphaVault: false,
    activationType: ActivationType.Timestamp,
    collectFeeMode: CollectFeeMode.OnlyB,
    activationPoint: null,
    tokenAProgram: TOKEN_2022_PROGRAM_ID,
    tokenBProgram: args.pair.programId,
    isLockLiquidity: args.lockLiquidity,
  });

  return { tx, positionNft, pool, position };
}
