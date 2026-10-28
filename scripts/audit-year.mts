// Independent checks of a saved run (scripts/wrapped.mts --out): cash flow vs the PnL engine,
// trades re-read from the chain, and whether any real activity is missing around sample moments.
//   node --env-file=.env.local --import tsx scripts/audit-year.mts out/audit/suqh.events.json <wallet> [samples]
import { readFileSync } from "node:fs";
import { isMoney } from "../src/lib/core/assets";
import { runPnl } from "../src/lib/engine/pnl";
import type { UnifiedEvent } from "../src/lib/core/types";

const [file, wallet, nArg] = process.argv.slice(2);
const N = Number(nArg ?? 25);
const events: UnifiedEvent[] = JSON.parse(readFileSync(file, "utf8"));
const WSOL = "So11111111111111111111111111111111111111112";
const usd = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString();
const sumUsd = (legs: UnifiedEvent["in"]) => legs.reduce((s, l) => s + (l.usd ?? 0), 0);

// ---------- A. Cash flow: what went out vs what came back, on trades only ----------
const isTrade = (e: UnifiedEvent) => !e.ownTransfer && (e.type === "swap" || (e.type === "mint" && e.out.length > 0));
let paid = 0, got = 0, trades = 0, noUsd = 0;
for (const e of events) {
  if (!isTrade(e)) continue;
  trades++;
  for (const l of e.out) if (isMoney(l.token)) { paid += l.usd ?? 0; if (l.usd == null) noUsd++; }
  for (const l of e.in) if (isMoney(l.token)) { got += l.usd ?? 0; if (l.usd == null) noUsd++; }
}
console.log(`A. trades ${trades.toLocaleString()} | money paid ${usd(paid)} | money back ${usd(got)} | cash result ${usd(got - paid)} | money legs without a USD value: ${noUsd}`);

// Engine on the same events (prices only matter for still-held coins, which are worth ~0 here).
const pb = { majorAt: () => 0, majorNow: () => 0, series: () => [], current: () => 0, liquidity: () => undefined } as never;
const pos = [...runPnl(events, pb, {}).values()];
const realized = pos.reduce((s, p) => s + p.realized, 0);
const tokenCash = pos.reduce((s, p) => s + p.proceeds - p.costIn, 0);
console.log(`   same trades valued on the coin side: ${usd(tokenCash)} | profit engine (realized): ${usd(realized)} | gap ${usd(tokenCash - realized)}`);
// cash - realized = (sells of coins we never saw bought, booked break-even) - (cost of coins still held or moved out)
const gaps = pos.map((p) => ({ p, gap: p.proceeds - p.costIn - p.realized })).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
for (const { p, gap } of gaps.slice(0, 8)) {
  const bought = p.buys.reduce((a, b) => a + b.amount, 0), sold = p.sells.reduce((a, b) => a + b.amount, 0);
  console.log(`   ${p.token.symbol?.slice(0, 14).padEnd(14)} gap ${usd(gap).padStart(9)} | bought ${bought.toPrecision(4)} sold ${sold.toPrecision(4)} | cost ${usd(p.costIn)} back ${usd(p.proceeds)} realized ${usd(p.realized)} | open ${usd(p.openCost)} movedOut ${p.sentAwayKnown.toPrecision(3)} partial=${p.partial} airdrop=${p.airdropped}`);
}
const posGap = gaps.filter((g) => g.gap > 0).reduce((s, g) => s + g.gap, 0), negGap = gaps.filter((g) => g.gap < 0).reduce((s, g) => s + g.gap, 0);
console.log(`   gap from coins sold without a seen buy: ${usd(posGap)} | from coins still held / moved out: ${usd(negGap)}`);

// ---------- B. Re-read random trades from the chain ----------
const helius = async (sigs: string[]) => {
  const r = await fetch(`https://api-mainnet.helius-rpc.com/v0/transactions?api-key=${process.env.HELIUS_API_KEY}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transactions: sigs }),
  });
  if (!r.ok) throw new Error(`helius ${r.status}`);
  return (await r.json()) as {
    signature: string; timestamp: number; feePayer: string; transactionError: unknown;
    accountData?: { account: string; nativeBalanceChange: number; tokenBalanceChanges?: { userAccount: string; mint: string; rawTokenAmount: { tokenAmount: string; decimals: number } }[] }[];
  }[];
};
type Tx = Awaited<ReturnType<typeof helius>>[number];
/** The wallet's own balance changes in a tx: SOL (native + wSOL) and each token. */
function changes(tx: Tx) {
  let sol = 0;
  const tok = new Map<string, number>();
  for (const a of tx.accountData ?? []) {
    if (a.account === wallet) sol += a.nativeBalanceChange / 1e9;
    for (const b of a.tokenBalanceChanges ?? []) {
      if (b.userAccount !== wallet) continue;
      const amt = Number(b.rawTokenAmount.tokenAmount) / 10 ** b.rawTokenAmount.decimals;
      if (b.mint === WSOL) sol += amt; else tok.set(b.mint, (tok.get(b.mint) ?? 0) + amt);
    }
  }
  return { sol, tok };
}
const seeded = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const rnd = seeded(42);
const swaps = events.filter(isTrade);
const sample = Array.from({ length: Math.min(N, swaps.length) }, () => swaps[Math.floor(rnd() * swaps.length)]);
const txs = new Map((await helius([...new Set(sample.map((e) => e.txHash))])).map((t) => [t.signature, t]));
let ok = 0, bad = 0;
for (const e of sample) {
  const tx = txs.get(e.txHash);
  if (!tx) { console.log("   no chain data for", e.txHash.slice(0, 12)); continue; }
  const c = changes(tx);
  const legSol = e.in.filter((l) => isMoney(l.token) && l.token.symbol?.toUpperCase().includes("SOL")).reduce((s, l) => s + l.amount, 0)
    - e.out.filter((l) => isMoney(l.token) && l.token.symbol?.toUpperCase().includes("SOL")).reduce((s, l) => s + l.amount, 0);
  const tokOk = [...e.in, ...e.out].filter((l) => !isMoney(l.token)).every((l) => {
    const chain = c.tok.get(l.token.address) ?? 0;
    const ours = e.in.includes(l) ? l.amount : -l.amount;
    return Math.abs(chain - ours) <= Math.abs(ours) * 0.001 + 1e-9;
  });
  // The chain's SOL change also includes the network fee and account rent; allow for those.
  const solOk = Math.abs(c.sol - legSol) <= Math.max(0.01, Math.abs(legSol) * 0.03);
  if (tokOk && solOk) ok++;
  else { bad++; console.log(`   MISMATCH ${e.txHash.slice(0, 16)} tokensOk=${tokOk} ourSOL=${legSol.toFixed(4)} chainSOL=${c.sol.toFixed(4)} usd in/out ${usd(sumUsd(e.in))}/${usd(sumUsd(e.out))}`); }
}
console.log(`B. ${sample.length} random trades re-read from the chain: ${ok} match, ${bad} differ`);

// ---------- C. Anything real missing? List every transaction just before sample moments ----------
const rpc = async (method: string, params: unknown[]) => {
  const r = await fetch(process.env.SOLANA_RPC_URL!, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  return ((await r.json()) as { result: { signature: string; blockTime: number; err: unknown }[] }).result;
};
const known = new Set(events.map((e) => e.txHash));
const anchors = Array.from({ length: 6 }, () => swaps[Math.floor(rnd() * swaps.length)]);
let windows = 0, realSeen = 0, missing = 0;
for (const a of anchors) {
  const sigs = (await rpc("getSignaturesForAddress", [wallet, { before: a.txHash, limit: 1000 }])).filter((s) => !s.err);
  if (!sigs.length) continue;
  windows++;
  const span = a.timestamp - sigs[sigs.length - 1].blockTime;
  const parsed: Tx[] = [];
  for (let i = 0; i < sigs.length; i += 100) parsed.push(...(await helius(sigs.slice(i, i + 100).map((s) => s.signature))));
  const real = parsed.filter((t) => {
    const c = changes(t);
    // Moved this wallet's coins, or its SOL beyond dust (bots send tiny amounts to flood it).
    return [...c.tok.values()].some((v) => v !== 0) || Math.abs(c.sol) > 0.001;
  });
  const miss = real.filter((t) => !known.has(t.signature));
  realSeen += real.length;
  missing += miss.length;
  console.log(`   window ${new Date(a.timestamp * 1000).toISOString().slice(0, 16)} (${Math.round(span / 60)} min, ${sigs.length} txs): ${real.length} touched your balances, ${miss.length} missing from our data`);
  for (const t of miss.slice(0, 5)) {
    const c = changes(t);
    console.log(`      missing ${t.signature.slice(0, 16)} SOL ${c.sol.toFixed(4)} tokens ${[...c.tok.entries()].map(([m, v]) => `${m.slice(0, 6)}:${v.toPrecision(3)}`).join(" ")} feePayer=${t.feePayer === wallet ? "you" : "other"}`);
  }
}
console.log(`C. ${windows} windows: ${realSeen} transactions touched your balances, ${missing} of them missing from our data`);
process.exit(0);
