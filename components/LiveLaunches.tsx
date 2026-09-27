"use client";
import { useRef } from "react";
import { timeAgo } from "@/lib/format";
import type { LaunchRecord } from "@/lib/registry";
import { Chevron } from "./Icons";
import { hueFor } from "./useLaunches";

export default function LiveLaunches({ launches, loading, configured, query }: { launches: LaunchRecord[]; loading: boolean; configured: boolean; query: string }) {
  const track = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => track.current?.scrollBy({ left: dir * 256 * 2, behavior: "smooth" });

  return (
    <section id="live" className="wrap section" aria-labelledby="live-title">
      <div className="row-head">
        <div>
          <h2 className="h-section" id="live-title">Live launches</h2>
          <p className="sub">{query ? `Matching “${query}”` : "The newest coins launched on FORWARD"}</p>
        </div>
        <div className="car-btns">
          <button type="button" className="round" aria-label="Scroll back" onClick={() => scroll(-1)}><Chevron dir="left" size={16} /></button>
          <button type="button" className="round" aria-label="Scroll forward" onClick={() => scroll(1)}><Chevron dir="right" size={16} /></button>
        </div>
      </div>
      {loading ? (
        <div className="empty">Loading launches…</div>
      ) : launches.length === 0 ? (
        <div className="empty">
          <b>{query ? "No launches match that search." : configured ? "No launches yet." : "The launch feed isn't connected yet."}</b>
          <span>{query ? "Try a ticker, a name, or paste a mint address." : "Launch the first coin with the form above."}</span>
        </div>
      ) : (
        <div className="track" ref={track}>
          {launches.slice(0, 24).map((l) => (
            <a key={l.pool} className="lcard" href={`https://jup.ag/swap/${l.pairMint}-${l.mint}`} target="_blank" rel="noreferrer">
              <div className="lcover" style={{ background: hueFor(l.mint) }}>
                {l.image ? <img src={l.image} alt="" loading="lazy" /> : <span className="tk">${l.symbol}</span>}
                <span className="badge"><span className="dot" />{timeAgo(l.createdAt)}</span>
                {l.forwardedFrom.length > 0 && (
                  <span className="fwd-badge">Fees forwarded from {l.forwardedFrom.map((f) => `$${f.symbol}`).join(", ")}</span>
                )}
              </div>
              <div className="lmeta">
                <b>{l.name} <span style={{ color: "var(--muted)", fontWeight: 400 }}>${l.symbol}</span></b>
                <span>Paired with {l.pairSymbol}</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
