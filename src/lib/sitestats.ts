// Site-wide live numbers and the "recent wraps" feed. All real: every finished lookup adds itself.
// The feed never shows wallet addresses or links, only what kind of trader it was and when.
import { kv } from "./infra/kv";
import type { WrappedStats } from "./engine/stats";

const FEED = "site:feed";
const FEED_KEEP = 60;
const TRADES = "pct:trades"; // one member per finished lookup, scored by its trade count (see percentile.ts)

export interface FeedItem { id: string; t: number; title: string; trades: number; pnl: number; tf: string; pump: number }
export interface SiteStats { wallets: number; lookups: number; trades: number; today: number; recent: FeedItem[] }

/** Called once when a lookup finishes. */
export async function recordWrap(id: string, s: WrappedStats, at = Date.now()): Promise<void> {
  const item: FeedItem = {
    id, t: at, title: s.archetype.title, trades: s.overview.totalTrades,
    pnl: Math.round(s.pnl.totalUsd), tf: s.meta.timeframe, pump: s.pumpfun?.coins ?? 0,
  };
  await kv().zadd(FEED, at, JSON.stringify(item));
  await kv().ztrim(FEED, FEED_KEEP);
}

// Summing every lookup's trades reads the whole set: keep the answer for a minute.
let cache: { at: number; v: SiteStats } | null = null;

export async function getSiteStats(): Promise<SiteStats> {
  if (cache && Date.now() - cache.at < 60_000) return cache.v;
  const [wallets, pool, feed] = await Promise.all([
    kv().get("ach:total").then(Number).catch(() => 0),
    kv().zrange(TRADES, 0, -1).catch(() => [] as [string, number][]),
    kv().zrange(FEED, 0, FEED_KEEP - 1, true).catch(() => [] as [string, number][]),
  ]);
  const recent = feed.map(([m]) => { try { return JSON.parse(m) as FeedItem; } catch { return null; } }).filter((x): x is FeedItem => !!x);
  const dayAgo = Date.now() - 86400_000;
  const v: SiteStats = {
    wallets: wallets || 0,
    lookups: pool.length,
    trades: pool.reduce((a, [, n]) => a + n, 0),
    today: recent.filter((r) => r.t >= dayAgo).length,
    recent: recent.slice(0, 12),
  };
  cache = { at: Date.now(), v };
  return v;
}
