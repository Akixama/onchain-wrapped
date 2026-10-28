import { minOf, pushAll } from "../core/num";
import type { ChainAdapter, EventType, FetchOptions, FetchResult, Leg, TokenRef, UnifiedEvent } from "../core/types";
import { fetchJson } from "../infra/http";
import { drain, timeUp } from "../infra/drain";
import { appFeeOf } from "./app-fees";

// Helius Enhanced Transactions: already-parsed Solana txs (type SWAP/TRANSFER/..., source JUPITER/PUMP_FUN/...).
// We compute the wallet's *net* balance change per token from accountData, which is robust across
// every DEX/aggregator without per-program parsers.

const WSOL = "So11111111111111111111111111111111111111112";
const BRIDGE_SOURCES = new Set(["WORMHOLE", "DEBRIDGE", "ALLBRIDGE", "MAYAN", "PORTAL", "CCTP", "RELAY"]);

interface HeliusTx {
  signature: string;
  timestamp: number;
  type: string;
  source: string;
  fee: number;
  feePayer: string;
  transactionError: unknown;
  nativeTransfers?: { fromUserAccount: string; toUserAccount: string; amount: number }[];
  tokenTransfers?: { fromUserAccount: string; toUserAccount: string; mint: string; tokenAmount: number }[];
  accountData?: {
    account: string;
    nativeBalanceChange: number;
    tokenBalanceChanges?: { userAccount: string; tokenAccount?: string; mint: string; rawTokenAmount: { tokenAmount: string; decimals: number } }[];
  }[];
  instructions?: HeliusIx[];
}
interface HeliusIx { programId: string; data: string; accounts: string[]; innerInstructions?: HeliusIx[] }

const TOKEN_PROGRAMS = new Set(["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"]);
const ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

/**
 * Token accounts this wallet opened or closed in the tx. Their balance can stay 0, so Helius lists no
 * token change for them, but their SOL deposit/refund still moves: it's the wallet's own money.
 */
function openedOrClosedAccounts(tx: HeliusTx, wallet: string, out: Set<string>) {
  const walk = (ix: HeliusIx) => {
    const a = ix.accounts ?? [];
    // SPL Token CloseAccount (instruction 9 = base58 "A"): [account, destination, owner]
    if (TOKEN_PROGRAMS.has(ix.programId) && ix.data === "A" && a[2] === wallet) out.add(a[0]);
    // Associated token account Create / CreateIdempotent: [payer, account, owner, mint, ...]
    if (ix.programId === ATA_PROGRAM && (ix.data === "" || ix.data === "1" || ix.data === "2") && a[2] === wallet) out.add(a[1]);
    for (const c of ix.innerInstructions ?? []) walk(c);
  };
  for (const ix of tx.instructions ?? []) walk(ix);
}

interface DasAsset {
  id: string;
  content?: { metadata?: { name?: string; symbol?: string }; links?: { image?: string }; files?: { uri?: string; cdn_uri?: string }[] };
  token_info?: { symbol?: string; decimals?: number; price_info?: { price_per_token?: number } };
}

const apiBase = () => process.env.HELIUS_API_BASE ?? "https://api-mainnet.helius-rpc.com";
const rpcUrl = () => `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

export const heliusAdapter: ChainAdapter = {
  id: "helius",
  family: "solana",
  chains: ["solana"],
  isConfigured: () => !!process.env.HELIUS_API_KEY,

  async fetchEvents(address: string, opts: FetchOptions): Promise<FetchResult> {
    // Everything read so far lives in `st`, so a run that hits its deadline can hand it to the next run.
    const st: HeliusState = (opts.resume as HeliusState | undefined) ?? {
      requests: 0, raw: 0, real: 0, events: [], done: false, failed: { listed: false, pending: [], events: [] },
    };
    // Optional cap (MAX_TXS_PER_ADDRESS); by default the whole history is read.
    const maxPages = Number.isFinite(opts.maxTxs) ? Math.ceil(opts.maxTxs / 100) * 3 + 2 : Infinity;
    let truncated = false;
    // Failed transactions still burn fees but aren't in the parsed history. Look their fees up
    // alongside the history (separate rate limit) instead of after it.
    let stopFailed = false;
    const failedP = failedFees(address, opts.sinceTs, st.failed, opts.deadline, () => stopFailed, (done, total) =>
      opts.onProgress?.({ chain: "solana", fetched: st.real, message: `Adding fees from failed transactions (${done.toLocaleString()}/${total.toLocaleString()})` }),
    ).catch(() => {});
    const pageParam = process.env.HELIUS_BEFORE_PARAM ?? "before-signature";

    while (!st.done && !timeUp(opts.deadline)) {
      // token-accounts=balanceChanged: also include txs that only touched the wallet's token accounts
      // (e.g. someone sending tokens into an existing account). Without it those receives are invisible.
      const qs = new URLSearchParams({ "api-key": process.env.HELIUS_API_KEY!, limit: "100", "token-accounts": "balanceChanged" });
      if (st.before) qs.set(pageParam, st.before);
      const page = await fetchJson<HeliusTx[]>("helius", `${apiBase()}/v0/addresses/${address}/transactions?${qs}`, {
        endpoint: "enhanced/transactions",
      });
      st.requests++;
      if (!page.length) { st.done = true; break; }
      for (const tx of page) {
        if (tx.timestamp < opts.sinceTs) { st.done = true; break; }
        if (opts.untilTs && tx.timestamp > opts.untilTs) continue; // after a custom range: skip
        st.raw++;
        const e = normalize(address, tx);
        if (e) { st.events.push(e); st.real++; }
      }
      opts.onProgress?.({ chain: "solana", fetched: st.real });
      if (st.done) break;
      // Bots that only reference this address can bury its real activity (seen: 2 real in 400).
      if (st.requests >= 4 && st.real / st.raw < 0.05) {
        stopFailed = true;
        await failedP;
        return { events: [], truncated: true, requests: st.requests, junkFlooded: true };
      }
      st.before = page[page.length - 1].signature;
      if (st.real >= opts.maxTxs || st.requests >= maxPages) { truncated = true; st.done = true; break; }
    }
    await failedP;
    if (!st.done || !st.failed.listed || st.failed.pending.length) {
      return { events: [], truncated: false, requests: st.requests, partial: true, resume: st };
    }

    const events = st.events;
    // Failed fees only inside the history we read (it stops early only when a cap is set).
    const oldest = events.length ? minOf(events.map((e) => e.timestamp)) : opts.sinceTs;
    const cutoff = truncated ? oldest : opts.sinceTs;
    const known = new Set(events.map((e) => e.txHash));
    pushAll(events, st.failed.events.filter((e) => !known.has(e.txHash) && e.timestamp >= cutoff));
    const meta = await fetchTokenMeta(events);
    const currentPrices: Record<string, number> = {};
    for (const e of events) for (const l of [...e.in, ...e.out]) enrichToken(l.token, meta.byMint, currentPrices);
    return { events, truncated, requests: st.requests + meta.requests, currentPrices };
  },
};

interface FailedState {
  before?: string; // listing cursor
  listed: boolean; // every failed signature in the window is known
  pending: { signature: string; blockTime: number }[]; // fees still to look up
  looked?: number; // fees looked up so far
  events: UnifiedEvent[];
}
interface HeliusState {
  before?: string;
  requests: number;
  raw: number; // history entries seen
  real: number; // entries that actually move this wallet's tokens or SOL
  events: UnifiedEvent[];
  done: boolean;
  failed: FailedState;
}

function normalize(wallet: string, tx: HeliusTx): UnifiedEvent | null {
  const feeSol = tx.feePayer === wallet ? tx.fee / 1e9 : 0;
  const base = {
    id: `solana:${tx.signature}:${wallet}`,
    wallet,
    chain: "solana" as const,
    timestamp: tx.timestamp,
    txHash: tx.signature,
    gasUsd: null,
    gasNative: feeSol,
    protocol: tx.source && tx.source !== "UNKNOWN" ? tx.source.toLowerCase() : undefined,
  };
  if (tx.transactionError) return feeSol ? { ...base, type: "other", in: [], out: [] } : null;

  // The wallet's own token accounts. SOL moving into/out of them is the refundable account deposit
  // (~0.00204 SOL each) or wrapped SOL — never a trade cost — so it's netted into the SOL change.
  const myTokenAccounts = new Set<string>();
  for (const acc of tx.accountData ?? [])
    for (const tb of acc.tokenBalanceChanges ?? []) if (tb.userAccount === wallet) myTokenAccounts.add(tb.tokenAccount ?? acc.account);
  openedOrClosedAccounts(tx, wallet, myTokenAccounts);

  // Net change per mint for this wallet.
  const delta = new Map<string, { amount: number; decimals: number }>();
  let solLamports = 0;
  for (const acc of tx.accountData ?? []) {
    if (acc.account === wallet || myTokenAccounts.has(acc.account)) solLamports += acc.nativeBalanceChange;
    for (const tb of acc.tokenBalanceChanges ?? []) {
      if (tb.userAccount !== wallet) continue;
      const dec = tb.rawTokenAmount.decimals;
      if (dec === 0) continue; // NFTs — out of scope for Wrapped v1
      const amt = Number(tb.rawTokenAmount.tokenAmount) / 10 ** dec;
      const mint = tb.mint === WSOL ? "native" : tb.mint;
      const cur = delta.get(mint) ?? { amount: 0, decimals: dec };
      cur.amount += amt;
      delta.set(mint, cur);
    }
  }
  // Fee added back so gas isn't a trade leg. Wrapped SOL is already inside the token-account lamports.
  const sol = solLamports / 1e9 + feeSol;
  delta.delete("native");
  if (Math.abs(sol) > 1e-9) delta.set("native", { amount: sol, decimals: 9 });

  const ins: Leg[] = [];
  const outs: Leg[] = [];
  for (const [mint, d] of delta) {
    if (Math.abs(d.amount) < 1e-12) continue;
    const token: TokenRef = { chain: "solana", address: mint, symbol: mint === "native" ? "SOL" : mint.slice(0, 4), decimals: d.decimals };
    const leg: Leg = { token, amount: Math.abs(d.amount), usd: null, counterparty: counterpartyFor(tx, wallet, mint, d.amount > 0) };
    (d.amount > 0 ? ins : outs).push(leg);
  }
  if (!ins.length && !outs.length && !feeSol) return null;

  const type = classify(tx, ins, outs);
  if (type !== "swap") return { ...base, type, in: ins, out: outs };
  const fee = appFeeOf(tx, wallet, Math.abs(sol));
  return { ...base, type, in: ins, out: outs, feeScan: true, ...(fee ? { appFee: fee } : {}) };
}

function classify(tx: HeliusTx, ins: Leg[], outs: Leg[]): EventType {
  const isBridge = BRIDGE_SOURCES.has(tx.source);
  if (ins.length && outs.length) return isBridge ? "bridge_out" : "swap";
  if (ins.length) {
    if (isBridge) return "bridge_in";
    if (/CLAIM|AIRDROP/.test(tx.type)) return "airdrop";
    if (/MINT/.test(tx.type)) return "mint";
    return "transfer_in";
  }
  if (outs.length) return isBridge ? "bridge_out" : "transfer_out";
  return "other";
}

function counterpartyFor(tx: HeliusTx, wallet: string, mint: string, incoming: boolean): string | undefined {
  if (mint === "native") {
    const t = tx.nativeTransfers?.find((n) => (incoming ? n.toUserAccount === wallet : n.fromUserAccount === wallet));
    return incoming ? t?.fromUserAccount : t?.toUserAccount;
  }
  const t = tx.tokenTransfers?.find(
    (n) => n.mint === mint && (incoming ? n.toUserAccount === wallet : n.fromUserAccount === wallet),
  );
  return (incoming ? t?.fromUserAccount : t?.toUserAccount) || undefined;
}

async function fetchTokenMeta(events: UnifiedEvent[]) {
  const mints = [...new Set(events.flatMap((e) => [...e.in, ...e.out]).map((l) => l.token.address))].filter((m) => m !== "native");
  const byMint = new Map<string, DasAsset>();
  let requests = 0;
  for (let i = 0; i < mints.length; i += 1000) {
    const res = await fetchJson<{ result: DasAsset[] }>("helius", rpcUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "meta", method: "getAssetBatch", params: { ids: mints.slice(i, i + 1000) } }),
      endpoint: "das/getAssetBatch",
    });
    requests++;
    for (const a of res.result ?? []) if (a) byMint.set(a.id, a);
  }
  return { byMint, requests };
}

function enrichToken(t: TokenRef, byMint: Map<string, DasAsset>, prices: Record<string, number>) {
  if (t.address === "native") return;
  const a = byMint.get(t.address);
  if (!a) return;
  t.symbol = a.token_info?.symbol || a.content?.metadata?.symbol || t.symbol;
  t.name = a.content?.metadata?.name;
  // Helius's CDN copy loads reliably; many launchpad image hosts go down or block hotlinking.
  t.icon = a.content?.files?.find((f) => f.cdn_uri)?.cdn_uri ?? a.content?.links?.image;
  const p = a.token_info?.price_info?.price_per_token;
  if (p) prices[`solana:${t.address}`] = p;
}

/**
 * Fees paid by the wallet on failed transactions since `sinceTs` (Helius RPC; ~8 lookups/s on the
 * free plan). Fills `st` as it goes and stops at the deadline, so a later run can finish the rest.
 */
async function failedFees(
  wallet: string, sinceTs: number, st: FailedState, deadline: number | undefined, stopped: () => boolean, onCount?: (done: number, total: number) => void,
): Promise<void> {
  while (!st.listed && !stopped() && !timeUp(deadline)) {
    const r = await fetchJson<{ result: { signature: string; blockTime: number | null; err: unknown }[] }>("helius-rpc", rpcUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [wallet, { limit: 1000, ...(st.before ? { before: st.before } : {}) }] }),
      endpoint: "rpc/getSignaturesForAddress",
    });
    const list = r.result ?? [];
    if (!list.length) st.listed = true;
    for (const x of list) {
      if ((x.blockTime ?? 0) < sinceTs) { st.listed = true; break; }
      if (x.err && x.blockTime) st.pending.push({ signature: x.signature, blockTime: x.blockTime });
    }
    if (list.length) st.before = list[list.length - 1].signature;
  }
  const total = st.pending.length + (st.looked ?? 0);
  onCount?.(st.looked ?? 0, total);
  // Helius's batch parser: 100 fees per request instead of one RPC call each.
  const size = Number(process.env.HELIUS_BATCH_SIZE ?? 100);
  const batches: (typeof st.pending)[] = [];
  for (let i = 0; i < st.pending.length; i += size) batches.push(st.pending.slice(i, i + size));
  // Each batch takes seconds to come back; several in flight keep us near the plan's request rate.
  const left = await drain(batches, Number(process.env.HELIUS_VERIFY_CONCURRENCY ?? 12), deadline, async (batch) => {
    if (stopped()) return;
    const txs = await fetchJson<HeliusTx[]>("helius", `${apiBase()}/v0/transactions?api-key=${process.env.HELIUS_API_KEY}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transactions: batch.map((x) => x.signature) }),
      endpoint: "enhanced/transactions-batch",
      timeoutMs: 90_000,
    });
    const bySig = new Map(txs.map((t) => [t.signature, t]));
    for (const x of batch) {
      const t = bySig.get(x.signature);
      if (!t || t.feePayer !== wallet) continue; // someone else paid
      st.events.push({
        id: `solana:${x.signature}:${wallet}`, wallet, chain: "solana", timestamp: x.blockTime, txHash: x.signature,
        type: "other", in: [], out: [], gasUsd: null, gasNative: t.fee / 1e9,
      });
    }
    st.looked = (st.looked ?? 0) + batch.length;
    onCount?.(st.looked, total);
  });
  st.pending = left.flat();
}

/**
 * Zerion sometimes labels a Solana SELL as a plain "transfer out" (and the reverse for buys). Re-read
 * those transactions through Helius's batch parser — 100 per request instead of one RPC call each —
 * and replace the legs with the wallet's real balance changes. Stops at the deadline; anything not
 * reached stays unmarked so a later run picks it up.
 */
export async function verifyTransfersHelius(
  events: UnifiedEvent[],
  isMoney: (t: TokenRef) => boolean,
  deadline?: number,
  onProgress?: (done: number, total: number) => void,
): Promise<{ checked: number; fixed: number; remaining: number }> {
  const list = events.filter(
    (e) => e.chain === "solana" && !e.verified && ["transfer_in", "transfer_out", "other"].includes(e.type) && [...e.in, ...e.out].some((l) => !isMoney(l.token)),
  );
  const batches: UnifiedEvent[][] = [];
  const size = Number(process.env.HELIUS_BATCH_SIZE ?? 100);
  for (let i = 0; i < list.length; i += size) batches.push(list.slice(i, i + size));
  let checked = 0, fixed = 0, done = 0;
  onProgress?.(0, list.length);
  const left = await drain(batches, 4, deadline, async (batch) => {
    const txs = await fetchJson<HeliusTx[]>("helius", `${apiBase()}/v0/transactions?api-key=${process.env.HELIUS_API_KEY}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transactions: [...new Set(batch.map((e) => e.txHash))] }),
      endpoint: "enhanced/transactions-batch",
      timeoutMs: 90_000, // up to 100 parsed transactions: a few MB
    });
    const bySig = new Map(txs.map((t) => [t.signature, t]));
    for (const e of batch) {
      done++;
      const tx = bySig.get(e.txHash);
      e.verified = true; // checked (or not parseable): don't fetch it again
      if (!tx) continue;
      checked++;
      const real = normalize(e.wallet, tx);
      if (!real || real.type !== "swap") continue;
      // Keep token names from the provider; take amounts and direction from the chain.
      const named = new Map([...e.in, ...e.out].map((l) => [l.token.address, l.token]));
      const fix = (legs: Leg[]) => legs.map((l) => ({ ...l, token: named.get(l.token.address) ?? l.token, usd: null }));
      e.in = fix(real.in);
      e.out = fix(real.out);
      e.type = "swap";
      e.onchainFix = true;
      fixed++;
    }
    onProgress?.(done, list.length);
  });
  return { checked, fixed, remaining: left.reduce((n, b) => n + b.length, 0) };
}
