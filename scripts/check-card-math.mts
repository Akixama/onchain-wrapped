// For every coin: result = got back (coins bought here) + still held (bought here) - put in + moved away (cost).
//   node --env-file=.env.local --import tsx scripts/check-card-math.mts out/audit/suqh.events.fixed.json
import { readFileSync } from "node:fs";
import { runPnl } from "../src/lib/engine/pnl";
import type { UnifiedEvent } from "../src/lib/core/types";
const events: UnifiedEvent[] = JSON.parse(readFileSync(process.argv[2], "utf8"));
const pb = { majorAt: () => 0, majorNow: () => 0, series: () => [], current: () => 0.5, liquidity: () => undefined } as never;
let ok = 0, bad = 0, partial = 0;
for (const p of runPnl(events, pb, {}).values()) {
  const rebuilt = p.proceedsKnown + p.holdingKnown * p.currentPrice - p.costIn + p.costMoved;
  if (p.partial) partial++;
  if (Math.abs(rebuilt - p.pnl) <= Math.max(0.01, Math.abs(p.pnl) * 1e-6)) ok++;
  else { bad++; if (bad <= 5) console.log("differs", p.token.symbol, p.pnl.toFixed(2), rebuilt.toFixed(2)); }
}
console.log(`${ok} coins add up, ${bad} don't (${partial} had coins from before the period)`);
process.exit(0);
