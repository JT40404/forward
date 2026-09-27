import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { getTokenMetadata } from "@solana/spl-token";
import {
  CollectFeeMode,
  CpAmm,
  getTokenProgram,
  getUnClaimLpFee,
  type PoolState,
} from "@meteora-ag/cp-amm-sdk";
import BN from "bn.js";
import { LAUNCHPAD_TAG } from "./config";
import { resolveToken, type TokenInfo } from "./solana";
import { shortAddr } from "./format";

export type VaultEntry = {
  pool: PublicKey;
  position: PublicKey;
  positionNftAccount: PublicKey;
  poolState: PoolState;
  coinMint: PublicKey;
  coinSymbol: string;
  pair: TokenInfo;
  unclaimed: BN; // in pair-token base units
};

/**
 * Finds every FORWARD pool this wallet created and still holds the position for,
 * with the fees waiting to be claimed (paid in the pair token).
 */
export async function loadVault(connection: Connection, owner: PublicKey): Promise<VaultEntry[]> {
  const cpAmm = new CpAmm(connection);
  const positions = await cpAmm.getPositionsByUser(owner);
  if (positions.length === 0) return [];

  const poolKeys = positions.map((p) => p.positionState.pool);
  const pools = await cpAmm.getMultiplePools(poolKeys);
  const pairCache = new Map<string, TokenInfo>();
  const out: VaultEntry[] = [];

  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    const poolState = pools[i];
    if (!poolState) continue;
    if (!poolState.creator.equals(owner)) continue;
    if (poolState.collectFeeMode !== CollectFeeMode.OnlyB) continue;

    // Only FORWARD coins: check the launchpad tag in the coin's Token-2022 metadata.
    let coinSymbol = shortAddr(poolState.tokenAMint.toBase58());
    try {
      const md = await getTokenMetadata(connection, poolState.tokenAMint, "confirmed");
      const tagged = md?.additionalMetadata?.some(
        ([k, v]) => k === LAUNCHPAD_TAG.key && v === LAUNCHPAD_TAG.value
      );
      if (!tagged) continue;
      coinSymbol = md?.symbol || coinSymbol;
    } catch {
      continue;
    }

    const pairKey = poolState.tokenBMint.toBase58();
    let pair = pairCache.get(pairKey);
    if (!pair) {
      pair = await resolveToken(connection, poolState.tokenBMint);
      pairCache.set(pairKey, pair);
    }

    const { feeTokenB } = getUnClaimLpFee(poolState, p.positionState);
    out.push({
      pool: poolKeys[i],
      position: p.position,
      positionNftAccount: p.positionNftAccount,
      poolState,
      coinMint: poolState.tokenAMint,
      coinSymbol,
      pair,
      unclaimed: feeTokenB,
    });
  }
  return out.sort((a, b) => (b.unclaimed.gt(a.unclaimed) ? 1 : -1));
}

export async function buildClaimTx(
  connection: Connection,
  owner: PublicKey,
  entry: VaultEntry
): Promise<Transaction> {
  const cpAmm = new CpAmm(connection);
  const s = entry.poolState;
  return cpAmm.claimPositionFee2({
    owner,
    receiver: owner,
    feePayer: owner,
    pool: entry.pool,
    position: entry.position,
    positionNftAccount: entry.positionNftAccount,
    tokenAMint: s.tokenAMint,
    tokenBMint: s.tokenBMint,
    tokenAVault: s.tokenAVault,
    tokenBVault: s.tokenBVault,
    tokenAProgram: getTokenProgram(s.tokenAFlag),
    tokenBProgram: getTokenProgram(s.tokenBFlag),
  });
}
