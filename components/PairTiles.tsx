"use client";
import { PAIR_PRESETS } from "@/lib/config";
import { CUSTOM } from "./LaunchComposer";

const COLORS: Record<string, [string, string]> = {
  SOL: ["#1A1D2E", "#FFFFFF"], USDC: ["#D6DCFF", "#1A1D2E"], JUP: ["#CDEFD9", "#1A1D2E"], BONK: ["#FFE0B8", "#1A1D2E"],
  WIF: ["#FFD9E0", "#1A1D2E"], JTO: ["#E4D6FF", "#1A1D2E"], PYTH: ["#D9F2F7", "#1A1D2E"],
};

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
          <p className="sub">Pick a pair to start a launch with it. Any SPL or Token-2022 token works.</p>
        </div>
      </div>
      <div className="tiles">
        {PAIR_PRESETS.map((p) => (
          <button key={p.mint} type="button" className="tile" aria-pressed={pairKey === p.mint} onClick={() => pick(p.mint)}>
            <span className="tile-circle" style={{ background: COLORS[p.symbol]?.[0], color: COLORS[p.symbol]?.[1] }}>{p.symbol}</span>
            {p.name}
          </button>
        ))}
        <button type="button" className="tile" aria-pressed={pairKey === CUSTOM} onClick={() => pick(CUSTOM)}>
          <span className="tile-circle" style={{ background: "#fff", color: "var(--blue)", border: pairKey === CUSTOM ? undefined : "2px dashed var(--blue)", fontSize: 40 }}>+</span>
          Any mint
        </button>
      </div>
    </section>
  );
}
