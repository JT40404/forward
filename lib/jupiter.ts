import { VersionedTransaction } from "@solana/web3.js";
import BN from "bn.js";

export type JupQuote = {
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  priceImpactPct: string;
  [k: string]: unknown;
};

/** Quotes go through our own API route so the Jupiter API key stays on the server. */
export async function jupQuote(
  inputMint: string,
  outputMint: string,
  amount: BN,
  slippageBps = 100
): Promise<JupQuote> {
  const qs = new URLSearchParams({
    inputMint,
    outputMint,
    amount: amount.toString(),
    slippageBps: String(slippageBps),
    maxAccounts: "40",
  });
  const r = await fetch(`/api/jup/quote?${qs}`);
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(`No swap route: ${j.error || r.statusText}`);
  return j as JupQuote;
}

export async function jupSwapTx(
  quote: JupQuote,
  userPublicKey: string
): Promise<{ tx: VersionedTransaction; lastValidBlockHeight?: number }> {
  const r = await fetch(`/api/jup/swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quoteResponse: quote, userPublicKey }),
  });
  const j = await r.json();
  if (!r.ok || !j.swapTransaction) throw new Error(`Couldn't build the swap: ${j.error || r.statusText}`);
  const tx = VersionedTransaction.deserialize(Buffer.from(j.swapTransaction, "base64"));
  return { tx, lastValidBlockHeight: j.lastValidBlockHeight };
}
