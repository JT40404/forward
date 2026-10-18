import { Connection, PublicKey } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getMint,
  getTokenMetadata,
} from "@solana/spl-token";
import { presetSymbol } from "./config";
import { shortAddr } from "./format";

export type TokenInfo = {
  mint: PublicKey;
  programId: PublicKey;
  decimals: number;
  symbol: string;
};

/** Looks up any SPL / Token-2022 mint: which program owns it, its decimals and a display symbol. */
export async function resolveToken(connection: Connection, mint: PublicKey): Promise<TokenInfo> {
  const info = await connection.getAccountInfo(mint);
  if (!info) throw new Error("That mint address doesn't exist on this network.");
  let programId: PublicKey;
  if (info.owner.equals(TOKEN_PROGRAM_ID)) programId = TOKEN_PROGRAM_ID;
  else if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) programId = TOKEN_2022_PROGRAM_ID;
  else throw new Error("That address isn't a token mint.");
  const m = await getMint(connection, mint, "confirmed", programId);
  let symbol = presetSymbol(mint.toBase58()) || "";
  if (!symbol && programId.equals(TOKEN_2022_PROGRAM_ID)) {
    try {
      symbol = (await getTokenMetadata(connection, mint, "confirmed"))?.symbol || "";
    } catch {}
  }
  return { mint, programId, decimals: m.decimals, symbol: symbol || shortAddr(mint.toBase58()) };
}
