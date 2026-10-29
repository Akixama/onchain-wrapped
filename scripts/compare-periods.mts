// Run one wallet for several periods and print every card's headline, to spot cards that disagree.
//   node --env-file=.env.local --import tsx scripts/compare-periods.mts <wallet> 3m 6m 12m
import { runWrapped } from "../src/lib/pipeline";
import type { WrappedStats } from "../src/lib/engine/stats";
const [w, ...tfs] = process.argv.slice(2);
const t = (c: { symbol: string; pnlUsd: number } | null | undefined) => (c ? `${c.symbol} ${Math.round(c.pnlUsd)}` : "-");
const rows: Record<string, string[]> = {};
const put = (k: string, v: unknown) => (rows[k] ??= []).push(String(v));
for (const tf of tfs) {
  const r = await runWrapped({ addresses: [w], timeframe: tf as "3m" });
  if (r.partial) throw new Error("partial");
  const s: WrappedStats = r.stats;
  put("period", tf);
  put("trades", s.overview.totalTrades);
  put("pnl", Math.round(s.pnl.totalUsd));
  put("best", t(s.bestTrade));
  put("worst", t(s.worstTrade));
  put("roundTrip", s.roundTrip ? `${s.roundTrip.symbol} up ${Math.round(s.roundTrip.peakGainUsd)}` : "-");
  put("paperHands", s.paperHands ? `${s.paperHands.symbol} ${Math.round(s.paperHands.missedUsd)}` : "-");
  put("diamond", s.diamondHands ? `${s.diamondHands.symbol} ${s.diamondHands.daysHeld}d` : "-");
  put("rugs", `${s.rugs.count} caught, ${s.rugs.dodged} dodged`);
  put("whatIf", `${s.counterfactual.verdict} ${Math.round(s.counterfactual.justHeldDiffUsd)}`);
  put("bags", s.bags ? `${s.bags.count} ${Math.round(s.bags.valueUsd)}` : "-");
  put("fastestFlip", s.speed?.fastestFlip ? `${s.speed.fastestFlip.symbol} ${s.speed.fastestFlip.seconds}s` : "-");
  put("sniper", s.sniper ? `${s.sniper.within60s}/${s.sniper.checked}` : "-");
  put("cards", s.cards.length);
  put("hasWhatIf", s.cards.includes("counterfactual"));
}
for (const [k, v] of Object.entries(rows)) console.log(k.padEnd(12), v.map((x) => x.padEnd(26)).join(""));
process.exit(0);
