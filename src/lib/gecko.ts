// GeckoTerminal candles, shared by the server (paper-hands check) and the browser (trade charts).
// Free API: ~30 requests/min per IP and only the last 180 days. Loading charts in the viewer's
// browser gives every viewer their own limit and keeps the lookup job fast.
import type { ChainId } from "./core/types";

export type Candle = [number, number, number, number, number]; // time, open, high, low, close (USD)
export type JsonFetcher = <T>(url: string) => Promise<T>;

export const GT_NETWORK: Record<ChainId, string> = {
  solana: "solana", ethereum: "eth", base: "base", arbitrum: "arbitrum", bsc: "bsc", polygon: "polygon_pos", optimism: "optimism",
};
const GT = "https://api.geckoterminal.com/api/v2";
const MAX_CANDLES = 120;

interface Pool { attributes: { address: string; reserve_in_usd: string | null } }

export async function topPool(get: JsonFetcher, chain: ChainId, address: string): Promise<string | null> {
  const r = await get<{ data?: Pool[] }>(`${GT}/networks/${GT_NETWORK[chain]}/tokens/${address}/pools?page=1`);
  const pools = [...(r.data ?? [])].sort((a, b) => Number(b.attributes.reserve_in_usd ?? 0) - Number(a.attributes.reserve_in_usd ?? 0));
  return pools[0]?.attributes.address ?? null;
}

/** Candle size so the window fits in one request (max 1000 candles), finer for short trades. */
export function candleFrame(span: number): { tf: "minute" | "hour" | "day"; agg: number; label: string } {
  if (span <= 12 * 3600) return { tf: "minute", agg: 1, label: "1m" };
  if (span <= 3 * 86400) return { tf: "minute", agg: 5, label: "5m" };
  if (span <= 40 * 86400) return { tf: "hour", agg: 1, label: "1h" };
  return { tf: "day", agg: 1, label: "1d" };
}

/** Padding so even a 3-minute trade shows what the chart did around it. */
export function chartWindow(from: number, to: number, now = Math.floor(Date.now() / 1000)) {
  const span = Math.max(60, to - from);
  const pad = Math.max(3600, span * 0.15);
  return { start: Math.floor(from - pad), end: Math.floor(Math.min(now, to + pad)) };
}

/** Candles for [start, end]; thinned to MAX_CANDLES for drawing unless `raw` (peaks need every candle). */
export async function fetchCandles(get: JsonFetcher, chain: ChainId, pool: string, token: string, start: number, end: number, raw = false) {
  const f = candleFrame(end - start);
  const r = await get<{ data?: { attributes?: { ohlcv_list?: number[][] } } }>(
    `${GT}/networks/${GT_NETWORK[chain]}/pools/${pool}/ohlcv/${f.tf}?aggregate=${f.agg}&limit=1000&currency=usd&token=${token}&before_timestamp=${end}`,
  );
  const list = (r.data?.attributes?.ohlcv_list ?? [])
    .filter((c) => c[0] >= start && c[0] <= end)
    .map((c) => [c[0], c[1], c[2], c[3], c[4]] as Candle)
    .sort((a, b) => a[0] - b[0]);
  return { candles: raw ? list : downsample(list), interval: f.label };
}

function downsample(c: Candle[]): Candle[] {
  if (c.length <= MAX_CANDLES) return c;
  const k = Math.ceil(c.length / MAX_CANDLES);
  const out: Candle[] = [];
  for (let i = 0; i < c.length; i += k) {
    const g = c.slice(i, i + k);
    out.push([g[0][0], g[0][1], Math.max(...g.map((x) => x[2])), Math.min(...g.map((x) => x[3])), g[g.length - 1][4]]);
  }
  return out;
}
