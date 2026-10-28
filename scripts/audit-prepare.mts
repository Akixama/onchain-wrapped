// Re-run the on-chain double-check on a saved events file (ignoring any earlier "checked" marks),
// re-price, and write <file>.fixed.json for the audit.
import { readFileSync, writeFileSync } from "node:fs";
import { verifyTransfersHelius } from "../src/lib/chains/solana-helius";
import { isMoney } from "../src/lib/core/assets";
import { buildPriceBook } from "../src/lib/prices/pricebook";
import { enrichEvents } from "../src/lib/core/enrich";
import type { UnifiedEvent } from "../src/lib/core/types";
const file = process.argv[2];
const events: UnifiedEvent[] = JSON.parse(readFileSync(file, "utf8"));
for (const e of events) { e.verified = false; e.onchainFix = false; }
const t = Date.now();
const v = await verifyTransfersHelius(events, isMoney, undefined, (d, n) => process.stderr.write(`\rchecked ${d}/${n}   `));
console.error(`\nverify: checked ${v.checked}, fixed ${v.fixed}, left ${v.remaining} in ${((Date.now() - t) / 1000).toFixed(0)}s`);
const now = Math.floor(Date.now() / 1000);
const pb = await buildPriceBook(events, now - 365 * 86400, {});
enrichEvents(events, pb);
writeFileSync(file.replace(/\.json$/, ".fixed.json"), JSON.stringify(events));
console.error("saved");
process.exit(0);
