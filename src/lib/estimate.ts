// Before a lookup: roughly how many transactions a wallet has in the chosen period, and whether
// today's free data budget can read them all in one go. Costs 1–2 Zerion requests + 1 RPC call per wallet.
import { TIMEFRAME_DAYS, type Timeframe } from "./core/types";
import { isSolanaAddress } from "./core/identity";
import { fetchJson } from "./infra/http";
import { rpc } from "./chains/solana-rpc";
import { kv } from "./infra/kv";
import { keyTag, liveZerionKey, zerionHeaders, zerionAuth, zerionRequestsLeft } from "./chains/zerion-keys";

export interface WalletSize {
  address: string;
  /** Estimated transactions in the period (Zerion's spam-filtered count); 0 when not needed. */
  txs: number;
  /** True when we counted every one (fewer than a page). */
  exact: boolean;
  /** Bot-flooded address: read through Zerion, which is what the daily limit applies to. */
  flooded: boolean;
}
export interface SizeEstimate {
  wallets: WalletSize[];
  /** Transactions today's remaining Zerion requests can still read. */
  capacity: number;
  /** Transactions that must come from Zerion (flooded wallets only). */
  needed: number;
  fits: boolean;
}

const PAGE = 100;
const DAY = 86400;

async function zerionPage(address: string, from: number, to: number): Promise<number[]> {
  const key = await liveZerionKey();
  const q = new URLSearchParams({
    currency: "usd", "page[size]": String(PAGE), "filter[chain_ids]": "solana",
    "filter[asset_types]": "fungible", "filter[trash]": "only_non_trash",
    "filter[max_mined_at]": String(to * 1000),
  });
  if (from > 0) q.set("filter[min_mined_at]", String(from * 1000));
  const page = await fetchJson<{ data: { attributes: { mined_at: string } }[] }>("zerion", `https://api.zerion.io/v1/wallets/${address}/transactions/?${q}`, {
    headers: { authorization: zerionAuth(key), accept: "application/json" },
    endpoint: "wallets/transactions",
    throttle: `zerion:${keyTag(key)}`,
    onHeaders: zerionHeaders(key),
  });
  return page.data.map((t) => Math.floor(Date.parse(t.attributes.mined_at) / 1000));
}

const SAMPLES = Number(process.env.ESTIMATE_SAMPLES ?? 8);

/**
 * Count whole days spread evenly over the period and scale up. A day with more than a page is
 * extrapolated from the part of the day the page covered. Day-sized windows keep one burst of trades
 * from being stretched over months.
 */
async function sampledCount(address: string, since: number, now: number): Promise<number> {
  const span = now - since;
  const day = Math.min(DAY, span / SAMPLES);
  const perDay = await Promise.all(Array.from({ length: SAMPLES }, async (_, i) => {
    const end = Math.floor(since + (span * (i + 1)) / SAMPLES);
    const ts = await zerionPage(address, end - day, end);
    if (ts.length < PAGE) return ts.length;
    const covered = Math.max(60, end - ts[ts.length - 1]);
    return (PAGE * day) / covered;
  }));
  return Math.round((perDay.reduce((a, b) => a + b, 0) / SAMPLES) * (span / day));
}

async function sizeOf(address: string, timeframe: Timeframe, now: number, force = false): Promise<WalletSize> {
  const since = timeframe === "all" ? now - 3 * 365 * DAY : now - TIMEFRAME_DAYS[timeframe] * DAY;
  const newest = await zerionPage(address, timeframe === "all" ? 0 : since, now);
  if (newest.length < PAGE) return { address, txs: newest.length, exact: true, flooded: false };
  // Raw signatures (bot noise included) vs real activity: same 5% rule the Helius reader uses.
  const realRate = PAGE / Math.max(60, newest[0] - newest[newest.length - 1]);
  let flooded = false;
  const sigs = await rpc<{ blockTime: number | null }[]>("getSignaturesForAddress", [address, { limit: 1000 }]).catch(() => []);
  if (sigs.length === 1000) {
    const rawRate = 1000 / Math.max(60, (sigs[0].blockTime ?? now) - (sigs[999].blockTime ?? 0));
    flooded = realRate / rawRate < 0.05;
  }
  // Only flooded wallets are read through Zerion's daily budget, so only they need a count.
  if (!flooded && !force) return { address, txs: 0, exact: false, flooded };
  return { address, txs: await sampledCount(address, since, now), exact: false, flooded };
}

export async function estimateSize(addresses: string[], timeframe: Timeframe, force = false): Promise<SizeEstimate> {
  const now = Math.floor(Date.now() / 1000);
  const wallets = await Promise.all(addresses.filter(isSolanaAddress).map(async (a) => {
    // Sizes barely move within hours; re-checking would spend the same budget we're measuring.
    const ck = `est:${timeframe}:${a}`;
    const hit = force ? null : await kv().get(ck).catch(() => null);
    if (hit) return JSON.parse(hit) as WalletSize;
    const w = await sizeOf(a, timeframe, now, force);
    await kv().set(ck, JSON.stringify(w), 6 * 3600).catch(() => {});
    return w;
  }));
  const capacity = (await zerionRequestsLeft()) * PAGE;
  const needed = wallets.filter((w) => w.flooded).reduce((s, w) => s + w.txs, 0);
  // The count is an estimate (seen up to ~50% high over a year): leave some room either way.
  return { wallets, capacity, needed, fits: needed * 1.2 <= capacity };
}
