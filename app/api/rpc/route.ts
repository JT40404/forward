import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * JSON-RPC proxy so the RPC API key (RPC_URL, a Secret) never reaches the browser.
 * Only the methods FORWARD actually uses are allowed, so the endpoint can't be
 * used as a general-purpose free RPC (no getProgramAccounts scans, no airdrops, etc).
 */
const ALLOWED = new Set([
  "getAccountInfo",
  "getMultipleAccounts",
  "getBalance",
  "getLatestBlockhash",
  "getMinimumBalanceForRentExemption",
  "getSignatureStatuses",
  "getTokenAccountsByOwner",
  "getTokenAccountBalance",
  "getTokenSupply",
  "sendTransaction",
  "simulateTransaction",
  "getSlot",
  "getBlockHeight",
  "getBlockTime",
  "getEpochInfo",
  "getFeeForMessage",
  "getRecentPrioritizationFees",
  "isBlockhashValid",
  "getVersion",
  "getGenesisHash",
  "getHealth",
]);
const MAX_BATCH = 20;
const MAX_BODY_BYTES = 64 * 1024;

type RpcReq = { jsonrpc?: string; id?: unknown; method?: unknown };

function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

export async function POST(req: Request) {
  const upstream = process.env.RPC_URL;
  if (!upstream) {
    return NextResponse.json(rpcError(null, -32000, "RPC_URL is not set on the server"), { status: 500 });
  }

  // Block other websites from using this proxy from their visitors' browsers.
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return NextResponse.json(rpcError(null, 403, "Origin not allowed"), { status: 403 });
  }

  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) {
    return NextResponse.json(rpcError(null, -32600, "Request too large"), { status: 413 });
  }

  let body: RpcReq | RpcReq[];
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json(rpcError(null, -32700, "Parse error"), { status: 400 });
  }

  const calls = Array.isArray(body) ? body : [body];
  if (calls.length === 0 || calls.length > MAX_BATCH) {
    return NextResponse.json(rpcError(null, -32600, "Invalid batch size"), { status: 400 });
  }
  for (const c of calls) {
    if (typeof c?.method !== "string" || !ALLOWED.has(c.method)) {
      return NextResponse.json(rpcError(c?.id, -32601, `Method not allowed: ${String(c?.method)}`), { status: 403 });
    }
  }

  const r = await fetch(upstream, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: text,
    cache: "no-store",
  });
  return new NextResponse(await r.text(), {
    status: r.status,
    headers: { "Content-Type": "application/json" },
  });
}
