// Real price peaks for the positions that could be a "round trip" (up big while held, gave it back).
// DefiLlama's history only covers the biggest tokens and often skips memecoins entirely; without it we
// only know your own buy/sell prices and miss the run-up in between. Here the candidates get actual
// GeckoTerminal candles for the time they were held, and their peaks are recomputed from those.
import type { Position } from "./engine/pnl";
import { computePeak } from "./engine/pnl";
import type { PriceBook, PricePoint } from "./prices/pricebook";
import { fetchJson } from "./infra/http";
import { fetchCandles, GT_NETWORK, topPool, type Candle, type JsonFetcher } from "./gecko";
import { dexPools } from "./prices/pricebook";

const HOUR = 3600, DAY = 86400;
// Free candle history covers ~180 days; GeckoTerminal allows ~30 requests/min.
const MAX_CANDIDATES = Number(process.env.PEAK_CANDIDATES ?? 8);
// A few retries: GeckoTerminal's per-minute limit is shared with the charts, so a 429 usually clears quickly.
const gt: JsonFetcher = (url) => fetchJson("geckoterminal", url, { endpoint: url.includes("/ohlcv/") ? "ohlcv" : "token-pools" }, 4);

/** When the position was last held: now if still held, else its last sell (later dust transfers don't count). */
const heldUntil = (p: Position, now: number) => (p.holding > 0 ? now : p.sells.at(-1)?.ts ?? p.lastTs);

/** Positions where a big run-up could have happened unseen: real money, held an hour or more. */
export function peakCandidates(positions: Map<string, Position>, now: number): Position[] {
  return [...positions.values()]
    .filter((p) => {
      if (!p.buys.length || p.costIn < 20 || p.untracedExit || p.token.address === "native" || !GT_NETWORK[p.chain]) return false;
      const end = heldUntil(p, now);
      return end - p.buys[0].ts >= HOUR && end > now - 179 * DAY;
    })
    .sort((a, b) => b.costIn - a.costIn)
    .slice(0, MAX_CANDIDATES);
}

/** A price book that also returns the candle series fetched here (merged with what it already had). */
function withExtra(pb: PriceBook, extra: Map<string, PricePoint[]>): PriceBook {
  return {
    ...pb,
    series: (k) => {
      const add = extra.get(k);
      return add ? [...pb.series(k), ...add].sort((a, b) => a.ts - b.ts) : pb.series(k);
    },
  };
}

export async function refinePeaks(positions: Map<string, Position>, pb: PriceBook, now: number, stopAt?: number): Promise<PriceBook> {
  const cands = peakCandidates(positions, now);
  if (!cands.length) return pb;
  const extra = new Map<string, PricePoint[]>();
  // GeckoTerminal is rate-limited per IP; the shared throttle spaces these out. A few at once overlap latency.
  // Pools for all candidates in one DexScreener request; GeckoTerminal is only asked for candles.
  const pools = await dexPools(cands.map((p) => p.key)).catch(() => ({} as Record<string, string>));
  const queue = [...cands];
  await Promise.all(Array.from({ length: 3 }, async () => {
    for (let p = queue.shift(); p && !(stopAt && Date.now() > stopAt); p = queue.shift()) {
      try {
        const end = heldUntil(p, now);
        let pool: string | null = pools[p.key] ?? null;
        let { candles } = pool ? await fetchCandles(gt, p.chain, pool, p.token.address, p.buys[0].ts, end, true) : { candles: [] as Candle[] };
        if (!candles.length) {
          // DexScreener had no pool (or GeckoTerminal no candles for it): ask GeckoTerminal for its own.
          const gtPool = await topPool(gt, p.chain, p.token.address);
          if (gtPool && gtPool !== pool) ({ candles } = await fetchCandles(gt, p.chain, (pool = gtPool), p.token.address, p.buys[0].ts, end, true));
        }
        // Candle body tops (not wicks): a one-trade spike shouldn't count as a peak you could have sold at.
        if (candles.length) extra.set(p.key, candles.map((c) => ({ ts: c[0], price: Math.max(c[1], c[4]) })));
      } catch (e) {
        if (process.env.DEBUG_PEAKS) console.error("peak candles failed", p.token.symbol, String(e).slice(0, 120));
      }
    }
  }));
  if (!extra.size) return pb;
  const merged = withExtra(pb, extra);
  for (const p of cands) if (extra.has(p.key)) computePeak(p, merged.series(p.key), now);
  if (process.env.DEBUG_PEAKS) for (const p of cands) if (extra.has(p.key)) {
    const pts = extra.get(p.key)!;
    const top = pts.reduce((m, x) => (x.price > m.price ? x : m), pts[0]);
    console.error("peak", p.token.symbol, "candles", pts.length, "top", top.price, new Date(top.ts * 1000).toISOString().slice(0, 16), "| peakGain", p.peakGain.toFixed(2), "at", new Date(p.peakGainTs * 1000).toISOString().slice(0, 16), "| timeline", p.timeline.length, "openCost", p.timeline.at(-1)?.openCost);
  }
  return merged;
}
