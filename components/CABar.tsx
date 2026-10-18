"use client";
import { useState } from "react";
import { shortAddr } from "@/lib/format";

/**
 * The FORWARD token's contract address, shown at the top of every page.
 * Set NEXT_PUBLIC_FORWARD_CA in Vercel and redeploy to publish it.
 */
const CA = (process.env.NEXT_PUBLIC_FORWARD_CA || "").trim();
const TICKER = (process.env.NEXT_PUBLIC_FORWARD_TICKER || "FORWARD").trim().replace(/^\$/, "");
const BUY_URL = (process.env.NEXT_PUBLIC_FORWARD_BUY_URL || "").trim() || (CA ? `https://jup.ag/swap/SOL-${CA}` : "");

export default function CABar() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(CA);
    } catch {
      const t = document.createElement("textarea");
      t.value = CA;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      t.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="ca-bar" role="region" aria-label={`$${TICKER} contract address`}>
      <div className="wrap">
        <span className="ca-label">${TICKER} CA</span>
        {CA ? (
          <>
            <button type="button" className="ca-addr" onClick={copy} title="Copy contract address">
              <span className="ca-full">{CA}</span>
              <span className="ca-short">{shortAddr(CA, 6)}</span>
            </button>
            <button type="button" className="ca-btn" onClick={copy} aria-live="polite">
              {copied ? "Copied" : "Copy"}
            </button>
            <a className="ca-btn solid" href={BUY_URL} target="_blank" rel="noreferrer">Buy</a>
            <a className="ca-btn scan" href={`https://solscan.io/token/${CA}`} target="_blank" rel="noreferrer">Solscan</a>
          </>
        ) : (
          <span className="ca-soon">Launching soon. The official address will appear here.</span>
        )}
      </div>
    </div>
  );
}
