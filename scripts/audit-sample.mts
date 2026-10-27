// Random-sample audit: N trades re-read from the chain, compared leg by leg.
import { readFileSync } from "node:fs";
import type { UnifiedEvent } from "../src/lib/core/types";
import { normalizeRaw } from "../src/lib/chains/solana-rpc";
const [file, nStr] = process.argv.slice(2);
const events: UnifiedEvent[] = JSON.parse(readFileSync(file, "utf8")).filter((e: UnifiedEvent) => e.chain === "solana" && e.type === "swap");
const pick = [...events].sort(() => Math.random() - 0.5).slice(0, Number(nStr ?? 25));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let match = 0, mismatch = 0;
for (const e of pick) {
  await sleep(1100);
  const r = await fetch("https://api.mainnet-beta.solana.com", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTransaction", params: [e.txHash, { encoding: "jsonParsed", maxSupportedTransactionVersion: 1 }] }) }).then((x) => x.json());
  const c = r.result && normalizeRaw(e.wallet, r.result);
  const sum = (legs: UnifiedEvent["in"]) => Object.fromEntries(legs.map((l) => [l.token.address, l.amount]));
  const a = { ...sum(e.in) }, ao = { ...sum(e.out) }, b = c ? sum(c.in) : {}, bo = c ? sum(c.out) : {};
  const same = (x: Record<string, number>, y: Record<string, number>) => Object.keys({ ...x, ...y }).every((k) => Math.abs((x[k] ?? 0) - (y[k] ?? 0)) <= Math.max(0.003, Math.abs(x[k] ?? 0) * 1e-6));
  if (c && same(a, b) && same(ao, bo)) match++; else { mismatch++; console.log("MISMATCH", e.txHash.slice(0, 12), JSON.stringify({ app: [a, ao], chain: [b, bo] })); }
}
console.log(`sample: ${match} of ${pick.length} trades match the chain exactly (${mismatch} mismatches)`);
