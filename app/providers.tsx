"use client";
import { Buffer } from "buffer";
import { useMemo, type ReactNode } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { RPC_URL } from "@/lib/config";
import "@solana/wallet-adapter-react-ui/styles.css";

if (typeof window !== "undefined" && !(window as any).Buffer) (window as any).Buffer = Buffer;

export default function Providers({ children }: { children: ReactNode }) {
  // Empty list: Phantom, Solflare, Backpack and other Wallet Standard wallets are detected automatically.
  const wallets = useMemo(() => [], []);
  return (
    <ConnectionProvider endpoint={RPC_URL} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
