import { Connection, PublicKey } from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import BN from "bn.js";
import { buildCreateTokenTx, TOTAL_SUPPLY_BASE } from "./token";
import { buildCreatePoolTx } from "./pool";
import { buildPumpCreateTx } from "./pump";
import { buildSourceClaimTx, type ForwardSource } from "./vault";
import { jupQuote, jupSwapTx } from "./jupiter";
import { sendAndConfirm } from "./send";
import type { TokenInfo } from "./solana";

export type Venue = "meteora" | "pump";

export type LaunchForm = {
  venue: Venue;
  name: string;
  symbol: string;
  description: string;
  website: string;
  twitter: string;
  telegram: string;
  image: File;
  /** Meteora: the pool's pair token. Pump: the bonding curve's quote token. */
  pair: TokenInfo;
  /** Meteora: starting liquidity. Pump: dev buy. Both in pair-token base units. */
  seed: BN;
  poolPercent: number; // Meteora only
  lockLiquidity: boolean; // Meteora only
  forwardFrom: ForwardSource[];
};

/** Survives a failed step so "Try again" never repeats a finished one. */
export type LaunchProgress = {
  venue?: Venue;
  uri?: string;
  mint?: string;
  claimed?: boolean;
  forwarded?: string; // BN string, pair-token base units
  pool?: string; // Meteora pool, or pump.fun bonding curve
  registered?: boolean;
};

export type StepUpdate = { id: string; label: string; state: "active" | "done" | "error" };

async function uploadMetadata(f: LaunchForm): Promise<string> {
  const fd = new FormData();
  fd.set("image", f.image);
  for (const k of ["name", "symbol", "description", "website", "twitter", "telegram"] as const) fd.set(k, f[k]);
  const r = await fetch("/api/upload", { method: "POST", body: fd });
  const j = await r.json();
  if (!r.ok || !j.uri) throw new Error(j.error || "Upload failed.");
  return j.uri as string;
}

/** Claims each selected source, converts everything into the target token, returns the usable amount. */
async function forwardFees(
  connection: Connection,
  wallet: WalletContextState,
  owner: PublicKey,
  sources: ForwardSource[],
  target: TokenInfo,
  onStep: (s: StepUpdate) => void
): Promise<BN> {
  let forwarded = new BN(0);
  const byMint = new Map<string, BN>();
  for (const src of sources) {
    onStep({ id: "claim", label: `Claiming ${src.label} (approve in wallet)`, state: "active" });
    await sendAndConfirm(connection, wallet, await buildSourceClaimTx(connection, owner, src));
    const k = src.pair.mint.toBase58();
    byMint.set(k, (byMint.get(k) || new BN(0)).add(src.unclaimed));
  }
  onStep({ id: "claim", label: "Claimed fees from earlier launches", state: "done" });

  for (const [mint, amount] of byMint) {
    const usable = amount.muln(999).divn(1000);
    if (mint === target.mint.toBase58()) {
      forwarded = forwarded.add(usable);
      continue;
    }
    onStep({ id: "swap", label: `Swapping forwarded fees into ${target.symbol} (approve in wallet)`, state: "active" });
    const quote = await jupQuote(mint, target.mint.toBase58(), usable, 100);
    const { tx, lastValidBlockHeight } = await jupSwapTx(quote, owner.toBase58());
    await sendAndConfirm(connection, wallet, tx, { lastValidBlockHeight });
    forwarded = forwarded.add(new BN(quote.otherAmountThreshold));
    onStep({ id: "swap", label: `Swapped forwarded fees into ${target.symbol}`, state: "done" });
  }
  return forwarded;
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
  progress.venue = f.venue;
  const sources = f.forwardFrom.filter((e) => e.unclaimed.gtn(0));

  // 1. Metadata
  if (!progress.uri) {
    onStep({ id: "upload", label: "Uploading image and metadata", state: "active" });
    progress.uri = await uploadMetadata(f);
  }
  onStep({ id: "upload", label: "Uploaded image and metadata", state: "done" });

  if (f.venue === "pump") {
    // 2. Fee Forward first, so the forwarded amount can go into the dev buy.
    if (sources.length && !progress.claimed) {
      progress.forwarded = (await forwardFees(connection, wallet, owner, sources, f.pair, onStep)).toString();
      progress.claimed = true;
    }
    // 3. Create + dev buy in one transaction.
    if (!progress.mint) {
      const buy = f.seed.add(new BN(progress.forwarded || "0"));
      onStep({
        id: "mint",
        label: `Creating $${f.symbol} on pump.fun${buy.gtn(0) ? " with your dev buy" : ""} (approve in wallet)`,
        state: "active",
      });
      const { tx, mint, bondingCurve } = await buildPumpCreateTx(connection, owner, {
        name: f.name,
        symbol: f.symbol,
        uri: progress.uri,
        quote: f.pair,
        quoteAmount: buy,
      });
      await sendAndConfirm(connection, wallet, tx, { signers: [mint] });
      progress.mint = mint.publicKey.toBase58();
      progress.pool = bondingCurve.toBase58();
    }
    onStep({ id: "mint", label: `$${f.symbol} is live on pump.fun`, state: "done" });
  } else {
    // 2. Token
    if (!progress.mint) {
      onStep({ id: "mint", label: `Creating $${f.symbol} (approve in wallet)`, state: "active" });
      const { tx, mint } = await buildCreateTokenTx(connection, owner, { name: f.name, symbol: f.symbol, uri: progress.uri });
      await sendAndConfirm(connection, wallet, tx, { signers: [mint] });
      progress.mint = mint.publicKey.toBase58();
    }
    onStep({ id: "mint", label: `Created $${f.symbol}, mint authority revoked`, state: "done" });

    // 3. Fee Forward
    if (sources.length && !progress.claimed) {
      progress.forwarded = (await forwardFees(connection, wallet, owner, sources, f.pair, onStep)).toString();
      progress.claimed = true;
    }

    // 4. Pool
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
  }

  // Public feed (best effort: the launch is already on-chain)
  if (!progress.registered) {
    try {
      await fetch("/api/launches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venue: f.venue,
          pool: progress.pool,
          mint: progress.mint,
          forwardedFrom: sources.filter((s) => s.kind === "meteora").map((s) => s.key),
          forwardedFromPump: sources.some((s) => s.kind === "pump"),
        }),
      });
    } catch {}
    progress.registered = true;
  }
  return progress;
}
