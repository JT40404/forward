import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { getTokenMetadata } from "@solana/spl-token";
import { CollectFeeMode, CpAmm } from "@meteora-ag/cp-amm-sdk";
import { LAUNCHPAD_TAG, RPC_URL, presetSymbol } from "@/lib/config";
import { LIST_KEY, poolKey, redis, type LaunchRecord } from "@/lib/registry";
import { shortAddr } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const connection = () => new Connection(process.env.RPC_URL || RPC_URL, "confirmed");

export async function GET() {
  const db = redis();
  if (!db) return NextResponse.json({ launches: [], configured: false });
  const raw = await db.lrange<LaunchRecord | string>(LIST_KEY, 0, 59);
  const launches = raw.map((r) => (typeof r === "string" ? (JSON.parse(r) as LaunchRecord) : r));
  return NextResponse.json({ launches, configured: true });
}

async function symbolFor(conn: Connection, mint: PublicKey): Promise<string> {
  const preset = presetSymbol(mint.toBase58());
  if (preset) return preset;
  try {
    return (await getTokenMetadata(conn, mint, "confirmed"))?.symbol || shortAddr(mint.toBase58());
  } catch {
    return shortAddr(mint.toBase58());
  }
}

/** Anyone can call this, so everything listed is re-derived from chain, not trusted from the body. */
export async function POST(req: Request) {
  const db = redis();
  if (!db) return NextResponse.json({ ok: false, reason: "feed not configured" });
  try {
    const body = await req.json();
    const pool = new PublicKey(String(body.pool));
    const conn = connection();
    const cpAmm = new CpAmm(conn);
    const state = await cpAmm.fetchPoolState(pool);
    if (state.collectFeeMode !== CollectFeeMode.OnlyB) {
      return NextResponse.json({ error: "Not a FORWARD pool" }, { status: 400 });
    }
    const md = await getTokenMetadata(conn, state.tokenAMint, "confirmed");
    const tagged = md?.additionalMetadata?.some(([k, v]) => k === LAUNCHPAD_TAG.key && v === LAUNCHPAD_TAG.value);
    if (!md || !tagged) return NextResponse.json({ error: "Not a FORWARD coin" }, { status: 400 });

    const isNew = await db.set(poolKey(pool.toBase58()), 1, { nx: true });
    if (!isNew) return NextResponse.json({ ok: true, duplicate: true });

    let image: string | undefined;
    try {
      const ctrl = AbortSignal.timeout(4000);
      const j = await (await fetch(md.uri, { signal: ctrl })).json();
      if (typeof j.image === "string" && /^https:\/\//.test(j.image)) image = j.image;
    } catch {}

    // Only keep forwardedFrom pools that this same creator actually made.
    const forwardedFrom: LaunchRecord["forwardedFrom"] = [];
    const claimed: string[] = Array.isArray(body.forwardedFrom) ? body.forwardedFrom.slice(0, 10) : [];
    for (const p of claimed) {
      try {
        const prev = await cpAmm.fetchPoolState(new PublicKey(p));
        if (prev.creator.equals(state.creator)) {
          forwardedFrom.push({ pool: p, symbol: await symbolFor(conn, prev.tokenAMint) });
        }
      } catch {}
    }

    const record: LaunchRecord = {
      pool: pool.toBase58(),
      mint: state.tokenAMint.toBase58(),
      pairMint: state.tokenBMint.toBase58(),
      pairSymbol: await symbolFor(conn, state.tokenBMint),
      name: md.name,
      symbol: md.symbol,
      image,
      creator: state.creator.toBase58(),
      createdAt: Date.now(),
      forwardedFrom,
    };
    await db.lpush(LIST_KEY, JSON.stringify(record));
    await db.ltrim(LIST_KEY, 0, 499);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid" }, { status: 400 });
  }
}
