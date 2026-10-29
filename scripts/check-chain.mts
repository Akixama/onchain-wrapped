// Re-read random trades from the blockchain and compare with what the site recorded (coins and SOL).
//   node --env-file=.env.local --import tsx scripts/check-chain.mts 1m 40 <wallet> [<wallet> ...]
import { runWrapped } from "../src/lib/pipeline";
import { isMoney } from "../src/lib/core/assets";
import type { UnifiedEvent } from "../src/lib/core/types";
const [tf, nArg, ...wallets] = process.argv.slice(2);
const r = await runWrapped({ addresses: wallets, timeframe: tf as "1m" });
if (r.partial) throw new Error("partial");
const WSOL = "So11111111111111111111111111111111111111112";
const trades = r.events.filter((e) => !e.ownTransfer && e.type === "swap");
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = trades.length <= Number(nArg) ? trades : Array.from({ length: Number(nArg) }, () => trades[Math.floor(rnd() * trades.length)]);
const sample = [...new Map(pick.map((e) => [e.id, e])).values()];
type Tx = { signature: string; accountData?: { account: string; nativeBalanceChange: number; tokenBalanceChanges?: { userAccount: string; mint: string; rawTokenAmount: { tokenAmount: string; decimals: number } }[] }[] };
const txs = new Map<string, Tx>();
for (let i = 0; i < sample.length; i += 100) {
  const res = await fetch(`https://api-mainnet.helius-rpc.com/v0/transactions?api-key=${process.env.HELIUS_API_KEY}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transactions: [...new Set(sample.slice(i, i + 100).map((e) => e.txHash))] }) });
  for (const t of (await res.json()) as Tx[]) txs.set(t.signature, t);
}
let ok = 0, bad = 0;
for (const e of sample as UnifiedEvent[]) {
  const tx = txs.get(e.txHash);
  if (!tx) { console.log("no chain data", e.txHash.slice(0, 12)); bad++; continue; }
  let sol = 0; const tok = new Map<string, number>();
  for (const a of tx.accountData ?? []) {
    if (a.account === e.wallet) sol += a.nativeBalanceChange / 1e9;
    for (const b of a.tokenBalanceChanges ?? []) {
      if (b.userAccount !== e.wallet) continue;
      const v = Number(b.rawTokenAmount.tokenAmount) / 10 ** b.rawTokenAmount.decimals;
      if (b.mint === WSOL) sol += v; else tok.set(b.mint, (tok.get(b.mint) ?? 0) + v);
    }
  }
  const ourSol = e.in.filter((l) => isMoney(l.token) && /SOL/i.test(l.token.symbol ?? "")).reduce((s, l) => s + l.amount, 0) - e.out.filter((l) => isMoney(l.token) && /SOL/i.test(l.token.symbol ?? "")).reduce((s, l) => s + l.amount, 0);
  const tokOk = [...e.in, ...e.out].filter((l) => !isMoney(l.token)).every((l) => {
    const ours = e.in.includes(l) ? l.amount : -l.amount;
    return Math.abs((tok.get(l.token.address) ?? 0) - ours) <= Math.abs(ours) * 0.001 + 1e-9;
  });
  const solOk = Math.abs(sol - ourSol) <= Math.max(0.01, Math.abs(ourSol) * 0.03); // chain SOL includes the network fee
  if (tokOk && solOk) ok++;
  else { bad++; console.log(`DIFFERS ${e.txHash.slice(0, 14)} coins ${tokOk ? "ok" : "WRONG"} | SOL ours ${ourSol.toFixed(4)} chain ${sol.toFixed(4)}`); }
}
console.log(`${sample.length} of ${trades.length} trades checked against the chain: ${ok} match, ${bad} differ`);
process.exit(0);
