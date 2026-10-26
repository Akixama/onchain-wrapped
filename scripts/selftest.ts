// Offline test of the engine: synthetic events + fake prices, checked against hand-computed answers.
//   npm run selftest
import assert from "node:assert/strict";
import type { ChainId, Leg, TokenRef, UnifiedEvent } from "../src/lib/core/types";
import type { PriceBook, PricePoint } from "../src/lib/prices/pricebook";
import { enrichEvents } from "../src/lib/core/enrich";
import { filterSpam } from "../src/lib/core/spam";
import { mergeIdentity } from "../src/lib/core/identity";
import { runPnl } from "../src/lib/engine/pnl";
import { computeStats } from "../src/lib/engine/stats";

const DAY = 86400;
const T0 = Math.floor(Date.now() / 1000) - 200 * DAY;
const d = (n: number) => T0 + n * DAY;

const A = "So1ana11111111111111111111111111111111111aaa";
const A2 = "So1ana22222222222222222222222222222222222bbb";
const E = "0x1111111111111111111111111111111111111111";

const tok = (chain: ChainId, address: string, symbol: string): TokenRef => ({ chain, address, symbol });
const SOL = tok("solana", "native", "SOL");
const USDC_BASE = tok("base", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", "USDC");
const USDC_ARB = tok("arbitrum", "0xaf88d065e77c8cc2239327c5edb3a432268e5831", "USDC");
const USDC_SOL = tok("solana", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "USDC");
const USDC_MAIN = tok("ethereum", "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", "USDC");
const ETH_MAIN = tok("ethereum", "native", "ETH");
const ETH_BASE = tok("base", "native", "ETH");
const X = tok("solana", "XmintXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX", "XCAT");
const Y = tok("solana", "YmintYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY", "YDOG");
const Z = tok("solana", "ZmintZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ", "RUGME");
const D = tok("base", "0xdddddddddddddddddddddddddddddddddddddddd", "DIAMOND");
const JUP = tok("solana", "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", "JUP");
const SPAM = { ...tok("solana", "SpamSpamSpamSpamSpamSpamSpamSpamSpamSpam11", "VISIT"), name: "Claim at reward-drop.com" };

const leg = (token: TokenRef, amount: number, counterparty?: string): Leg => ({ token, amount, usd: null, counterparty });
let n = 0;
const ev = (wallet: string, chain: ChainId, ts: number, type: UnifiedEvent["type"], ins: Leg[], outs: Leg[]): UnifiedEvent => ({
  id: `${chain}:tx${++n}:${wallet}`, wallet, chain, timestamp: ts, txHash: `tx${n}`, type, in: ins, out: outs,
  gasUsd: null, gasNative: chain === "solana" ? 0.0001 : 0.0002,
});

const events: UnifiedEvent[] = [
  // XCAT: buy 1M for 10 SOL ($1500), sell all day 3 for $2000 -> +500. Later pumps to 0.01 -> paper hands $8000.
  ev(A, "solana", d(0), "swap", [leg(X, 1_000_000)], [leg(SOL, 10)]),
  ev(A, "solana", d(3), "swap", [leg(SOL, 2000 / 150)], [leg(X, 1_000_000)]),
  // YDOG: buy 100k for $1000, move to own wallet A2 (NOT a sell), sell from A2 day 60 for $1050. Peak gain ~$4000 -> round trip.
  ev(A, "solana", d(30), "swap", [leg(Y, 100_000)], [leg(SOL, 1000 / 150)]),
  ev(A, "solana", d(35), "transfer_out", [], [leg(Y, 100_000, A2)]),
  ev(A2, "solana", d(35), "transfer_in", [leg(Y, 100_000, A)], []),
  ev(A2, "solana", d(60), "swap", [leg(SOL, 1050 / 150)], [leg(Y, 100_000)]),
  // RUGME: $500 in, no price anywhere now -> rug.
  ev(A, "solana", d(50), "swap", [leg(Z, 5_000_000)], [leg(SOL, 500 / 150)]),
  // DIAMOND on Base: 2000 USDC -> 1000 tokens day 10, still held, now $6 -> +$4000 unrealized.
  ev(E, "base", d(10), "swap", [leg(D, 1000)], [leg(USDC_BASE, 2000)]),
  // Bridge: ETH mainnet -> Base, 20 minutes apart, same wallet.
  ev(E, "ethereum", d(70), "transfer_out", [], [leg(ETH_MAIN, 1 / 3)]),
  ev(E, "base", d(70) + 1200, "transfer_in", [leg(ETH_BASE, 0.33 / 1)], []),
  // Hyperliquid deposit from Arbitrum (we can't see inside HL yet, but it's a journey hop).
  ev(E, "arbitrum", d(85), "transfer_out", [], [leg(USDC_ARB, 500, "0x2df1c51e09aecf9cacb7bc98cb1742757f163df7")]),
  // Cross-family bridge: Base wallet E -> Solana wallet A via Mayan, 10 minutes later.
  { ...ev(E, "base", d(90), "bridge_out", [], [leg(USDC_BASE, 1000)]), protocol: "mayan" },
  ev(A, "solana", d(90) + 600, "transfer_in", [leg(USDC_SOL, 995)], []),
  // CoW Swap settlement on Ethereum that looks like an inflow: must NOT pair with the Arbitrum deposit.
  { ...ev(E, "ethereum", d(85) + 300, "transfer_in", [leg(USDC_MAIN, 499)], []), protocol: "cow-swap" },
  // Airdrop + spam
  ev(A, "solana", d(80), "airdrop", [leg(JUP, 300)], []),
  ev(A, "solana", d(81), "transfer_in", [leg(SPAM, 1_000_000)], []),
];
events.find((e) => e.in[0]?.token === JUP)!.in[0].usd = 300;

const flat = (p: number): PricePoint[] => [{ ts: d(-1), price: p }, { ts: d(200), price: p }];
const series: Record<string, PricePoint[]> = {
  [`solana:${X.address}`]: [{ ts: d(0), price: 0.0015 }, { ts: d(3), price: 0.002 }, { ts: d(10), price: 0.01 }, { ts: d(20), price: 0.004 }],
  [`solana:${Y.address}`]: [{ ts: d(30), price: 0.01 }, { ts: d(40), price: 0.05 }, { ts: d(60), price: 0.0105 }],
};
const pb: PriceBook = {
  majorAt: (m) => ({ SOL: 150, ETH: 3000, BNB: 600, POL: 0.5, USD: 1 })[m],
  majorNow: (m) => ({ SOL: 200, ETH: 3500, BNB: 600, POL: 0.5, USD: 1 })[m],
  series: (k) => series[k] ?? [],
  current: (k) => ({ [`solana:${X.address}`]: 0.004, [`solana:${Y.address}`]: 0.003, [`base:${D.address}`]: 6, [`solana:${JUP.address}`]: 1 })[k],
  liquidity: () => undefined,
};
void flat;

enrichEvents(events, pb);
const spamFiltered = filterSpam(events, (k) => pb.current(k));
const { bridges } = mergeIdentity(events, [A, A2, E]);
const positions = runPnl(events, pb);
const stats = computeStats({ wallets: [A, A2, E], timeframe: "12m", fromTs: T0, events, positions, bridges, pb, truncated: false, txCap: 5000, spamFiltered });

const near = (a: number, b: number, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);
const pos = (t: TokenRef) => positions.get(`${t.chain}:${t.address}`)!;

near(pos(X).realized, 500);
near(pos(Y).realized, 50);
near(pos(Z).pnl, -500);
near(pos(D).unrealized, 4000);
assert.equal(spamFiltered, 1, "spam token removed");
assert.equal(stats.overview.totalTrades, 6, "own transfer is not a trade");
assert.equal(stats.bestTrade?.symbol, "DIAMOND");
assert.equal(stats.worstTrade?.symbol, "RUGME");
assert.equal(stats.roundTrip?.symbol, "YDOG");
near(stats.roundTrip!.peakGainUsd, 4000);
assert.equal(stats.paperHands?.symbol, "XCAT");
near(stats.paperHands!.missedUsd, 8000);
assert.equal(stats.diamondHands?.symbol, "DIAMOND");
assert.deepEqual(stats.bridges.journey, ["ethereum", "base", "solana", "arbitrum", "hyperliquid"]);
assert.equal(stats.bridges.hops.length, 3, "ETH->Base, Arb->HL, Base->Solana; CoW settlement not a bridge");
assert.ok(!events.find((e) => e.protocol === "cow-swap")!.ownTransfer, "CoW inflow stays a normal transfer");
assert.equal(stats.rugs.count, 1);
assert.equal(stats.airdrops.count, 1);
near(stats.pnl.totalUsd, 500 + 50 - 500 + 4000); // airdrops are their own card, not trading PnL
near(stats.airdrops.valueUsd, 300);
// Held SOL instead: $3000 of Solana buys x (200/150 - 1) + $2000 Base buy x (3500/3000 - 1)
near(stats.counterfactual.holdPnlUsd, 1000 + 2000 / 6);
// Reconciliation: chain says RUGME balance is 0 (left via a bot/delegate we can't see) -> not a dead bag.
const reconciled = runPnl(events, pb, { actualBalances: new Map([[`solana:${Z.address}`, 0], [`solana:${JUP.address}`, 300]]) });
near(reconciled.get(`solana:${Z.address}`)!.pnl, 0);
near(reconciled.get(`solana:${Z.address}`)!.untracedExit!, 5_000_000);
near(reconciled.get(`solana:${JUP.address}`)!.holding, 300); // matches reality: untouched
console.log(JSON.stringify(stats, null, 2));
console.log("\nselftest passed ✔");
