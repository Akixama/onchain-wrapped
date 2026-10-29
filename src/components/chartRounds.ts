// Rounds for the "Win or lose?" chart game (server side: picks trades, hides nothing yet).
import type { TradeCard } from "@/lib/engine/stats";

export interface ChartRound { card: TradeCard; cutoff: number }

/** Rounds from the trade cards: one per coin, skipping near-break-even ones (no right answer). */
export function chartRounds(cards: (TradeCard | null | undefined)[], seed: string): ChartRound[] {
  const seen = new Set<string>();
  const out: ChartRound[] = [];
  for (const c of cards) {
    if (!c || seen.has(c.address) || Math.abs(c.pnlUsd) < 1) continue;
    seen.add(c.address);
    const firstBuy = c.fills?.find((f) => f.side === "buy")?.t ?? c.firstTs;
    out.push({ card: c, cutoff: firstBuy });
  }
  // Fixed order per wallet that doesn't give away "best first, worst second".
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return out.map((r, k) => ({ r, k: (h ^ (k * 2654435761)) >>> 0 })).sort((a, b) => a.k - b.k).map((x) => x.r);
}
