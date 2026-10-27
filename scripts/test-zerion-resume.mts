// Simulated Zerion: lookup 1 hits the daily limit mid-history; lookup 2 (next day) picks up new txs
// and carries on from the saved spot. Uses local file storage and fake keys, no real API calls.
//   node --import tsx scripts/test-zerion-resume.mts
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "zres-"));
delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.KV_REST_API_URL;
process.env.ZERION_API_KEYS = "fake1,fake2";
const { zerionAdapter } = await import("../src/lib/chains/evm-zerion");
const { kv } = await import("../src/lib/infra/kv");

const W = "0x00000000000000000000000000000000000000aa";
const tx = (n: number) => ({
  id: `t${n}`,
  attributes: {
    operation_type: "trade", hash: `0xhash${n}`, mined_at: new Date(Date.UTC(2026, 9, 1) - n * 3600_000).toISOString(), sent_from: W, status: "confirmed",
    fee: { quantity: { float: 0.0001 }, value: 0.3 },
    transfers: [
      { direction: "out", fungible_info: { name: "Ether", symbol: "ETH", implementations: [{ chain_id: "base", address: null, decimals: 18 }] }, quantity: { float: 0.01 }, value: 30, sender: W, recipient: "0xpool" },
      { direction: "in", fungible_info: { name: "Tok", symbol: "TOK", implementations: [{ chain_id: "base", address: "0xtok", decimals: 18 }] }, quantity: { float: 100 + n }, value: 30, sender: "0xpool", recipient: W },
    ],
  },
  relationships: { chain: { data: { id: "base" } } },
});
let history = Array.from({ length: 50 }, (_, i) => tx(i + 1)); // newest first
let budget = 3; // pages allowed before every key is "out for today"
let calls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input));
  if (!url.hostname.includes("zerion")) return realFetch(input, init);
  calls++;
  if (budget-- <= 0) return new Response("{}", { status: 429, headers: { "ratelimit-org-day-remaining": "0", "ratelimit-org-day-reset": "3600" } });
  const page = Number(url.searchParams.get("p") ?? 0);
  const size = 10;
  const data = history.slice(page * size, page * size + size);
  const next = (page + 1) * size < history.length ? (() => { const u = new URL(url); u.searchParams.set("p", String(page + 1)); return u.toString(); })() : undefined;
  return new Response(JSON.stringify({ data, links: { next } }), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

// Lookup 1: 3 pages (30 txs), then the limit.
const r1 = await zerionAdapter.fetchEvents(W, { sinceTs: 0, maxTxs: Infinity });
assert.equal(r1.quotaCut, true, "first lookup is cut by the limit");
assert.equal(r1.events.length, 30);
console.log("lookup 1:", r1.events.length, "txs, cut by limit:", r1.quotaCut, "| calls", calls);

// Next day: limits reset, and 5 new transactions happened since.
for (const k of ["fake1", "fake2"]) await kv().set(`zerion:spent:${(await import("node:crypto")).createHash("sha256").update(k).digest("hex").slice(0, 12)}`, "0", 60);
history = [...Array.from({ length: 5 }, (_, i) => tx(-(i + 1))), ...history];
budget = 100; calls = 0;
const r2 = await zerionAdapter.fetchEvents(W, { sinceTs: 0, maxTxs: Infinity });
const hashes = r2.events.map((e) => e.txHash);
assert.equal(new Set(hashes).size, hashes.length, "no duplicates");
assert.equal(hashes.length, 55, "all 50 old + 5 new");
assert.ok(!r2.quotaCut && !r2.truncated, "finished");
console.log("lookup 2:", hashes.length, "txs (50 old + 5 new, no duplicates) | Zerion calls:", calls, "(a fresh read would need 6)");
console.log("notes:", r2.notes);
console.log("\nzerion resume test passed ✔");
