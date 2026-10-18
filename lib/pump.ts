import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  ExtensionType,
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  getExtensionData,
  unpackMint,
} from "@solana/spl-token";
import { unpack as unpackTokenMetadata } from "@solana/spl-token-metadata";
import {
  OnlinePumpSdk,
  PUMP_SDK,
  bondingCurvePda,
  getBuyTokenAmountFromSolAmount,
} from "@pump-fun/pump-sdk";
import BN from "bn.js";
import { PLATFORM_FEE, presetSymbol } from "./config";
import { shortAddr } from "./format";
import { resolveToken, type TokenInfo } from "./solana";

export const PUMP_TOTAL_SUPPLY_UI = 1_000_000_000;
export const PUMP_DECIMALS = 6;

export type PumpQuoteOption = { mint: string; symbol: string };

const isSolMint = (m: PublicKey) => m.equals(NATIVE_MINT) || m.equals(PublicKey.default);

/**
 * Every quote token pump.fun's program accepts for a new coin right now (SOL, USDC and
 * the whitelisted custom pairs), read live from chain, with display symbols where
 * the mint carries Token-2022 metadata.
 */
export async function listPumpQuotes(connection: Connection): Promise<PumpQuoteOption[]> {
  const sdk = new OnlinePumpSdk(connection);
  const supported = (await sdk.fetchSupportedQuoteMints()).filter((s) => String(s.source) !== "pumpCoin");
  const mints = supported.map((s) => (isSolMint(s.mint) ? NATIVE_MINT : s.mint));
  const infos = await connection.getMultipleAccountsInfo(mints);
  const out: PumpQuoteOption[] = [];
  mints.forEach((m, i) => {
    const key = m.toBase58();
    let symbol = presetSymbol(key) || "";
    const info = infos[i];
    if (!symbol && info && info.owner.equals(TOKEN_2022_PROGRAM_ID)) {
      try {
        const mint = unpackMint(m, info, TOKEN_2022_PROGRAM_ID);
        const data = getExtensionData(ExtensionType.TokenMetadata, mint.tlvData);
        if (data) symbol = unpackTokenMetadata(data).symbol;
      } catch {}
    }
    if (!out.some((o) => o.mint === key)) out.push({ mint: key, symbol: symbol || shortAddr(key) });
  });
  return out;
}

async function feeContext(connection: Connection) {
  const sdk = new OnlinePumpSdk(connection);
  const [global, feeConfig, quoteControl] = await Promise.all([
    sdk.fetchGlobal(),
    sdk.fetchFeeConfig(),
    sdk.fetchQuoteControl(),
  ]);
  return { sdk, global, feeConfig, quoteControl };
}

/** Coins the creator receives for a dev buy of `quoteAmount` on a brand-new curve. */
export async function estimateDevBuy(
  connection: Connection,
  quote: TokenInfo,
  quoteAmount: BN
): Promise<BN> {
  if (quoteAmount.lten(0)) return new BN(0);
  const { global, feeConfig, quoteControl } = await feeContext(connection);
  return getBuyTokenAmountFromSolAmount({
    global,
    feeConfig,
    mintSupply: null,
    bondingCurve: null,
    amount: quoteAmount,
    quoteMint: isSolMint(quote.mint) ? NATIVE_MINT : quote.mint,
    quoteControl,
  });
}

/**
 * Creates a pump.fun coin (create_v2, Token-2022) and, if `quoteAmount` > 0, makes the
 * creator's first buy in the same transaction, so nobody can buy before the creator.
 */
export async function buildPumpCreateTx(
  connection: Connection,
  creator: PublicKey,
  args: { name: string; symbol: string; uri: string; quote: TokenInfo; quoteAmount: BN }
): Promise<{ tx: Transaction; mint: Keypair; bondingCurve: PublicKey }> {
  const mint = Keypair.generate();
  const sol = isSolMint(args.quote.mint);
  const base = {
    mint: mint.publicKey,
    name: args.name,
    symbol: args.symbol,
    uri: args.uri,
    creator,
    user: creator,
    mayhemMode: false,
  };

  let ixs;
  if (args.quoteAmount.lten(0)) {
    ixs = [
      await PUMP_SDK.createV2Instruction({
        ...base,
        ...(sol ? {} : { quoteMint: args.quote.mint, quoteTokenProgram: args.quote.programId }),
      }),
    ];
  } else {
    const { global, feeConfig, quoteControl } = await feeContext(connection);
    const out = getBuyTokenAmountFromSolAmount({
      global,
      feeConfig,
      mintSupply: null,
      bondingCurve: null,
      amount: args.quoteAmount,
      quoteMint: sol ? NATIVE_MINT : args.quote.mint,
      quoteControl,
    });
    // Ask for 0.5% fewer coins than quoted so rounding can never push the cost over the cap.
    const amount = out.muln(995).divn(1000);
    ixs = sol
      ? await PUMP_SDK.createV2AndBuyInstructions({ ...base, global, amount, solAmount: args.quoteAmount })
      : await PUMP_SDK.createV2AndBuyV2Instructions({
          ...base,
          global,
          amount,
          quoteAmount: args.quoteAmount,
          quoteMint: args.quote.mint,
          quoteTokenProgram: args.quote.programId,
          slippage: 1,
        });
  }

  const tx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: sol ? 350_000 : 500_000 }),
    ...ixs
  );
  if (PLATFORM_FEE) {
    tx.add(SystemProgram.transfer({ fromPubkey: creator, toPubkey: PLATFORM_FEE.wallet, lamports: PLATFORM_FEE.lamports }));
  }
  return { tx, mint, bondingCurve: bondingCurvePda(mint.publicKey) };
}

export type PumpVaultEntry = {
  kind: "pump";
  key: string;
  label: string;
  pair: TokenInfo;
  unclaimed: BN;
};

/** Creator fees waiting in pump.fun's creator vaults (all of this wallet's pump coins), per quote token. */
export async function loadPumpVault(connection: Connection, creator: PublicKey): Promise<PumpVaultEntry[]> {
  const sdk = new OnlinePumpSdk(connection);
  let balances;
  try {
    balances = await sdk.getCreatorVaultQuoteBalances(creator);
  } catch {
    return [];
  }
  const out: PumpVaultEntry[] = [];
  for (const b of balances) {
    if (!b.total.gtn(0)) continue;
    const mint = isSolMint(b.mint) ? NATIVE_MINT : b.mint;
    const pair = await resolveToken(connection, mint);
    out.push({ kind: "pump", key: `pump:${mint.toBase58()}`, label: "pump.fun creator fees", pair, unclaimed: b.total });
  }
  return out;
}

export async function buildPumpClaimTx(
  connection: Connection,
  creator: PublicKey,
  entry: PumpVaultEntry
): Promise<Transaction> {
  const sdk = new OnlinePumpSdk(connection);
  if (isSolMint(entry.pair.mint)) {
    return new Transaction().add(...(await sdk.collectCoinCreatorFeeInstructions(creator)));
  }
  const ata = getAssociatedTokenAddressSync(entry.pair.mint, creator, false, entry.pair.programId);
  return new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(creator, ata, creator, entry.pair.mint, entry.pair.programId),
    ...(await sdk.collectCoinCreatorFeeV2Instructions(creator, entry.pair.mint, entry.pair.programId))
  );
}
