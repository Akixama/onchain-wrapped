import type { ChainAdapter, FetchOptions } from "../core/types";
import { isEvmAddress, isSolanaAddress } from "../core/identity";
import { heliusAdapter } from "./solana-helius";
import { zerionAdapter, zerionSolanaAdapter } from "./evm-zerion";

// Adding a chain = write one adapter and list it here.
// Later: hyperliquidAdapter (HL info API), tronAdapter (TronGrid), bitcoinAdapter (mempool.space).

/**
 * Solana: Helius first (fast, exact balance changes). If the address is flooded with bot transactions
 * that never touch its balances, Helius history can't reach the real activity — fall back to Zerion,
 * whose index skips that noise (its transfers are still double-checked on-chain).
 */
const solanaAuto: ChainAdapter = {
  id: "solana-auto",
  family: "solana",
  chains: ["solana"],
  isConfigured: () => heliusAdapter.isConfigured() || zerionSolanaAdapter.isConfigured(),
  async fetchEvents(address: string, opts: FetchOptions) {
    if (!heliusAdapter.isConfigured()) return zerionSolanaAdapter.fetchEvents(address, opts);
    const h = await heliusAdapter.fetchEvents(address, opts);
    if (!h.junkFlooded || !zerionSolanaAdapter.isConfigured()) return h;
    opts.onProgress?.({ chain: "solana", fetched: 0, message: "Busy address — switching to a filtered history" });
    const z = await zerionSolanaAdapter.fetchEvents(address, opts);
    // "Recent activity couldn't be loaded" is meaningless here: the recent history IS the bot noise.
    const notes = (z.notes ?? []).filter((n) => !n.includes("couldn't be loaded"));
    return { ...z, requests: z.requests + h.requests, notes: [...notes, "This address is flooded with bot transactions, so its history was read from a filtered source."] };
  },
};

export const ADAPTERS: ChainAdapter[] = [solanaAuto, heliusAdapter, zerionSolanaAdapter, zerionAdapter];

/** Solana source: SOLANA_PROVIDER=zerion forces Zerion; otherwise Helius with automatic fallback. */
function solanaAdapter(): ChainAdapter {
  return process.env.SOLANA_PROVIDER === "zerion" ? zerionSolanaAdapter : solanaAuto;
}

export function adaptersFor(address: string): ChainAdapter[] {
  if (isEvmAddress(address)) return [zerionAdapter];
  if (isSolanaAddress(address)) return [solanaAdapter()];
  return [];
}
