"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Mark, SearchIcon } from "./Icons";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

export default function Header({
  query,
  onQuery,
}: {
  query?: string;
  onQuery?: (q: string) => void;
}) {
  return (
    <header id="top">
      <div className="util">
        <div className="wrap">
          <nav aria-label="Account">
            <span>Connect a wallet to launch or claim fees</span>
            <Link href="/#fee-forward">Fee Forward</Link>
            <Link href="/#pairs">Pairs</Link>
          </nav>
          <nav className="secondary" aria-label="Creator">
            <Link href="/vault">Creator vault</Link>
          </nav>
        </div>
      </div>
      <div className="head">
        <div className="wrap">
          <Link href="/" className="logo" aria-label="FORWARD home">
            <Mark />
            <span>FORWARD</span>
          </Link>
          <form
            className="search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              document.getElementById("live")?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            <SearchIcon />
            <label htmlFor="site-search" className="sr-only">Search launches by name, ticker or mint</label>
            <input
              id="site-search"
              type="search"
              placeholder="Search launches by name, ticker or mint"
              value={query ?? ""}
              onChange={(e) => onQuery?.(e.target.value)}
              disabled={!onQuery}
            />
            <button type="submit" className="btn btn-blue btn-sm" style={{ height: 36 }}>Search</button>
          </form>
          <Link href="/#launch" className="btn btn-ink">Launch a coin</Link>
          <WalletMultiButton />
        </div>
      </div>
      <div className="cats">
        <div className="wrap">
          <Link href="/#live"><span className="dot" style={{ marginRight: 8 }} />Live launches</Link>
          <Link href="/#recent">Launch chains</Link>
          <Link href="/#pairs">SOL pairs</Link>
          <Link href="/#pairs">USDC pairs</Link>
          <Link href="/#pairs">Custom mint pairs</Link>
          <Link href="/vault">Creator vault</Link>
          <Link href="/#fee-forward" style={{ color: "var(--orange-ink)", fontWeight: 600 }}>Fee Forward</Link>
        </div>
      </div>
    </header>
  );
}
