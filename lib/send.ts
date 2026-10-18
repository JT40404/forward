import {
  AddressLookupTableAccount,
  AddressLookupTableProgram,
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import { PRIORITY_MICROLAMPORTS } from "./config";

function hasPriorityFee(tx: Transaction): boolean {
  return tx.instructions.some(
    (ix) => ix.programId.equals(ComputeBudgetProgram.programId) && ix.data[0] === 3
  );
}

const MAX_TX_BYTES = 1232;

function legacySize(tx: Transaction): number {
  const sigs = new Set([tx.feePayer!.toBase58(), ...tx.instructions.flatMap((ix) => ix.keys.filter((k) => k.isSigner).map((k) => k.pubkey.toBase58()))]);
  return tx.serializeMessage().length + 1 + 64 * sigs.size;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * For a transaction over Solana's 1232-byte limit: creates a lookup table holding its
 * accounts (one extra wallet approval), waits for it to activate, then rebuilds the
 * same instructions as a compact v0 transaction that references them by index.
 */
async function toV0WithLookupTable(
  connection: Connection,
  wallet: WalletContextState,
  tx: Transaction,
  signers: Keypair[]
): Promise<{ v0: VersionedTransaction; lastValidBlockHeight: number }> {
  const owner = wallet.publicKey!;
  const signerKeys = new Set([owner.toBase58(), ...signers.map((k) => k.publicKey.toBase58())]);
  const programIds = new Set(tx.instructions.map((ix) => ix.programId.toBase58()));
  const addresses: PublicKey[] = [];
  const seen = new Set<string>();
  for (const ix of tx.instructions) {
    for (const k of ix.keys) {
      const a = k.pubkey.toBase58();
      // Signers and invoked programs must stay in the message itself.
      if (seen.has(a) || signerKeys.has(a) || programIds.has(a)) continue;
      seen.add(a);
      addresses.push(k.pubkey);
    }
  }

  // Each address moved into the table saves ~31 bytes; 28 is the most one setup
  // transaction can carry, and far more than any launch transaction needs.
  addresses.splice(28);
  const recentSlot = await connection.getSlot("finalized");
  const [createIx, table] = AddressLookupTableProgram.createLookupTable({ authority: owner, payer: owner, recentSlot });
  await sendAndConfirm(
    connection,
    wallet,
    new Transaction().add(
      createIx,
      AddressLookupTableProgram.extendLookupTable({ payer: owner, authority: owner, lookupTable: table, addresses })
    )
  );

  // A table can be used from the slot after its last extension; wait until the RPC serves it complete.
  let lut: AddressLookupTableAccount | null = null;
  for (let tries = 0; tries < 30; tries++) {
    await sleep(800);
    const res = await connection.getAddressLookupTable(table, { commitment: "confirmed" });
    const current = await connection.getSlot("confirmed");
    if (res.value && res.value.state.addresses.length >= addresses.length && current > Number(res.value.state.lastExtendedSlot)) {
      lut = res.value;
      break;
    }
  }
  if (!lut) throw new Error("The lookup table didn't activate in time. Press Try again.");

  const latest = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: owner,
    recentBlockhash: latest.blockhash,
    instructions: tx.instructions,
  }).compileToV0Message([lut]);
  const v0 = new VersionedTransaction(message);
  if (signers.length) v0.sign(signers);
  const bytes = v0.serialize().length;
  if (bytes > MAX_TX_BYTES) throw new Error(`Transaction still too large after compression (${bytes} bytes). Use a shorter name or fewer links.`);
  return { v0, lastValidBlockHeight: latest.lastValidBlockHeight };
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

    if (legacySize(tx) > MAX_TX_BYTES) {
      const { v0, lastValidBlockHeight: lvbh } = await toV0WithLookupTable(connection, wallet, tx, opts.signers || []);
      // Already signed by the extra keypairs; only the wallet signs now.
      return sendAndConfirm(connection, wallet, v0, { lastValidBlockHeight: lvbh });
    }
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
