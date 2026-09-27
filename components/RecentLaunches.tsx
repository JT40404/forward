"use client";
import { useState } from "react";
import { timeAgo } from "@/lib/format";
import type { LaunchRecord } from "@/lib/registry";
import { SmallArrow } from "./Icons";

const FILTERS = [
  ["all", "All pairs"],
  ["SOL", "SOL"],
  ["USDC", "USDC"],
  ["other", "Other tokens"],
] as const;

export default function RecentLaunches({ launches }: { launches: LaunchRecord[] }) {
  const [f, setF] = useState<(typeof FILTERS)[number][0]>("all");
  const list = launches.filter((l) =>
    f === "all" ? true : f === "other" ? l.pairSymbol !== "SOL" && l.pairSymbol !== "USDC" : l.pairSymbol === f
  );
  if (launches.length === 0) return null;
  return (
    <section id="recent" className="wrap section" aria-labelledby="recent-title">
      <div className="row-head">
        <div>
          <h2 className="h-section" id="recent-title">Launch chains</h2>
          <p className="sub">Recent launches, with the earlier coins whose fees seeded them</p>
        </div>
        <div className="chips" role="group" aria-label="Filter by pair">
          {FILTERS.map(([k, label]) => (
            <button key={k} type="button" className="chip" aria-pressed={f === k} onClick={() => setF(k)}>{label}</button>
          ))}
        </div>
      </div>
      {list.length === 0 ? (
        <div className="empty">No launches on this pair yet. Start one with the form above.</div>
      ) : (
        <div className="grid4">
          {list.slice(0, 16).map((l) => (
            <a key={l.pool} className="rcard" href={`https://jup.ag/swap/${l.pairMint}-${l.mint}`} target="_blank" rel="noreferrer">
              <div className="chain">
                {l.forwardedFrom.map((p) => (
                  <span key={p.pool} style={{ display: "inline-flex", alignItems: "center" }}>
                    <span className="cpill">{p.symbol}</span>
                    <SmallArrow />
                  </span>
                ))}
                <span className="cpill now">{l.symbol}</span>
              </div>
              <div className="lmeta">
                <b>{l.name}</b>
                <span>Paired with {l.pairSymbol}</span>
              </div>
              <div className="rfoot">
                <span>{l.forwardedFrom.length ? `${l.forwardedFrom.length + 1} launches in chain` : "First in chain"}</span>
                <span>{timeAgo(l.createdAt)}</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
