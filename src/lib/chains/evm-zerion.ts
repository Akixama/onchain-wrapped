import type { ChainAdapter, ChainId, EventType, FetchOptions, FetchResult, Leg, TokenRef, UnifiedEvent } from "../core/types";
import { NATIVE } from "../core/assets";
import { fetchJson, QuotaError } from "../infra/http";
import { fetchRawEvent, signaturesSince, verifySolanaTransfers } from "./solana-rpc";
import { drain, timeUp } from "../infra/drain";
import { keyTag, liveZerionKey, markZerionKeySpent, zerionHeaders, zerionAuth, zerionKeys } from "./zerion-keys";
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
    const base = `https://api.zerion.io/v1/wallets/${wallet}/transactions/`;
    const nowS = Math.floor(Date.now() / 1000) + 60;
    /** A query for one date range (seconds, both ends included; Zerion takes milliseconds). */
    const winUrl = (w: ZWin) => {
      const q = new URLSearchParams(qs);
      if (w.from > 0) q.set("filter[min_mined_at]", String(w.from * 1000));
      q.set("filter[max_mined_at]", String(w.to * 1000));
      return `${base}?${q}`;
    };
    // A lookup cut short by the daily data limit saves where it stopped, so the next lookup of this
    // wallet carries on from there (after picking up anything new) instead of re-reading everything.
    // Keyed by window length in days (rounded), so 1-month and 12-month lookups don't share progress.
    const savedKey = `zres:${family}:${wallet}:${opts.sinceTs === 0 ? "all" : Math.round((nowS - opts.sinceTs) / 86400) >= 360 ? "12m" : `${Math.round((nowS - opts.sinceTs) / 86400)}d`}`;
    // Everything read so far lives in `st`, so a run that hits its deadline can hand it to the next run.
    let st = opts.resume as ZerionState | undefined;
    if (st && !st.wins) st = upgradeState(st as unknown as OldState, opts.sinceTs, nowS); // from before parallel reading
    if (!st) {
      const saved = await loadBlob<SavedRead>(savedKey).catch(() => null);
      if (saved) {
        // Pick up what happened since (with an hour of overlap), then the ranges still unread.
        const wins = saved.wins ?? (saved.url ? [{ from: opts.sinceTs, to: nowS, url: saved.url }] : []);
        const since = saved.savedAt ? saved.savedAt - 3600 : opts.sinceTs;
        st = { wins: [{ from: Math.max(opts.sinceTs, since), to: nowS, url: null }, ...wins], resumed: true, events: saved.events, requests: 0, seen: saved.seen, truncated: false, notes: [] };
      } else {
        st = { wins: initialWindows(opts.sinceTs, nowS), events: [], requests: 0, seen: 0, truncated: false, notes: [] };
      }
    }
    const S = st;
    const known = new Set(S.events.map((e) => e.txHash)); // de-duplicate: ranges overlap at their edges
    const spent = new Set<string>(); // keys used up during this run (even if saving that to the store fails)
    const keys = zerionKeys().length;
    // Several readers at once: each range is read newest-first with its own cursor; a free reader
    // takes another range, and a dense range is split in half when someone is free to take a half.
    const readers = Math.min(12, Math.max(2, keys * 3)); // ~3/s per developer-plan key
    const active = new Set<ZWin>();
    let idle = 0, stop = false, failure: unknown = null;
    const mined = (tx: ZTx) => Math.floor(Date.parse(tx.attributes.mined_at) / 1000);

    const reader = async (n: number) => {
      let key: string | null = null;
      while (!stop && !timeUp(opts.deadline)) {
        const w = S.wins.find((x) => !active.has(x));
        if (!w) {
          if (!active.size) return; // everything read
          idle++;
          await new Promise((r) => setTimeout(r, 200));
          idle--;
          continue;
        }
        active.add(w);
        try {
          while (!stop && !timeUp(opts.deadline) && S.wins.includes(w)) {
            key ??= await liveZerionKey(spent, n);
            const page: { data: ZTx[]; links?: { next?: string } } = await fetchJson("zerion", w.url ?? winUrl(w), {
              headers: { authorization: zerionAuth(key), accept: "application/json" },
              endpoint: "wallets/transactions",
              throttle: `zerion:${keyTag(key)}`,
              onHeaders: zerionHeaders(key),
            });
            S.requests++;
            // Safety: if the date filter were ignored, ranges would overlap wholesale. Fall back to
            // one plain newest-first read of everything (de-duplication keeps what we already have).
            if (!S.sequential && w.to < nowS - 120 && page.data.some((tx) => mined(tx) > w.to + 1)) {
              S.sequential = true;
              S.wins = [{ from: opts.sinceTs, to: nowS, url: null }];
              break;
            }
            let oldest = Infinity;
            for (const tx of page.data) {
              oldest = Math.min(oldest, mined(tx));
              const h = tx.attributes.hash;
              if (known.has(h)) continue;
              known.add(h);
              S.seen++;
              const e = normalize(wallet, tx);
              if (e) S.events.push(e);
            }
            opts.onProgress?.({ chain: family === "evm" ? "evm" : "solana", fetched: S.seen });
            const next = page.links?.next;
            if (!next || !page.data.length) { S.wins = S.wins.filter((x) => x !== w); break; }
            // Optional cap (MAX_TXS_PER_ADDRESS); by default the whole history is read.
            if (S.seen >= opts.maxTxs) { S.truncated = true; S.wins = []; stop = true; break; }
            if (!S.sequential && idle > 0 && oldest - w.from > 2 * 3600) {
              // Dense range and a reader is waiting: hand it the older half (1s overlap at the cut).
              const mid = Math.floor((w.from + oldest) / 2);
              S.wins.push({ from: w.from, to: mid + 1, url: null });
              Object.assign(w, { from: mid, to: oldest + 1, url: null });
            } else {
              w.url = next;
            }
          }
        } catch (e) {
          if (e instanceof QuotaError && key) {
            // This key is out for today: remember it; the same page is retried with another key.
            spent.add(key);
            await markZerionKeySpent(key, e.resetHours);
            key = null;
          } else {
            if (!(e instanceof QuotaError)) failure = e;
            else S.quotaCut = true; // every key is out
            stop = true;
          }
        } finally {
          active.delete(w);
        }
      }
    };
    await Promise.all(Array.from({ length: readers }, (_, n) => reader(n)));

    if (failure) throw failure;
    if (S.quotaCut) {
      // Daily data limit ran out partway through a huge history: keep what we read and say so, instead
      // of failing the whole lookup. With nothing read yet, it's a real error.
      if (!S.events.length) await liveZerionKey(); // throws the QuotaError with the reset time
      // Save the unread ranges (and what we read, before any fixes) for the next lookup: kept for 3 days.
      if (S.wins.length) await saveBlob(savedKey, { wins: S.wins, events: S.events, seen: S.seen, savedAt: Math.floor(Date.now() / 1000) } satisfies SavedRead, 3 * 86400).catch(() => {});
      S.truncated = true;
      S.wins = [];
      S.notes.push(`Today's free data limit ran out after ${S.seen.toLocaleString()} transactions, so this covers the newest ones only. Look it up again tomorrow to read further back.`);
    }
    const partial = (): FetchResult => ({ events: [], truncated: false, requests: S.requests, partial: true, resume: S });
    if (S.wins.length) return partial();
    // Read to the end this time: the saved spot isn't needed any more.
    if (S.resumed && !S.quotaCut && !S.cleared) { await clearBlob(savedKey).catch(() => {}); S.cleared = true; }
    if (S.resumed && !S.quotaCut && !S.notes.some((n) => n.startsWith("Continued"))) S.notes.push("Continued from where an earlier lookup of this wallet stopped.");
    const { events, notes } = S;
    if (family === "solana") {
      // Zerion can lag on very spammy Solana wallets. Fill anything newer straight from Solana RPC.
      // (Not for bot-flooded addresses: everything newer there is the bot noise.)
      if (!opts.junkFlooded && !S.backfill) {
        const newest = events.reduce((m, e) => Math.max(m, e.timestamp), opts.sinceTs);
        try {
          const { sigs } = await signaturesSince(wallet, newest);
          const known = new Set(events.map((e) => e.txHash));
          S.backfill = { pending: sigs.filter((s) => !known.has(s)), added: 0 };
        } catch {
          notes.push(`Couldn't double-check recent Solana activity for ${wallet.slice(0, 4)}….`);
          S.backfill = { pending: [], added: 0 };
        }
      }
      if (S.backfill?.pending.length) {
        const bf = S.backfill;
        bf.pending = await drain(bf.pending, 6, opts.deadline, async (sig) => {
          const e = await fetchRawEvent(wallet, sig);
          if (e) { events.push(e); bf.added++; }
        });
        if (bf.pending.length) return partial();
        if (bf.added) notes.push(`Filled ${bf.added} recent Solana transactions the data provider was missing.`);
      }
      opts.onProgress?.({ chain: "solana", fetched: S.seen });
      // Helius batch parser (100 per request) when available; plain RPC one by one otherwise.
      const helius = !!process.env.HELIUS_API_KEY;
      const verify = helius ? verifyTransfersHelius : verifySolanaTransfers;
      // An earlier lookup of this wallet already checked everything up to `until`: reuse its answers.
      const verKey = `ver:solana:${wallet}`;
      if (helius && !S.verCacheApplied) {
        S.verCacheApplied = true;
        const saved = await loadBlob<VerifiedCache>(verKey).catch(() => null);
        if (saved) {
          for (const e of events) {
            if (e.verified || e.timestamp > saved.until) continue;
            const fix = saved.fixes[e.txHash];
            if (fix) { e.in = fix.in; e.out = fix.out; e.type = "swap"; e.onchainFix = true; S.fixed = (S.fixed ?? 0) + 1; }
            e.verified = true;
          }
        }
      }
      const v = await verify(events, isMoney, opts.deadline, (done, total) =>
        opts.onProgress?.({ chain: "solana", fetched: S.seen, message: `Double-checking trades on-chain (${done.toLocaleString()}/${total.toLocaleString()})` }),
      );
      S.fixed = (S.fixed ?? 0) + v.fixed;
      if (v.remaining) return partial();
      if (helius && !S.verCacheSaved) {
        S.verCacheSaved = true;
        const fixes: VerifiedCache["fixes"] = {};
        for (const e of events) if (e.onchainFix) fixes[e.txHash] = { in: e.in, out: e.out };
        const until = events.reduce((m, e) => Math.max(m, e.timestamp), 0);
        await saveBlob(verKey, { until, fixes } satisfies VerifiedCache, 30 * 86400).catch(() => {});
      }
      if (S.fixed) notes.push(`Corrected ${S.fixed} Solana trades the data provider had labeled as plain transfers.`);
    }
    const { truncated, requests, quotaCut } = S;
    return { events, truncated, requests, notes, quotaCut };
  },
  };
}

/** A date range still to read (seconds, both ends included) and its next-page cursor, if started. */
interface ZWin { from: number; to: number; url: string | null }

/** On-chain double-check results for a wallet, reused by later lookups (trades up to `until`). */
interface VerifiedCache { until: number; fixes: Record<string, { in: Leg[]; out: Leg[] }> }

/** Where a lookup cut short by the daily limit stopped (saved for the next lookup of the wallet). */
interface SavedRead { wins?: ZWin[]; url?: string | null; events: UnifiedEvent[]; seen: number; savedAt?: number }

interface ZerionState {
  wins: ZWin[]; // ranges still to read; empty when the history is fully read
  sequential?: boolean; // date filter didn't hold: reading everything newest-first instead
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
  verCacheApplied?: boolean;
  verCacheSaved?: boolean;
}
/** Saved state from before parallel reading (one cursor). */
type OldState = Omit<ZerionState, "wins"> & { url: string | null; topUrl?: string };

function upgradeState(old: OldState, sinceTs: number, nowS: number): ZerionState {
  const { url, topUrl, ...rest } = old;
  void topUrl;
  return { ...rest, wins: url ? [{ from: sinceTs, to: nowS, url }] : [] };
}

/**
 * Starting ranges. Recent months are usually the busiest, so they're cut finer; dense ranges are
 * split further while reading.
 */
function initialWindows(sinceTs: number, nowS: number): ZWin[] {
  const DAY = 86400;
  const cuts = [nowS, nowS - 30 * DAY, nowS - 90 * DAY, nowS - 180 * DAY, nowS - 365 * DAY].filter((t) => t > sinceTs);
  const wins: ZWin[] = [];
  for (let i = 0; i < cuts.length; i++) {
    const to = cuts[i], from = i + 1 < cuts.length ? cuts[i + 1] : sinceTs;
    wins.push({ from: Math.max(0, from - 1), to: to + 1, url: null }); // 1s overlap at each cut
  }
  if (sinceTs === 0 && cuts.length === 5) wins[wins.length - 1].from = 0; // all time: everything older
  return wins;
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
