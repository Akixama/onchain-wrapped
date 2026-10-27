import type { ChainAdapter, FetchOptions, FetchResult } from "../core/types";
import { isEvmAddress, isSolanaAddress } from "../core/identity";
import { heliusAdapter } from "./solana-helius";
import { zerionAdapter, zerionSolanaAdapter } from "./evm-zerion";
import { QuotaError } from "../infra/http";

/** Where the Solana router was when a run hit its deadline. */
interface AutoState { source: "helius" | "zerion"; inner?: unknown; heliusRequests: number }

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
  async fetchEvents(address: string, opts: FetchOptions): Promise<FetchResult> {
    if (!heliusAdapter.isConfigured()) return zerionSolanaAdapter.fetchEvents(address, opts);
    // Resumable: remember which source we were on when a run hit its deadline.
    const st = (opts.resume as AutoState | undefined) ?? { source: "helius", heliusRequests: 0 };
    if (st.source === "helius") {
      const h = await heliusAdapter.fetchEvents(address, { ...opts, resume: st.inner });
      if (h.partial) return { ...h, resume: { source: "helius", inner: h.resume, heliusRequests: 0 } satisfies AutoState };
      if (!h.junkFlooded || !zerionSolanaAdapter.isConfigured()) return h;
      opts.onProgress?.({ chain: "solana", fetched: 0, message: "Busy address — switching to a filtered history" });
      Object.assign(st, { source: "zerion", inner: undefined, heliusRequests: h.requests });
    }
    let z: FetchResult;
    try {
      z = await zerionSolanaAdapter.fetchEvents(address, { ...opts, resume: st.inner, junkFlooded: true });
    } catch (e) {
      // Say why: the flooded-wallet source ran out, not the whole site.
      if (e instanceof QuotaError) throw new QuotaError("zerion-flooded", e.resetHours);
      throw e;
    }
    if (z.partial) return { ...z, resume: { ...st, inner: z.resume } satisfies AutoState };
    return {
      ...z,
      requests: z.requests + st.heliusRequests,
      notes: [...(z.notes ?? []), "This address is flooded with bot transactions, so its history was read from a filtered source."],
    };
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
