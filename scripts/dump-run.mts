// Run a lookup once and save its events + stats, so several checks can reuse them.
//   node --env-file=.env.local --import tsx scripts/dump-run.mts <3m|1m|6m|12m> <out-prefix> <wallet> [...]
import { writeFileSync } from "node:fs";
import { runWrapped, type FetchSlots } from "../src/lib/pipeline";
const [tf, prefix, ...wallets] = process.argv.slice(2);
const t0 = Date.now();
let resume: FetchSlots | undefined, r;
for (let part = 1; ; part++) {
  r = await runWrapped({ addresses: wallets, timeframe: tf as "3m", resume, onProgress: (p) => process.stderr.write(`\r[${((Date.now() - t0) / 1000).toFixed(0)}s] ${p.stage} ${p.message.slice(0, 70)} — ${p.fetched}     `) });
  if (!r.partial) break;
  resume = JSON.parse(JSON.stringify(r.partial));
}
writeFileSync(`${prefix}.events.json`, JSON.stringify(r.events));
writeFileSync(`${prefix}.stats.json`, JSON.stringify(r.stats));
const s = r.stats;
console.log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(0)}s: trades ${s.overview.totalTrades}, volume ${s.overview.volumeUsd}, pnl ${s.pnl.totalUsd}, gas ${s.gas.totalUsd}, best ${s.bestTrade?.symbol} ${s.bestTrade?.pnlUsd}, worst ${s.worstTrade?.symbol} ${s.worstTrade?.pnlUsd}`);
console.log("notes", s.meta.notes);
process.exit(0);
