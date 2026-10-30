// Analyze a saved events file (12 months) and write the stats JSON, for refresh-job.mts.
//   node --max-old-space-size=10000 --env-file=.env.local --import tsx scripts/analyze-saved.mts <events.json> <stats.json>
import { readFileSync, writeFileSync } from "node:fs";
import type { UnifiedEvent } from "../src/lib/core/types";
import { analyze } from "../src/lib/pipeline";
import { storyCards } from "../src/lib/engine/stats";
const [inp, out] = process.argv.slice(2);
const events: UnifiedEvent[] = JSON.parse(readFileSync(inp, "utf8"));
const resolved = [...new Set(events.map((e) => e.wallet))].map((address) => ({ address, family: "solana" as const }));
const now = Math.floor(Date.now() / 1000), sinceTs = now - 365 * 86400;
const t0 = Date.now();
const s = await analyze({ events, resolved, timeframe: "12m", sinceTs, coverageStart: sinceTs, truncated: false, cap: 0,
  notes: ["This address is flooded with bot transactions, so its history was read from a filtered source."],
  onStage: (_s, m) => console.error(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`) });
const fixed = events.filter((e) => e.onchainFix).length;
s.meta.notes = [`Corrected ${fixed} Solana trades the data provider had labeled as plain transfers.`, ...(s.meta.notes ?? [])];
s.cards = storyCards(s);
writeFileSync(out, JSON.stringify(s));
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s: trades ${s.overview.totalTrades}, pnl ${s.pnl.totalUsd}, graves ${s.graveyard?.count}, badges ${s.achievements?.earned.length}`);
process.exit(0);
