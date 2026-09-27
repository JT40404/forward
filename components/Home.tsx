"use client";
import { useMemo, useState } from "react";
import { PAIR_PRESETS } from "@/lib/config";
import Header from "./Header";
import Footer from "./Footer";
import LaunchComposer from "./LaunchComposer";
import LiveLaunches from "./LiveLaunches";
import PairTiles from "./PairTiles";
import FeeForwardBanner from "./FeeForwardBanner";
import RecentLaunches from "./RecentLaunches";
import { DashArrow } from "./Icons";
import { matches, useLaunches } from "./useLaunches";

export default function Home() {
  const [pairKey, setPairKey] = useState(PAIR_PRESETS[0].mint);
  const [ticker, setTicker] = useState("");
  const [query, setQuery] = useState("");
  const feed = useLaunches();
  const filtered = useMemo(() => feed.launches.filter((l) => matches(l, query)), [feed.launches, query]);

  return (
    <>
      <Header query={query} onQuery={setQuery} />
      <main>
        <section id="launch" className="hero" aria-labelledby="hero-title">
          <div className="wrap">
            <div className="hero-inner">
              <div className="hero-copy">
                <h1 id="hero-title">Launch a coin against any Solana token.</h1>
                <p>Pair with SOL, USDC, or paste any mint. Then carry the fees your last launch earned straight into the next one.</p>
                <div className="relay" aria-hidden="true">
                  <div className="relay-node"><div className="coin" style={{ background: "#fff", color: "var(--blue)" }}>1st</div>Last launch</div>
                  <div className="relay-link"><span className="pill-orange">Fees it earned</span><DashArrow /></div>
                  <div className="relay-node">
                    <div className="coin" style={{ background: "var(--ink)", color: "#fff", border: "3px solid var(--orange)" }}>{ticker ? ticker.slice(0, 5) : "NEXT"}</div>
                    Your next launch
                  </div>
                </div>
              </div>
              <LaunchComposer pairKey={pairKey} setPairKey={setPairKey} onTicker={setTicker} />
            </div>
          </div>
        </section>
        <LiveLaunches launches={filtered} loading={feed.loading} configured={feed.configured} query={query} />
        <PairTiles pairKey={pairKey} setPairKey={setPairKey} />
        <FeeForwardBanner />
        <RecentLaunches launches={filtered} />
      </main>
      <Footer />
    </>
  );
}
