import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const PINATA_UPLOAD = "https://uploads.pinata.cloud/v3/files";

function gatewayUrl(cid: string): string {
  const gw = process.env.PINATA_GATEWAY;
  return gw ? `https://${gw.replace(/^https?:\/\//, "")}/ipfs/${cid}` : `https://gateway.pinata.cloud/ipfs/${cid}`;
}

async function pin(file: Blob, name: string): Promise<string> {
  const fd = new FormData();
  fd.set("file", file, name);
  fd.set("network", "public");
  const r = await fetch(PINATA_UPLOAD, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.PINATA_JWT}` },
    body: fd,
  });
  const j = await r.json().catch(() => ({}));
  const cid = j?.data?.cid;
  if (!r.ok || !cid) throw new Error(`Pinata upload failed (${r.status})`);
  return cid;
}

const clip = (v: FormDataEntryValue | null, n: number) => String(v ?? "").trim().slice(0, n);

export async function POST(req: Request) {
  if (!process.env.PINATA_JWT) {
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
