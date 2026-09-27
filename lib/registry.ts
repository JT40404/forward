import { Redis } from "@upstash/redis";

export type LaunchRecord = {
  pool: string;
  mint: string;
  pairMint: string;
  pairSymbol: string;
  name: string;
  symbol: string;
  image?: string;
  creator: string;
  createdAt: number;
  forwardedFrom: { pool: string; symbol: string }[];
};

let client: Redis | null | undefined;
export function redis(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  client = url && token ? new Redis({ url, token }) : null;
  return client;
}

export const LIST_KEY = "forward:launches";
export const poolKey = (pool: string) => `forward:launch:${pool}`;
