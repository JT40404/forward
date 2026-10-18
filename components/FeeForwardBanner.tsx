import Link from "next/link";

export default function FeeForwardBanner() {
  return (
    <section id="fee-forward" className="wrap section" aria-labelledby="ff-title">
      <div className="ff">
        <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "flex-start" }}>
          <h2 id="ff-title">Every launch can fund the next one.</h2>
          <p>Each FORWARD pool pays its trading fees to you in the pair token. Turn on Fee Forward and those fees seed your next pool, so you put in less of your own capital each time.</p>
          <Link href="/#launch" className="btn btn-ink" style={{ marginTop: 6 }}>Start a launch</Link>
        </div>
        <ol>
          <li><span className="n">1</span><b>Launch your coin</b><span className="d">Pair it with SOL, a stablecoin, or any token you choose.</span></li>
          <li><span className="n">2</span><b>Fees build up</b><span className="d">Your share of every trade collects in the pair token. Track it in your creator vault.</span></li>
          <li><span className="n">3</span><b>Forward or withdraw</b><span className="d">Flip Fee Forward on your next launch to seed its pool, or claim the fees to your wallet.</span></li>
        </ol>
      </div>
    </section>
  );
}
