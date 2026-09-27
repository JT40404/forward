import { PublicKey } from "@solana/web3.js";

export const CLUSTER = (process.env.NEXT_PUBLIC_CLUSTER || "mainnet-beta") as
  | "mainnet-beta"
  | "devnet";

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ||
  (CLUSTER === "devnet"
    ? "https://api.devnet.solana.com"
    : "https://api.mainnet-beta.solana.com");

export const PRIORITY_MICROLAMPORTS = Number(
  process.env.NEXT_PUBLIC_PRIORITY_MICROLAMPORTS || 200_000
);

export const POOL_FEES = {
  startingFeeBps: Number(process.env.NEXT_PUBLIC_POOL_START_FEE_BPS || 5000),
  endingFeeBps: Number(process.env.NEXT_PUBLIC_POOL_END_FEE_BPS || 100),
  numberOfPeriod: Number(process.env.NEXT_PUBLIC_POOL_FEE_PERIODS || 60),
  totalDuration: Number(process.env.NEXT_PUBLIC_POOL_FEE_DURATION_SECONDS || 300),
};

const feeWallet = process.env.NEXT_PUBLIC_PLATFORM_FEE_WALLET;
const feeSol = Number(process.env.NEXT_PUBLIC_PLATFORM_FEE_SOL || 0);
export const PLATFORM_FEE =
  feeWallet && feeSol > 0
    ? { wallet: new PublicKey(feeWallet), lamports: Math.round(feeSol * 1e9) }
    : null;

/** Every FORWARD coin: 1,000,000,000 supply, 6 decimals. */
export const TOKEN_DECIMALS = 6;
export const TOTAL_SUPPLY_UI = 1_000_000_000;

/** Tag written into each coin's on-chain metadata so the launch feed only lists FORWARD coins. */
export const LAUNCHPAD_TAG = { key: "launchpad", value: "FORWARD" };

export type PairPreset = { symbol: string; name: string; mint: string };

/** Quick-pick pairs. Anything else can be pasted as a mint address. */
export const PAIR_PRESETS: PairPreset[] = [
  { symbol: "SOL", name: "Solana", mint: "So11111111111111111111111111111111111111112" },
  { symbol: "USDC", name: "USD Coin", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
  { symbol: "JUP", name: "Jupiter", mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN" },
  { symbol: "BONK", name: "Bonk", mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
  { symbol: "WIF", name: "dogwifhat", mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm" },
  { symbol: "JTO", name: "Jito", mint: "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL" },
  { symbol: "PYTH", name: "Pyth", mint: "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3" },
];

export function presetSymbol(mint: string): string | undefined {
  return PAIR_PRESETS.find((p) => p.mint === mint)?.symbol;
}
