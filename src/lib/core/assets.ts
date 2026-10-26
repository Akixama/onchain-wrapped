import type { ChainId, TokenRef, Venue } from "./types";

/** "Base" assets: the money people trade *with*. Not counted as trades on their own. */
export type Major = "SOL" | "ETH" | "BNB" | "POL" | "USD";

export const NATIVE: Record<ChainId, { symbol: string; major: Major; decimals: number }> = {
  solana: { symbol: "SOL", major: "SOL", decimals: 9 },
  ethereum: { symbol: "ETH", major: "ETH", decimals: 18 },
  base: { symbol: "ETH", major: "ETH", decimals: 18 },
  arbitrum: { symbol: "ETH", major: "ETH", decimals: 18 },
  optimism: { symbol: "ETH", major: "ETH", decimals: 18 },
  bsc: { symbol: "BNB", major: "BNB", decimals: 18 },
  polygon: { symbol: "POL", major: "POL", decimals: 18 },
};

/** DefiLlama ids for majors (used for historical pricing + counterfactuals). */
export const MAJOR_LLAMA_ID: Record<Exclude<Major, "USD">, string> = {
  SOL: "coingecko:solana",
  ETH: "coingecko:ethereum",
  BNB: "coingecko:binancecoin",
  POL: "coingecko:polygon-ecosystem-token",
};

// address (lowercase for EVM, exact for Solana) -> major it represents
const KNOWN: Partial<Record<ChainId, Record<string, Major>>> = {
  solana: {
    So11111111111111111111111111111111111111112: "SOL",
    EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USD", // USDC
    Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USD", // USDT
    "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo": "USD", // PYUSD
    USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB: "USD", // USD1
  },
  ethereum: {
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "ETH",
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USD",
    "0xdac17f958d2ee523a2206206994597c13d831ec7": "USD",
    "0x6b175474e89094c44da98b954eedeac495271d0f": "USD",
    "0x4c9edd5852cd905f086c759e8383e09bff1e68b3": "USD", // USDe
  },
  base: {
    "0x4200000000000000000000000000000000000006": "ETH",
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "USD",
    "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca": "USD", // USDbC
  },
  arbitrum: {
    "0x82af49447d8a07e3bd95bd0d56f35241523fbab1": "ETH",
    "0xaf88d065e77c8cc2239327c5edb3a432268e5831": "USD",
    "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8": "USD",
    "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9": "USD",
  },
  optimism: {
    "0x4200000000000000000000000000000000000006": "ETH",
    "0x0b2c639c533813f4aa9d7837caf62653d097ff85": "USD",
    "0x7f5c764cbc14f9669b88837ca1490cca17c31607": "USD",
    "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58": "USD",
  },
  bsc: {
    "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c": "BNB",
    "0x55d398326f99059ff775485246999027b3197955": "USD",
    "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d": "USD",
  },
  polygon: {
    "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270": "POL",
    "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619": "ETH",
    "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359": "USD",
    "0x2791bca1f2de4661ed88a30c99a7a9449aa84174": "USD",
    "0xc2132d05d31c914a87c6611c10748aeb04b58e8f": "USD",
  },
};

export function majorOf(t: Pick<TokenRef, "chain" | "address">): Major | null {
  if (t.address === "native") return NATIVE[t.chain].major;
  return KNOWN[t.chain]?.[t.address] ?? null;
}

// Stablecoins, staked/liquid-staked majors and wrapped BTC we don't list by address.
// Matched by exact symbol, and only when the provider hasn't marked the token unverified.
const MONEY_SYMBOLS = /^(usdc|usdt|usdt0|dai|usde|susde|usds|susds|frax|frxusd|sfrxusd|fdusd|pyusd|usd1|gho|crvusd|lusd|tusd|busd|usdc\.e|usdbc|rlusd|usdg|usdh|usd0|usd0\+\+|dola|steth|wsteth|cbeth|reth|weeth|ezeth|meth|sfrxeth|frxeth|oseth|jitosol|msol|jupsol|bsol|bnsol|inf|wbtc|cbbtc|btcb|tbtc|lbtc)$/i;

/** "Money": what people trade with. Swapping money->money is a trade but never a position. */
export function isMoney(t: Pick<TokenRef, "chain" | "address" | "symbol" | "verified">): boolean {
  if (majorOf(t)) return true;
  return t.verified !== false && MONEY_SYMBOLS.test(t.symbol ?? "") && /^[\x20-\x7e]+$/.test(t.symbol);
}

/** Wrapped natives (WETH, wSOL...) are merged with the native coin for PnL purposes. */
export function canonicalToken(t: TokenRef): TokenRef {
  const m = majorOf(t);
  if (m && m !== "USD" && t.address !== "native" && NATIVE[t.chain].major === m) {
    return { ...t, address: "native", symbol: NATIVE[t.chain].symbol };
  }
  return t;
}

/** Which major the "if you'd just held" card uses for this chain. */
export const counterfactualMajor = (c: ChainId): "SOL" | "ETH" => (c === "solana" ? "SOL" : "ETH");

export const CHAIN_LABEL: Record<Venue, string> = {
  hyperliquid: "Hyperliquid",
  solana: "Solana",
  ethereum: "Ethereum",
  base: "Base",
  arbitrum: "Arbitrum",
  bsc: "BNB Chain",
  polygon: "Polygon",
  optimism: "Optimism",
};
