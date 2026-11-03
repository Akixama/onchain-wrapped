// Sneak peeks for the waiting screen: things we know as soon as the history is read, before prices.
// Counts only (no USD), so they're cheap and never change once the full result is in.
import { isMoney } from "../core/assets";
import type { UnifiedEvent } from "../core/types";

export interface Preview {
  trades: number;
  coins: number;
  firstTs: number | null;
  busiestDay: { ts: number; trades: number } | null;
  /** Trades per UTC hour (the browser shifts it to local time). */
  hours: number[];
  topCoin: { symbol: string; trades: number } | null;
  activeDays: number;
}

export function quickPreview(events: UnifiedEvent[]): Preview {
  const trades = events.filter((e) => e.type === "swap" && !e.spam && !e.ownTransfer);
  const perDay = new Map<number, number>();
  const hours = new Array(24).fill(0);
  const perCoin = new Map<string, { symbol: string; n: number }>();
  for (const e of trades) {
    const d = Math.floor(e.timestamp / 86400);
    perDay.set(d, (perDay.get(d) ?? 0) + 1);
    hours[new Date(e.timestamp * 1000).getUTCHours()]++;
    const seen = new Set<string>();
    for (const l of [...e.in, ...e.out]) {
      if (isMoney(l.token) || l.token.address === "native") continue;
      const k = `${l.token.chain}:${l.token.address}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const c = perCoin.get(k) ?? { symbol: l.token.symbol, n: 0 };
      c.n++;
      perCoin.set(k, c);
    }
  }
  const busiest = [...perDay.entries()].sort((a, b) => b[1] - a[1])[0];
  const top = [...perCoin.values()].sort((a, b) => b.n - a.n)[0];
  return {
    trades: trades.length,
    coins: perCoin.size,
    firstTs: trades[0]?.timestamp ?? null,
    busiestDay: busiest ? { ts: busiest[0] * 86400, trades: busiest[1] } : null,
    hours,
    topCoin: top ? { symbol: top.symbol, trades: top.n } : null,
    activeDays: perDay.size,
  };
}
