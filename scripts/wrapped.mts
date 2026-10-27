// Run the whole engine from the terminal and print card data as JSON.
//   npm run wrapped -- <address> [<address> ...] [--all] [--max 3000] [--out out/result.json]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { runWrapped, type FetchSlots } from "../src/lib/pipeline";
import { COST_HINT } from "../src/lib/infra/usage";

const args = process.argv.slice(2);
const flag = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const all = args.includes("--all");
const max = flag("--max");
// --segment N: stop and resume every N seconds, like the server does (round-trips the saved state through JSON).
const segment = flag("--segment");
const out = flag("--out");
const addresses = args.filter((a) => !a.startsWith("--"));
if (!addresses.length) {
  console.error("usage: npm run wrapped -- <address...> [--all] [--max N] [--out file.json]");
  process.exit(1);
}

const t0 = Date.now();
let resume: FetchSlots | undefined;
let run;
for (let part = 1; ; part++) {
  run = await runWrapped({
    addresses,
    timeframe: all ? "all" : "12m",
    maxTxsPerAddress: max ? Number(max) : undefined,
    deadline: segment ? Date.now() + Number(segment) * 1000 : undefined,
    resume,
    onProgress: (p) => process.stderr.write(`\r[part ${part}] [${p.stage}] ${p.message} — ${p.fetched} txs   `),
  });
  if (!run.partial) break;
  resume = JSON.parse(JSON.stringify(run.partial));
  process.stderr.write(`\n— part ${part} out of time, resuming (${JSON.stringify(resume).length.toLocaleString()} bytes of saved progress)\n`);
}
const { stats, events, usage } = run;
process.stderr.write("\n");

if (out) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(stats, null, 2));
  writeFileSync(out.replace(/\.json$/, ".events.json"), JSON.stringify(events, null, 1));
}
console.log(JSON.stringify(stats, null, 2));
console.error(`\nTook ${((Date.now() - t0) / 1000).toFixed(1)}s. API calls:`);
for (const [p, c] of Object.entries(usage)) console.error(`  ${p}: ${c.calls} calls (${c.errors} errors) — ${COST_HINT[p] ?? ""}`);
