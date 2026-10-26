# Onchain Wrapped: plan

## Providers (checked Oct 2026)
| Need | Pick | Free tier | Why |
|---|---|---|---|
| Solana | **Helius** Enhanced Transactions | 1M credits/mo, 100 credits per 100-tx page (~1M txs/mo), 2 req/s | Pre-parsed swaps, net balance changes per account |
| EVM (6 chains) | **Zerion** `/wallets/{addr}/transactions` | 2,000 req/day, 3 req/s | ONE call covers all EVM chains, decoded `trade` ops, USD value at tx time on every transfer, server-side spam flag |
| History prices | DefiLlama (`/chart`, `/prices/current`) | free, no key | SOL/ETH/BNB/POL daily series + token coverage |
| Current price / liquidity | provider → DefiLlama → DexScreener | free, no key | DexScreener covers fresh memecoins + rug detection |

Rejected: **Moralis** (per-chain calls, so 6x the requests; CU cost of wallet history unclear). **GoldRush/Covalent** (no permanent free tier anymore, 14-day trial only).

Bottleneck: Zerion free = ~2,000 pages/day ≈ 100–400 EVM lookups/day. If it goes viral, Builder plan is $149/mo (250K req) — **ask first**.

## Folder structure
```
src/lib/core/      types.ts (unified event), assets.ts (majors/stables), enrich.ts (USD fill),
                   spam.ts, identity.ts (own-wallet + bridge detection)
src/lib/chains/    one adapter per provider + registry.ts  ← add Hyperliquid/Tron/BTC here
src/lib/prices/    pricebook.ts (DefiLlama + DexScreener)
src/lib/engine/    pnl.ts (FIFO), stats.ts (all card data)
src/lib/infra/     http.ts (throttle/retry), usage.ts (API cost log)  [+ cache, rate limit in Phase 4]
src/lib/pipeline.ts  fetch → normalize → price → spam → identity → PnL → stats
src/app/           Next.js UI, /api/wrapped jobs, /w/[id] public pages, OG images  [Phase 3]
scripts/           wrapped.ts (CLI → JSON), selftest.ts (offline engine test)
```

## Unified event
```ts
{ id, wallet, chain, timestamp, txHash,
  type: swap|transfer_in|transfer_out|bridge_in|bridge_out|airdrop|mint|other,
  in: Leg[], out: Leg[],          // Leg = { token, amount, usd, counterparty }
  gasUsd, gasNative, protocol, spam?, ownTransfer? }
```
Legs instead of single tokenIn/tokenOut so multi-token txs (LP, refunds, multi-hop) don't lose data.

## Phases
1. **Engine (now):** Solana + EVM end to end → stats JSON. Needs your two free API keys to test on real wallets.
2. Multi-wallet merge, own-transfer + bridge detection (already drafted in identity.ts), ENS / .sol names, tune on real wallets.
3. Story UI (framer-motion), cards, OG images, `/w/[id]` pages.
4. Cache (Upstash Redis free tier or Cloudflare KV), per-IP rate limit, roast mode, deploy.

## Phase 1 findings (real wallets, Oct 26 2026)
- Helius key returns 403 Forbidden on every call; Solana currently runs through Zerion (`SOLANA_PROVIDER=zerion`).
- Zerion reads Solana too, so one provider can cover everything if Helius stays blocked (costs Zerion quota).
- A 1,000-tx cap covers 2 weeks (Gucci) to 12 months (Tetranode). Heavy Solana traders need ~10–25k txs for a full year.
- Each lookup ≈ 1 Zerion call per 100 txs + ~35 free DefiLlama/DexScreener calls, ~45–65s.
- Fixed on real data: DefiLlama 500-point cap, $0 prices overwriting provider values, unknown-cost transfers counted as losses,
  stablecoins/staked ETH counted as memecoin positions, counterfactual math, rugs split into "caught" vs "dodged".
- For the UI: the same token can win several cards (APESTR = worst + round trip + paper hands); pick distinct tokens per card.
  DeFi-style wallets (Tetranode) have no memecoin cards; hide empty cards.

## Phase 2 status (Oct 26 2026)
Done:
- ENS + .sol/.sns names (`core/resolve.ts`). `.sol` maps to `.sns` (Bonfida paused direct .sol lookups); up to 6 wallets per lookup.
- Multi-wallet merge tested on Cented + 2 sibling wallets: 873 own transfers excluded.
- Capped multi-wallet runs analyse only the window every wallet fully covers.
- Bridges: Hyperliquid deposits/withdrawals (Arbitrum Bridge2) are journey hops; unlabeled matches are strict (≤1h, ≤3% fee, no DEX).
- Solana gap-fill from public RPC when Zerion lags; balance check marks tokens that left untraced as "moved", not dead bags.
- One token can't take every card; `cards` lists the story cards worth showing; rugs = caught vs dodged.
- Local cache of raw provider results (12h); Zerion quota-exhausted errors fail fast with a reset time.

Learned:
- Zerion key is on the **demo** tier: 1 req/s, 300 req/day (≈ 10–30 lookups/day), not the 2,000/day Developer plan.
- Solana lists token-account-only activity (receives into existing accounts, bot/delegate moves) under the token account,
  not the wallet. Only Helius with `token-accounts=balanceChanged` sees it. Big wallet clusters (Cented: 6+ wallets) need it.
- Helius key still returns 403.

## Phase 3 status (Oct 26 2026)
Done:
- Landing page (`/`): multi-wallet chip input, ENS/.sol, 12-month / all-time toggle, demo wallets.
- `POST /api/wrapped` starts a background job (`after()`), reuses identical lookups for 24h; `GET /api/wrapped/[id]` for polling.
- Loading sequence with live stage + tx count; friendly errors (bad input, daily quota hit).
- Story player `/w/[id]` and `/w/[id]/[card]`: tap/swipe/hold/keyboard, autoplay, progress bars, URL follows the card.
- 16 card types; only cards with something to say are shown. NGN toggle on the gas card; sleep chart in viewer's timezone.
- Share sheet per card: Post on X, copy link, save image, native share. Share images at `/api/og/[id]/[card]` (1200×630).
- `npm run seed` rebuilds demo results from `out/` with the current engine (no Zerion calls).

Before deploying (Phase 4):
- `src/lib/store.ts` writes local files (`.data/`). Vercel/Cloudflare disks are temporary: swap for a hosted KV (e.g. Upstash Redis free tier).
- Set `NEXT_PUBLIC_SITE_URL` so share links and X previews use the real domain.

## Phase 4 status (Oct 26 2026)
Done (tested locally; Redis path not yet tested, needs Upstash keys):
- Storage: Upstash Redis over REST when `UPSTASH_REDIS_REST_*` (or Vercel's `KV_REST_API_*`) is set, local files otherwise.
  Results kept 90 days, demos forever; ~50 store commands per lookup (free tier: 500K/month).
- Limits: 5 new lookups/IP/hour, 15/IP/day, 25/day for everyone (sized to the Zerion demo quota), 20 requests/IP/minute.
  Reused results are free. IPs are hashed, never stored.
- Usage dashboard: `/api/admin/usage?key=ADMIN_KEY` (lookups + API calls per provider per day, incl. 429s).
- Percentile card: shown once 30+ lookups exist.
- Roast card: Claude (`claude-opus-5-5`, low effort, refusal fallback on) when `ANTHROPIC_API_KEY` is set; free built-in roasts otherwise.
- Default tx cap lowered to 2,000 per wallet; polling and progress writes slowed to save store commands.
- Production build passes; Vercel config (`outputFileTracingIncludes` for fonts, `.vercelignore`).

LIVE (Oct 26 2026): https://onchain-wrapped-psi.vercel.app — Vercel project `onchain-wrapped` (account akixama),
Upstash Redis `onchain-wrapped` (free tier, us-east-1, eviction on). Demos seeded. Redeploy: `vercel deploy --prod`
from `wrapped/` (Vercel CLI installed at %TEMP%\vcli because the project path is too long for npm scripts on Windows).
Not yet verified live: a successful brand-new lookup (Zerion demo quota was exhausted at deploy time).

Deploy checklist:
1. Upstash: create a free Redis database → copy REST URL + token.
2. Vercel: `npx vercel login` (or a token from vercel.com/account/tokens).
3. `npx vercel deploy --prod`, then add env vars from `.env.example` (SOLANA_PROVIDER=zerion while Helius is blocked).
4. Set `NEXT_PUBLIC_SITE_URL` to the live URL, redeploy.
5. Run `npm run seed` locally with the Upstash vars set, to load the demo wallets into production.

## Cut / deferred for speed
- NFTs ignored (fungible tokens only).
- Peak prices use DefiLlama daily data for the top 25 tokens + observed trade prices. No candle data for obscure memecoins (GeckoTerminal fallback cut).
- Sleep schedule computed in UTC; UI shifts to the viewer's timezone.
- Percentile rank needs a results DB → Phase 4.
- Airdrop detection = explicit claim/airdrop txs only.
- "Connect wallet" button: pasting works for everyone; connecting needs wallet libraries for both Solana and EVM. Add after launch.
- Percentile card stays hidden until Phase 4 has a results database to rank against.
- Story video/GIF export: share images only for now.
