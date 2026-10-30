// Finish the on-chain double-check on a saved events file (with the retrying checker) and save the result.
//   node --max-old-space-size=10000 --env-file=.env.local --import tsx scripts/reverify.mts <in.events.json> <out.events.json>
import { readFileSync, writeFileSync } from "node:fs";
import type { UnifiedEvent } from "../src/lib/core/types";
import { isMoney } from "../src/lib/core/assets";
import { verifyTransfersHelius } from "../src/lib/chains/solana-helius";
const [inp, out] = process.argv.slice(2);
const events: UnifiedEvent[] = JSON.parse(readFileSync(inp, "utf8"));
const swaps = () => events.filter((e) => e.type === "swap").length;
console.log("events", events.length, "swaps before", swaps(), "unchecked", events.filter((e) => !e.verified).length);
const t0 = Date.now();
const v = await verifyTransfersHelius(events, isMoney, undefined, (d, t) => { if (d % 2000 < 100) process.stderr.write(`\r${d}/${t}   `); });
console.log(`\nchecked ${v.checked}, fixed ${v.fixed}, failed ${v.failed}, remaining ${v.remaining} in ${((Date.now() - t0) / 1000).toFixed(0)}s; swaps after ${swaps()}`);
writeFileSync(out, JSON.stringify(events));
process.exit(0);
