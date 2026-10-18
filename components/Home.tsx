"use client";
import { useMemo, useState } from "react";
import { PAIR_PRESETS } from "@/lib/config";
import type { Venue } from "@/lib/launch";
import { usePumpQuotes } from "./usePumpQuotes";
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
  const [venue, setVenue] = useState<Venue>("meteora");
  const pump = usePumpQuotes();
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
              <div className="banner">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/banner.webp" alt="FORWARD" width={1024} height={338} />
              </div>
              <div className="hero-copy">
                <h1 id="hero-title">Launch a coin against <em>any</em> Solana token.</h1>
                <p>Open a Meteora pool against SOL, USDC or any mint, or launch on pump.fun&apos;s bonding curve. Then carry the fees your last launch earned straight into the next one.</p>
                <div className="relay" aria-hidden="true">
                  <div className="relay-node"><div className="coin prev">LAST</div>Last launch</div>
                  <div className="relay-link"><span className="pill-glow">Fees it earned</span><DashArrow /></div>
                  <div className="relay-node">
                    <div className="coin next">{ticker ? ticker.slice(0, 5) : "NEXT"}</div>
                    Your next launch
                  </div>
                </div>
              </div>
              <LaunchComposer venue={venue} setVenue={setVenue} pairKey={pairKey} setPairKey={setPairKey} onTicker={setTicker} pumpQuotes={pump.quotes} pumpQuotesError={pump.error} />
            </div>
          </div>
        </section>
        <LiveLaunches launches={filtered} loading={feed.loading} configured={feed.configured} query={query} />
        <PairTiles
          pairKey={pairKey}
          setPairKey={(k) => {
            // Any-token pairs are a Meteora feature; switch over unless pump.fun supports this one.
            if (venue === "pump" && !pump.quotes.some((q) => q.mint === k)) setVenue("meteora");
            setPairKey(k);
          }}
        />
        <FeeForwardBanner />
        <RecentLaunches launches={filtered} />
      </main>
      <Footer />
    </>
  );
}
