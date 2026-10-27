import type { ChainAdapter, ChainId, EventType, FetchOptions, FetchResult, Leg, TokenRef, UnifiedEvent } from "../core/types";
import { NATIVE } from "../core/assets";
import { fetchJson, QuotaError } from "../infra/http";
import { fetchRawEvent, signaturesSince, verifySolanaTransfers } from "./solana-rpc";
import { drain, timeUp } from "../infra/drain";
import { liveZerionKey, markZerionKeySpent, zerionAuth, zerionKeys } from "./zerion-keys";
import { verifyTransfersHelius } from "./solana-helius";
import { clearBlob, loadBlob, saveBlob } from "../infra/blob";
import { isMoney } from "../core/assets";

// Zerion: one endpoint returns decoded history for ALL EVM chains, with USD value at tx time
// and a spam ("trash") flag. That's why there are no per-chain EVM parsers in this codebase.

const ZERION_CHAIN: Record<string, ChainId> = {
  ethereum: "ethereum",
  base: "base",
  arbitrum: "arbitrum",
  "binance-smart-chain": "bsc",
  polygon: "polygon",
  optimism: "optimism",
};
const EVM_CHAINS = Object.keys(ZERION_CHAIN);
// Solana addresses are case-sensitive; EVM ones are lowercased everywhere.
const norm = (chain: ChainId, a: string) => (chain === "solana" ? a : a.toLowerCase());

const BRIDGE_DAPP = /across|stargate|\bhop\b|relay|orbiter|synapse|cbridge|celer|debridge|bridge|wormhole|mayan|li-?fi|jumper|socket|bungee|rhino|layerswap|owlto|squid|axelar|allbridge|meson|gas-zip|rango/i;

interface ZFungible {
  name: string;
  symbol: string;
  icon?: { url?: string } | null;
  flags?: { verified?: boolean };
  implementations?: { chain_id: string; address: string | null; decimals: number }[];
}
interface ZTx {
  id: string;
  attributes: {
    operation_type: string;
    hash: string;
    mined_at: string;
    sent_from: string;
    status: string;
    fee?: { quantity?: { float: number }; value: number | null } | null;
    transfers: {
      direction: "in" | "out" | "self";
      fungible_info?: ZFungible;
      nft_info?: unknown;
      quantity: { float: number };
      value: number | null;
      sender: string;
      recipient: string;
    }[];
    flags?: { is_trash?: boolean };
  };
  relationships: { chain: { data: { id: string } }; dapp?: { data?: { id: string } | null } };
}

/** Zerion for EVM (all 6 chains in one stream), or for Solana as a backup to Helius. */
function makeZerionAdapter(family: "evm" | "solana"): ChainAdapter {
  const zChains = family === "evm" ? EVM_CHAINS : ["solana"];
  return {
  id: family === "evm" ? "zerion" : "zerion-solana",
  family,
  chains: family === "evm" ? Object.values(ZERION_CHAIN) : ["solana"],
  isConfigured: () => zerionKeys().length > 0,

  async fetchEvents(address: string, opts: FetchOptions): Promise<FetchResult> {
    const wallet = family === "evm" ? address.toLowerCase() : address;
    const qs = new URLSearchParams({
      currency: "usd",
      "page[size]": "100",
      "filter[chain_ids]": zChains.join(","),
      "filter[asset_types]": "fungible",
      "filter[trash]": "only_non_trash", // spam filtered server-side: saves requests too
    });
    if (opts.sinceTs > 0) qs.set("filter[min_mined_at]", String(opts.sinceTs * 1000));
    const startUrl = `https://api.zerion.io/v1/wallets/${wallet}/transactions/?${qs}`;
    // A lookup cut short by the daily data limit saves where it stopped, so the next lookup of this
    // wallet carries on from there (after picking up anything new) instead of re-reading everything.
    const savedKey = `zres:${family}:${wallet}:${opts.sinceTs === 0 ? "all" : "12m"}`;
    // Everything read so far lives in `st`, so a run that hits its deadline can hand it to the next run.
    let st = opts.resume as ZerionState | undefined;
    if (!st) {
      const saved = await loadBlob<SavedRead>(savedKey).catch(() => null);
      st = saved
        ? { url: saved.url, topUrl: startUrl, resumed: true, events: saved.events, requests: 0, seen: saved.seen, truncated: false, notes: [] }
        : { url: startUrl, events: [], requests: 0, seen: 0, truncated: false, notes: [] };
    }
    let key: string | null = null;
    const spent = new Set<string>(); // used up during this run (even if saving that to the store fails)
    // Resumed: first read what's new since last time (newest first) until we reach what we already have.
    // (Also guards against overlap between pages read on different days.)
    const known = st.resumed ? new Set(st.events.map((e) => e.txHash)) : null;
    while ((st.topUrl || st.url) && !timeUp(opts.deadline)) {
      const topping = !!st.topUrl;
      let page: { data: ZTx[]; links?: { next?: string } };
      try {
        key ??= await liveZerionKey(spent);
        page = await fetchJson("zerion", (st.topUrl ?? st.url)!, {
          headers: { authorization: zerionAuth(key), accept: "application/json" },
          endpoint: "wallets/transactions",
        });
      } catch (e) {
        // This key is out for today: remember it and retry the same page with the next one.
        if (e instanceof QuotaError && key) {
          spent.add(key);
          await markZerionKeySpent(key, e.resetHours);
          key = null;
          continue;
        }
        // Daily data limit ran out partway through a huge history: keep what we read (newest first)
        // and say so, instead of failing the whole lookup. With nothing read yet, it's a real error.
        if (!(e instanceof QuotaError) || !st.events.length) throw e;
        // Save the spot (and what we read, before any fixes) for the next lookup: kept for 3 days.
        await saveBlob(savedKey, { url: st.url, events: st.events, seen: st.seen } satisfies SavedRead, 3 * 86400).catch(() => {});
        st.truncated = true;
        st.quotaCut = true;
        st.url = null;
        st.topUrl = undefined;
        st.notes.push(`Today's free data limit ran out after ${st.seen.toLocaleString()} transactions, so this covers the newest ones only. Look it up again tomorrow to read further back.`);
        break;
      }
      st.requests++;
      let caughtUp = false;
      for (const tx of page.data) {
        if (known?.has(tx.attributes.hash)) {
          if (topping) { caughtUp = true; break; }
          continue;
        }
        known?.add(tx.attributes.hash);
        st.seen++;
        const e = normalize(wallet, tx);
        if (e) st.events.push(e);
      }
      opts.onProgress?.({ chain: family === "evm" ? "evm" : "solana", fetched: st.seen });
      if (topping) {
        st.topUrl = caughtUp ? undefined : page.links?.next;
        continue;
      }
      st.url = page.links?.next ?? null;
      // Optional cap (MAX_TXS_PER_ADDRESS); by default the whole history is read.
      if (st.seen >= opts.maxTxs && st.url) { st.truncated = true; st.url = null; }
    }
    const partial = (): FetchResult => ({ events: [], truncated: false, requests: st.requests, partial: true, resume: st });
    if (st.url || st.topUrl) return partial();
    // Read to the end this time: the saved spot isn't needed any more.
    if (st.resumed && !st.quotaCut && !st.cleared) { await clearBlob(savedKey).catch(() => {}); st.cleared = true; }
    if (st.resumed && !st.quotaCut && !st.notes.some((n) => n.startsWith("Continued"))) st.notes.push("Continued from where an earlier lookup of this wallet stopped.");
    const { events, notes } = st;
    if (family === "solana") {
      // Zerion can lag on very spammy Solana wallets. Fill anything newer straight from Solana RPC.
      // (Not for bot-flooded addresses: everything newer there is the bot noise.)
      if (!opts.junkFlooded && !st.backfill) {
        const newest = events.reduce((m, e) => Math.max(m, e.timestamp), opts.sinceTs);
        try {
          const { sigs } = await signaturesSince(wallet, newest);
          const known = new Set(events.map((e) => e.txHash));
          st.backfill = { pending: sigs.filter((s) => !known.has(s)), added: 0 };
        } catch {
          notes.push(`Couldn't double-check recent Solana activity for ${wallet.slice(0, 4)}….`);
          st.backfill = { pending: [], added: 0 };
        }
      }
      if (st.backfill?.pending.length) {
        const bf = st.backfill;
        bf.pending = await drain(bf.pending, 6, opts.deadline, async (sig) => {
          const e = await fetchRawEvent(wallet, sig);
          if (e) { events.push(e); bf.added++; }
        });
        if (bf.pending.length) return partial();
        if (bf.added) notes.push(`Filled ${bf.added} recent Solana transactions the data provider was missing.`);
      }
      opts.onProgress?.({ chain: "solana", fetched: st.seen });
      // Helius batch parser (100 per request) when available; plain RPC one by one otherwise.
      const verify = process.env.HELIUS_API_KEY ? verifyTransfersHelius : verifySolanaTransfers;
      const v = await verify(events, isMoney, opts.deadline, (done, total) =>
        opts.onProgress?.({ chain: "solana", fetched: st.seen, message: `Double-checking trades on-chain (${done.toLocaleString()}/${total.toLocaleString()})` }),
      );
      st.fixed = (st.fixed ?? 0) + v.fixed;
      if (v.remaining) return partial();
      if (st.fixed) notes.push(`Corrected ${st.fixed} Solana trades the data provider had labeled as plain transfers.`);
    }
    const { truncated, requests, quotaCut } = st;
    return { events, truncated, requests, notes, quotaCut };
  },
  };
}

/** Where a lookup cut short by the daily limit stopped (saved for the next lookup of the wallet). */
interface SavedRead { url: string | null; events: UnifiedEvent[]; seen: number }

interface ZerionState {
  url: string | null; // next page, null when the history is fully read
  topUrl?: string; // resumed from a saved read: newer pages still to pick up first
  resumed?: boolean;
  quotaCut?: boolean; // stopped early: daily limit ran out on every key
  cleared?: boolean;
  events: UnifiedEvent[];
  requests: number;
  seen: number;
  truncated: boolean;
  notes: string[];
  backfill?: { pending: string[]; added: number };
  fixed?: number;
}

export const zerionAdapter = makeZerionAdapter("evm");
export const zerionSolanaAdapter = makeZerionAdapter("solana");

function tokenFrom(f: ZFungible, chain: ChainId, zChain: string): TokenRef {
  const impl = f.implementations?.find((i) => i.chain_id === zChain);
  const address = impl?.address ? norm(chain, impl.address) : "native";
  return {
    chain,
    address,
    symbol: address === "native" ? NATIVE[chain].symbol : f.symbol,
    name: f.name,
    decimals: impl?.decimals,
    icon: f.icon?.url,
    verified: f.flags?.verified,
  };
}

function normalize(wallet: string, tx: ZTx): UnifiedEvent | null {
  const a = tx.attributes;
  const zChain = tx.relationships.chain.data.id;
  const chain = zChain === "solana" ? "solana" : ZERION_CHAIN[zChain];
  if (!chain) return null;
  const paidGas = a.sent_from?.toLowerCase() === wallet.toLowerCase();
  const gasNative = paidGas ? a.fee?.quantity?.float ?? 0 : 0;
  const gasUsd = paidGas ? a.fee?.value ?? null : 0;

  // Net per token & direction (handles refunds / multi-hop dust).
  const net = new Map<string, { token: TokenRef; amount: number; usd: number | null; cp?: string }>();
  if (a.status !== "failed") {
    for (const t of a.transfers ?? []) {
      if (!t.fungible_info || t.direction === "self") continue;
      const token = tokenFrom(t.fungible_info, chain, zChain);
      const sign = t.direction === "in" ? 1 : -1;
      const k = token.address;
      const cur = net.get(k) ?? { token, amount: 0, usd: 0 };
      cur.amount += sign * t.quantity.float;
      cur.usd = cur.usd === null || t.value === null ? null : cur.usd + sign * t.value;
      cur.cp ??= t.direction === "in" ? t.sender && norm(chain, t.sender) : t.recipient && norm(chain, t.recipient);
      net.set(k, cur);
    }
  }
  const ins: Leg[] = [];
  const outs: Leg[] = [];
  for (const n of net.values()) {
    if (Math.abs(n.amount) < 1e-15) continue;
    const leg: Leg = { token: n.token, amount: Math.abs(n.amount), usd: n.usd === null ? null : Math.abs(n.usd), counterparty: n.cp };
    (n.amount > 0 ? ins : outs).push(leg);
  }
  if (!ins.length && !outs.length && !gasNative) return null;

  const dapp = tx.relationships.dapp?.data?.id;
  return {
    id: `${chain}:${a.hash}:${wallet}`,
    wallet,
    chain,
    timestamp: Math.floor(new Date(a.mined_at).getTime() / 1000),
    txHash: a.hash,
    type: classify(a.operation_type, dapp, ins, outs),
    in: ins,
    out: outs,
    gasUsd,
    gasNative,
    protocol: dapp,
    spam: a.flags?.is_trash,
  };
}

function classify(op: string, dapp: string | undefined, ins: Leg[], outs: Leg[]): EventType {
  const bridge = !!dapp && BRIDGE_DAPP.test(dapp);
  if (bridge && outs.length && !ins.length) return "bridge_out";
  if (bridge && ins.length && !outs.length) return "bridge_in";
  switch (op) {
    case "trade":
      return ins.length && outs.length ? "swap" : ins.length ? "transfer_in" : "transfer_out";
    case "send":
      return "transfer_out";
    case "receive":
      return "transfer_in";
    case "claim":
      return ins.length ? "airdrop" : "other";
    case "mint":
      return ins.length ? "mint" : "other";
    default:
      return "other"; // approve, deposit, withdraw, execute...: neutral for PnL
  }
}
