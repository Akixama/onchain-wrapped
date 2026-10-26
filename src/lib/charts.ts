// Real price charts for the trade cards (best, worst, round trip, paper hands, diamond hands).
// Candles come from GeckoTerminal (free, 30 req/min, last 180 days). Supply lets the UI show
// market cap instead of tiny token prices. Peaks on the cards are refined from these candles,
// using closing prices (one-candle wicks on thin pools aren't prices anyone could really sell at).
import type { ChainId } from "./core/types";
import type { TradeCard, TradeChart, WrappedStats } from "./engine/stats";
import type { Position } from "./engine/pnl";
import { fetchJson } from "./infra/http";

const GT_NETWORK: Record<ChainId, string> = {
  solana: "solana", ethereum: "eth", base: "base", arbitrum: "arbitrum", bsc: "bsc", polygon: "polygon_pos", optimism: "optimism",
};
const GT = "https://api.geckoterminal.com/api/v2";
const DAY = 86400;
const MAX_CANDLES = 120;

interface Pool { attributes: { address: string; reserve_in_usd: string | null }; relationships: { base_token: { data: { id: string } } } }

async function topPool(chain: ChainId, address: string): Promise<string | null> {
  const r = await fetchJson<{ data: Pool[] }>("geckoterminal", `${GT}/networks/${GT_NETWORK[chain]}/tokens/${address}/pools?page=1`, { endpoint: "token-pools" });
  const pools = [...(r.data ?? [])].sort((a, b) => Number(b.attributes.reserve_in_usd ?? 0) - Number(a.attributes.reserve_in_usd ?? 0));
  return pools[0]?.attributes.address ?? null;
}

async function supplyOf(chain: ChainId, address: string): Promise<number | null> {
  const r = await fetchJson<{ data: { attributes: { normalized_total_supply?: string | null } } }>(
    "geckoterminal", `${GT}/networks/${GT_NETWORK[chain]}/tokens/${address}`, { endpoint: "token" },
  );
  const s = Number(r.data?.attributes?.normalized_total_supply);
  return s > 0 ? s : null;
}

/** Pick candle size so the window fits in one request (max 1000 candles). */
function frame(span: number): { tf: "minute" | "hour" | "day"; agg: number; label: string; sec: number } {
  if (span <= 3 * DAY) return { tf: "minute", agg: 5, label: "5m", sec: 300 };
  if (span <= 40 * DAY) return { tf: "hour", agg: 1, label: "1h", sec: 3600 };
  return { tf: "day", agg: 1, label: "1d", sec: DAY };
}

async function candles(chain: ChainId, pool: string, token: string, start: number, end: number) {
  const f = frame(end - start);
  const r = await fetchJson<{ data: { attributes: { ohlcv_list: number[][] } } }>(
    "geckoterminal",
    `${GT}/networks/${GT_NETWORK[chain]}/pools/${pool}/ohlcv/${f.tf}?aggregate=${f.agg}&limit=1000&currency=usd&token=${token}&before_timestamp=${end}`,
    { endpoint: "ohlcv" },
  );
  const list = (r.data?.attributes?.ohlcv_list ?? [])
    .filter((c) => c[0] >= start && c[0] <= end)
    .map((c) => [c[0], c[1], c[2], c[3], c[4]] as [number, number, number, number, number])
    .sort((a, b) => a[0] - b[0]);
  return { list: downsample(list), interval: f.label };
}

/** Merge neighbouring candles so a card never draws more than MAX_CANDLES. */
function downsample(c: [number, number, number, number, number][]) {
  if (c.length <= MAX_CANDLES) return c;
  const k = Math.ceil(c.length / MAX_CANDLES);
  const out: typeof c = [];
  for (let i = 0; i < c.length; i += k) {
    const g = c.slice(i, i + k);
    out.push([g[0][0], g[0][1], Math.max(...g.map((x) => x[2])), Math.min(...g.map((x) => x[3])), g[g.length - 1][4]]);
  }
  return out;
}

const maxClose = (c: TradeChart["candles"], from: number, to: number) =>
  Math.max(0, ...c.filter((x) => x[0] >= from && x[0] <= to).map((x) => x[4]));

/** Attach charts to the trade cards and refine their peaks. Never throws: a card without a chart still works. */
export async function addTradeCharts(s: WrappedStats, positions: Map<string, Position>, onNote?: (n: string) => void) {
  const now = Math.floor(Date.now() / 1000);
  type Slot = { card: TradeCard; end: number; kind: "trade" | "paper" };
  const slots: Slot[] = [];
  for (const c of [s.bestTrade, s.worstTrade, s.roundTrip, s.diamondHands]) if (c) slots.push({ card: c, end: c.holdingValueUsd > 0 ? now : c.lastTs, kind: "trade" });
  if (s.paperHands) slots.push({ card: s.paperHands, end: Math.min(now, s.paperHands.soldTs + 90 * DAY), kind: "paper" });

  const cache = new Map<string, Promise<{ pool: string | null; supply: number | null }>>();
  let missing = 0;
  for (const slot of slots) {
    const c = slot.card;
    const p = positions.get(`${c.chain}:${c.address}`);
    c.fills = [
      ...(p?.buys ?? []).map((f) => ({ t: f.ts, side: "buy" as const, price: f.price, usd: f.usd })),
      ...(p?.sells ?? []).map((f) => ({ t: f.ts, side: "sell" as const, price: f.price, usd: f.usd })),
    ].sort((a, b) => a.t - b.t).slice(-60);
    if (c.address === "native" || !GT_NETWORK[c.chain]) continue;

    const span = Math.max(3600, slot.end - c.firstTs);
    const start = c.firstTs - Math.max(1800, span * 0.08);
    const end = Math.min(now, slot.end + Math.max(1800, span * 0.08));
    try {
      const key = `${c.chain}:${c.address}`;
      if (!cache.has(key)) cache.set(key, (async () => ({ pool: await topPool(c.chain, c.address), supply: await supplyOf(c.chain, c.address).catch(() => null) }))());
      const { pool, supply } = await cache.get(key)!;
      if (!pool) { missing++; continue; }
      const { list, interval } = await candles(c.chain, pool, c.address, Math.floor(start), Math.floor(end));
      if (list.length < 3) { missing++; continue; }
      c.chart = { candles: list, interval, supply };

      if (slot.kind === "paper" && s.paperHands) {
        // Real peak after the sale, from closing prices.
        const later = maxClose(list, s.paperHands.soldTs, s.paperHands.soldTs + 90 * DAY);
        const ph = s.paperHands;
        if (later > ph.soldAt) {
          const soldAmount = ph.missedUsd / Math.max(1e-18, ph.laterPeak - ph.soldAt);
          ph.laterPeak = later;
          ph.missedUsd = Math.round(soldAmount * (later - ph.soldAt) * 100) / 100;
        } else {
          s.paperHands = null; // the candles don't show a later run after all
        }
      } else {
        // Peak while held: highest close, or your own best fill if you traded above that (a real price).
        const fillMax = Math.max(0, ...c.fills.map((f) => f.price));
        const held = Math.max(maxClose(list, c.firstTs, c.holdingValueUsd > 0 ? now : c.lastTs), fillMax);
        if (held > 0) c.peakPrice = held;
      }
    } catch {
      missing++;
    }
  }
  if (missing) onNote?.(`${missing} trade chart${missing === 1 ? "" : "s"} show only your own trade prices (no candle data for that token or period).`);
}
