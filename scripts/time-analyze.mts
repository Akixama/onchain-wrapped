// Time each step of the analysis on saved events (no reading, no double-check).
//   node --env-file=.env.local --import tsx scripts/time-analyze.mts out/audit/suqh.events.fixed.json
import { readFileSync } from "node:fs";
import type { UnifiedEvent } from "../src/lib/core/types";
import { analyze } from "../src/lib/pipeline";
const events: UnifiedEvent[] = JSON.parse(readFileSync(process.argv[2], "utf8"));
const resolved = [...new Set(events.map((e) => e.wallet))].map((address) => ({ address, family: "solana" as const }));
const now = Math.floor(Date.now() / 1000), sinceTs = now - 365 * 86400;
const t0 = Date.now(); let last = t0, lastMsg = "start";
const s = await analyze({ events, resolved, timeframe: "12m", sinceTs, coverageStart: sinceTs, truncated: false, cap: 0,
  finishBy: Date.now() + 275_000,
  onStage: (_st, msg) => { const n = Date.now(); console.log(`${((n - last) / 1000).toFixed(1).padStart(6)}s  ${lastMsg}`); last = n; lastMsg = msg; } });
console.log(`${((Date.now() - last) / 1000).toFixed(1).padStart(6)}s  ${lastMsg}\ntotal ${((Date.now() - t0) / 1000).toFixed(1)}s, trades ${s.overview.totalTrades}`);
process.exit(0);
