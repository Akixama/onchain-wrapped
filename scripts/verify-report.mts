// Shows what the on-chain double-check would change, without saving anything.
import { readFileSync } from "node:fs";
import type { UnifiedEvent } from "../src/lib/core/types";
import { isMoney } from "../src/lib/core/assets";
import { verifySolanaTransfers } from "../src/lib/chains/solana-rpc";
const events: UnifiedEvent[] = JSON.parse(readFileSync(process.argv[2], "utf8"));
const before = new Map(events.map((e) => [e.id, e.type]));
await verifySolanaTransfers(events, isMoney);
const changed = events.filter((e) => before.get(e.id) !== e.type);
const sol = (l: UnifiedEvent["in"]) => l.filter((x) => isMoney(x.token)).reduce((s, x) => s + x.amount, 0);
const buckets: Record<string, number> = {};
for (const e of changed) {
  const kind = e.in.some((l) => isMoney(l.token)) ? "sell" : "buy";
  const amt = sol(e.in) + sol(e.out);
  const b = amt < 0.01 ? "<0.01" : amt < 0.1 ? "0.01-0.1" : amt < 1 ? "0.1-1" : amt < 10 ? "1-10" : "10+";
  buckets[`${before.get(e.id)}→${kind} ${b} money`] = (buckets[`${before.get(e.id)}→${kind} ${b} money`] ?? 0) + 1;
}
console.log(JSON.stringify(buckets, null, 1));
for (const e of changed.slice(0, 6)) console.log(e.txHash.slice(0, 12), before.get(e.id), "→", e.type, "IN", e.in.map((l) => l.amount.toPrecision(4) + " " + l.token.symbol).join(","), "OUT", e.out.map((l) => l.amount.toPrecision(4) + " " + l.token.symbol).join(","));
