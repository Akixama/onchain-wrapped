// Read one date range of a Solana wallet from Zerion (no on-chain check) and compare with a saved run.
//   node --env-file=.env.local --import tsx scripts/read-range.mts <wallet> 2026-02-10 2026-02-26 [saved.events.json]
import { readFileSync } from "node:fs";
import { zerionSolanaAdapter } from "../src/lib/chains/evm-zerion";
import type { UnifiedEvent } from "../src/lib/core/types";
const [w, a, b, saved] = process.argv.slice(2);
const from = Date.parse(a) / 1000, to = Date.parse(b) / 1000;
// FAKE_CUT=n: pretend Zerion ended a range early on its n-th page (drops the "next page" link).
if (process.env.FAKE_CUT) {
  const real = globalThis.fetch; let n = 0;
  globalThis.fetch = (async (u: RequestInfo | URL, init?: RequestInit) => {
    const r = await real(u, init);
    if (!String(u).includes("api.zerion.io") || ++n !== Number(process.env.FAKE_CUT)) return r;
    const j = await r.json(); delete j.links?.next; console.log(`
[fake] cut a range short at page ${n}`);
    return new Response(JSON.stringify(j), { status: r.status, headers: r.headers });
  }) as typeof fetch;
}
const t = Date.now();
const evs = await new Promise<UnifiedEvent[]>((res, rej) => {
  zerionSolanaAdapter.fetchEvents(w, { sinceTs: from, untilTs: to, maxTxs: Infinity, onProgress: (p) => process.stdout.write(`${p.fetched} ${p.message ?? ""}   `), onSlowCheck: (e) => res([...e]) }).then((r) => res(r.events), rej);
});
const inRange = (e: UnifiedEvent) => e.timestamp >= from && e.timestamp < to;
const got = new Set(evs.filter(inRange).map((e) => e.txHash));
console.log(`read ${got.size} txs in range in ${((Date.now() - t) / 1000).toFixed(0)}s`);
if (saved) {
  const old = new Set((JSON.parse(readFileSync(saved, "utf8")) as UnifiedEvent[]).filter(inRange).map((e) => e.txHash));
  console.log(`saved run had ${old.size}; only in saved ${[...old].filter((h) => !got.has(h)).length}, only in new read ${[...got].filter((h) => !old.has(h)).length}`);
}
const { usageSnapshot } = await import("../src/lib/infra/usage");
console.log("requests", JSON.stringify(usageSnapshot()).match(/"zerion[^}]*}/g)?.join(" ") ?? JSON.stringify(usageSnapshot()).slice(0, 300));
process.exit(0);
