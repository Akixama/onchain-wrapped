import type { EventType, Leg, TokenRef, UnifiedEvent } from "../core/types";
import { fetchJson } from "../infra/http";

// Raw Solana RPC: ground truth, free, but one call per transaction. Used to fill gaps a provider
// left (Zerion sometimes stops indexing very spammy wallets). Same net-balance-change idea as the
// Helius adapter, so no per-DEX parsing.

const WSOL = "So11111111111111111111111111111111111111112";
const ATA_RENT_SOL = 0.0021;
// Set SOLANA_RPC_URL to a dedicated node (e.g. https://mainnet.helius-rpc.com/?api-key=...) for ~10x faster checks.
const rpcUrl = () => process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

interface TokenBal { accountIndex: number; mint: string; owner?: string; uiTokenAmount: { amount: string; decimals: number } }
interface RawTx {
  blockTime: number | null;
  transaction: { signatures: string[]; message: { accountKeys: { pubkey: string }[] } };
  meta: { err: unknown; fee: number; preBalances: number[]; postBalances: number[]; preTokenBalances?: TokenBal[]; postTokenBalances?: TokenBal[] } | null;
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const r = await fetchJson<{ result: T; error?: { message: string } }>("solana-rpc", rpcUrl(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    endpoint: method,
  });
  if (r.error) throw new Error(`solana rpc ${method}: ${r.error.message}`);
  return r.result;
}

/** Successful signatures newer than `afterTs` (newest first), up to `limit`. */
export async function signaturesSince(wallet: string, afterTs: number, limit = 1000): Promise<{ sigs: string[]; more: boolean }> {
  const sigs: string[] = [];
  let before: string | undefined;
  for (let page = 0; page < 5; page++) {
    const res = await rpc<{ signature: string; blockTime: number | null; err: unknown }[]>("getSignaturesForAddress", [
      wallet,
      { limit: 1000, ...(before ? { before } : {}) },
    ]);
    if (!res.length) return { sigs, more: false };
    for (const s of res) {
      if ((s.blockTime ?? 0) <= afterTs) return { sigs, more: false };
      if (!s.err) sigs.push(s.signature);
      if (sigs.length >= limit) return { sigs, more: true };
    }
    before = res[res.length - 1].signature;
  }
  return { sigs, more: true };
}

export async function fetchRawEvents(wallet: string, sigs: string[]): Promise<UnifiedEvent[]> {
  const out: UnifiedEvent[] = [];
  for (const sig of sigs) {
    const tx = await rpc<RawTx | null>("getTransaction", [sig, { encoding: "jsonParsed", maxSupportedTransactionVersion: 1 }]);
    const e = tx && normalizeRaw(wallet, tx);
    if (e) out.push(e);
  }
  return out;
}

export function normalizeRaw(wallet: string, tx: RawTx): UnifiedEvent | null {
  if (!tx.meta || !tx.blockTime) return null;
  const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey);
  const sig = tx.transaction.signatures[0];
  const feePayer = keys[0] === wallet;
  const feeSol = feePayer ? tx.meta.fee / 1e9 : 0;
  const base = {
    id: `solana:${sig}:${wallet}`, wallet, chain: "solana" as const, timestamp: tx.blockTime, txHash: sig,
    gasUsd: null, gasNative: feeSol,
  };
  if (tx.meta.err) return feeSol ? { ...base, type: "other", in: [], out: [] } : null;

  // Per mint, per owner: post - pre (human units).
  const byMintOwner = new Map<string, Map<string, { d: number; dec: number }>>();
  const add = (b: TokenBal, sign: 1 | -1) => {
    if (!b.owner || b.uiTokenAmount.decimals === 0) return; // NFTs out of scope
    const m = byMintOwner.get(b.mint) ?? new Map();
    const cur = m.get(b.owner) ?? { d: 0, dec: b.uiTokenAmount.decimals };
    cur.d += (sign * Number(b.uiTokenAmount.amount)) / 10 ** b.uiTokenAmount.decimals;
    m.set(b.owner, cur);
    byMintOwner.set(b.mint, m);
  };
  for (const b of tx.meta.preTokenBalances ?? []) add(b, -1);
  for (const b of tx.meta.postTokenBalances ?? []) add(b, 1);

  const idx = keys.indexOf(wallet);
  let sol = idx >= 0 ? (tx.meta.postBalances[idx] - tx.meta.preBalances[idx]) / 1e9 + feeSol : 0;
  const wsol = byMintOwner.get(WSOL)?.get(wallet);
  if (wsol) sol += wsol.d;

  const ins: Leg[] = [], outs: Leg[] = [];
  const push = (token: TokenRef, d: number, cp?: string) => {
    if (Math.abs(d) < 1e-12) return;
    (d > 0 ? ins : outs).push({ token, amount: Math.abs(d), usd: null, counterparty: cp });
  };
  for (const [mint, owners] of byMintOwner) {
    if (mint === WSOL) continue;
    const mine = owners.get(wallet);
    if (!mine) continue;
    // Counterparty: the other owner with the biggest opposite move on this mint.
    let cp: string | undefined, best = 0;
    for (const [o, v] of owners) if (o !== wallet && Math.sign(v.d) === -Math.sign(mine.d) && Math.abs(v.d) > best) { best = Math.abs(v.d); cp = o; }
    push({ chain: "solana", address: mint, symbol: "", decimals: mine.dec }, mine.d, cp);
  }
  if (ins.length + outs.length > 0 && sol < 0 && -sol <= ATA_RENT_SOL) sol = 0;
  if (Math.abs(sol) > 1e-9) {
    let cp: string | undefined, best = 0;
    keys.forEach((k, i) => {
      const d = (tx.meta!.postBalances[i] - tx.meta!.preBalances[i]) / 1e9;
      if (k !== wallet && Math.sign(d) === -Math.sign(sol) && Math.abs(d) > best) { best = Math.abs(d); cp = k; }
    });
    push({ chain: "solana", address: "native", symbol: "SOL", decimals: 9 }, sol, cp);
  }
  if (!ins.length && !outs.length && !feeSol) return null;
  const type: EventType = ins.length && outs.length ? "swap" : ins.length ? "transfer_in" : outs.length ? "transfer_out" : "other";
  return { ...base, type, in: ins, out: outs };
}

const TOKEN_PROGRAMS = ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"];

/** What the wallet actually holds right now, per mint (human units). 2 RPC calls. */
export async function currentTokenBalances(wallet: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const programId of TOKEN_PROGRAMS) {
    const res = await rpc<{ value: { account: { data: { parsed: { info: { mint: string; tokenAmount: { amount: string; decimals: number } } } } } }[] }>(
      "getTokenAccountsByOwner",
      [wallet, { programId }, { encoding: "jsonParsed" }],
    );
    for (const a of res.value) {
      const { mint, tokenAmount } = a.account.data.parsed.info;
      out.set(mint, (out.get(mint) ?? 0) + Number(tokenAmount.amount) / 10 ** tokenAmount.decimals);
    }
  }
  return out;
}

/**
 * Zerion sometimes labels a Solana SELL as a plain "transfer out" (the SOL comes back by a route it
 * doesn't count), and the reverse for buys. Re-read those transactions from the chain and replace
 * the legs with the real balance changes. Swaps were exact in our audits, so only transfers are checked.
 */
export async function verifySolanaTransfers(
  events: UnifiedEvent[],
  isMoney: (t: TokenRef) => boolean,
  max = Number(process.env.SOLANA_VERIFY_MAX ?? 400),
  onProgress?: (done: number, total: number) => void,
): Promise<{ checked: number; fixed: number; skipped: number }> {
  const suspects = events.filter(
    (e) => e.chain === "solana" && ["transfer_in", "transfer_out", "other"].includes(e.type) && [...e.in, ...e.out].some((l) => !isMoney(l.token)),
  );
  let checked = 0, fixed = 0, done = 0;
  const list = suspects.slice(0, max);
  // Several requests in flight; the shared throttle in fetchJson still keeps us under the RPC's rate limit.
  const check = async (e: UnifiedEvent) => {
    let raw: RawTx | null = null;
    try {
      raw = await rpc<RawTx | null>("getTransaction", [e.txHash, { encoding: "jsonParsed", maxSupportedTransactionVersion: 1 }]);
    } catch {
      return;
    } finally {
      done++;
      if (done % 10 === 0 || done === list.length) onProgress?.(done, list.length);
    }
    checked++;
    const real = raw && normalizeRaw(e.wallet, raw);
    if (!real || real.type !== "swap") return;
    // Keep token names from the provider; take amounts and direction from the chain.
    const named = new Map([...e.in, ...e.out].map((l) => [l.token.address, l.token]));
    const fix = (legs: Leg[]) => legs.map((l) => ({ ...l, token: named.get(l.token.address) ?? l.token, usd: null }));
    e.in = fix(real.in);
    e.out = fix(real.out);
    e.type = "swap";
    fixed++;
  };
  onProgress?.(0, list.length);
  for (let i = 0; i < list.length; i += 4) await Promise.all(list.slice(i, i + 4).map(check));
  return { checked, fixed, skipped: Math.max(0, suspects.length - max) };
}

/** Total token supply (human units) for market-cap math. 1 RPC call. */
export async function solanaTokenSupply(mint: string): Promise<number | null> {
  try {
    const r = await rpc<{ value: { uiAmount: number | null } }>("getTokenSupply", [mint]);
    return r.value?.uiAmount && r.value.uiAmount > 0 ? r.value.uiAmount : null;
  } catch {
    return null;
  }
}
