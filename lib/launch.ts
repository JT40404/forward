import { Connection, PublicKey } from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import BN from "bn.js";
import { buildCreateTokenTx, TOTAL_SUPPLY_BASE } from "./token";
import { buildCreatePoolTx } from "./pool";
import { buildClaimTx, type VaultEntry } from "./vault";
import { jupQuote, jupSwapTx } from "./jupiter";
import { sendAndConfirm } from "./send";
import type { TokenInfo } from "./solana";

export type LaunchForm = {
  name: string;
  symbol: string;
  description: string;
  website: string;
  twitter: string;
  telegram: string;
  image: File;
  pair: TokenInfo;
  seed: BN; // pair-token base units from the creator's wallet
  poolPercent: number; // share of supply deposited into the pool (1-100)
  lockLiquidity: boolean;
  forwardFrom: VaultEntry[]; // previous launches whose fees roll into this one
};

/**
 * Progress survives a failed step so the person can press "Try again"
 * without re-creating the token or re-claiming fees.
 */
export type LaunchProgress = {
  uri?: string;
  mint?: string;
  claimed?: boolean;
  forwarded?: string; // BN string, pair-token base units
  pool?: string;
  registered?: boolean;
};

export type StepUpdate = { id: string; label: string; state: "active" | "done" | "error" };

const SAFETY_NUM = new BN(999);
const SAFETY_DEN = new BN(1000);

async function uploadMetadata(f: LaunchForm): Promise<string> {
  const fd = new FormData();
  fd.set("image", f.image);
  fd.set("name", f.name);
  fd.set("symbol", f.symbol);
  fd.set("description", f.description);
  fd.set("website", f.website);
  fd.set("twitter", f.twitter);
  fd.set("telegram", f.telegram);
  const r = await fetch("/api/upload", { method: "POST", body: fd });
  const j = await r.json();
  if (!r.ok || !j.uri) throw new Error(j.error || "Upload failed.");
  return j.uri as string;
}

export async function runLaunch(
  connection: Connection,
  wallet: WalletContextState,
  f: LaunchForm,
  progress: LaunchProgress,
  onStep: (s: StepUpdate) => void
): Promise<LaunchProgress> {
  const owner = wallet.publicKey;
  if (!owner) throw new Error("Connect a wallet first.");

  // 1. Metadata
  if (!progress.uri) {
    onStep({ id: "upload", label: "Uploading image and metadata", state: "active" });
    progress.uri = await uploadMetadata(f);
  }
  onStep({ id: "upload", label: "Uploaded image and metadata", state: "done" });

  // 2. Token
  if (!progress.mint) {
    onStep({ id: "mint", label: `Creating $${f.symbol} (approve in wallet)`, state: "active" });
    const { tx, mint } = await buildCreateTokenTx(connection, owner, {
      name: f.name,
      symbol: f.symbol,
      uri: progress.uri,
    });
    await sendAndConfirm(connection, wallet, tx, { signers: [mint] });
    progress.mint = mint.publicKey.toBase58();
  }
  onStep({ id: "mint", label: `Created $${f.symbol}, mint authority revoked`, state: "done" });

  // 3 + 4. Fee Forward: claim previous fees, convert them into this launch's pair token
  const toForward = f.forwardFrom.filter((e) => e.unclaimed.gtn(0));
  if (toForward.length && !progress.claimed) {
    let forwarded = new BN(0);
    const byPair = new Map<string, BN>();
    for (const e of toForward) {
      onStep({ id: "claim", label: `Claiming fees from $${e.coinSymbol} (approve in wallet)`, state: "active" });
      await sendAndConfirm(connection, wallet, await buildClaimTx(connection, owner, e));
      const k = e.pair.mint.toBase58();
      byPair.set(k, (byPair.get(k) || new BN(0)).add(e.unclaimed));
    }
    onStep({ id: "claim", label: "Claimed fees from previous launches", state: "done" });

    for (const [pairMint, amount] of byPair) {
      const usable = amount.mul(SAFETY_NUM).div(SAFETY_DEN);
      if (pairMint === f.pair.mint.toBase58()) {
        forwarded = forwarded.add(usable);
        continue;
      }
      onStep({ id: "swap", label: `Swapping forwarded fees into ${f.pair.symbol} (approve in wallet)`, state: "active" });
      const quote = await jupQuote(pairMint, f.pair.mint.toBase58(), usable, 100);
      const { tx, lastValidBlockHeight } = await jupSwapTx(quote, owner.toBase58());
      await sendAndConfirm(connection, wallet, tx, { lastValidBlockHeight });
      forwarded = forwarded.add(new BN(quote.otherAmountThreshold));
      onStep({ id: "swap", label: `Swapped forwarded fees into ${f.pair.symbol}`, state: "done" });
    }
    progress.forwarded = forwarded.toString();
    progress.claimed = true;
  }

  // 5. Pool
  if (!progress.pool) {
    onStep({ id: "pool", label: `Opening the $${f.symbol} / ${f.pair.symbol} pool (approve in wallet)`, state: "active" });
    const pairAmount = f.seed.add(new BN(progress.forwarded || "0"));
    if (pairAmount.lten(0)) throw new Error("The pool needs some starting liquidity.");
    const coinAmount = TOTAL_SUPPLY_BASE.muln(Math.round(f.poolPercent * 100)).divn(10_000);
    const { tx, positionNft, pool } = await buildCreatePoolTx(connection, owner, {
      coinMint: new PublicKey(progress.mint),
      coinAmount,
      pair: f.pair,
      pairAmount,
      lockLiquidity: f.lockLiquidity,
    });
    await sendAndConfirm(connection, wallet, tx, { signers: [positionNft] });
    progress.pool = pool.toBase58();
  }
  onStep({ id: "pool", label: "Pool is live", state: "done" });

  // 6. Public feed (best effort: the launch is already on-chain)
  if (!progress.registered) {
    try {
      await fetch("/api/launches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pool: progress.pool,
          forwardedFrom: toForward.map((e) => e.pool.toBase58()),
        }),
      });
    } catch {}
    progress.registered = true;
  }
  return progress;
}
