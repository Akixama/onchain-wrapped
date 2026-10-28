// Launch sniping: how soon after a coin launched did the wallet first buy it?
// One free RPC call per coin: the coin's transactions from before the wallet's first buy. Under 1,000
// of them means the oldest is the coin's creation, so we get the exact launch time (busy coins get up
// to 3 pages, then count as "couldn't tell"). DexScreener can't do this: it drops dead pump.fun coins.
import type { Position } from "./engine/pnl";
import { fetchJson } from "./infra/http";
import { drain } from "./infra/drain";

export interface SniperStats {
  /** Solana coins bought in the period. */
  bought: number;
  /** Coins they launched themselves (their buy was the coin's very first transaction). Not counted below. */
  launched: number;
  /** Coins bought from someone else's launch whose launch time we found. All counts below are out of these. */
  checked: number;
  /** True when only a sample of coins was checked (big wallets): show counts as percentages. */
  sampled: boolean;
  within10s: number;
  within60s: number;
  within5m: number;
  medianSec: number;
  fastest: { symbol: string; address: string; icon?: string; sec: number; txNumber: number } | null;
  /** Coins bought within a minute of launch vs the rest (checked coins only). */
  snipes: { count: number; pnlUsd: number };
  rest: { count: number; pnlUsd: number };
}

const rpcUrl = () => process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const r2 = (n: number) => Math.round(n * 100) / 100;
// A dedicated RPC does ~8 calls/s; the free public node ~1/s, so check far fewer there.
const maxCoins = () => (process.env.SOLANA_RPC_URL ? 200 : 30);

type Sig = { signature: string; blockTime: number | null };
const sigsBefore = (mint: string, before: string) =>
  fetchJson<{ result?: Sig[]; error?: { message: string } }>("solana-rpc", rpcUrl(), {
    method: "POST", headers: { "content-type": "application/json" }, endpoint: "getSignaturesForAddress",
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [mint, { before, limit: 1000 }] }),
  }).then((r) => { if (r.error || !r.result) throw new Error(r.error?.message ?? "no result"); return r.result; });

/** Seconds from launch to `sig`, and how many transactions came before it. null = couldn't tell. */
async function launchDelay(mint: string, sig: string, ts: number): Promise<{ sec: number; before: number } | null> {
  let cursor = sig, count = 0;
  let oldest: number | null = ts; // nothing before the buy = the buy is the first transaction
  for (let page = 0; page < 3; page++) {
    const s = await sigsBefore(mint, cursor);
    count += s.length;
    if (s.length) oldest = s[s.length - 1].blockTime;
    if (s.length < 1000) return oldest == null ? null : { sec: Math.max(0, ts - oldest), before: count };
    // Already more than 5 minutes in with 1,000+ trades before: not a snipe, and we know enough.
    if (oldest != null && ts - oldest > 300) return { sec: ts - oldest, before: count };
    cursor = s[999].signature;
  }
  return null;
}

/** Stable pseudo-random order, so the same wallet always samples the same coins. */
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

export async function sniperStats(positions: Position[], deadline?: number): Promise<SniperStats | undefined> {
  const bought = positions.filter((p) => p.chain === "solana" && p.buys.length && p.buys[0].sig && p.token.address !== "native");
  if (!bought.length) return undefined;
  const pick = [...bought].sort((a, b) => hash(a.key) - hash(b.key)).slice(0, maxCoins());
  const all: { p: Position; sec: number; before: number }[] = [];
  await drain(pick, 4, deadline, async (p) => {
    const d = await launchDelay(p.token.address, p.buys[0].sig!, p.buys[0].ts);
    if (d) all.push({ p, ...d });
  });
  // Their buy was the coin's first transaction: they created it (a dev buy), not sniped it.
  const found = all.filter((f) => f.before > 0);
  if (!found.length) return undefined;
  const secs = found.map((f) => f.sec).sort((a, b) => a - b);
  const fast = [...found].sort((a, b) => a.sec - b.sec || a.before - b.before)[0];
  const snipes = found.filter((f) => f.sec <= 60), rest = found.filter((f) => f.sec > 60);
  const sum = (xs: typeof found) => r2(xs.reduce((s, f) => s + f.p.pnl, 0));
  return {
    bought: bought.length,
    launched: all.length - found.length,
    checked: found.length,
    sampled: pick.length < bought.length,
    within10s: found.filter((f) => f.sec <= 10).length,
    within60s: snipes.length,
    within5m: found.filter((f) => f.sec <= 300).length,
    medianSec: secs[Math.floor(secs.length / 2)],
    fastest: { symbol: fast.p.token.symbol, address: fast.p.token.address, icon: fast.p.token.icon, sec: fast.sec, txNumber: fast.before + 1 },
    snipes: { count: snipes.length, pnlUsd: sum(snipes) },
    rest: { count: rest.length, pnlUsd: sum(rest) },
  };
}
