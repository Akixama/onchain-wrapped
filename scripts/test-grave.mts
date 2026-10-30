// Run the analysis on saved events and print the graveyard + achievements.
//   UPSTASH_REDIS_REST_URL= node --env-file=.env.local --import tsx scripts/test-grave.mts out/machi.events.json [--json out.json]
import { readFileSync, writeFileSync } from "node:fs";
import type { UnifiedEvent } from "../src/lib/core/types";
import { analyze } from "../src/lib/pipeline";
import { ACHIEVEMENT_BY_ID } from "../src/lib/achievements-catalog";
import { putJob } from "../src/lib/store";
import { storyCards } from "../src/lib/engine/stats";
const [file] = process.argv.slice(2);
const j = process.argv.indexOf("--json"), outFile = j > 0 ? process.argv[j + 1] : null;
const events: UnifiedEvent[] = JSON.parse(readFileSync(file, "utf8"));
const resolved = [...new Set(events.map((e) => e.wallet))].map((address) => ({ address, family: "solana" as const }));
const now = Math.floor(Date.now() / 1000), sinceTs = now - 365 * 86400;
const t0 = Date.now();
const s = await analyze({ events, resolved, timeframe: "12m", sinceTs, coverageStart: sinceTs, truncated: false, cap: 0, finishBy: Date.now() + 240_000,
  onStage: (_st, msg) => { const n = Date.now(); console.error(`  [${((n - t0) / 1000).toFixed(0)}s] ${msg}`); } });
const g = s.graveyard;
const d = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
console.log(`\n=== ${file}  (${((Date.now() - t0) / 1000).toFixed(0)}s, ${s.overview.tokensTraded} coins, ${s.overview.totalTrades} trades)`);
if (g) {
  console.log(`graveyard: ${g.count} dead coins, buried $${g.buriedUsd.toLocaleString()}, got out $${g.gotOutUsd.toLocaleString()}, causes ${JSON.stringify(g.causes)}, top cause ${g.topCause}, epitaphs ${g.epitaphSource}`);
  for (const x of g.graves.slice(0, 6)) console.log(`  ${x.symbol.padEnd(12)} born ${d(x.bornTs)} died ${d(x.diedTs)}${x.diedExact ? " (candles)" : " (est.)"}  in $${x.putInUsd} out $${x.gotOutUsd}  ${x.cause}  drop ${x.dropFromPeak}  "${x.epitaph}"`);
}
console.log("achievements:", (s.achievements?.earned ?? []).map((e) => `${ACHIEVEMENT_BY_ID[e.id].emoji} ${ACHIEVEMENT_BY_ID[e.id].name}${e.detail ? ` (${e.detail})` : ""}`).join(" | "));
const sv = process.argv.indexOf("--save");
if (sv > 0) {
  const id = process.argv[sv + 1];
  s.cards = storyCards(s);
  await putJob({ id, status: "done", inputs: s.meta.wallets, wallets: s.meta.wallets, names: {}, timeframe: "12m", createdAt: Date.now(), updatedAt: Date.now(), stats: s });
  console.log("saved as job", id, "cards:", s.cards.join(","));
}
if (outFile) writeFileSync(outFile, JSON.stringify({ graveyard: g && { ...g, graves: g.graves.slice(0, 5) }, achievements: s.achievements }, null, 2));
process.exit(0);
