"use client";
import { PAIR_PRESETS } from "@/lib/config";
import { CUSTOM } from "./LaunchComposer";

export default function PairTiles({ pairKey, setPairKey }: { pairKey: string; setPairKey: (k: string) => void }) {
  const pick = (k: string) => {
    setPairKey(k);
    document.getElementById("launch")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <section id="pairs" className="wrap section" aria-labelledby="pairs-title">
      <div className="row-head">
        <div>
          <h2 className="h-section" id="pairs-title">Pair with anything</h2>
          <p className="sub">Pick a pair to start a launch with it. Meteora pools take any SPL or Token-2022 token; pump.fun supports its own list.</p>
        </div>
      </div>
      <div className="tiles">
        {PAIR_PRESETS.map((p) => (
          <button key={p.mint} type="button" className="tile" aria-pressed={pairKey === p.mint} onClick={() => pick(p.mint)}>
            <span className="tile-circle">{p.symbol}</span>
            {p.name}
          </button>
        ))}
        <button type="button" className="tile any" aria-pressed={pairKey === CUSTOM} onClick={() => pick(CUSTOM)}>
          <span className="tile-circle">+</span>
          Any mint
        </button>
      </div>
    </section>
  );
}
