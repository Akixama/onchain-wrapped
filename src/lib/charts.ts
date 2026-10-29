// Prepares the trade cards for charts. Fast by design:
// - every trade card gets your fills, the chart window and the token's on-chain supply (market cap);
// - candles themselves load in the viewer's browser (see TradeChart) — except for Paper hands,
//   whose claim ("it ran after you sold") we verify here against real candles before showing it.
import type { TradeCard, WrappedStats } from "./engine/stats";
import type { Position } from "./engine/pnl";
import { fetchJson } from "./infra/http";
import { chartWindow, fetchCandles, topPool, GT_NETWORK, type JsonFetcher } from "./gecko";
import { tokenSupply } from "./supply";
import type { PriceBook } from "./prices/pricebook";

const DAY = 86400;
// Server-side GeckoTerminal calls: one quick retry at most, never the long backoff.
const gt: JsonFetcher = (url) => fetchJson("geckoterminal", url, { endpoint: url.includes("/ohlcv/") ? "ohlcv" : "token-pools" }, 1);

export async function addTradeCharts(s: WrappedStats, positions: Map<string, Position>, pb: PriceBook, onNote?: (n: string) => void) {
  const now = Math.floor(Date.now() / 1000);
  const cards: { card: TradeCard; to: number }[] = [];
  for (const c of [s.bestTrade, s.worstTrade, s.roundTrip, s.diamondHands]) if (c) cards.push({ card: c, to: c.holdingValueUsd > 0 ? now : c.lastTs });
  const paperTries = [s.paperHands, ...(s.paperHandsAlts ?? [])].filter((x): x is NonNullable<typeof x> => !!x);
  delete s.paperHandsAlts;
  for (const ph of paperTries) cards.push({ card: ph, to: Math.min(now, ph.soldTs + 90 * DAY) });

  const supplies = new Map<string, Promise<number | null>>();
  await Promise.all(cards.map(async ({ card: c, to }) => {
    const p = positions.get(`${c.chain}:${c.address}`);
    c.fills = [
      ...(p?.buys ?? []).map((f) => ({ t: f.ts, side: "buy" as const, price: f.price, usd: f.usd, sig: f.sig })),
      ...(p?.sells ?? []).map((f) => ({ t: f.ts, side: "sell" as const, price: f.price, usd: f.usd, sig: f.sig })),
    ].sort((a, b) => a.t - b.t).slice(-60);
    if (c.chain === "solana") c.solUsd = pb.majorAt("SOL", c.firstTs) ?? undefined;
    // Free candle data only covers ~180 days; older charts fall back to your own fills.
    c.window = { ...chartWindow(c.firstTs, to, now), tooOld: to < now - 179 * DAY };
    const key = `${c.chain}:${c.address}`;
    if (!supplies.has(key)) supplies.set(key, tokenSupply(c.chain, c.address, p?.token.decimals));
    c.supply = await supplies.get(key)!;
    // Peak while held can't be below your own best fill (a price you actually got).
    const fillMax = Math.max(0, ...c.fills.map((f) => f.price));
    if (fillMax > c.peakPrice) c.peakPrice = fillMax;
  }));

  // Paper hands: check the top few candidates against real candles and keep the biggest confirmed
  // one (checking only the first made the card depend on which coin happened to rank first).
  if (!paperTries.length) return;
  let unchecked = false;
  const results = await Promise.all(paperTries.map(async (ph) => {
    if (!GT_NETWORK[ph.chain] || ph.address === "native") return ph; // can't check: keep the estimate
    try {
      const pool = await topPool(gt, ph.chain, ph.address);
      if (!pool || !ph.window) return ph;
      const { candles, interval } = await fetchCandles(gt, ph.chain, pool, ph.address, ph.window.start, ph.window.end);
      if (candles.length < 3) return ph;
      ph.chart = { candles, interval, supply: ph.supply ?? null };
      const later = Math.max(0, ...candles.filter((c) => c[0] > ph.soldTs && c[0] <= ph.soldTs + 90 * DAY).map((c) => c[4]));
      if (later <= ph.soldAt * 1.5) return null; // real candles show no meaningful run after the sale
      const soldAmount = ph.missedUsd / Math.max(1e-18, ph.laterPeak - ph.soldAt);
      ph.laterPeak = later;
      ph.missedUsd = Math.round(soldAmount * (later - ph.soldAt) * 100) / 100;
      return ph;
    } catch {
      unchecked = true;
      return ph;
    }
  }));
  const kept = results.filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => b.missedUsd - a.missedUsd);
  s.paperHands = kept[0] ?? null;
  if (unchecked && s.paperHands && !s.paperHands.chart) onNote?.("Paper hands is estimated from DefiLlama prices (chart data was unavailable).");
}
