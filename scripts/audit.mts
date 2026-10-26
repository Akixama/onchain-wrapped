// Accuracy audit: re-read each trade of chosen tokens straight from Solana RPC and compare with the
// provider data the app used.   node --import tsx scripts/audit.mts out/cented.events.json SYM1 SYM2 ...
import { readFileSync } from "node:fs";
import type { UnifiedEvent } from "../src/lib/core/types";
import { normalizeRaw } from "../src/lib/chains/solana-rpc";

const [file, ...syms] = process.argv.slice(2);
const events: UnifiedEvent[] = JSON.parse(readFileSync(file, "utf8"));
const wallet = events[0].wallet;
const rpc = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getTx(sig: string) {
  for (let i = 0; i < 5; i++) {
    const r = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTransaction", params: [sig, { encoding: "jsonParsed", maxSupportedTransactionVersion: 1 }] }) });
    if (r.status === 429) { await sleep(2000 * (i + 1)); continue; }
    return (await r.json()).result;
  }
  return null;
}
const sol = (legs: UnifiedEvent["in"]) => legs.filter((l) => l.token.address === "native").reduce((s, l) => s + l.amount, 0);
const tok = (legs: UnifiedEvent["in"], mint: string) => legs.filter((l) => l.token.address === mint).reduce((s, l) => s + l.amount, 0);

for (const sym of syms) {
  const evs = events.filter((e) => [...e.in, ...e.out].some((l) => l.token.symbol === sym)).sort((a, b) => a.timestamp - b.timestamp);
  const mint = [...evs[0].in, ...evs[0].out].find((l) => l.token.symbol === sym)!.token.address;
  console.log(`\n=== $${sym} (${mint}) — ${evs.length} events`);
  let solMismatch = 0, tokMismatch = 0;
  const tot = { appSolOut: 0, appSolIn: 0, rpcSolOut: 0, rpcSolIn: 0, appUsdOut: 0, appUsdIn: 0 };
  for (const e of evs) {
    await sleep(350);
    const raw = await getTx(e.txHash);
    const r = raw && normalizeRaw(wallet, raw);
    const a = { solIn: sol(e.in), solOut: sol(e.out), tIn: tok(e.in, mint), tOut: tok(e.out, mint) };
    const b = r ? { solIn: sol(r.in), solOut: sol(r.out), tIn: tok(r.in, mint), tOut: tok(r.out, mint) } : null;
    const okSol = b && Math.abs(a.solIn - b.solIn) < 0.003 && Math.abs(a.solOut - b.solOut) < 0.003;
    const okTok = b && Math.abs(a.tIn - b.tIn) <= Math.max(1, a.tIn * 1e-6) && Math.abs(a.tOut - b.tOut) <= Math.max(1, a.tOut * 1e-6);
    if (!okSol) solMismatch++;
    if (!okTok) tokMismatch++;
    if (e.type === "swap") {
      tot.appSolOut += a.solOut; tot.appSolIn += a.solIn; tot.rpcSolOut += b?.solOut ?? 0; tot.rpcSolIn += b?.solIn ?? 0;
      for (const l of e.out) if (l.token.address === "native") tot.appUsdOut += l.usd ?? 0;
      for (const l of e.in) if (l.token.address === "native") tot.appUsdIn += l.usd ?? 0;
    }
    if (!okSol || !okTok)
      console.log(`  ${new Date(e.timestamp * 1000).toISOString().slice(0, 16)} ${e.type.padEnd(12)} ${e.txHash.slice(0, 10)} APP sol +${a.solIn.toFixed(4)}/-${a.solOut.toFixed(4)} tok +${a.tIn.toExponential(3)}/-${a.tOut.toExponential(3)} | CHAIN sol +${b?.solIn.toFixed(4)}/-${b?.solOut.toFixed(4)} tok +${b?.tIn.toExponential(3)}/-${b?.tOut.toExponential(3)}`);
  }
  console.log(`  mismatches: SOL ${solMismatch}/${evs.length}, token ${tokMismatch}/${evs.length}`);
  console.log(`  swaps: app spent ${tot.appSolOut.toFixed(3)} SOL, got ${tot.appSolIn.toFixed(3)} SOL → net ${(tot.appSolIn - tot.appSolOut).toFixed(3)} SOL | chain net ${(tot.rpcSolIn - tot.rpcSolOut).toFixed(3)} SOL`);
  console.log(`  USD used by app: spent $${tot.appUsdOut.toFixed(0)}, got $${tot.appUsdIn.toFixed(0)} → net $${(tot.appUsdIn - tot.appUsdOut).toFixed(0)}`);
}
