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
}

export interface FetchOptions {
  sinceTs: number; // unix seconds, 0 for all time
  maxTxs: number; // hard cap per address (cost protection)
  onProgress?: (p: { chain: ChainId | "evm"; fetched: number }) => void;
}

export interface FetchResult {
  events: UnifiedEvent[];
  truncated: boolean; // hit maxTxs before reaching sinceTs
  requests: number;
  /** Current USD prices the provider happened to give us, keyed by tokenKey. */
  currentPrices?: Record<string, number>;
  /** Human-readable data-quality notes shown in the UI ("filled 18 missing txs"). */
  notes?: string[];
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
