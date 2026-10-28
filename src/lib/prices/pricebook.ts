import { maxOf, minOf } from "../core/num";
import type { ChainId, UnifiedEvent } from "../core/types";
import { tokenKey } from "../core/types";
import { MAJOR_LLAMA_ID, NATIVE, type Major, isMoney, majorOf } from "../core/assets";
import { fetchJson } from "../infra/http";

export interface PricePoint { ts: number; price: number }

/** Everything the engines need to know about prices. Built once per run; fakeable in tests. */
export interface PriceBook {
  majorAt(m: Major, ts: number): number | null;
  majorNow(m: Major): number | null;
  /** Daily-ish historical series for a token (may be empty for obscure memecoins). */
  series(key: string): PricePoint[];
  /** Current price; 0 = dead coin, undefined = unknown (treated as 0 by PnL). */
  current(key: string): number | undefined;
  /** Best pool liquidity in USD, when known (rug detection). */
  liquidity(key: string): number | undefined;
}

const LLAMA_CHAIN: Record<ChainId, string> = {
  solana: "solana",
  ethereum: "ethereum",
  base: "base",
  arbitrum: "arbitrum",
  bsc: "bsc",
  polygon: "polygon",
  optimism: "optimism",
};
const DEXSCREENER_CHAIN: Record<ChainId, string> = {
  solana: "solana",
  ethereum: "ethereum",
  base: "base",
  arbitrum: "arbitrum",
  bsc: "bsc",
  polygon: "polygon",
  optimism: "optimism",
};

const llamaId = (key: string) => {
  const [chain, addr] = key.split(":") as [ChainId, string];
  return `${LLAMA_CHAIN[chain]}:${addr}`;
};

function interp(series: PricePoint[], ts: number): number | null {
  if (!series.length) return null;
  if (ts <= series[0].ts) return series[0].price;
  if (ts >= series[series.length - 1].ts) return series[series.length - 1].price;
  let lo = 0, hi = series.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (series[mid].ts <= ts) lo = mid; else hi = mid;
  }
  const a = series[lo], b = series[hi];
  return a.price + ((b.price - a.price) * (ts - a.ts)) / (b.ts - a.ts || 1);
}

async function llamaChart(ids: string[], startTs: number): Promise<Record<string, PricePoint[]>> {
  const out: Record<string, PricePoint[]> = {};
  const days = Math.max(2, Math.ceil((Date.now() / 1000 - startTs) / 86400) + 1);
  // DefiLlama caps a request at 500 points total (coins x span), so: one coin per call, coarser period for long ranges.
  const periodDays = Math.ceil(days / 480);
  const period = `${periodDays}d`;
  const span = Math.ceil(days / periodDays);
  // One coin per call (500-point cap), all calls in flight together; the throttle spaces their starts.
  await Promise.all(ids.map(async (id) => {
    const batch = [id];
    try {
      const r = await fetchJson<{ coins: Record<string, { prices: { timestamp: number; price: number }[] }> }>(
        "defillama",
        `https://coins.llama.fi/chart/${batch.join(",")}?start=${startTs}&span=${span}&period=${period}`,
        { endpoint: "chart" },
      );
      for (const [id, v] of Object.entries(r.coins ?? {})) out[id] = v.prices.map((p) => ({ ts: p.timestamp, price: p.price }));
    } catch {
      /* missing coverage is normal for memecoins */
    }
  }));
  return out;
}

/** Hourly series in windows of 480 points (DefiLlama allows 500 per request). */
async function llamaHourly(id: string, from: number, to: number, eventTimes: number[]): Promise<PricePoint[]> {
  const out: PricePoint[] = [];
  const W = 480 * 3600;
  // Only the 20-day windows that actually contain trades, fetched in parallel.
  const windows = [...new Set(eventTimes.map((t) => Math.floor((t - from) / W)))].map((k) => from + k * W).filter((s) => s < to);
  await Promise.all(windows.map(async (s) => {
    try {
      const r = await fetchJson<{ coins: Record<string, { prices: { timestamp: number; price: number }[] }> }>(
        "defillama",
        `https://coins.llama.fi/chart/${id}?start=${s}&span=${Math.min(480, Math.ceil((to - s) / 3600) + 1)}&period=1h`,
        { endpoint: "chart-hourly" },
      );
      for (const p of r.coins?.[id]?.prices ?? []) out.push({ ts: p.timestamp, price: p.price });
    } catch {
      /* fall back to daily for this window */
    }
  }));
  return out.sort((a, b) => a.ts - b.ts);
}

/** Daily points outside the hourly window + all hourly points, sorted. */
function mergeSeries(daily: PricePoint[], hourly: PricePoint[]): PricePoint[] {
  const lo = hourly[0].ts, hi = hourly[hourly.length - 1].ts;
  return [...daily.filter((p) => p.ts < lo || p.ts > hi), ...hourly].sort((a, b) => a.ts - b.ts);
}

async function llamaCurrent(ids: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (let i = 0; i < ids.length; i += 60) {
    try {
      const r = await fetchJson<{ coins: Record<string, { price: number }> }>(
        "defillama",
        `https://coins.llama.fi/prices/current/${ids.slice(i, i + 60).join(",")}`,
        { endpoint: "prices/current" },
      );
      for (const [id, v] of Object.entries(r.coins ?? {})) out[id] = v.price;
    } catch {}
  }
  return out;
}

async function dexscreener(keys: string[]): Promise<Record<string, { price: number; liq: number }>> {
  const out: Record<string, { price: number; liq: number }> = {};
  const byChain = new Map<ChainId, string[]>();
  for (const k of keys) {
    const [c, a] = k.split(":") as [ChainId, string];
    byChain.set(c, [...(byChain.get(c) ?? []), a]);
  }
  for (const [chain, addrs] of byChain) {
    for (let i = 0; i < addrs.length; i += 30) {
      try {
        const pairs = await fetchJson<
          { baseToken: { address: string }; priceUsd?: string; liquidity?: { usd?: number } }[]
        >("dexscreener", `https://api.dexscreener.com/tokens/v1/${DEXSCREENER_CHAIN[chain]}/${addrs.slice(i, i + 30).join(",")}`, {
          endpoint: "tokens",
        });
        for (const p of pairs ?? []) {
          const addr = chain === "solana" ? p.baseToken.address : p.baseToken.address.toLowerCase();
          const k = `${chain}:${addr}`;
          const liq = p.liquidity?.usd ?? 0;
          if (!out[k] || liq > out[k].liq) out[k] = { price: Number(p.priceUsd ?? 0), liq };
        }
      } catch {}
    }
  }
  return out;
}

/**
 * Build the price book for a run.
 * - Majors (SOL/ETH/BNB/POL): DefiLlama daily chart -> reliable historical pricing.
 * - Tokens: DefiLlama chart for the top `maxSeriesTokens` by volume (peak / paper-hands need history),
 *   current price from provider -> DefiLlama -> DexScreener. No price anywhere = dead coin = 0.
 */
export async function buildPriceBook(
  events: UnifiedEvent[],
  sinceTs: number,
  providerCurrent: Record<string, number>,
  maxSeriesTokens = 25,
): Promise<PriceBook> {
  const start = minOf(events.map((e) => e.timestamp), sinceTs || Infinity) - 86400;
  const majors = Object.entries(MAJOR_LLAMA_ID) as [Exclude<Major, "USD">, string][];
  // Majors (the money side of every trade) get HOURLY prices over the period the user actually traded,
  // falling back to the daily series. Hourly keeps USD conversions within a fraction of a percent.
  // Everything below is independent: start the token lookups now so they overlap with the majors.
  const vol = new Map<string, number>();
  for (const e of events)
    for (const l of [...e.in, ...e.out]) {
      if (isMoney(l.token)) continue;
      const k = tokenKey(l.token);
      vol.set(k, (vol.get(k) ?? 0) + (l.usd ?? 0) + 1e-9);
    }
  const tokens = [...vol.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const seriesP = llamaChart(tokens.slice(0, maxSeriesTokens).map(llamaId), start);
  const curLlamaP = llamaCurrent(tokens.map(llamaId));
  const majorCurP = llamaCurrent(majors.map(([, id]) => id));
  const dexP = curLlamaP.then((cur) => {
    const needDex = tokens.filter((k) => providerCurrent[k] === undefined && cur[llamaId(k)] === undefined);
    // Liquidity is useful for rug detection on everything, but only query DexScreener for what we need + top tokens.
    return dexscreener([...new Set([...needDex, ...tokens.slice(0, maxSeriesTokens)])]);
  });

  const daily = await llamaChart(majors.map(([, id]) => id), start);
  const usedMajors = new Set(events.flatMap((e) => [NATIVE[e.chain].major, ...[...e.in, ...e.out].map((l) => majorOf(l.token))]).filter(Boolean));
  const tsList = events.map((e) => e.timestamp);
  const majorCharts: Record<string, PricePoint[]> = { ...daily };
  if (tsList.length) {
    const lo = minOf(tsList) - 3600, hi = Math.min(maxOf(tsList) + 3600, Math.floor(Date.now() / 1000));
    await Promise.all(majors.filter(([m]) => usedMajors.has(m)).map(async ([, id]) => {
      const hourly = await llamaHourly(id, lo, hi, tsList);
      if (hourly.length) majorCharts[id] = mergeSeries(daily[id] ?? [], hourly);
    }));
  }
  const [majorCur, seriesRaw, curLlama, dex] = await Promise.all([majorCurP, seriesP, curLlamaP, dexP]);

  return {
    majorAt: (m, ts) => (m === "USD" ? 1 : interp(majorCharts[MAJOR_LLAMA_ID[m]] ?? [], ts)),
    majorNow: (m) => (m === "USD" ? 1 : majorCur[MAJOR_LLAMA_ID[m]] ?? interp(majorCharts[MAJOR_LLAMA_ID[m]] ?? [], Date.now() / 1000)),
    series: (k) => seriesRaw[llamaId(k)] ?? [],
    current: (k) => providerCurrent[k] ?? curLlama[llamaId(k)] ?? dex[k]?.price,
    liquidity: (k) => dex[k]?.liq,
  };
}

export const priceAt = interp;

/** Most liquid pool per token, from DexScreener (30 tokens per request). Keys are `chain:address`. */
export async function dexPools(keys: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const liqOf: Record<string, number> = {};
  const byChain = new Map<ChainId, string[]>();
  for (const k of keys) {
    const [c, a] = k.split(":") as [ChainId, string];
    byChain.set(c, [...(byChain.get(c) ?? []), a]);
  }
  for (const [chain, addrs] of byChain) {
    for (let i = 0; i < addrs.length; i += 30) {
      try {
        const pairs = await fetchJson<{ baseToken: { address: string }; pairAddress: string; liquidity?: { usd?: number } }[]>(
          "dexscreener", `https://api.dexscreener.com/tokens/v1/${DEXSCREENER_CHAIN[chain]}/${addrs.slice(i, i + 30).join(",")}`, { endpoint: "tokens" },
        );
        for (const p of pairs ?? []) {
          const k = `${chain}:${chain === "solana" ? p.baseToken.address : p.baseToken.address.toLowerCase()}`;
          const liq = p.liquidity?.usd ?? 0;
          if (!out[k] || liq > liqOf[k]) { out[k] = p.pairAddress; liqOf[k] = liq; }
        }
      } catch {}
    }
  }
  return out;
}
