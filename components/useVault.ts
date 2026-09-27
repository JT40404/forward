"use client";
import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { loadVault, type VaultEntry } from "@/lib/vault";

export function useVault() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!publicKey) {
      setEntries([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setEntries(await loadVault(connection, publicKey));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your vault.");
    } finally {
      setLoading(false);
    }
  }, [connection, publicKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { entries, loading, error, refresh };
}
