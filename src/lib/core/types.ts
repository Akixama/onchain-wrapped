// The one event format every chain adapter normalizes into.
// The PnL + stats engines only ever see these types, never provider-specific JSON.

export type ChainId =
  | "solana"
  | "ethereum"
  | "base"
  | "arbitrum"
  | "bsc"
  | "polygon"
  | "optimism";
// Later: "hyperliquid" | "tron" | "bitcoin" | other EVM chains. Add here + one adapter.

export type ChainFamily = "solana" | "evm";

/** Places money can go that we can see the door to but not (yet) inside. Becomes a ChainId once it has an adapter. */
export type Venue = ChainId | "hyperliquid";

export type EventType =
  | "swap"
  | "transfer_in"
  | "transfer_out"
  | "bridge_out"
  | "bridge_in"
  | "airdrop"
  | "mint"
  | "other";

export interface TokenRef {
  chain: ChainId;
  /** Mint / contract address, or "native" for SOL/ETH/BNB/POL gas tokens. Lowercased for EVM. */
  address: string;
  symbol: string;
  name?: string;
  decimals?: number;
  icon?: string;
  /** Provider says this token is verified / non-spam. */
  verified?: boolean;
}

export interface Leg {
  token: TokenRef;
  amount: number; // human units (already divided by decimals)
  /** USD value at the time of the tx. null = unknown, filled later by the price layer. */
  usd: number | null;
  /** The other side of this movement, when known (used for own-wallet detection). */
  counterparty?: string;
}

export interface UnifiedEvent {
  id: string; // `${chain}:${txHash}:${wallet}`
  wallet: string;
  chain: ChainId;
  timestamp: number; // unix seconds
  txHash: string;
  type: EventType;
  in: Leg[]; // tokens that entered the wallet
  out: Leg[]; // tokens that left the wallet
  gasUsd: number | null;
  gasNative: number; // in native units (SOL / ETH / ...)
  protocol?: string; // "jupiter", "uniswap", "across", ...
  spam?: boolean;
  /** Set by identity merge: this transfer was between two of the user's own wallets. */
  ownTransfer?: boolean;
  /** Already re-read from the chain (provider transfer labels double-checked). */
  verified?: boolean;
  /** The chain showed this "transfer" was really a swap; in/out were replaced from the chain. */
  onchainFix?: boolean;
  /** Fee paid to a trading app (Axiom, GMGN...) in this swap, in native units. Already inside the trade cost. */
  appFee?: { app: string; native: number; usd?: number | null };
  /** This swap was checked for app fees (the source shows every transfer). */
  feeScan?: boolean;
}

export interface FetchOptions {
  sinceTs: number; // unix seconds, 0 for all time
  /** Custom range end (unix seconds): ignore anything later. */
  untilTs?: number;
  maxTxs: number; // optional cap per address (MAX_TXS_PER_ADDRESS); Infinity = whole history
  onProgress?: (p: { chain: ChainId | "evm"; fetched: number; message?: string }) => void;
  /**
   * Wall-clock time (ms) to stop at. Serverless runs are time-limited, so a big history is read in
   * parts: past the deadline an adapter returns `partial` + `resume`, and a later run passes that
   * `resume` back to carry on exactly where it stopped.
   */
  deadline?: number;
  resume?: unknown;
  /** The address is known to be flooded with bot transactions (skip work that only reads that noise). */
  junkFlooded?: boolean;
  /** Reading is done and a slow on-chain check starts: the caller can do other lookups meanwhile. */
  onSlowCheck?: (events: UnifiedEvent[]) => void;
}

export interface FetchResult {
  events: UnifiedEvent[];
  truncated: boolean; // stopped before reaching sinceTs (cap set, or junk-flooded address)
  requests: number;
  /** Stopped early because the provider's daily limit ran out (a later lookup can continue). */
  quotaCut?: boolean;
  /** Ran out of time: `events` is empty; pass `resume` back in the next run. */
  partial?: boolean;
  resume?: unknown;
  /** Current USD prices the provider happened to give us, keyed by tokenKey. */
  currentPrices?: Record<string, number>;
  /** Human-readable data-quality notes shown in the UI ("filled 18 missing txs"). */
  notes?: string[];
  /** The address history is mostly other programs' transactions that never touch this wallet's balances. */
  junkFlooded?: boolean;
}

/** A chain adapter = one data provider covering one or more chains. */
export interface ChainAdapter {
  id: string;
  family: ChainFamily;
  chains: ChainId[];
  isConfigured(): boolean;
  fetchEvents(address: string, opts: FetchOptions): Promise<FetchResult>;
}

export const tokenKey = (t: Pick<TokenRef, "chain" | "address">) => `${t.chain}:${t.address}`;

/** How far back a lookup reads. */
export type Timeframe = "1m" | "3m" | "6m" | "12m" | "all" | "custom";
/** A custom period (unix seconds, both inside the last 12 months). */
export interface DateRange { from: number; to: number }
export const TIMEFRAME_DAYS: Record<Exclude<Timeframe, "all" | "custom">, number> = { "1m": 30, "3m": 90, "6m": 180, "12m": 365 };
export const isTimeframe = (v: unknown): v is Timeframe => v === "all" || v === "custom" || (typeof v === "string" && v in TIMEFRAME_DAYS);

/** Parse a custom range from the form ("2026-03-01" dates or unix seconds); null if invalid. The end
 * date counts in full, and the range must sit inside the last 12 months. */
export function parseRange(from: unknown, to: unknown, nowS = Math.floor(Date.now() / 1000)): DateRange | null {
  const ts = (v: unknown) => typeof v === "number" ? v : typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? Date.parse(`${v}T00:00:00Z`) / 1000 : NaN;
  const f = ts(from), t0 = ts(to);
  if (!Number.isFinite(f) || !Number.isFinite(t0)) return null;
  const t = Math.min(nowS, typeof to === "string" ? t0 + 86400 - 1 : t0);
  // Within the last 12 months: the start may be any day from 365 days ago (that whole day counts).
  const earliest = Math.floor((nowS - 365 * 86400) / 86400) * 86400;
  if (f >= t || f < earliest) return null;
  return { from: Math.floor(f), to: Math.floor(t) };
}
