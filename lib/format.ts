import BN from "bn.js";
import Decimal from "decimal.js";

/** "12.5" + 6 decimals -> BN(12500000). Throws on bad input. */
export function toBaseUnits(ui: string, decimals: number): BN {
  const clean = ui.trim();
  if (!/^\d*\.?\d*$/.test(clean) || clean === "" || clean === ".") {
    throw new Error("Enter a number like 5 or 0.25");
  }
  const d = new Decimal(clean).mul(new Decimal(10).pow(decimals)).floor();
  return new BN(d.toFixed(0));
}

export function fromBaseUnits(amount: BN | bigint | string, decimals: number): string {
  const d = new Decimal(amount.toString()).div(new Decimal(10).pow(decimals));
  return d.toSignificantDigits(8).toFixed();
}

export function shortAddr(a: string, n = 4): string {
  return a.length > n * 2 + 1 ? `${a.slice(0, n)}…${a.slice(-n)}` : a;
}

export function timeAgo(ms: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} hr ago`;
  return `${Math.floor(h / 24)} days ago`;
}

export function isMintAddress(s: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s.trim());
}
