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

const HUES = ["#FFD6B8", "#D6DCFF", "#CDEFD9", "#FFF0B3", "#E4D6FF", "#FFD9E0", "#D9F2F7", "#E9F5C9"];
export function hueFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length];
}
