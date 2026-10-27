import type { ChainAdapter, EventType, FetchOptions, FetchResult, Leg, TokenRef, UnifiedEvent } from "../core/types";
import { fetchJson } from "../infra/http";

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
}

interface DasAsset {
  id: string;
  content?: { metadata?: { name?: string; symbol?: string }; links?: { image?: string } };
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
    const raw: HeliusTx[] = [];
    let before: string | undefined;
    let requests = 0;
    let truncated = false;
    let real = 0; // entries that actually move this wallet's tokens or SOL
    // The cap counts real activity; this bounds credits spent wading through junk (100 credits/page).
    const maxPages = Math.ceil(opts.maxTxs / 100) * 3 + 2;
    const pageParam = process.env.HELIUS_BEFORE_PARAM ?? "before-signature";

    for (;;) {
      // token-accounts=balanceChanged: also include txs that only touched the wallet's token accounts
      // (e.g. someone sending tokens into an existing account). Without it those receives are invisible.
      const qs = new URLSearchParams({ "api-key": process.env.HELIUS_API_KEY!, limit: "100", "token-accounts": "balanceChanged" });
      if (before) qs.set(pageParam, before);
      const page = await fetchJson<HeliusTx[]>("helius", `${apiBase()}/v0/addresses/${address}/transactions?${qs}`, {
        endpoint: "enhanced/transactions",
      });
      requests++;
      if (!page.length) break;
      let reachedSince = false;
      for (const tx of page) {
        if (tx.timestamp < opts.sinceTs) { reachedSince = true; break; }
        raw.push(tx);
        if (normalize(address, tx)) real++;
      }
      opts.onProgress?.({ chain: "solana", fetched: real });
      if (reachedSince) break;
      // Bots that only reference this address can bury its real activity (seen: 2 real in 400).
      if (requests >= 4 && real / raw.length < 0.05) return { events: [], truncated: true, requests, junkFlooded: true };
      if (real >= opts.maxTxs || requests >= maxPages) { truncated = true; break; }
      before = page[page.length - 1].signature;
    }

    const events = raw.map((tx) => normalize(address, tx)).filter((e): e is UnifiedEvent => !!e);
    // Failed transactions still burn fees but aren't in the parsed history: add their fees for the gas card.
    const oldest = raw.length ? raw[raw.length - 1].timestamp : opts.sinceTs;
    const failed = await failedFees(address, Math.max(opts.sinceTs, truncated ? oldest : opts.sinceTs), (n) =>
      opts.onProgress?.({ chain: "solana", fetched: raw.length, message: `Adding fees from failed transactions (${n})` }),
    ).catch(() => [] as UnifiedEvent[]);
    const known = new Set(events.map((e) => e.txHash));
    events.push(...failed.filter((e) => !known.has(e.txHash)));
    const meta = await fetchTokenMeta(events);
    requests += meta.requests;
    const currentPrices: Record<string, number> = {};
    for (const e of events) for (const l of [...e.in, ...e.out]) enrichToken(l.token, meta.byMint, currentPrices);
    return { events, truncated, requests, currentPrices };
  },
};

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

  return { ...base, type: classify(tx, ins, outs), in: ins, out: outs };
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
  t.icon = a.content?.links?.image;
  const p = a.token_info?.price_info?.price_per_token;
  if (p) prices[`solana:${t.address}`] = p;
}

/** Fees paid by the wallet on failed transactions since `sinceTs` (via Helius RPC; ~10 lookups/s on the free plan). */
async function failedFees(wallet: string, sinceTs: number, onCount?: (n: number) => void): Promise<UnifiedEvent[]> {
  const sigs: { signature: string; blockTime: number }[] = [];
  let before: string | undefined;
  for (let page = 0; page < 20; page++) {
    const r = await fetchJson<{ result: { signature: string; blockTime: number | null; err: unknown }[] }>("helius-rpc", rpcUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [wallet, { limit: 1000, ...(before ? { before } : {}) }] }),
      endpoint: "rpc/getSignaturesForAddress",
    });
    const list = r.result ?? [];
    let done = !list.length;
    for (const x of list) {
      if ((x.blockTime ?? 0) < sinceTs) { done = true; break; }
      if (x.err && x.blockTime) sigs.push({ signature: x.signature, blockTime: x.blockTime });
    }
    if (done) break;
    before = list[list.length - 1].signature;
  }
  const cap = sigs.slice(0, Number(process.env.FAILED_FEE_MAX ?? 400));
  onCount?.(cap.length);
  const out: UnifiedEvent[] = [];
  await Promise.all(cap.map(async (x) => {
    try {
      const r = await fetchJson<{ result: { meta: { fee: number } | null; transaction: { message: { accountKeys: { pubkey: string }[] } } } | null }>("helius-rpc", rpcUrl(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTransaction", params: [x.signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 1 }] }),
        endpoint: "rpc/getTransaction",
      });
      const t = r.result;
      if (!t?.meta || t.transaction.message.accountKeys[0]?.pubkey !== wallet) return; // someone else paid
      out.push({
        id: `solana:${x.signature}:${wallet}`, wallet, chain: "solana", timestamp: x.blockTime, txHash: x.signature,
        type: "other", in: [], out: [], gasUsd: null, gasNative: t.meta.fee / 1e9,
      });
    } catch {
      /* skip: one missing fee shouldn't fail the lookup */
    }
  }));
  return out;
}
