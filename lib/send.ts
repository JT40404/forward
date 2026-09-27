import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import { PRIORITY_MICROLAMPORTS } from "./config";

function hasPriorityFee(tx: Transaction): boolean {
  return tx.instructions.some(
    (ix) => ix.programId.equals(ComputeBudgetProgram.programId) && ix.data[0] === 3
  );
}

/** Signs with the connected wallet (plus any extra keypairs), sends, and waits for confirmation. */
export async function sendAndConfirm(
  connection: Connection,
  wallet: WalletContextState,
  tx: Transaction | VersionedTransaction,
  opts: { signers?: Keypair[]; lastValidBlockHeight?: number } = {}
): Promise<string> {
  if (!wallet.publicKey) throw new Error("Connect a wallet first.");

  let blockhash: string;
  let lastValidBlockHeight: number;

  if (tx instanceof Transaction) {
    if (!hasPriorityFee(tx)) {
      tx.instructions.unshift(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_MICROLAMPORTS })
      );
    }
    const latest = await connection.getLatestBlockhash("confirmed");
    blockhash = latest.blockhash;
    lastValidBlockHeight = latest.lastValidBlockHeight;
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;
  } else {
    blockhash = tx.message.recentBlockhash;
    lastValidBlockHeight =
      opts.lastValidBlockHeight ??
      (await connection.getLatestBlockhash("confirmed")).lastValidBlockHeight;
  }

  // Sign in the wallet, then broadcast through our own RPC (/api/rpc) instead of the
  // wallet's broadcaster. Preflight simulation then returns the real program error.
  let signature: string;
  if (wallet.signTransaction) {
    if (tx instanceof Transaction && opts.signers?.length) tx.partialSign(...opts.signers);
    const signed = await wallet.signTransaction(tx);
    signature = await connection.sendRawTransaction(signed.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
      maxRetries: 5,
    });
  } else {
    signature = await wallet.sendTransaction(tx, connection, {
      signers: opts.signers,
      preflightCommitment: "confirmed",
      maxRetries: 5,
    } as any);
  }

  await waitForConfirmation(connection, signature, lastValidBlockHeight);
  return signature;
}

/** HTTP polling instead of websockets, so it works through the /api/rpc proxy. */
async function waitForConfirmation(
  connection: Connection,
  signature: string,
  lastValidBlockHeight: number
): Promise<void> {
  for (;;) {
    const { value } = await connection.getSignatureStatuses([signature]);
    const st = value[0];
    if (st?.err) throw new Error(`Transaction failed on-chain: ${JSON.stringify(st.err)}`);
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return;
    const height = await connection.getBlockHeight("confirmed");
    if (height > lastValidBlockHeight) {
      throw new Error("block height exceeded: the transaction expired before it confirmed.");
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

/** Pulls the most useful line out of a failed simulation's program logs. */
function logHint(e: unknown): string {
  const logs: string[] | undefined = (e as any)?.logs ?? (e as any)?.transactionLogs;
  if (!Array.isArray(logs)) return "";
  const line =
    logs.find((l) => /Error Message:/i.test(l)) ||
    logs.find((l) => /insufficient|custom program error|failed/i.test(l));
  return line ? line.replace(/^Program log:\s*/, "").trim() : "";
}

/** Turns wallet / RPC errors into a sentence a person can act on. */
export function explainError(e: unknown): string {
  const hint = logHint(e);
  const msg = (e instanceof Error ? e.message : String(e)) + (hint ? ` (${hint})` : "");
  if (/User rejected|rejected the request/i.test(msg)) return "You declined the transaction in your wallet.";
  if (/insufficient (funds|lamports)|0x1\b|InsufficientFunds/i.test(msg)) return "Your wallet doesn't have enough balance for this step (including SOL for fees and rent).";
  if (/blockhash not found|block height exceeded/i.test(msg)) return "The network was congested and the transaction expired. Try again.";
  return msg.length > 240 ? msg.slice(0, 240) + "…" : msg;
}
