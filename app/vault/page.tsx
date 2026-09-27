"use client";
import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useVault } from "@/components/useVault";
import { buildClaimTx, type VaultEntry } from "@/lib/vault";
import { explainError, sendAndConfirm } from "@/lib/send";
import { fromBaseUnits } from "@/lib/format";
import { CLUSTER } from "@/lib/config";

export default function VaultPage() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { setVisible } = useWalletModal();
  const { entries, loading, error, refresh } = useVault();
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  async function claim(e: VaultEntry) {
    if (!wallet.publicKey) return;
    setBusy(e.pool.toBase58());
    setMsg("");
    try {
      await sendAndConfirm(connection, wallet, await buildClaimTx(connection, wallet.publicKey, e));
      setMsg(`Claimed ${fromBaseUnits(e.unclaimed, e.pair.decimals)} ${e.pair.symbol} from $${e.coinSymbol}.`);
      await refresh();
    } catch (err) {
      setMsg(explainError(err));
    } finally {
      setBusy("");
    }
  }

  const q = CLUSTER === "devnet" ? "?cluster=devnet" : "";

  return (
    <>
      <Header />
      <main className="wrap section" style={{ marginTop: 40 }}>
        <div className="row-head">
          <div>
            <h1 className="h-section" style={{ fontSize: 40 }}>Creator vault</h1>
            <p className="sub">Trading fees your FORWARD launches have earned. Claim them to your wallet, or forward them from the launch form.</p>
          </div>
          {wallet.publicKey && <button type="button" className="btn btn-ghost btn-sm" onClick={refresh} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>}
        </div>

        {!wallet.publicKey ? (
          <div className="empty">
            <b>Connect the wallet you launch with.</b>
            <button type="button" className="btn btn-ink" onClick={() => setVisible(true)}>Connect wallet</button>
          </div>
        ) : error ? (
          <p className="error" role="alert">{error}</p>
        ) : loading && entries.length === 0 ? (
          <div className="empty">Checking your launches…</div>
        ) : entries.length === 0 ? (
          <div className="empty">
            <b>No FORWARD launches for this wallet yet.</b>
            <a href="/#launch" className="btn btn-ink">Launch a coin</a>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="vtable">
              <thead>
                <tr><th>Coin</th><th>Pair</th><th>Unclaimed fees</th><th>Pool</th><th><span className="sr-only">Action</span></th></tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.pool.toBase58()}>
                    <td><b>${e.coinSymbol}</b></td>
                    <td>{e.pair.symbol}</td>
                    <td>{fromBaseUnits(e.unclaimed, e.pair.decimals)} {e.pair.symbol}</td>
                    <td><a href={`https://solscan.io/account/${e.pool.toBase58()}${q}`} target="_blank" rel="noreferrer">View</a></td>
                    <td style={{ textAlign: "right" }}>
                      <button type="button" className="btn btn-ink btn-sm" disabled={!e.unclaimed.gtn(0) || !!busy} onClick={() => claim(e)}>
                        {busy === e.pool.toBase58() ? "Claiming…" : "Claim to wallet"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {msg && <p role="status" style={{ marginTop: 16 }}>{msg}</p>}
      </main>
      <Footer />
    </>
  );
}
