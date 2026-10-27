// Print the new cards' numbers for saved events, and check the profit line ends at the total.
//   node --env-file=.env.local --import tsx scripts/show-extras.mts out/<name>.events.json [12m|all]
import { readFileSync } from "node:fs";
import type { UnifiedEvent } from "../src/lib/core/types";
import { isEvmAddress } from "../src/lib/core/identity";
import { analyze } from "../src/lib/pipeline";
const [file, tf = "all"] = process.argv.slice(2);
const events: UnifiedEvent[] = JSON.parse(readFileSync(file, "utf8"));
const resolved = [...new Set(events.map((e) => e.wallet))].map((address) => ({ address, family: (isEvmAddress(address) ? "evm" : "solana") as "evm" | "solana" }));
const now = Math.floor(Date.now() / 1000), sinceTs = tf === "12m" ? now - 365 * 86400 : 0;
const s = await analyze({ events, resolved, timeframe: tf as "12m" | "all", sinceTs, coverageStart: sinceTs, truncated: false, cap: 0 });
const t = s.profitTimeline!;
const lineEnd = (t.points.at(-1)?.[1] ?? 0) + t.openUsd;
console.log("cards:", s.cards.join(","));
console.log("profit line end", lineEnd.toFixed(2), "vs total PnL", s.pnl.totalUsd, Math.abs(lineEnd - s.pnl.totalUsd) < 0.05 ? "✓ matches" : "✗ MISMATCH", "| points", t.points.length, "| best day", t.bestDay, "| worst day", t.worstDay);
console.log("speed", JSON.stringify(s.speed));
console.log("narratives", JSON.stringify(s.narratives));
console.log("round trip", s.roundTrip ? `${s.roundTrip.symbol} peak +${s.roundTrip.peakGainUsd} ended ${s.roundTrip.endedWithUsd}` : "none");
