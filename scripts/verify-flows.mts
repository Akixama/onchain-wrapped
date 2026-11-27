// Raw-RPC checks on a saved run (getTransaction, so no parser in between):
//  A) money transfers >= $50: was any of them really a trade (a coin balance of the wallet also changed)?
//  B) transactions the chain has in the period that aren't in our data: did any change a coin balance?
//  C) the wallet's SOL balance just before its first transaction in the period, vs now.
//   node --max-old-space-size=8000 --env-file=.env.local --import tsx scripts/verify-flows.mts out/x/run
import { readFileSync, writeFileSync } from "node:fs";
import type { UnifiedEvent } from "../src/lib/core/types";
import type { WrappedStats } from "../src/lib/engine/stats";
import { isMoney } from "../src/lib/core/assets";
import { fetchJson } from "../src/lib/infra/http";
import { heliusKey, loadHeliusKeys } from "../src/lib/chains/helius-keys";
import { drain } from "../src/lib/infra/drain";

const [prefix] = process.argv.slice(2);
const events: UnifiedEvent[] = JSON.parse(readFileSync(`${prefix}.events.json`, "utf8"));
const s: WrappedStats = JSON.parse(readFileSync(`${prefix}.stats.json`, "utf8"));
const W = s.meta.wallets[0];
await loadHeliusKeys();
const STABLE_OR_SOL = new Set(["So11111111111111111111111111111111111111112", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"]);

const rpc = <T,>(method: string, params: unknown[]) =>
  fetchJson<{ result: T; error?: { message: string } }>("helius-rpc", `https://mainnet.helius-rpc.com/?api-key=${heliusKey()}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), timeoutMs: 30_000,
  }, 4).then((r) => r.result);

type RawTx = {
  blockTime: number;
  meta: { err: unknown; fee: number; preBalances: number[]; postBalances: number[];
    preTokenBalances?: { owner?: string; mint: string; uiTokenAmount: { uiAmount: number | null } }[];
    postTokenBalances?: { owner?: string; mint: string; uiTokenAmount: { uiAmount: number | null } }[] } | null;
  transaction: { message: { accountKeys: { pubkey: string }[] } };
};
const getTx = (sig: string) => rpc<RawTx | null>("getTransaction", [sig, { encoding: "jsonParsed", maxSupportedTransactionVersion: 1, commitment: "confirmed" }]);

/** The wallet's SOL change and its non-money coin changes in one transaction. */
function walletChanges(tx: RawTx) {
  const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey);
  const i = keys.indexOf(W);
  const sol = i >= 0 && tx.meta ? (tx.meta.postBalances[i] - tx.meta.preBalances[i]) / 1e9 : 0;
  const coins = new Map<string, number>();
  for (const [list, sign] of [[tx.meta?.preTokenBalances ?? [], -1], [tx.meta?.postTokenBalances ?? [], 1]] as const)
    for (const b of list) if (b.owner === W && !STABLE_OR_SOL.has(b.mint)) coins.set(b.mint, (coins.get(b.mint) ?? 0) + sign * (b.uiTokenAmount.uiAmount ?? 0));
  for (const [m, v] of coins) if (Math.abs(v) < 1e-9) coins.delete(m);
  return { sol, coins };
}

async function readAll(sigs: string[], label: string) {
  const out = new Map<string, RawTx | null>();
  let n = 0;
  await drain(sigs, Number(process.env.RPC_WORKERS ?? 6), undefined, async (sig) => {
    try { out.set(sig, await getTx(sig)); } catch { await new Promise((r) => setTimeout(r, 2000)); try { out.set(sig, await getTx(sig)); } catch { out.set(sig, null); } }
    if (++n % 250 === 0) process.stderr.write(`\r  ${label}: ${n}/${sigs.length}   `);
  });
  return out;
}

// A) money transfers >= $50
const moneyUsd = (e: UnifiedEvent) => [...e.in, ...e.out].filter((l) => isMoney(l.token)).reduce((a, l) => a + (l.usd ?? 0), 0);
const transfers = process.env.SKIP_A ? [] : events.filter((e) => e.type !== "swap" && !e.ownTransfer && moneyUsd(e) >= 50);
const ta = await readAll([...new Set(transfers.map((e) => e.txHash))], "transfers");
let hidden = 0, hiddenUsd = 0, unreadA = 0;
const hiddenList: string[] = [];
for (const e of transfers) {
  const tx = ta.get(e.txHash);
  if (!tx) { unreadA++; continue; }
  const c = walletChanges(tx);
  if (c.coins.size) { hidden++; hiddenUsd += moneyUsd(e); if (hiddenList.length < 8) hiddenList.push(`${e.txHash.slice(0, 14)} ${e.type} $${Math.round(moneyUsd(e))} coins ${[...c.coins.entries()].map(([m, v]) => `${m.slice(0, 6)} ${v.toFixed(2)}`).join(",")}`); }
}
console.log(`\nA) ${transfers.length} money transfers >= $50 checked on chain: ${hidden} also moved a coin (worth $${Math.round(hiddenUsd)} of the transfers)${unreadA ? `, ${unreadA} couldn't be read` : ""}`);
for (const h of hiddenList) console.log("   ", h);

// B) missing: chain signatures in the period that aren't in our data
const ours = new Set(events.map((e) => e.txHash));
const sigs: { signature: string; blockTime: number; err: unknown }[] = [];
let before: string | undefined;
for (;;) {
  const list = (await rpc<{ signature: string; blockTime: number; err: unknown }[]>("getSignaturesForAddress", [W, { limit: 1000, before }])) ?? [];
  let done = !list.length;
  for (const x of list) { if (x.blockTime < s.meta.fromTs) { done = true; break; } sigs.push(x); }
  if (done) break;
  before = list[list.length - 1].signature;
}
const unknown = sigs.filter((x) => !x.err && !ours.has(x.signature)).map((x) => x.signature);
const tb = await readAll(unknown, "missing");
let movedCoin = 0, movedSol = 0, unreadB = 0;
const movedList: string[] = [];
for (const sig of unknown) {
  const tx = tb.get(sig);
  if (!tx) { unreadB++; continue; }
  const c = walletChanges(tx);
  if (c.coins.size) { movedCoin++; if (movedList.length < 10) movedList.push(`${sig.slice(0, 14)} ${new Date(tx.blockTime * 1000).toISOString().slice(0, 16)} SOL ${c.sol.toFixed(4)} coins ${[...c.coins.entries()].map(([m, v]) => `${m.slice(0, 6)} ${v.toFixed(2)}`).join(",")}`); }
  else if (Math.abs(c.sol) > 0.01) movedSol++;
}
console.log(`\nB) chain: ${sigs.length.toLocaleString()} transactions in the period; ${unknown.length.toLocaleString()} successful ones not in our data. Of those: ${movedCoin} changed a coin balance, ${movedSol} moved over 0.01 SOL only, the rest moved nothing of this wallet${unreadB ? ` (${unreadB} couldn't be read)` : ""}`);
for (const m of movedList) console.log("   ", m);

// C) SOL balance at the start of the period (just before the first transaction in it) vs now
const first = [...sigs].sort((a, b) => a.blockTime - b.blockTime)[0];
const ftx = first ? await getTx(first.signature) : null;
const keys = ftx?.transaction.message.accountKeys.map((k) => k.pubkey) ?? [];
const startSol = ftx?.meta ? ftx.meta.preBalances[keys.indexOf(W)] / 1e9 : NaN;
const nowSol = (await rpc<{ value: number }>("getBalance", [W])).value / 1e9;
console.log(`\nC) SOL balance at the start (${first ? new Date(first.blockTime * 1000).toISOString().slice(0, 10) : "?"}): ${startSol.toFixed(2)} SOL | now: ${nowSol.toFixed(2)} SOL`);
writeFileSync(`${prefix}.flows.json`, JSON.stringify({ hidden, hiddenUsd, unknown: unknown.length, movedCoin, movedSol, startSol, nowSol }));
process.exit(0);
