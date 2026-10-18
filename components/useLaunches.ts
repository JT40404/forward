"use client";
import { useEffect, useState } from "react";
import type { LaunchRecord } from "@/lib/registry";

export function useLaunches() {
  const [launches, setLaunches] = useState<LaunchRecord[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/launches", { cache: "no-store" });
        const j = await r.json();
        if (!alive) return;
        setLaunches(j.launches || []);
        setConfigured(j.configured !== false);
      } catch {}
      if (alive) setLoading(false);
    };
    load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return { launches, configured, loading };
}

export function matches(l: LaunchRecord, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return [l.name, l.symbol, l.mint, l.pairSymbol].some((v) => v.toLowerCase().includes(s));
}

/** Dark, teal-family card backgrounds for coins without an image. */
const HUES = [
  "radial-gradient(circle at 30% 20%, #0e5f5d, #041213 70%)",
  "radial-gradient(circle at 70% 25%, #0b4a63, #030d12 70%)",
  "radial-gradient(circle at 40% 30%, #11605a, #031110 70%)",
  "radial-gradient(circle at 60% 20%, #1b4f6b, #040c12 70%)",
  "radial-gradient(circle at 30% 35%, #0f6a6f, #020c0d 70%)",
  "radial-gradient(circle at 65% 30%, #22545f, #050d10 70%)",
  "radial-gradient(circle at 45% 20%, #0c5450, #020a0a 70%)",
  "radial-gradient(circle at 55% 35%, #164a58, #030a0e 70%)",
];
export function hueFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length];
}
