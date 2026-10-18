import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { getTokenMetadata } from "@solana/spl-token";
import { CollectFeeMode, CpAmm } from "@meteora-ag/cp-amm-sdk";
import { PUMP_SDK, bondingCurvePda } from "@pump-fun/pump-sdk";
import { NATIVE_MINT } from "@solana/spl-token";
import { LAUNCHPAD_TAG, presetSymbol } from "@/lib/config";
import { LIST_KEY, poolKey, redis, type LaunchRecord } from "@/lib/registry";
import { shortAddr } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const connection = () => {
  if (!process.env.RPC_URL) throw new Error("RPC_URL is not set on the server");
  return new Connection(process.env.RPC_URL, "confirmed");
};

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

async function imageFrom(uri: string): Promise<{ image?: string; createdOn?: string }> {
  try {
    const j = await (await fetch(uri, { signal: AbortSignal.timeout(4000) })).json();
    return {
      image: typeof j.image === "string" && /^https:\/\//.test(j.image) ? j.image : undefined,
      createdOn: typeof j.createdOn === "string" ? j.createdOn : undefined,
    };
  } catch {
    return {};
  }
}

/** pump.fun coins can't carry our on-chain tag, so they're verified by their bonding curve plus our metadata JSON. */
async function registerPump(db: NonNullable<ReturnType<typeof redis>>, body: any) {
  const conn = connection();
  const mint = new PublicKey(String(body.mint));
  const curvePda = bondingCurvePda(mint);
  const info = await conn.getAccountInfo(curvePda);
  const curve = info ? PUMP_SDK.decodeBondingCurveNullable(info) : null;
  if (!curve) return NextResponse.json({ error: "Not a pump.fun coin" }, { status: 400 });
  const md = await getTokenMetadata(conn, mint, "confirmed");
  if (!md) return NextResponse.json({ error: "No metadata" }, { status: 400 });
  const meta = await imageFrom(md.uri);
  if (meta.createdOn !== "FORWARD") return NextResponse.json({ error: "Not launched through FORWARD" }, { status: 400 });

  const isNew = await db.set(poolKey(curvePda.toBase58()), 1, { nx: true });
  if (!isNew) return NextResponse.json({ ok: true, duplicate: true });

  const quote = curve.quoteMint.equals(PublicKey.default) ? NATIVE_MINT : curve.quoteMint;
  const record: LaunchRecord = {
    venue: "pump",
    pool: curvePda.toBase58(),
    mint: mint.toBase58(),
    pairMint: quote.toBase58(),
    pairSymbol: await symbolFor(conn, quote),
    name: md.name,
    symbol: md.symbol,
    image: meta.image,
    creator: curve.creator.toBase58(),
    createdAt: Date.now(),
    forwardedFrom: await verifiedForwards(conn, curve.creator, body),
  };
  await db.lpush(LIST_KEY, JSON.stringify(record));
  await db.ltrim(LIST_KEY, 0, 499);
  return NextResponse.json({ ok: true });
}

/** Only keeps forwarded-from Meteora pools that this same creator made, plus a pump.fun marker. */
async function verifiedForwards(conn: Connection, creator: PublicKey, body: any): Promise<LaunchRecord["forwardedFrom"]> {
  const out: LaunchRecord["forwardedFrom"] = [];
  const cpAmm = new CpAmm(conn);
  const claimed: string[] = Array.isArray(body.forwardedFrom) ? body.forwardedFrom.slice(0, 10) : [];
  for (const p of claimed) {
    try {
      const prev = await cpAmm.fetchPoolState(new PublicKey(p));
      if (prev.creator.equals(creator)) out.push({ pool: p, symbol: await symbolFor(conn, prev.tokenAMint) });
    } catch {}
  }
  if (body.forwardedFromPump === true) out.push({ pool: "", symbol: "PUMP FEES" });
  return out;
}

/** Anyone can call this, so everything listed is re-derived from chain, not trusted from the body. */
export async function POST(req: Request) {
  const db = redis();
  if (!db) return NextResponse.json({ ok: false, reason: "feed not configured" });
  try {
    const body = await req.json();
    if (body.venue === "pump") return await registerPump(db, body);
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

    const { image } = await imageFrom(md.uri);
    const forwardedFrom = await verifiedForwards(conn, state.creator, body);

    const record: LaunchRecord = {
      venue: "meteora",
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
