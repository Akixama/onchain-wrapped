// Independent check of the profit-over-time card: realized result of every sale, summed by UTC day,
// vs the chart's best/worst day and the total. Also lists the trades on the best and worst day.
//   node --env-file=.env.local --import tsx scripts/check-days.mts 12m <wallet> [<wallet> ...]
import { runWrapped } from "../src/lib/pipeline";
import { runPnl } from "../src/lib/engine/pnl";
const [tf, ...wallets] = process.argv.slice(2);
const r = await runWrapped({ addresses: wallets, timeframe: tf as "12m" });
if (r.partial) throw new Error("partial");
const s = r.stats, tl = s.profitTimeline!;
const pb = { majorAt: () => 0, majorNow: () => 0, series: () => [], current: () => 0, liquidity: () => undefined } as never;
const byDay = new Map<string, { usd: number; lines: string[] }>();
const day = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10);
let realized = 0;
for (const p of runPnl(r.events, pb, {}).values()) for (const f0 of p.sells) {
  const f = { ...f0, realized: f0.realized ?? 0 };
  realized += f.realized;
  const d = byDay.get(day(f.ts)) ?? { usd: 0, lines: [] };
  d.usd += f.realized;
  d.lines.push(`  ${new Date(f.ts * 1000).toISOString().slice(11, 19)} sold $${p.token.symbol} for $${f.usd.toFixed(2)} -> ${f.realized >= 0 ? "+" : ""}${f.realized.toFixed(2)}`);
  byDay.set(day(f.ts), d);
}
const days = [...byDay.entries()].sort((a, b) => b[1].usd - a[1].usd);
console.log(`site: total ${s.pnl.totalUsd} (closed ${s.pnl.realizedUsd}, still held ${s.pnl.unrealizedUsd}) | best day ${tl.bestDay ? `${day(tl.bestDay.ts)} ${tl.bestDay.usd}` : "none"} | worst day ${tl.worstDay ? `${day(tl.worstDay.ts)} ${tl.worstDay.usd}` : "none"}`);
console.log(`check: closed ${realized.toFixed(2)} | best day ${days[0][0]} ${days[0][1].usd.toFixed(2)} | worst day ${days.at(-1)![0]} ${days.at(-1)![1].usd.toFixed(2)}`);
console.log("top 3 days:", days.slice(0, 3).map(([d, v]) => `${d} ${v.usd.toFixed(2)}`).join(" | "));
console.log("bottom 3 days:", days.slice(-3).map(([d, v]) => `${d} ${v.usd.toFixed(2)}`).join(" | "));
for (const d of [days[0][0], days.at(-1)![0]]) console.log(d, "\n" + byDay.get(d)!.lines.join("\n"));
console.log("timeline first/last point:", day(tl.points[0][0]), day(tl.points.at(-1)![0]), "points", tl.points.length, "| first trade", day(r.events.find((e) => e.type === "swap")?.timestamp ?? 0));
process.exit(0);
