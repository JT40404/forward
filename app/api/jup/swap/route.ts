import { NextResponse } from "next/server";
import { jupBase } from "@/lib/jupiterServer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { quoteResponse, userPublicKey } = await req.json();
  if (!quoteResponse || typeof userPublicKey !== "string") {
    return NextResponse.json({ error: "quoteResponse and userPublicKey are required" }, { status: 400 });
  }
  const { url, headers } = jupBase();
  const r = await fetch(`${url}/swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: { maxLamports: 1_000_000, priorityLevel: "high" },
      },
    }),
    cache: "no-store",
  });
  const j = await r.json().catch(() => ({ error: "Bad response from Jupiter" }));
  return NextResponse.json(j, { status: r.status });
}
