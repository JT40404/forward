import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const PINATA_V3 = "https://uploads.pinata.cloud/v3/files";
const PINATA_LEGACY = "https://api.pinata.cloud/pinning/pinFileToIPFS";

/** Accepts the JWT with or without a "Bearer " prefix, quotes or stray whitespace. */
function pinataJwt(): string {
  return String(process.env.PINATA_JWT || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^Bearer\s+/i, "")
    .trim();
}

function gatewayUrl(cid: string): string {
  const gw = (process.env.PINATA_GATEWAY || "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return gw ? `https://${gw}/ipfs/${cid}` : `https://gateway.pinata.cloud/ipfs/${cid}`;
}

function explainPinata(status: number, body: string): string {
  if (status === 401) return "Pinata rejected the key (401). PINATA_JWT is wrong or expired: paste the JWT, not the API key or secret.";
  if (status === 403) return "Pinata key doesn't have upload permission (403). Create a new key with Admin access, or enable file uploads on it.";
  if (status === 429) return "Pinata rate limit hit (429). Wait a minute and try again.";
  if (/plan|limit|quota|storage/i.test(body)) return `Pinata account limit reached (${status}). Check your plan's storage and file count.`;
  return `Pinata upload failed (${status})${body ? `: ${body.slice(0, 160)}` : ""}`;
}

/** Tries Pinata's current v3 upload API, then the legacy pinning API (works with older keys). */
async function pin(file: Blob, name: string): Promise<string> {
  const jwt = pinataJwt();
  const v3 = new FormData();
  v3.set("file", file, name);
  v3.set("network", "public");
  const r1 = await fetch(PINATA_V3, { method: "POST", headers: { Authorization: `Bearer ${jwt}` }, body: v3 });
  const t1 = await r1.text();
  if (r1.ok) {
    const cid = JSON.parse(t1)?.data?.cid;
    if (cid) return cid;
  }

  const legacy = new FormData();
  legacy.set("file", file, name);
  legacy.set("pinataMetadata", JSON.stringify({ name }));
  const r2 = await fetch(PINATA_LEGACY, { method: "POST", headers: { Authorization: `Bearer ${jwt}` }, body: legacy });
  const t2 = await r2.text();
  if (r2.ok) {
    const cid = JSON.parse(t2)?.IpfsHash;
    if (cid) return cid;
  }
  console.error("Pinata v3:", r1.status, t1.slice(0, 300), "| legacy:", r2.status, t2.slice(0, 300));
  // Report whichever failure is more informative (an auth error beats a generic one).
  const [status, body] = [401, 403, 429].includes(r1.status) ? [r1.status, t1] : [r2.status, t2];
  throw new Error(explainPinata(status, body));
}

/** GET /api/upload checks the Pinata key without uploading anything. */
export async function GET() {
  if (!pinataJwt()) return NextResponse.json({ ok: false, error: "PINATA_JWT is not set on the server." }, { status: 500 });
  const r = await fetch("https://api.pinata.cloud/data/testAuthentication", {
    headers: { Authorization: `Bearer ${pinataJwt()}` },
    cache: "no-store",
  });
  const body = await r.text();
  return NextResponse.json(
    r.ok ? { ok: true, message: "Pinata key works." } : { ok: false, error: explainPinata(r.status, body) },
    { status: r.ok ? 200 : 500 }
  );
}

const clip = (v: FormDataEntryValue | null, n: number) => String(v ?? "").trim().slice(0, n);

export async function POST(req: Request) {
  if (!pinataJwt()) {
    return NextResponse.json({ error: "Uploads aren't configured. Set PINATA_JWT." }, { status: 500 });
  }
  try {
    const form = await req.formData();
    const image = form.get("image");
    const name = clip(form.get("name"), 32);
    const symbol = clip(form.get("symbol"), 10).toUpperCase();
    if (!name || !symbol) return NextResponse.json({ error: "Name and ticker are required." }, { status: 400 });
    if (!(image instanceof Blob) || !image.type.startsWith("image/")) {
      return NextResponse.json({ error: "Add a PNG, JPG, GIF or WebP image." }, { status: 400 });
    }
    if (image.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Image must be 2 MB or smaller." }, { status: 400 });
    }

    const ext = image.type.split("/")[1] || "png";
    const imageCid = await pin(image, `${symbol}.${ext}`);

    const website = clip(form.get("website"), 200);
    const twitter = clip(form.get("twitter"), 200);
    const telegram = clip(form.get("telegram"), 200);
    const json = {
      name,
      symbol,
      description: clip(form.get("description"), 1000),
      image: gatewayUrl(imageCid),
      ...(website && { website }),
      ...(twitter && { twitter }),
      ...(telegram && { telegram }),
      extensions: { website, twitter, telegram },
      createdOn: "FORWARD",
    };
    const metaCid = await pin(new Blob([JSON.stringify(json)], { type: "application/json" }), `${symbol}.json`);
    return NextResponse.json({ uri: gatewayUrl(metaCid), image: json.image });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed." }, { status: 500 });
  }
}
