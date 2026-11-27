// Check a saved run against the blockchain (Helius), without re-reading the wallet:
//  1) a random sample of trades: coin and SOL amounts per transaction
//  2) every transaction of the best and worst trade's coins, and their profit from chain amounts
//  3) transactions the chain has in the period that moved a coin but aren't in our data
//   node --max-old-space-size=8000 --env-file=.env.local --import tsx scripts/verify-saved.mts out/x/run [sample=300]
import { readFileSync } from "node:fs";
import type { UnifiedEvent } from "../src/lib/core/types";
import type { WrappedStats } from "../src/lib/engine/stats";
import { isMoney } from "../src/lib/core/assets";
import { fetchJson } from "../src/lib/infra/http";
import { heliusKey, loadHeliusKeys } from "../src/lib/chains/helius-keys";

const [prefix, nArg = "300"] = process.argv.slice(2);
const events: UnifiedEvent[] = JSON.parse(readFileSync(`${prefix}.events.json`, "utf8"));
const s: WrappedStats = JSON.parse(readFileSync(`${prefix}.stats.json`, "utf8"));
const wallet = s.meta.wallets[0];
await loadHeliusKeys();
const WSOL = "So11111111111111111111111111111111111111112";
type Tx = { signature: string; timestamp: number; transactionError?: unknown; accountData?: { account: string; nativeBalanceChange: number; tokenBalanceChanges?: { userAccount: string; mint: string; rawTokenAmount: { tokenAmount: string; decimals: number } }[] }[] };

let unread = 0;
async function chainTxs(sigs: string[], size = 100): Promise<Map<string, Tx>> {
  const out = new Map<string, Tx>();
  const uniq = [...new Set(sigs)];
  for (let i = 0; i < uniq.length; i += size) {
    const batch = uniq.slice(i, i + size);
    let txs: Tx[] = [];
    try { txs = await fetchJson<Tx[]>("helius", `https://api-mainnet.helius-rpc.com/v0/transactions?api-key=${heliusKey()}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transactions: batch }), timeoutMs: 60_000 }, 2); }
    catch { if (size > 5) { for (const [k, v] of await chainTxs(batch, Math.ceil(size / 4))) out.set(k, v); continue; } unread += batch.length; continue; }
    for (const t of txs) out.set(t.signature, t);
    if (uniq.length > 1000 && i % 2000 === 0) process.stderr.write(`\r  read ${i}/${uniq.length}   `);
  }
  return out;
}
/** The wallet's own SOL and coin changes in a transaction, from the chain (wrapped SOL counts as SOL). */
function changes(tx: Tx) {
  let sol = 0; const tok = new Map<string, number>();
  for (const a of tx.accountData ?? []) {
    if (a.account === wallet) sol += a.nativeBalanceChange / 1e9;
    for (const b of a.tokenBalanceChanges ?? []) {
      if (b.userAccount !== wallet) continue;
      const v = Number(b.rawTokenAmount.tokenAmount) / 10 ** b.rawTokenAmount.decimals;
      if (b.mint === WSOL) sol += v; else tok.set(b.mint, (tok.get(b.mint) ?? 0) + v);
    }
  }
  return { sol, tok };
}
const isSol = (l: UnifiedEvent["in"][number]) => isMoney(l.token) && /SOL/i.test(l.token.symbol ?? "");
function matches(e: UnifiedEvent, tx: Tx) {
  const { sol, tok } = changes(tx);
  const ourSol = e.in.filter(isSol).reduce((a, l) => a + l.amount, 0) - e.out.filter(isSol).reduce((a, l) => a + l.amount, 0);
  const coinsOk = [...e.in, ...e.out].filter((l) => !isMoney(l.token)).every((l) => {
    const ours = e.in.includes(l) ? l.amount : -l.amount;
    return Math.abs((tok.get(l.token.address) ?? 0) - ours) <= Math.abs(ours) * 0.001 + 1e-9;
  });
  // The chain's SOL change includes the network fee and tips; allow that.
  const solOk = Math.abs(sol - ourSol) <= Math.max(0.01, Math.abs(ourSol) * 0.03);
  return { coinsOk, solOk, sol, ourSol };
}

const trades = events.filter((e) => e.type === "swap" && !e.ownTransfer && !e.spam);
console.log(`wallet ${wallet.slice(0, 6)}…  ${s.meta.timeframe}  events ${events.length}, trades ${trades.length} (card says ${s.overview.totalTrades})`);

// 1) Random sample
let seed = 11; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const sample = [...new Map(Array.from({ length: Math.min(Number(nArg), trades.length) }, () => trades[Math.floor(rnd() * trades.length)]).map((e) => [e.id, e])).values()];
const st = await chainTxs(sample.map((e) => e.txHash));
let ok = 0; const bad: string[] = [];
for (const e of sample) {
  const tx = st.get(e.txHash);
  if (!tx) { bad.push(`${e.txHash.slice(0, 12)} not on chain`); continue; }
  const m = matches(e, tx);
  if (m.coinsOk && m.solOk) ok++; else bad.push(`${e.txHash.slice(0, 12)} coins ${m.coinsOk ? "ok" : "WRONG"} SOL ours ${m.ourSol.toFixed(4)} chain ${m.sol.toFixed(4)}`);
}
console.log(`\n1) random sample: ${ok}/${sample.length} trades match the chain exactly`);
for (const b of bad.slice(0, 10)) console.log("   ", b);

// 2) Best and worst coin: every transaction, from the chain
for (const [label, t] of [["best", s.bestTrade], ["worst", s.worstTrade]] as const) {
  if (!t) continue;
  const evs = events.filter((e) => [...e.in, ...e.out].some((l) => l.token.address === t.address));
  const txs = await chainTxs(evs.map((e) => e.txHash));
  let solNet = 0, tokNet = 0, usdNet = 0, mism = 0;
  for (const e of evs) {
    const tx = txs.get(e.txHash);
    if (!tx) { mism++; continue; }
    const c = changes(tx);
    solNet += c.sol; tokNet += c.tok.get(t.address) ?? 0;
    // Value the chain's SOL change at the SOL price we used for this event.
    const solLeg = [...e.in, ...e.out].find((l) => isSol(l) && l.usd && l.amount);
    const px = solLeg ? solLeg.usd! / solLeg.amount : NaN;
    if (Number.isFinite(px)) usdNet += c.sol * px;
    if (!matches(e, tx).coinsOk) mism++;
  }
  console.log(`\n2) ${label} trade $${t.symbol}: card ${t.pnlUsd >= 0 ? "+" : ""}${Math.round(t.pnlUsd)} | ${evs.length} transactions, ${mism} differ from chain`);
  console.log(`   chain: net SOL ${solNet.toFixed(3)} (~$${Math.round(usdNet)} at the time, incl. fees), coins left ${tokNet.toFixed(2)} | card: put in $${Math.round(t.costUsd)}, got back $${Math.round(t.proceedsUsd)}, still held $${Math.round(t.holdingValueUsd)}`);
}

// 3) Missing: every signature the chain has for the wallet in the period
const since = s.meta.fromTs, ours = new Set(events.map((e) => e.txHash));
const sigs: { signature: string; blockTime: number; err: unknown }[] = [];
let before: string | undefined;
for (;;) {
  const r = await fetchJson<{ result: { signature: string; blockTime: number; err: unknown }[] }>("helius-rpc", `https://mainnet.helius-rpc.com/?api-key=${heliusKey()}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [wallet, { limit: 1000, before }] }),
  });
  const list = r.result ?? [];
  let done = !list.length;
  for (const x of list) { if (x.blockTime < since) { done = true; break; } sigs.push(x); }
  if (done) break;
  before = list[list.length - 1].signature;
  if (sigs.length % 20000 < 1000) process.stderr.write(`\r  listed ${sigs.length}   `);
}
const unknown = sigs.filter((x) => !x.err && !ours.has(x.signature)).map((x) => x.signature);
console.log(`\n3) chain has ${sigs.length.toLocaleString()} transactions in the period (${sigs.filter((x) => x.err).length.toLocaleString()} failed); ${unknown.length.toLocaleString()} successful ones aren't in our data — checking if any moved a coin…`);
const capped = unknown.slice(0, Number(process.env.MISSING_CAP ?? 30000));
const ut = await chainTxs(capped, 25);
const moved = [...ut.values()].filter((tx) => { const c = changes(tx); return [...c.tok.values()].some((v) => Math.abs(v) > 0); });
console.log(`   of ${capped.length.toLocaleString()} checked, ${moved.length} changed a coin balance of this wallet${unread ? ` (${unread} wouldn't load from Helius)` : ""}${capped.length < unknown.length ? ` (capped; ${unknown.length - capped.length} not checked)` : ""}`);
for (const tx of moved.slice(0, 10)) { const c = changes(tx); console.log("   ", tx.signature.slice(0, 14), new Date(tx.timestamp * 1000).toISOString().slice(0, 16), [...c.tok.entries()].map(([m, v]) => `${m.slice(0, 6)} ${v.toFixed(2)}`).join(", "), `SOL ${c.sol.toFixed(4)}`); }
process.exit(0);
