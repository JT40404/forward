"use client";
import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { listPumpQuotes, type PumpQuoteOption } from "@/lib/pump";

/** pump.fun's live list of supported quote tokens, loaded once. */
export function usePumpQuotes() {
  const { connection } = useConnection();
  const [quotes, setQuotes] = useState<PumpQuoteOption[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    listPumpQuotes(connection)
      .then((q) => alive && setQuotes(q))
      .catch(() => alive && setError("Couldn't load pump.fun's supported pairs. SOL still works."));
    return () => { alive = false; };
  }, [connection]);
  return { quotes, error };
}
