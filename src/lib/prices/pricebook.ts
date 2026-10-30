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
  /** 24h trading volume (USD) of that pool, when known (graveyard: "abandoned" coins). Optional for fakes. */
  volume24h?(key: string): number | undefined;
  /** Address of that pool, when known (graveyard: death-date candles). */
  pool?(key: string): string | undefined;
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

/** Run `fn` over items with up to `n` in flight (the provider's throttle still sets the pace). */
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>, stopAt?: number) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length && !(stopAt && Date.now() >= stopAt)) await fn(items[i++]);
  }));
}
const chunks = <T,>(xs: T[], size: number) => Array.from({ length: Math.ceil(xs.length / size) }, (_, i) => xs.slice(i * size, (i + 1) * size));

/** `asked` collects every id a request answered for (found or not), so a saved result can say "no price". */
async function llamaCurrent(ids: string[], stopAt?: number, asked?: Set<string>): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  // Thousands of coins = 100+ requests: one at a time took minutes.
  await pool(chunks(ids, 60), 8, async (batch) => {
    try {
      const r = await fetchJson<{ coins: Record<string, { price: number }> }>(
        "defillama",
        `https://coins.llama.fi/prices/current/${batch.join(",")}`,
        { endpoint: "prices/current" },
      );
      for (const [id, v] of Object.entries(r.coins ?? {})) out[id] = v.price;
      for (const id of batch) asked?.add(id);
    } catch {}
  }, stopAt);
  return out;
}

type DexInfo = { price: number; liq: number; vol?: number; pool?: string };
async function dexscreener(keys: string[], stopAt?: number, asked?: Set<string>): Promise<Record<string, DexInfo>> {
  const out: Record<string, DexInfo> = {};
  const byChain = new Map<ChainId, string[]>();
  for (const k of keys) {
    const [c, a] = k.split(":") as [ChainId, string];
    const list = byChain.get(c);
    if (list) list.push(a); else byChain.set(c, [a]);
  }
  for (const [chain, addrs] of byChain) {
    await pool(chunks(addrs, 30), 4, async (batch) => {
      try {
        const pairs = await fetchJson<
          { baseToken: { address: string }; pairAddress?: string; priceUsd?: string; liquidity?: { usd?: number }; volume?: { h24?: number } }[]
        >("dexscreener", `https://api.dexscreener.com/tokens/v1/${DEXSCREENER_CHAIN[chain]}/${batch.join(",")}`, {
          endpoint: "tokens",
        });
        for (const p of pairs ?? []) {
          const addr = chain === "solana" ? p.baseToken.address : p.baseToken.address.toLowerCase();
          const k = `${chain}:${addr}`;
          const liq = p.liquidity?.usd ?? 0;
          if (!out[k] || liq > out[k].liq) out[k] = { price: Number(p.priceUsd ?? 0), liq, vol: p.volume?.h24, pool: p.pairAddress };
        }
        for (const a of batch) asked?.add(`${chain}:${a}`);
      } catch {}
    }, stopAt);
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
  /** Current prices looked up earlier in this lookup (see prefetchCurrent): those coins aren't asked again. */
  known: KnownPrices = {},
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
  // Price history: the top coins by volume, plus every coin they SOLD (most sold first, up to
  // SERIES_SOLD_MAX). Paper hands asks "did it run after you sold?", which needs history for the
  // coins sold; picking by overall volume alone made the answer depend on the period chosen.
  const sold = new Map<string, number>();
  for (const e of events) {
    if (e.type !== "swap") continue;
    for (const l of e.out) if (!isMoney(l.token)) sold.set(tokenKey(l.token), (sold.get(tokenKey(l.token)) ?? 0) + (l.usd ?? 0) + 1e-9);
  }
  const soldTop = [...sold.entries()].sort((a, b) => b[1] - a[1]).slice(0, Number(process.env.SERIES_SOLD_MAX ?? 120)).map(([k]) => k);
  // Round trips and peaks need history for coins they bought too: cover the top SERIES_MAX by volume.
  const seriesKeys = [...new Set([...tokens.slice(0, Math.max(maxSeriesTokens, Number(process.env.SERIES_MAX ?? 150))), ...soldTop])];
  const seriesP = llamaChart(seriesKeys.map(llamaId), start);
  // Coins looked up earlier aren't asked again; their answers (found or not) are filled in.
  const curLlamaP = llamaCurrent(tokens.filter((k) => known[k]?.l === undefined).map(llamaId)).then((cur) => {
    for (const k of tokens) { const l = known[k]?.l; if (l != null) cur[llamaId(k)] = l; }
    return cur;
  });
  const majorCurP = llamaCurrent(majors.map(([, id]) => id));
  const dexP = curLlamaP.then(async (cur) => {
    const needDex = tokens.filter((k) => providerCurrent[k] === undefined && cur[llamaId(k)] === undefined);
    // Pool size decides whether a coin is dead (rugs), so ask for every coin up to LIQUIDITY_MAX
    // (30 per request): a top-25 cut made the rug count depend on the period chosen.
    const want = [...new Set([...needDex, ...tokens.slice(0, Math.max(maxSeriesTokens, Number(process.env.LIQUIDITY_MAX ?? 900)))])];
    const dex = await dexscreener(want.filter((k) => known[k]?.d === undefined));
    for (const k of want) { const d = known[k]?.d; if (d) dex[k] = { price: d[0], liq: d[1], vol: d[2], pool: d[3] }; }
    return dex;
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
    volume24h: (k) => dex[k]?.vol,
    pool: (k) => dex[k]?.pool,
  };
}

export const priceAt = interp;

/**
 * Per coin: DefiLlama's current price (null = it has none) and DexScreener's best pool
 * ([price, liquidity], null = no pool). A missing field = not asked yet.
 */
export type KnownPrices = Record<string, { l?: number | null; d?: [number, number, number?, string?] | null }>;

/**
 * The same current-price lookups buildPriceBook makes, done early (while the slow on-chain check runs)
 * and stopped at `stopAt`. Merged into `known`; anything not reached is asked again later.
 */
export async function prefetchCurrent(events: UnifiedEvent[], known: KnownPrices, stopAt: number): Promise<number> {
  const keys = new Set<string>();
  const vol = new Map<string, number>();
  for (const e of events) for (const l of [...e.in, ...e.out]) {
    if (isMoney(l.token)) continue;
    const k = tokenKey(l.token);
    keys.add(k);
    vol.set(k, (vol.get(k) ?? 0) + (l.usd ?? 0) + 1e-9);
  }
  // Same top coins buildPriceBook asks DexScreener about for pool size (rugs).
  const top = new Set([...vol.entries()].sort((a, b) => b[1] - a[1]).slice(0, Number(process.env.LIQUIDITY_MAX ?? 900)).map(([k]) => k));
  const entry = (k: string) => (known[k] ??= {});
  const askL = [...keys].filter((k) => known[k]?.l === undefined);
  const askedL = new Set<string>();
  const cur = await llamaCurrent(askL.map(llamaId), stopAt, askedL);
  for (const k of askL) if (askedL.has(llamaId(k))) entry(k).l = cur[llamaId(k)] ?? null;
  // DexScreener: coins DefiLlama has no price for, plus the top coins (pool size), as buildPriceBook does.
  const askD = [...keys].filter((k) => (known[k]?.l === null || top.has(k)) && known[k]?.l !== undefined && known[k]?.d === undefined);
  const askedD = new Set<string>();
  const dex = await dexscreener(askD, stopAt, askedD);
  for (const k of askD) if (askedD.has(k)) entry(k).d = dex[k] ? [dex[k].price, dex[k].liq, dex[k].vol, dex[k].pool] : null;
  return askedL.size + askedD.size;
}

/** Most liquid pool per token, from DexScreener (30 tokens per request). Keys are `chain:address`. */
export async function dexPools(keys: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const liqOf: Record<string, number> = {};
  const byChain = new Map<ChainId, string[]>();
  for (const k of keys) {
    const [c, a] = k.split(":") as [ChainId, string];
    const list = byChain.get(c);
    if (list) list.push(a); else byChain.set(c, [a]);
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
