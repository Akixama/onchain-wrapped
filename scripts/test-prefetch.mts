// Prices looked up early (prefetchCurrent) must give the same price book as looking them up at the end.
//   node --env-file=.env.local --import tsx scripts/test-prefetch.mts out/audit/suqh.events.fixed.json
import { readFileSync } from "node:fs";
import type { UnifiedEvent } from "../src/lib/core/types";
import { tokenKey } from "../src/lib/core/types";
import { isMoney } from "../src/lib/core/assets";
import { buildPriceBook, prefetchCurrent, type KnownPrices } from "../src/lib/prices/pricebook";
const events: UnifiedEvent[] = JSON.parse(readFileSync(process.argv[2], "utf8"));
const since = Math.floor(Date.now() / 1000) - 365 * 86400;
const keys = [...new Set(events.flatMap((e) => [...e.in, ...e.out]).filter((l) => !isMoney(l.token)).map((l) => tokenKey(l.token)))];
let t = Date.now();
const known: KnownPrices = {};
const asked = await prefetchCurrent(events, known, Date.now() + 600_000);
console.log(`prefetch: ${asked} answers in ${((Date.now() - t) / 1000).toFixed(0)}s`);
t = Date.now(); const warm = await buildPriceBook(events, since, {}, 25, known); console.log(`price book with prefetch: ${((Date.now() - t) / 1000).toFixed(0)}s`);
t = Date.now(); const cold = await buildPriceBook(events, since, {}); console.log(`price book without: ${((Date.now() - t) / 1000).toFixed(0)}s`);
let same = 0, priceGone = 0, drift = 0, liqDiff = 0;
for (const k of keys) {
  const a = warm.current(k), b = cold.current(k);
  if ((a === undefined) !== (b === undefined) || (a === 0) !== (b === 0)) { priceGone++; if (priceGone <= 5) console.log("  differs", k, a, b); continue; }
  if (a !== undefined && b !== undefined && Math.abs(a - b) > Math.abs(b) * 0.05) drift++;
  if ((warm.liquidity(k) === undefined) !== (cold.liquidity(k) === undefined)) liqDiff++;
  same++;
}
console.log(`${keys.length} coins: ${same} same, ${priceGone} found by one but not the other, ${drift} moved >5% between lookups, ${liqDiff} liquidity known by one only`);
process.exit(0);
