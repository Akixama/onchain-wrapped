// Compare today's saved Zerion read (local storage) with an older events file, month by month.
//   UPSTASH_REDIS_REST_URL= node --env-file=.env.local --import tsx scripts/cmp-reads.mts <wallet> <old.events.json>
import { readFileSync } from "node:fs";
import type { UnifiedEvent } from "../src/lib/core/types";
const [w, oldFile] = process.argv.slice(2);
const now: UnifiedEvent[] = JSON.parse(readFileSync(process.argv[4], "utf8"));
const old: UnifiedEvent[] = JSON.parse(readFileSync(oldFile, "utf8"));
const month = (t: number) => new Date(t * 1000).toISOString().slice(0, 7);
const tally = (evs: UnifiedEvent[]) => { const m = new Map<string, { all: number; swap: number; tx: Set<string> }>(); for (const e of evs) { const k = month(e.timestamp); const r = m.get(k) ?? { all: 0, swap: 0, tx: new Set() }; r.all++; if (e.type === "swap") r.swap++; r.tx.add(e.txHash); m.set(k, r); } return m; };
const a = tally(old), b = tally(now);
console.log("events old", old.length, "now", now.length);
console.log("month    old(all/swap)   now(all/swap)   txs only-old  only-new");
for (const k of [...new Set([...a.keys(), ...b.keys()])].sort()) {
  const x = a.get(k), y = b.get(k);
  let onlyOld = 0, onlyNew = 0;
  if (x && y) { for (const t of x.tx) if (!y.tx.has(t)) onlyOld++; for (const t of y.tx) if (!x.tx.has(t)) onlyNew++; }
  console.log(k, String(x?.all ?? 0).padStart(7), String(x?.swap ?? 0).padStart(7), " ", String(y?.all ?? 0).padStart(7), String(y?.swap ?? 0).padStart(7), "  ", String(onlyOld).padStart(6), String(onlyNew).padStart(7));
}
process.exit(0);
