// Re-run pricing + PnL on a saved events file and print every position. npm run debug -- out/x.events.json
import { readFileSync } from "node:fs";
import type { UnifiedEvent } from "../src/lib/core/types";
import { buildPriceBook } from "../src/lib/prices/pricebook";
import { enrichEvents } from "../src/lib/core/enrich";
import { filterSpam } from "../src/lib/core/spam";
import { mergeIdentity } from "../src/lib/core/identity";
import { runPnl } from "../src/lib/engine/pnl";

const events: UnifiedEvent[] = JSON.parse(readFileSync(process.argv[2], "utf8"));
const pb = await buildPriceBook(events, Math.floor(Date.now() / 1000) - 365 * 86400, {});
enrichEvents(events, pb);
filterSpam(events, (k) => pb.current(k));
mergeIdentity(events, [...new Set(events.map((e) => e.wallet))]);
const pos = [...runPnl(events, pb).values()].sort((a, b) => a.pnl - b.pnl);
for (const p of pos)
  console.log(
    `${p.token.symbol.padEnd(10)} ${p.chain.padEnd(9)} pnl ${p.pnl.toFixed(0).padStart(9)} real ${p.realized.toFixed(0).padStart(9)} unreal ${p.unrealized.toFixed(0).padStart(8)} cost ${p.costIn.toFixed(0).padStart(8)} proc ${p.proceeds.toFixed(0).padStart(8)} buys ${p.buys.length} sells ${p.sells.length} hold ${p.holding.toPrecision(3)} px ${p.currentPrice.toPrecision(3)}${p.partial ? " PARTIAL" : ""}`,
  );
