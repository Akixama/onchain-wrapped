import type { ChainAdapter } from "../core/types";
import { isEvmAddress, isSolanaAddress } from "../core/identity";
import { heliusAdapter } from "./solana-helius";
import { zerionAdapter, zerionSolanaAdapter } from "./evm-zerion";

// Adding a chain = write one adapter and list it here.
// Later: hyperliquidAdapter (HL info API), tronAdapter (TronGrid), bitcoinAdapter (mempool.space).
export const ADAPTERS: ChainAdapter[] = [heliusAdapter, zerionSolanaAdapter, zerionAdapter];

/** Solana source: SOLANA_PROVIDER=helius|zerion. Default Helius when its key is set, else Zerion. */
function solanaAdapter(): ChainAdapter {
  const pref = process.env.SOLANA_PROVIDER;
  if (pref === "zerion") return zerionSolanaAdapter;
  if (pref === "helius") return heliusAdapter;
  return heliusAdapter.isConfigured() ? heliusAdapter : zerionSolanaAdapter;
}

export function adaptersFor(address: string): ChainAdapter[] {
  if (isEvmAddress(address)) return [zerionAdapter];
  if (isSolanaAddress(address)) return [solanaAdapter()];
  return [];
}
