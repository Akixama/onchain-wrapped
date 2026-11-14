// Analyze saved events and print the Pump.fun Wrapped stats; with --save <id>, store the result for a local preview.
//   UPSTASH_REDIS_REST_URL= node --env-file=.env.local --import tsx scripts/test-pump.mts out/cented.events.json [--save test-pump]
import { readFileSync } from "node:fs";
import type { UnifiedEvent } from "../src/lib/core/types";
import { analyze } from "../src/lib/pipeline";
import { putJob } from "../src/lib/store";
const [file] = process.argv.slice(2);
const sv = process.argv.indexOf("--save"), saveId = sv > 0 ? process.argv[sv + 1] : null;
const events: UnifiedEvent[] = JSON.parse(readFileSync(file, "utf8"));
const resolved = [...new Set(events.map((e) => e.wallet))].map((address) => ({ address, family: "solana" as const }));
const now = Math.floor(Date.now() / 1000), sinceTs = now - 365 * 86400;
const s = await analyze({ events, resolved, timeframe: "12m", sinceTs, coverageStart: sinceTs, truncated: false, cap: 0, finishBy: Date.now() + 240_000 });
console.log(file, JSON.stringify(s.pumpfun, null, 1));
console.log("cards:", s.cards.join(","));
if (saveId) { await putJob({ id: saveId, status: "done", inputs: s.meta.wallets, wallets: s.meta.wallets, names: {}, timeframe: "12m", createdAt: Date.now(), updatedAt: Date.now(), stats: s }); console.log("saved", saveId); }
process.exit(0);
