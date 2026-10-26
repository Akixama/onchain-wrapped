import type { ChainAdapter, ChainId, EventType, FetchOptions, FetchResult, Leg, TokenRef, UnifiedEvent } from "../core/types";
import { NATIVE } from "../core/assets";
import { fetchJson } from "../infra/http";
import { fetchRawEvents, signaturesSince } from "./solana-rpc";

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
  isConfigured: () => !!process.env.ZERION_API_KEY,

  async fetchEvents(address: string, opts: FetchOptions): Promise<FetchResult> {
    const wallet = family === "evm" ? address.toLowerCase() : address;
    const auth = "Basic " + Buffer.from(`${process.env.ZERION_API_KEY}:`).toString("base64");
    const qs = new URLSearchParams({
      currency: "usd",
      "page[size]": "100",
      "filter[chain_ids]": zChains.join(","),
      "filter[asset_types]": "fungible",
      "filter[trash]": "only_non_trash", // spam filtered server-side: saves requests too
    });
    if (opts.sinceTs > 0) qs.set("filter[min_mined_at]", String(opts.sinceTs * 1000));
    let url: string | null = `https://api.zerion.io/v1/wallets/${wallet}/transactions/?${qs}`;

    const events: UnifiedEvent[] = [];
    let requests = 0;
    let truncated = false;
    let seen = 0;
    while (url) {
      const page: { data: ZTx[]; links?: { next?: string } } = await fetchJson("zerion", url, {
        headers: { authorization: auth, accept: "application/json" },
        endpoint: "wallets/transactions",
      });
      requests++;
      for (const tx of page.data) {
        seen++;
        const e = normalize(wallet, tx);
        if (e) events.push(e);
      }
      opts.onProgress?.({ chain: family === "evm" ? "evm" : "solana", fetched: seen });
      if (seen >= opts.maxTxs && page.links?.next) { truncated = true; break; }
      url = page.links?.next ?? null;
    }
    const notes: string[] = [];
    if (family === "solana") {
      // Zerion can lag on very spammy Solana wallets. Fill anything newer straight from Solana RPC.
      const newest = events.reduce((m, e) => Math.max(m, e.timestamp), opts.sinceTs);
      const cap = Number(process.env.SOLANA_BACKFILL_MAX ?? 40);
      try {
        const { sigs, more } = await signaturesSince(wallet, newest, cap);
        const known = new Set(events.map((e) => e.txHash));
        const extra = await fetchRawEvents(wallet, sigs.filter((s) => !known.has(s)));
        events.push(...extra);
        if (extra.length) notes.push(`Filled ${extra.length} recent Solana transactions the data provider was missing.`);
        if (more) notes.push(`Some very recent Solana activity for ${wallet.slice(0, 4)}… couldn't be loaded.`);
      } catch {
        notes.push(`Couldn't double-check recent Solana activity for ${wallet.slice(0, 4)}….`);
      }
    }
    return { events, truncated, requests, notes };
  },
  };
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
