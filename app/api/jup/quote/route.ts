import { NextResponse } from "next/server";
import { jupBase } from "@/lib/jupiterServer";

export const runtime = "nodejs";
const ALLOWED = ["inputMint", "outputMint", "amount", "slippageBps", "maxAccounts"];

export async function GET(req: Request) {
  const src = new URL(req.url).searchParams;
  const qs = new URLSearchParams();
  for (const k of ALLOWED) {
    const v = src.get(k);
    if (v) qs.set(k, v);
  }
  const { url, headers } = jupBase();
  const r = await fetch(`${url}/quote?${qs}`, { headers, cache: "no-store" });
  const j = await r.json().catch(() => ({ error: "Bad response from Jupiter" }));
  return NextResponse.json(j, { status: r.status });
}
