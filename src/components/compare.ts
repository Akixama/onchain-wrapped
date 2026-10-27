// Head-to-head rows for two Wrapped results. Shared by the compare page and its share image.
import type { WrappedStats } from "@/lib/engine/stats";
import { NARRATIVE_LABEL } from "@/lib/engine/extras";
import { num, pct, usd } from "./format";

export interface CompareRow { label: string; a: string; b: string; winner: "a" | "b" | null }

const m = (n: number, sign = false) => usd(n, { sign });
const secs = (s: number) => (s < 90 ? `${s}s` : s < 5400 ? `${Math.round(s / 60)} min` : `${Math.round(s / 360) / 10} h`);
/** Who wins a row: higher (or lower) number; null on a tie or when either side has nothing. */
const win = (a: number | null | undefined, b: number | null | undefined, higher = true): CompareRow["winner"] => {
  if (a == null || b == null || a === b) return null;
  return (a > b) === higher ? "a" : "b";
};

export function compareRows(a: WrappedStats, b: WrappedStats): CompareRow[] {
  const rows: CompareRow[] = [
    { label: "Profit", a: m(a.pnl.totalUsd, true), b: m(b.pnl.totalUsd, true), winner: win(a.pnl.totalUsd, b.pnl.totalUsd) },
    { label: "Win rate", a: pct(a.pnl.winRate), b: pct(b.pnl.winRate), winner: win(a.pnl.winRate, b.pnl.winRate) },
    { label: "Trades", a: num(a.overview.totalTrades), b: num(b.overview.totalTrades), winner: win(a.overview.totalTrades, b.overview.totalTrades) },
    { label: "Volume", a: m(a.overview.volumeUsd), b: m(b.overview.volumeUsd), winner: win(a.overview.volumeUsd, b.overview.volumeUsd) },
    {
      label: "Best trade",
      a: a.bestTrade ? `$${a.bestTrade.symbol} ${m(a.bestTrade.pnlUsd, true)}` : "—",
      b: b.bestTrade ? `$${b.bestTrade.symbol} ${m(b.bestTrade.pnlUsd, true)}` : "—",
      winner: win(a.bestTrade?.pnlUsd, b.bestTrade?.pnlUsd),
    },
    {
      label: "Worst trade",
      a: a.worstTrade ? `$${a.worstTrade.symbol} ${m(a.worstTrade.pnlUsd, true)}` : "—",
      b: b.worstTrade ? `$${b.worstTrade.symbol} ${m(b.worstTrade.pnlUsd, true)}` : "—",
      winner: win(a.worstTrade?.pnlUsd ?? 0, b.worstTrade?.pnlUsd ?? 0), // smaller loss wins
    },
    {
      label: "Fastest flip",
      a: a.speed?.fastestFlip ? `${secs(a.speed.fastestFlip.seconds)} · $${a.speed.fastestFlip.symbol}` : "—",
      b: b.speed?.fastestFlip ? `${secs(b.speed.fastestFlip.seconds)} · $${b.speed.fastestFlip.symbol}` : "—",
      winner: win(a.speed?.fastestFlip?.seconds, b.speed?.fastestFlip?.seconds, false),
    },
    { label: "Gas burned", a: m(a.gas.totalUsd), b: m(b.gas.totalUsd), winner: win(a.gas.totalUsd, b.gas.totalUsd, false) },
    { label: "Rugs caught", a: num(a.rugs.count), b: num(b.rugs.count), winner: win(a.rugs.count, b.rugs.count, false) },
  ];
  const fa = a.narratives?.top[0], fb = b.narratives?.top[0];
  if (fa || fb) rows.push({ label: "Favourite narrative", a: fa ? NARRATIVE_LABEL[fa.id] : "—", b: fb ? NARRATIVE_LABEL[fb.id] : "—", winner: null });
  return rows;
}

export function compareScore(rows: CompareRow[]) {
  return { a: rows.filter((r) => r.winner === "a").length, b: rows.filter((r) => r.winner === "b").length };
}
