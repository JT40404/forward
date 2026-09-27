"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { getTokenMetadata } from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import BN from "bn.js";
import { CLUSTER, LAUNCHPAD_TAG, PAIR_PRESETS, PLATFORM_FEE, TOTAL_SUPPLY_UI } from "@/lib/config";
import { fromBaseUnits, isMintAddress, toBaseUnits } from "@/lib/format";
import { resolveToken, type TokenInfo } from "@/lib/solana";
import { runLaunch, type LaunchProgress, type StepUpdate } from "@/lib/launch";
import { explainError } from "@/lib/send";
import { useVault } from "./useVault";
import { Check } from "./Icons";

export const CUSTOM = "custom";
const q = CLUSTER === "devnet" ? "?cluster=devnet" : "";

export default function LaunchComposer({
  pairKey,
  setPairKey,
  onTicker,
}: {
  pairKey: string;
  setPairKey: (k: string) => void;
  onTicker: (t: string) => void;
}) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { setVisible } = useWalletModal();
  const vault = useVault();

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [customMint, setCustomMint] = useState("");
  const [seed, setSeed] = useState("1");
  const [poolPercent, setPoolPercent] = useState("100");
  const [lock, setLock] = useState(true);
  const [forward, setForward] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [pair, setPair] = useState<TokenInfo | null>(null);
  const [pairError, setPairError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<StepUpdate[]>([]);
  const [result, setResult] = useState<LaunchProgress | null>(null);
  const progress = useRef<LaunchProgress>({});
  const [resumed, setResumed] = useState("");

  const storageKey = wallet.publicKey ? `forward:pending:${wallet.publicKey.toBase58()}` : "";
  const save = () => {
    if (!storageKey) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ progress: progress.current, name, symbol, pairKey, customMint, seed, poolPercent, lock })
      );
    } catch {}
  };
  const clearSaved = () => {
    try { if (storageKey) localStorage.removeItem(storageKey); } catch {}
  };

  // Restore an unfinished launch after a reload, or resume a coin via ?resume=<mint>.
  useEffect(() => {
    if (!storageKey || !wallet.publicKey) return;
    let cancel = false;
    (async () => {
      const param = new URLSearchParams(window.location.search).get("resume");
      if (param && isMintAddress(param)) {
        try {
          const md = await getTokenMetadata(connection, new PublicKey(param), "confirmed");
          const tagged = md?.additionalMetadata?.some(([k, v]) => k === LAUNCHPAD_TAG.key && v === LAUNCHPAD_TAG.value);
          if (!md || !tagged) throw new Error("That mint isn't a FORWARD coin.");
          if (!md.updateAuthority?.equals(wallet.publicKey!)) throw new Error("That coin was created by a different wallet.");
          if (cancel) return;
          progress.current = { uri: md.uri, mint: param };
          setName(md.name);
          setSymbol(md.symbol);
          onTicker(md.symbol);
          setResumed(md.symbol);
        } catch (e) {
          if (!cancel) setError(explainError(e));
        }
        return;
      }
      try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return;
        const d = JSON.parse(raw);
        if (!d?.progress?.mint || d.progress.pool) return;
        progress.current = d.progress;
        setName(d.name || "");
        setSymbol(d.symbol || "");
        onTicker(d.symbol || "");
        if (d.pairKey) setPairKey(d.pairKey);
        setCustomMint(d.customMint || "");
        setSeed(d.seed || "1");
        setPoolPercent(d.poolPercent || "100");
        setLock(d.lock !== false);
        setResumed(d.symbol || "your coin");
      } catch {}
    })();
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const pairMint = pairKey === CUSTOM ? customMint.trim() : pairKey;

  // Resolve the pair token (program, decimals, symbol) whenever it changes.
  useEffect(() => {
    let cancel = false;
    setPair(null);
    setPairError("");
    if (!isMintAddress(pairMint)) {
      if (pairKey === CUSTOM && customMint) setPairError("That doesn't look like a Solana mint address.");
      return;
    }
    const t = setTimeout(async () => {
      try {
        const info = await resolveToken(connection, new PublicKey(pairMint));
        if (!cancel) setPair(info);
      } catch (e) {
        if (!cancel) setPairError(explainError(e));
      }
    }, 250);
    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [pairMint, pairKey, customMint, connection]);

  // Pre-select every previous launch that has fees waiting.
  useEffect(() => {
    setSelected(new Set(vault.entries.filter((e) => e.unclaimed.gtn(0)).map((e) => e.pool.toBase58())));
  }, [vault.entries]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const forwardEntries = useMemo(
    () => (forward ? vault.entries.filter((e) => selected.has(e.pool.toBase58()) && e.unclaimed.gtn(0)) : []),
    [forward, vault.entries, selected]
  );
  const samePairForward = useMemo(() => {
    if (!pair) return new BN(0);
    return forwardEntries.filter((e) => e.pair.mint.equals(pair.mint)).reduce((a, e) => a.add(e.unclaimed), new BN(0));
  }, [forwardEntries, pair]);
  const needsSwap = forwardEntries.some((e) => pair && !e.pair.mint.equals(pair.mint));

  const seedBase = useMemo(() => {
    try { return pair ? toBaseUnits(seed || "0", pair.decimals) : null; } catch { return null; }
  }, [seed, pair]);
  const pct = Math.min(100, Math.max(1, Number(poolPercent) || 0));
  const startMcap = useMemo(() => {
    if (!pair || !seedBase) return "";
    const pairUi = Number(fromBaseUnits(seedBase.add(samePairForward), pair.decimals));
    if (!pairUi) return "";
    const mcap = (pairUi / (TOTAL_SUPPLY_UI * (pct / 100))) * TOTAL_SUPPLY_UI;
    return `${mcap.toLocaleString(undefined, { maximumSignificantDigits: 4 })} ${pair.symbol}`;
  }, [pair, seedBase, samePairForward, pct]);

  function onImage(f: File | null) {
    setImage(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f ? URL.createObjectURL(f) : "");
  }

  const step = (s: StepUpdate) => {
    if (s.state === "done") save();
    setSteps((prev) => {
      const i = prev.findIndex((p) => p.id === s.id);
      if (i === -1) return [...prev, s];
      const next = prev.slice();
      next[i] = s;
      return next;
    });
  };

  async function launch() {
    setError("");
    if (!wallet.publicKey) return setVisible(true);
    if (!name.trim() || !symbol.trim()) return setError("Add a coin name and ticker.");
    if (!image && !progress.current.uri) return setError("Add an image for your coin.");
    if (!pair) return setError(pairError || "Pick a token to pair with.");
    if (!seedBase) return setError("Enter your starting liquidity as a number.");
    if (seedBase.isZero() && forwardEntries.length === 0) return setError("Add starting liquidity or forward fees from a previous launch.");
    if (CLUSTER !== "mainnet-beta" && needsSwap) return setError("Swapping forwarded fees into a different pair only works on mainnet.");

    setBusy(true);
    setSteps((s) => s.map((x) => (x.state === "error" ? { ...x, state: "active" } : x)));
    try {
      const done = await runLaunch(
        connection,
        wallet,
        {
          name: name.trim(),
          symbol: symbol.trim().toUpperCase(),
          description: description.trim(),
          website: website.trim(),
          twitter: twitter.trim(),
          telegram: telegram.trim(),
          image: image as File,
          pair,
          seed: seedBase,
          poolPercent: pct,
          lockLiquidity: lock,
          forwardFrom: forwardEntries,
        },
        progress.current,
        step
      );
      setResult({ ...done });
      clearSaved();
      setResumed("");
      vault.refresh();
    } catch (e) {
      setSteps((s) => s.map((x) => (x.state === "active" ? { ...x, state: "error" } : x)));
      save();
      setError(explainError(e) + (progress.current.mint ? " Your progress is saved, so Try again picks up where it stopped." : ""));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    progress.current = {};
    clearSaved();
    setResumed("");
    if (window.location.search.includes("resume=")) window.history.replaceState(null, "", window.location.pathname);
    setResult(null);
    setSteps([]);
    setName(""); setSymbol(""); setDescription(""); setWebsite(""); setTwitter(""); setTelegram("");
    onImage(null);
    onTicker("");
  }

  if (result?.pool && result.mint && pair) {
    return (
      <div className="card" role="status">
        <div className="success-icon"><Check color="#1E7B3A" size={28} /></div>
        <h2>${symbol.toUpperCase()} is live</h2>
        <p style={{ margin: 0, lineHeight: 1.5, color: "var(--ink-2)" }}>
          The ${symbol.toUpperCase()} / {pair.symbol} pool is open. Trading fees collect in {pair.symbol} and show up in your creator vault, ready to forward into your next launch.
        </p>
        <div className="field">
          <span className="label">Coin mint</span>
          <span className="mono">{result.mint}</span>
        </div>
        <div className="links">
          <a href={`https://jup.ag/swap/${pair.mint.toBase58()}-${result.mint}`} target="_blank" rel="noreferrer">Trade on Jupiter</a>
          <a href={`https://solscan.io/token/${result.mint}${q}`} target="_blank" rel="noreferrer">Coin on Solscan</a>
          <a href={`https://solscan.io/account/${result.pool}${q}`} target="_blank" rel="noreferrer">Pool on Solscan</a>
        </div>
        <button type="button" className="btn btn-ghost" onClick={reset}>Start another launch</button>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>{resumed ? `Finish launching $${resumed}` : "New launch"}</h2>
      {resumed && (
        <div className="forward-box on" role="status">
          <span style={{ fontSize: 14, lineHeight: 1.5 }}>
            ${resumed} is already created and in your wallet. Pressing the button below picks up where the launch stopped and opens its pool.
          </span>
          <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={reset} disabled={busy}>
            Discard and start a new coin
          </button>
        </div>
      )}

      <div className="grid-2">
        <div className="field">
          <label htmlFor="coin-name">Coin name</label>
          <input id="coin-name" className="input" maxLength={32} value={name} onChange={(e) => setName(e.target.value)} placeholder="Mothlight" disabled={busy || !!progress.current.mint} />
        </div>
        <div className="field">
          <label htmlFor="coin-ticker">Ticker</label>
          <input
            id="coin-ticker"
            className="input"
            value={symbol}
            onChange={(e) => {
              const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
              setSymbol(v);
              onTicker(v);
            }}
            placeholder="MOTH"
            disabled={busy || !!progress.current.mint}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="coin-image">Image</label>
        <div className="upload">
          {preview ? <img src={preview} alt="" className="upload-preview" /> : <span className="upload-preview">None</span>}
          <input id="coin-image" type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={(e) => onImage(e.target.files?.[0] ?? null)} disabled={busy || !!progress.current.uri} />
        </div>
        <span className="hint">PNG, JPG, GIF or WebP, up to 2 MB. Square works best.</span>
      </div>

      <details className="more">
        <summary>Description and links (optional)</summary>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="field">
            <label htmlFor="coin-desc">Description</label>
            <textarea id="coin-desc" className="input" maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid-3">
            <div className="field"><label htmlFor="w">Website</label><input id="w" className="input" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" /></div>
            <div className="field"><label htmlFor="x">X</label><input id="x" className="input" value={twitter} onChange={(e) => setTwitter(e.target.value)} placeholder="https://x.com/…" /></div>
            <div className="field"><label htmlFor="tg">Telegram</label><input id="tg" className="input" value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="https://t.me/…" /></div>
          </div>
        </div>
      </details>

      <div className="field">
        <span className="label" id="pair-label">Pair it with</span>
        <div className="chips" role="group" aria-labelledby="pair-label">
          {PAIR_PRESETS.slice(0, 6).map((p) => (
            <button key={p.mint} type="button" className="chip" aria-pressed={pairKey === p.mint} onClick={() => setPairKey(p.mint)} disabled={busy || !!progress.current.claimed}>
              {p.symbol}
            </button>
          ))}
          <button type="button" className="chip" aria-pressed={pairKey === CUSTOM} onClick={() => setPairKey(CUSTOM)} disabled={busy || !!progress.current.claimed}>
            Any mint
          </button>
        </div>
        {pairKey === CUSTOM && (
          <input aria-label="Pair token mint address" className="input" style={{ marginTop: 6 }} value={customMint} onChange={(e) => setCustomMint(e.target.value.trim())} placeholder="Paste any SPL or Token-2022 mint" disabled={busy} />
        )}
        {pairError && <span className="error" style={{ fontSize: 13 }}>{pairError}</span>}
        {pair && pairKey === CUSTOM && <span className="hint">Pairing with {pair.symbol} ({pair.decimals} decimals)</span>}
      </div>

      <div className="grid-2">
        <div className="field">
          <label htmlFor="seed">Starting liquidity{pair ? ` (${pair.symbol})` : ""}</label>
          <input id="seed" className="input" inputMode="decimal" value={seed} onChange={(e) => setSeed(e.target.value.replace(/[^0-9.]/g, ""))} disabled={busy} />
        </div>
        <div className="field">
          <label htmlFor="pct">Supply in pool (%)</label>
          <input id="pct" className="input" inputMode="numeric" value={poolPercent} onChange={(e) => setPoolPercent(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))} disabled={busy} />
        </div>
      </div>

      <div className={`forward-box${forward ? " on" : ""}`}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>Fee Forward</span>
            <span className="hint" style={{ fontSize: 13 }}>
              {!wallet.publicKey
                ? "Connect a wallet to see fees from your earlier launches."
                : vault.loading
                ? "Checking your earlier launches…"
                : vault.entries.length === 0
                ? "No earlier FORWARD launches found for this wallet yet."
                : "Add fees your earlier launches earned to this pool."}
            </span>
          </div>
          <button type="button" role="switch" aria-checked={forward} aria-label="Fee Forward" className="switch" onClick={() => setForward(!forward)} disabled={busy}>
            <span />
          </button>
        </div>
        {forward && vault.entries.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {vault.entries.map((e) => {
              const k = e.pool.toBase58();
              const has = e.unclaimed.gtn(0);
              return (
                <div className="vault-row" key={k}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selected.has(k)}
                      disabled={!has || busy}
                      onChange={(ev) => {
                        const s = new Set(selected);
                        ev.target.checked ? s.add(k) : s.delete(k);
                        setSelected(s);
                      }}
                    />
                    ${e.coinSymbol}
                  </label>
                  <span>{has ? `${fromBaseUnits(e.unclaimed, e.pair.decimals)} ${e.pair.symbol}` : "No fees yet"}</span>
                </div>
              );
            })}
            {needsSwap && pair && <span className="hint">Fees earned in other tokens are swapped into {pair.symbol} through Jupiter before the pool opens (1% max slippage).</span>}
          </div>
        )}
      </div>

      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, cursor: "pointer" }}>
        <input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} style={{ width: 18, height: 18, marginTop: 1 }} disabled={busy} />
        <span>
          <b style={{ fontWeight: 600 }}>Lock liquidity permanently</b>
          <span className="hint" style={{ display: "block" }}>Buyers can see the pool can&apos;t be pulled. You still collect trading fees.</span>
        </span>
      </label>

      <div className="summary">
        <div><span>Pool</span><b>${symbol || "TICKER"} / {pair?.symbol || "…"}</b></div>
        <div><span>From your wallet</span><span>{seed || "0"} {pair?.symbol}</span></div>
        <div>
          <span>Forwarded fees</span>
          <span style={{ color: forwardEntries.length ? "var(--orange-ink)" : undefined, fontWeight: forwardEntries.length ? 600 : 400 }}>
            {!forwardEntries.length ? "None" : `${pair ? fromBaseUnits(samePairForward, pair.decimals) : "0"} ${pair?.symbol ?? ""}${needsSwap ? " + swapped fees" : ""}`}
          </span>
        </div>
        {startMcap && <div><span>Starting market cap</span><span>{startMcap}</span></div>}
        {PLATFORM_FEE && <div><span>Launch fee</span><span>{PLATFORM_FEE.lamports / 1e9} SOL</span></div>}
      </div>

      {steps.length > 0 && (
        <ol className="steps" aria-live="polite">
          {steps.map((s) => (
            <li key={s.id}>
              <span className={`mark ${s.state}`}>{s.state === "done" && <Check />}</span>
              <span>{s.label}</span>
            </li>
          ))}
        </ol>
      )}

      {error && <p className="error" role="alert">{error}</p>}

      <button type="button" className="btn btn-ink" style={{ height: 52, fontSize: 17 }} onClick={launch} disabled={busy}>
        {!wallet.publicKey ? "Connect wallet to launch" : busy ? "Launching…" : progress.current.mint ? "Try again" : "Launch coin"}
      </button>
      <span className="hint">You&apos;ll approve 2 transactions in your wallet, plus 1 per launch you forward fees from and 1 per swap. Keep about 0.1 SOL for rent and network fees.</span>
    </div>
  );
}
