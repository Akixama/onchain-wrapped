// Simulated Zerion (date filters + cursors + 30ms per request) to prove the parallel reader returns
// exactly the full history: no gaps, no duplicates. Local file storage and fake keys, no real calls.
//   node --import tsx scripts/test-zerion-resume.mts
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "zres-"));
delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.KV_REST_API_URL;
process.env.ZERION_API_KEYS = "fake1,fake2";
const { zerionAdapter } = await import("../src/lib/chains/evm-zerion");
const { kv } = await import("../src/lib/infra/kv");

const W = "0x00000000000000000000000000000000000000aa";
const NOW = Math.floor(Date.now() / 1000);
const DAY = 86400;
let n = 0;
const tx = (t: number) => {
  const i = n++;
  return {
    id: `t${i}`,
    attributes: {
      operation_type: "trade", hash: `0xhash${i}`, mined_at: new Date(t * 1000).toISOString(), sent_from: W, status: "confirmed",
      fee: { quantity: { float: 0.0001 }, value: 0.3 },
      transfers: [
        { direction: "out", fungible_info: { name: "Ether", symbol: "ETH", implementations: [{ chain_id: "base", address: null, decimals: 18 }] }, quantity: { float: 0.01 }, value: 30, sender: W, recipient: "0xpool" },
        { direction: "in", fungible_info: { name: "Tok", symbol: "TOK", implementations: [{ chain_id: "base", address: "0xtok", decimals: 18 }] }, quantity: { float: 100 + i }, value: 30, sender: "0xpool", recipient: W },
      ],
    },
    relationships: { chain: { data: { id: "base" } } },
  };
};
type Tx = ReturnType<typeof tx>;
// 2,000 txs in the last 20 days, 1,000 over the rest of the year, plus some sharing a second exactly
// on likely cut points (edge-case for range boundaries).
let history: Tx[] = [
  ...Array.from({ length: 2000 }, (_, i) => tx(NOW - 100 - Math.floor((i / 2000) * 20 * DAY))),
  ...Array.from({ length: 1000 }, (_, i) => tx(NOW - 20 * DAY - Math.floor((i / 1000) * 340 * DAY))),
  ...[30, 90, 180].flatMap((d) => [tx(NOW - d * DAY), tx(NOW - d * DAY), tx(NOW - d * DAY + 1), tx(NOW - d * DAY - 1)]),
];
const sortNewest = () => history.sort((a, b) => Date.parse(b.attributes.mined_at) - Date.parse(a.attributes.mined_at));
sortNewest();

let budget = Infinity, calls = 0, ignoreMax = false;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input));
  if (!url.hostname.includes("zerion")) return realFetch(input, init);
  calls++;
  await new Promise((r) => setTimeout(r, 30));
  if (budget-- <= 0) return new Response("{}", { status: 429, headers: { "ratelimit-org-day-remaining": "0", "ratelimit-org-day-reset": "3600" } });
  const min = Number(url.searchParams.get("filter[min_mined_at]") ?? -Infinity);
  const max = ignoreMax ? Infinity : Number(url.searchParams.get("filter[max_mined_at]") ?? Infinity);
  const list = history.filter((t) => { const ms = Date.parse(t.attributes.mined_at); return ms >= min && ms <= max; });
  const at = Number(url.searchParams.get("c") ?? 0), size = Number(url.searchParams.get("page[size]") ?? 100);
  const next = at + size < list.length ? (() => { const u = new URL(url); u.searchParams.set("c", String(at + size)); return u.toString(); })() : undefined;
  return new Response(JSON.stringify({ data: list.slice(at, at + size), links: { next } }), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

const allHashes = () => new Set(history.map((t) => t.attributes.hash));
const check = (events: { txHash: string }[], label: string) => {
  const hashes = events.map((e) => e.txHash);
  assert.equal(new Set(hashes).size, hashes.length, `${label}: no duplicates`);
  const want = allHashes();
  const missing = [...want].filter((h) => !hashes.includes(h));
  assert.equal(missing.length, 0, `${label}: nothing missing (missing ${missing.length})`);
  assert.equal(hashes.length, want.size, `${label}: exactly the full history`);
};
const resetKeys = async () => {
  for (const k of ["fake1", "fake2"]) await kv().set(`zerion:spent:${createHash("sha256").update(k).digest("hex").slice(0, 12)}`, "0", 60);
};

// 1. Full read, all time.
let t0 = Date.now();
const r1 = await zerionAdapter.fetchEvents(W, { sinceTs: 0, maxTxs: Infinity });
check(r1.events, "parallel read");
console.log(`1. parallel read: ${r1.events.length} txs, ${calls} requests, ${((Date.now() - t0) / 1000).toFixed(1)}s (a one-after-another read is ${Math.ceil(history.length / 100)} requests in a row)`);

// 2. Daily limit mid-read, then next day with new transactions.
calls = 0; budget = 12;
const r2a = await zerionAdapter.fetchEvents(W + "b".repeat(0), { sinceTs: NOW - 365 * DAY, maxTxs: Infinity });
assert.equal(r2a.quotaCut, true);
const firstPart = r2a.events.length;
history = [...Array.from({ length: 7 }, (_, i) => tx(NOW - 10 - i)), ...history];
sortNewest();
await resetKeys();
budget = Infinity; calls = 0;
const r2b = await zerionAdapter.fetchEvents(W, { sinceTs: NOW - 365 * DAY, maxTxs: Infinity });
check(r2b.events, "resumed read");
console.log(`2. cut after ${firstPart} txs; next day: ${r2b.events.length} txs (incl. 7 new) in ${calls} more requests; notes: ${JSON.stringify(r2b.notes)}`);

// 3. Date filter ignored by the server: must fall back and still be exact.
calls = 0; ignoreMax = true;
const r3 = await zerionAdapter.fetchEvents(W, { sinceTs: 0, maxTxs: Infinity });
check(r3.events, "fallback read");
console.log(`3. date filter ignored -> fell back safely: ${r3.events.length} txs, ${calls} requests`);

console.log("\nzerion parallel-read tests passed ✔");
