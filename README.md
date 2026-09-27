# FORWARD

Launch Solana coins paired with **any** SPL or Token-2022 token, and roll the fees each launch earns into the next one.

## How it works

Nothing custom is deployed on-chain. FORWARD composes audited, already-deployed programs, and every transaction is signed in the creator's own wallet.

| Step | What happens | Program |
| --- | --- | --- |
| Metadata | Image + JSON pinned to IPFS through `/api/upload` | Pinata |
| Create coin | Token-2022 mint with on-chain metadata, 1B supply minted to the creator, **mint authority revoked**, no freeze authority | Token-2022 |
| Open pool | Customizable pool: coin = token A, **any mint** = token B, fees collected **only in token B**, anti-snipe fee schedule, optional permanent LP lock | Meteora DAMM v2 (`cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG`) |
| Fee Forward | Claim token-B fees from the creator's earlier FORWARD pools → swap into the new pair if different → add to the new pool's liquidity | DAMM v2 + Jupiter |
| Feed | Server re-reads the pool and coin metadata from chain before listing it | Upstash Redis |

Because fees are collected only in the pair token, forwarding never requires selling your own previous coin.

A coin counts as a FORWARD coin when its Token-2022 metadata carries `launchpad = FORWARD`. The vault and the feed both check this tag.

## Deploy

1. **Push to GitHub**
   ```bash
   git init && git add . && git commit -m "FORWARD"
   git branch -M main
   git remote add origin https://github.com/YOU/forward.git
   git push -u origin main
   ```
2. **Import into Vercel**: vercel.com → Add New → Project → pick the repo. Framework: Next.js (auto-detected).
3. **Add storage**: in the Vercel project go to Storage → Marketplace → Upstash (Redis). It injects the `KV_REST_API_URL` / `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_*`) variables automatically.
4. **Set environment variables** (Settings → Environment Variables). See `.env.example`. You need at least:
   - `RPC_URL` (**Secret**): a paid mainnet RPC with its key (Helius, Triton, QuickNode). It stays on the server: the browser calls `/api/rpc` on your own site, which forwards only the methods FORWARD uses.
   - `PINATA_JWT` and optionally `PINATA_GATEWAY`.
   - `JUPITER_API_KEY` (optional, higher rate limits).
   - `NEXT_PUBLIC_PLATFORM_FEE_WALLET` + `NEXT_PUBLIC_PLATFORM_FEE_SOL` if you want to charge per launch.
5. **Deploy**. Every push to `main` redeploys.

Locally:
```bash
cp .env.example .env.local   # fill it in
npm install
npm run dev
```

## Test on devnet first

Set `NEXT_PUBLIC_CLUSTER=devnet` and `RPC_URL` to a devnet RPC (e.g. your Helius devnet URL). DAMM v2 uses the same program ID on devnet.

Launching, claiming and same-pair Fee Forward all work on devnet. Cross-pair Fee Forward needs Jupiter, which is mainnet only, so do one small mainnet launch before announcing.

Suggested checklist:
1. Launch a coin paired with SOL. Confirm on Solscan: supply 1,000,000,000, mint authority none, freeze authority none.
2. Buy and sell a little of it from a second wallet, then check the fees in `/vault`.
3. Launch a second coin paired with SOL using Fee Forward. Confirm the claim, then the pool.
4. On mainnet, launch a coin paired with USDC while forwarding SOL fees (exercises the Jupiter swap).
5. Launch against a Token-2022 pair token and a custom pasted mint.

## Configuration notes

- **Anti-snipe fees**: `NEXT_PUBLIC_POOL_*` controls the exponential fee decay (default 50% → 1% over 5 minutes). The ending fee is the permanent trading fee creators earn from, minus Meteora's protocol share.
- **Supply in pool**: whatever percent the creator doesn't deposit stays in their wallet. Showing this clearly to buyers is on you.
- **Liquidity lock**: on by default. Locked DAMM v2 positions still collect fees, so Fee Forward keeps working.
- **Pair tokens with transfer hooks** are rejected by DAMM v2 unless Meteora has whitelisted them. Pairs with a Token-2022 transfer fee work, but the fee is taken on deposit.

## Before you go live

- This code hasn't had a security audit. The on-chain programs it calls have been audited by their teams; this frontend and its API routes have not.
- `/api/rpc` spends your RPC credits. It only allows the methods the app needs and rejects other websites, but add a Vercel Firewall rate-limit rule on `/api/rpc` and set a usage cap in your RPC dashboard.
- `/api/upload` is public. Add rate limiting (e.g. Vercel Firewall or `@upstash/ratelimit`) so no one burns through your Pinata quota.
- Running a token launchpad can carry legal and regulatory obligations depending on where you and your users are. Get advice from a lawyer for your jurisdiction.
