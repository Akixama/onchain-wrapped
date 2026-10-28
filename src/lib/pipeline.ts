import type { UnifiedEvent } from "./core/types";
import { tokenKey } from "./core/types";
import { adaptersFor } from "./chains/registry";
import { mergeIdentity } from "./core/identity";
import { resolveWallets } from "./core/resolve";
import { enrichEvents } from "./core/enrich";
import { filterSpam } from "./core/spam";
import { buildPriceBook } from "./prices/pricebook";
import { runPnl } from "./engine/pnl";
import { bagStats } from "./engine/extras";
import { sniperStats } from "./launch";
import { computeStats, storyCards, type WrappedStats } from "./engine/stats";
import { addTradeCharts } from "./charts";
import { refinePeaks } from "./peaks";
import { usageSnapshot } from "./infra/usage";
import { cacheGet, cacheSet } from "./infra/cache";
import { currentTokenBalances } from "./chains/solana-rpc";
import type { FetchResult } from "./core/types";

import { TIMEFRAME_DAYS, type Timeframe } from "./core/types";
export type { Timeframe };

export interface Progress {
  stage: "fetching" | "pricing" | "crunching" | "done";
  message: string;
  fetched: number;
}

export interface RunInput {
  addresses: string[];
  timeframe: Timeframe;
  maxTxsPerAddress?: number;
  onProgress?: (p: Progress) => void;
  /** Stop reading at this time (ms) and return `partial` (see FetchOptions.deadline). */
  deadline?: number;
  /** Saved progress from an earlier run that hit its deadline. */
  resume?: FetchSlots;
}

/** Per adapter + wallet: the finished result, or the adapter's saved state to carry on from. */
export type FetchSlots = Record<string, { done: true; result: FetchResult } | { done: false; state: unknown }>;

export type RunOutput =
  | { partial: FetchSlots; fetched: number }
  | { partial?: undefined; stats: WrappedStats; events: UnifiedEvent[]; usage: ReturnType<typeof usageSnapshot> };

export async function runWrapped(input: RunInput): Promise<RunOutput> {
  input.onProgress?.({ stage: "fetching", message: "Finding your wallets", fetched: 0 });
  const resolved = await resolveWallets(input.addresses);
  const wallets = resolved.map((w) => w.address);
  // No cap by default: the whole history in the timeframe. MAX_TXS_PER_ADDRESS can still set one.
  const cap = input.maxTxsPerAddress ?? Number(process.env.MAX_TXS_PER_ADDRESS || Infinity);
  const now = Math.floor(Date.now() / 1000);
  const sinceTs = input.timeframe === "all" ? 0 : now - TIMEFRAME_DAYS[input.timeframe] * 86400;
  const say = (p: Progress) => input.onProgress?.(p);

  let fetched = 0;
  const slots: FetchSlots = { ...(input.resume ?? {}) };

  await Promise.all(
    wallets.flatMap((w) => {
      const adapters = adaptersFor(w);
      if (!adapters.length) throw new Error(`Not a Solana or EVM address: ${w}`);
      return adapters.map(async (a) => {
        if (!a.isConfigured()) throw new Error(`${a.id} API key missing (see .env.example)`);
        const slotKey = `${a.id}:${w}`;
        const prev = slots[slotKey];
        if (prev?.done) return;
        let last = 0;
        // Cache raw provider output per wallet + window + cap (day-rounded so it hits all day).
        const cacheKey = `fetch:v2:${a.id}:${w}:${Math.floor(sinceTs / 86400)}:${cap}`;
        const cached = prev ? null : await cacheGet<FetchResult>(cacheKey);
        const res = cached ?? await a.fetchEvents(w, {
          sinceTs,
          maxTxs: cap,
          deadline: input.deadline,
          resume: prev?.state,
          onProgress: ({ chain, fetched: n, message }) => {
            fetched += n - last;
            last = n;
            say({ stage: "fetching", message: message ?? `Reading ${chain === "evm" ? "EVM chains" : chain} history`, fetched });
          },
        });
        if (res.partial) { slots[slotKey] = { done: false, state: res.resume }; return; }
        if (!cached) await cacheSet(cacheKey, res);
        slots[slotKey] = { done: true, result: res };
      });
    }),
  );
  // Out of time with reading left (or no time left to analyse): hand back everything read so far.
  if (Object.values(slots).some((s) => !s.done) || (input.deadline && Date.now() >= input.deadline)) {
    return { partial: slots, fetched };
  }

  let truncated = false;
  let quotaCut = false;
  // When a cap cuts a wallet's history short, we only see it back to some date. With several
  // wallets we analyse just the window ALL of them cover, or a buy in wallet A followed by a sale in
  // busy wallet B (outside B's window) would look like a coin still held.
  let coverageStart = sinceTs;
  const providerPrices: Record<string, number> = {};
  const notes: string[] = [];
  const all: UnifiedEvent[] = [];
  for (const s of Object.values(slots)) {
    if (!s.done) continue;
    const res = s.result;
    truncated ||= res.truncated;
    quotaCut ||= !!res.quotaCut;
    if (res.truncated && res.events.length) {
      coverageStart = Math.max(coverageStart, Math.min(...res.events.map((e) => e.timestamp)));
    }
    Object.assign(providerPrices, res.currentPrices);
    notes.push(...(res.notes ?? []));
    all.push(...res.events);
  }
  fetched = all.length;

  // Same tx seen via two linked wallets keeps both perspectives; exact duplicates are dropped.
  const events = [...new Map(all.map((e) => [e.id, e])).values()]
    .filter((e) => e.timestamp >= coverageStart)
    .sort((a, b) => a.timestamp - b.timestamp);
  fillTokenInfo(events);

  const stats = await analyze({
    events, resolved, timeframe: input.timeframe, sinceTs, coverageStart, truncated, cap: Number.isFinite(cap) ? cap : 0, providerPrices, notes,
    onStage: (stage, message) => say({ stage, message, fetched }),
  });
  if (quotaCut) stats.meta.quotaCut = true;
  say({ stage: "done", message: "Done", fetched });
  return { stats, events, usage: usageSnapshot() };
}

export interface AnalyzeInput {
  events: UnifiedEvent[];
  resolved: { address: string; family: "evm" | "solana"; name?: string }[];
  timeframe: Timeframe;
  sinceTs: number;
  coverageStart: number;
  truncated: boolean;
  cap: number;
  providerPrices?: Record<string, number>;
  notes?: string[];
  onStage?: (stage: Progress["stage"], message: string) => void;
}

/** Everything after fetching: prices, spam, identity, PnL, stats. Re-runnable on saved events (no provider calls). */
export async function analyze(a: AnalyzeInput): Promise<WrappedStats> {
  const { events, resolved, sinceTs, coverageStart, truncated, cap } = a;
  const wallets = resolved.map((w) => w.address);
  const notes = [...new Set(a.notes ?? [])];
  const now = Math.floor(Date.now() / 1000);
  a.onStage?.("pricing", "Looking up prices");
  const pb = await buildPriceBook(events, sinceTs, a.providerPrices ?? {});
  enrichEvents(events, pb);
  const spamFiltered = filterSpam(events, (k) => pb.current(k));
  const { bridges } = mergeIdentity(events, wallets);

  a.onStage?.("crunching", "Crunching your PnL");
  const actualBalances = await solanaHoldings(resolved.filter((w) => w.family === "solana").map((w) => w.address));
  const positions = runPnl(events, pb, { actualBalances });
  // Real price peaks for positions held long enough to round-trip (DefiLlama often has no memecoin history).
  a.onStage?.("crunching", "Checking price peaks");
  const pbx = await refinePeaks(positions, pb, now).catch(() => pb);
  const fromTs = truncated ? coverageStart : sinceTs || (events[0]?.timestamp ?? now);
  const stats = computeStats({ wallets, timeframe: a.timeframe, fromTs, events, positions, bridges, pb: pbx, truncated, txCap: cap, spamFiltered });

  const untraced = [...positions.values()].filter((p) => p.untracedExit).length;
  if (untraced) notes.push(`${untraced} tokens left your wallets by routes we can't trace (bots, other wallets). We count them as moved, not sold.`);
  stats.meta.notes = notes;
  a.onStage?.("crunching", "Drawing your charts");
  await addTradeCharts(stats, positions, pbx, (n) => notes.push(n)).catch(() => {});
  stats.meta.notes = notes;
  // Bags still held: only when we saw the real balances, so coins that left by other routes don't show up.
  if (actualBalances) stats.bags = bagStats([...positions.values()].filter((p) => p.chain === "solana"));
  a.onStage?.("crunching", "Checking how early you bought");
  stats.sniper = await sniperStats([...positions.values()], Date.now() + 30_000).catch(() => undefined);
  stats.cards = storyCards(stats);
  stats.meta.names = Object.fromEntries(resolved.filter((w) => w.name).map((w) => [w.address, w.name!]));
  return stats;
}

/** Legs from raw RPC have no symbol/name; borrow them from any other event that saw the same token. */
function fillTokenInfo(events: UnifiedEvent[]) {
  const best = new Map<string, UnifiedEvent["in"][number]["token"]>();
  for (const e of events) for (const l of [...e.in, ...e.out]) {
    const k = tokenKey(l.token);
    if (l.token.symbol && !best.has(k)) best.set(k, l.token);
  }
  for (const e of events) for (const l of [...e.in, ...e.out]) {
    if (l.token.symbol) continue;
    const b = best.get(tokenKey(l.token));
    l.token = b ? { ...b, decimals: l.token.decimals ?? b.decimals } : { ...l.token, symbol: l.token.address.slice(0, 4) };
  }
}

/**
 * Current Solana token balances across all linked Solana wallets (keyed by tokenKey).
 * Lets PnL notice tokens that left through routes no provider shows (bots with delegated
 * token accounts, wallet clusters we weren't given). Undefined = couldn't check, skip.
 */
async function solanaHoldings(wallets: string[]): Promise<Map<string, number> | undefined> {
  if (!wallets.length) return undefined;
  try {
    const total = new Map<string, number>();
    for (const w of wallets) {
      for (const [mint, amt] of await currentTokenBalances(w)) total.set(`solana:${mint}`, (total.get(`solana:${mint}`) ?? 0) + amt);
    }
    return total;
  } catch {
    return undefined;
  }
}
