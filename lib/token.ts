import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  AuthorityType,
  ExtensionType,
  LENGTH_SIZE,
  TOKEN_2022_PROGRAM_ID,
  TYPE_SIZE,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  getAssociatedTokenAddressSync,
  getMintLen,
} from "@solana/spl-token";
import {
  createInitializeInstruction,
  createUpdateFieldInstruction,
  pack,
  type TokenMetadata,
} from "@solana/spl-token-metadata";
import BN from "bn.js";
import { LAUNCHPAD_TAG, PLATFORM_FEE, TOKEN_DECIMALS, TOTAL_SUPPLY_UI } from "./config";

export const TOTAL_SUPPLY_BASE = new BN(TOTAL_SUPPLY_UI).mul(new BN(10).pow(new BN(TOKEN_DECIMALS)));

/**
 * One transaction that:
 *  - creates a Token-2022 mint with on-chain metadata (name, symbol, uri, launchpad tag)
 *  - mints the full fixed supply to the creator
 *  - permanently revokes the mint authority (no one can ever mint more)
 *  - never sets a freeze authority
 *  - optionally pays the platform fee
 */
export async function buildCreateTokenTx(
  connection: Connection,
  creator: PublicKey,
  meta: { name: string; symbol: string; uri: string }
): Promise<{ tx: Transaction; mint: Keypair; creatorAta: PublicKey }> {
  const mint = Keypair.generate();

  const metadata: TokenMetadata = {
    mint: mint.publicKey,
    name: meta.name,
    symbol: meta.symbol,
    uri: meta.uri,
    updateAuthority: creator,
    additionalMetadata: [[LAUNCHPAD_TAG.key, LAUNCHPAD_TAG.value]],
  };

  const mintLen = getMintLen([ExtensionType.MetadataPointer]);
  const metadataLen = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen + metadataLen);
  const creatorAta = getAssociatedTokenAddressSync(
    mint.publicKey,
    creator,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: creator,
      newAccountPubkey: mint.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeMetadataPointerInstruction(
      mint.publicKey,
      creator,
      mint.publicKey,
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeMintInstruction(mint.publicKey, TOKEN_DECIMALS, creator, null, TOKEN_2022_PROGRAM_ID),
    createInitializeInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      metadata: mint.publicKey,
      updateAuthority: creator,
      mint: mint.publicKey,
      mintAuthority: creator,
      name: meta.name,
      symbol: meta.symbol,
      uri: meta.uri,
    }),
    createUpdateFieldInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      metadata: mint.publicKey,
      updateAuthority: creator,
      field: LAUNCHPAD_TAG.key,
      value: LAUNCHPAD_TAG.value,
    }),
    createAssociatedTokenAccountIdempotentInstruction(
      creator,
      creatorAta,
      creator,
      mint.publicKey,
      TOKEN_2022_PROGRAM_ID
    ),
    createMintToInstruction(
      mint.publicKey,
      creatorAta,
      creator,
      BigInt(TOTAL_SUPPLY_BASE.toString()),
      [],
      TOKEN_2022_PROGRAM_ID
    ),
    createSetAuthorityInstruction(
      mint.publicKey,
      creator,
      AuthorityType.MintTokens,
      null,
      [],
      TOKEN_2022_PROGRAM_ID
    )
  );

  if (PLATFORM_FEE) {
    tx.add(
      SystemProgram.transfer({
        fromPubkey: creator,
        toPubkey: PLATFORM_FEE.wallet,
        lamports: PLATFORM_FEE.lamports,
      })
    );
  }

  return { tx, mint, creatorAta };
}
