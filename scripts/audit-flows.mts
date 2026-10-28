// Where did coins that arrived / left by plain transfer come from / go to? (top counterparties by USD)
import { readFileSync } from "node:fs";
import { isMoney } from "../src/lib/core/assets";
import type { UnifiedEvent } from "../src/lib/core/types";
const [file] = process.argv.slice(2);
const events: UnifiedEvent[] = JSON.parse(readFileSync(file, "utf8"));
const tally = (dir: "in" | "out", money: boolean) => {
  const m = new Map<string, { n: number; usd: number }>();
  for (const e of events) {
    if (e.type !== (dir === "in" ? "transfer_in" : "transfer_out")) continue;
    for (const l of e[dir]) {
      if (isMoney(l.token) !== money) continue;
      const k = l.counterparty ?? "(unknown)";
      const r = m.get(k) ?? { n: 0, usd: 0 };
      r.n++; r.usd += l.usd ?? 0; m.set(k, r);
    }
  }
  const all = [...m.entries()].sort((a, b) => b[1].usd - a[1].usd);
  const tot = all.reduce((s, [, r]) => s + r.usd, 0), cnt = all.reduce((s, [, r]) => s + r.n, 0);
  console.log(`${money ? "SOL/USDC" : "coins"} ${dir === "in" ? "received" : "sent"}: ${cnt} transfers, $${Math.round(tot).toLocaleString()}, ${all.length} counterparties`);
  for (const [k, r] of all.slice(0, 6)) console.log(`   ${k}  ${r.n} transfers  $${Math.round(r.usd).toLocaleString()}`);
};
tally("in", false); tally("out", false); tally("in", true); tally("out", true);
process.exit(0);
