// Candles rebuilt from the chain, for Solana tokens chart sites never indexed properly — mostly fresh
// pump.fun launches, where the free chart APIs miss the bonding-curve trading. We list the token's
// transactions around your trade, read a sample, and take the pool's price from each swap:
// price = SOL that moved in/out of the pool / tokens that moved out/in.
import type { Candle } from "./gecko";
import { fetchJson } from "./infra/http";

const WSOL = "So11111111111111111111111111111111111111112";
const rpcUrl = () => process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const MAX_TXS = Number(process.env.CHAIN_CANDLE_TXS ?? 80);
const MAX_SIG_PAGES = 6;

interface TokenBal { accountIndex: number; mint: string; owner?: string; uiTokenAmount: { amount: string; decimals: number } }
interface RawTx {
  blockTime: number | null;
  transaction: { message: { accountKeys: { pubkey: string }[] } };
  meta: { err: unknown; preBalances: number[]; postBalances: number[]; preTokenBalances?: TokenBal[]; postTokenBalances?: TokenBal[] } | null;
}
interface Sig { signature: string; blockTime: number | null; err: unknown }

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const r = await fetchJson<{ result: T; error?: { message: string } }>("solana-rpc", rpcUrl(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    endpoint: method,
  }, 2);
  if (r.error) throw new Error(`solana rpc ${method}: ${r.error.message}`);
  return r.result;
}

/** Successful signatures for `mint` with start <= time <= end, oldest first. Starts paging at `before` when given. */
async function sigsBetween(mint: string, start: number, end: number, before?: string): Promise<{ sigs: Sig[]; reachedStart: boolean }> {
  const out: Sig[] = [];
  let cursor = before;
  for (let page = 0; page < MAX_SIG_PAGES; page++) {
    const res = await rpc<Sig[]>("getSignaturesForAddress", [mint, { limit: 1000, ...(cursor ? { before: cursor } : {}) }]);
    for (const s of res) {
      const t = s.blockTime ?? 0;
      if (t < start) return { sigs: out.reverse(), reachedStart: true };
      if (t <= end && !s.err) out.push(s);
    }
    if (res.length < 1000) return { sigs: out.reverse(), reachedStart: true };
    cursor = res[res.length - 1].signature;
  }
  return { sigs: out.reverse(), reachedStart: false };
}

const STABLES = new Set(["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"]);

/**
 * The pool's price in one swap of this mint: how much of the paired asset ("SOL" or a mint) the pool
 * took or gave per token. Works for SOL, stablecoin and token-paired pools (e.g. pump.fun's PUMP pairs).
 */
export function poolPrice(tx: RawTx, mint: string): { price: number; quote: string } | null {
  if (!tx.meta || tx.meta.err) return null;
  const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey);
  const signer = keys[0];
  const byOwner = new Map<string, Map<string, number>>(); // owner -> mint -> change
  const add = (b: TokenBal, sign: 1 | -1) => {
    if (!b.owner) return;
    const m = byOwner.get(b.owner) ?? new Map<string, number>();
    m.set(b.mint, (m.get(b.mint) ?? 0) + (sign * Number(b.uiTokenAmount.amount)) / 10 ** b.uiTokenAmount.decimals);
    byOwner.set(b.owner, m);
  };
  for (const b of tx.meta.preTokenBalances ?? []) add(b, -1);
  for (const b of tx.meta.postTokenBalances ?? []) add(b, 1);
  // The pool is whoever (other than the trader) moved the most of this token.
  let pool: string | null = null, best = 0;
  for (const [o, m] of byOwner) { const d = Math.abs(m.get(mint) ?? 0); if (o !== signer && d > best) { best = d; pool = o; } }
  if (!pool || !best) return null;
  const moves = byOwner.get(pool)!;
  const dTok = moves.get(mint)!;
  // Paired side: the other asset the pool moved the opposite way (biggest), else its own SOL balance.
  let quote: string | null = null, dq = 0;
  for (const [m, d] of moves) if (m !== mint && Math.sign(d) === -Math.sign(dTok) && Math.abs(d) > Math.abs(dq)) { quote = m; dq = d; }
  if (!quote) {
    const i = keys.indexOf(pool);
    dq = i >= 0 ? (tx.meta.postBalances[i] - tx.meta.preBalances[i]) / 1e9 : 0;
    quote = WSOL;
    if (Math.sign(dq) !== -Math.sign(dTok) || Math.abs(dq) < 1e-6) return null;
  }
  if (Math.abs(dq) < 1e-9) return null;
  return { price: Math.abs(dq / dTok), quote: quote === WSOL ? "SOL" : quote };
}

const BUCKETS: [number, string][] = [[60, "1m"], [300, "5m"], [900, "15m"], [3600, "1h"], [4 * 3600, "4h"], [86400, "1d"]];

/**
 * USD candles for a Solana token between start and end. `anchors` are your own trades (newest last):
 * when we know their transactions they're always included and paging starts from them, so busy tokens stay cheap.
 */
export async function solanaChainCandles(
  mint: string, start: number, end: number, anchors: { sig?: string; t: number; price: number }[], solUsd: number | null,
): Promise<{ candles: Candle[]; interval: string } | null> {
  if (!anchors.length) return null;
  const last = anchors[anchors.length - 1];
  let all: Sig[];
  if (last.sig) {
    // Before and during your trade: page back from your last fill. After it: page back from now,
    // skipped if the token is too busy to reach your trade cheaply. Both at once.
    const [before, after] = await Promise.all([
      sigsBetween(mint, start, last.t, last.sig),
      sigsBetween(mint, last.t + 1, end).catch(() => ({ sigs: [] as Sig[], reachedStart: false })),
    ]);
    all = [...before.sigs, ...(after.reachedStart ? after.sigs : [])];
  } else {
    // Older results don't store your transactions: page back from now (fine for quiet tokens).
    const r = await sigsBetween(mint, start, end);
    if (!r.reachedStart) return null;
    all = r.sigs;
  }
  const anchorSet = new Set(anchors.flatMap((a) => (a.sig ? [a.sig] : [])));
  // Even sample across time, plus your own trades.
  const step = Math.max(1, all.length / MAX_TXS);
  const picked = new Set<string>(anchorSet);
  for (let k = 0; k < all.length && picked.size < MAX_TXS + anchorSet.size; k += step) picked.add(all[Math.floor(k)].signature);
  const times = new Map(all.map((s) => [s.signature, s.blockTime ?? 0]));
  for (const a of anchors) if (a.sig) times.set(a.sig, a.t);

  const raw: { t: number; price: number; quote: string; sig: string }[] = [];
  // A rolling pool of readers (the shared throttle keeps us under the RPC's rate limit).
  const queue = [...picked];
  await Promise.all(Array.from({ length: 10 }, async () => {
    for (let sig = queue.shift(); sig; sig = queue.shift()) {
      try {
        const tx = await rpc<RawTx | null>("getTransaction", [sig, { encoding: "jsonParsed", maxSupportedTransactionVersion: 1 }]);
        const p = tx && poolPrice(tx, mint);
        if (p) raw.push({ t: tx!.blockTime ?? times.get(sig) ?? 0, ...p, sig });
      } catch { /* one missing swap doesn't matter */ }
    }
  }));
  // USD per unit of each paired asset: SOL from the price book, stables at $1, anything else
  // (e.g. PUMP) calibrated from your own trades in that pool (median, so one odd fill can't skew it).
  const usdPer = new Map<string, number>();
  if (solUsd && solUsd > 0) usdPer.set("SOL", solUsd);
  for (const q of new Set(raw.map((r) => r.quote))) {
    if (usdPer.has(q)) continue;
    if (STABLES.has(q)) { usdPer.set(q, 1); continue; }
    // Your own swap when we have it, else the nearest swap within two minutes of your trade.
    const ratios = anchors.flatMap((a) => {
      const same = raw.filter((r) => r.quote === q);
      const r = same.find((x) => a.sig && x.sig === a.sig)
        ?? same.filter((x) => Math.abs(x.t - a.t) <= 120).sort((x, y) => Math.abs(x.t - a.t) - Math.abs(y.t - a.t))[0];
      return r && a.price > 0 ? [a.price / r.price] : [];
    }).sort((x, y) => x - y);
    if (ratios.length) usdPer.set(q, ratios[Math.floor(ratios.length / 2)]);
  }
  const points: [number, number][] = raw.filter((r) => usdPer.has(r.quote)).map((r) => [r.t, r.price * usdPer.get(r.quote)!]);
  if (process.env.DEBUG_CANDLES) console.error(new Date().toISOString().slice(14,19), "picked", picked.size, "priced", raw.length, "usd", points.length, [...usdPer]);
  if (points.length < 5) return null;
  points.sort((a, b) => a[0] - b[0]);
  // Drop wild one-off prints (dust swaps with huge slippage): more than 5x off both neighbours.
  const clean = points.filter(([, p], i) => {
    const a = points[i - 1]?.[1], b = points[i + 1]?.[1];
    return !(a && b && (p > 5 * a && p > 5 * b || p < a / 5 && p < b / 5));
  });

  const span = Math.max(60, clean[clean.length - 1][0] - clean[0][0]);
  const [size, label] = BUCKETS.find(([s]) => span / s <= Math.max(12, clean.length / 1.5)) ?? BUCKETS[BUCKETS.length - 1];
  const candles: Candle[] = [];
  let prevClose: number | null = null;
  for (const [t, p] of clean) {
    const b = Math.floor(t / size) * size;
    const c = candles[candles.length - 1];
    if (c && c[0] === b) {
      c[2] = Math.max(c[2], p); c[3] = Math.min(c[3], p); c[4] = p;
    } else {
      const o = prevClose ?? p;
      candles.push([b, o, Math.max(o, p), Math.min(o, p), p]);
    }
    prevClose = p;
  }
  return candles.length >= 3 ? { candles, interval: label } : null;
}
