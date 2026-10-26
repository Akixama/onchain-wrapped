// API usage log so you can see what each lookup costs.
// Calls are counted in memory, then flushed to the KV store (per day, per provider) when a job ends.
// Read them at /api/admin/usage?key=ADMIN_KEY. Locally, USAGE_LOG_FILE also appends every call as JSONL.

export interface UsageRecord {
  provider: string;
  endpoint: string;
  status: number;
  ms: number;
}

const counters: Record<string, { calls: number; errors: number }> = {};
let pending: UsageRecord[] = [];

export function logUsage(r: UsageRecord) {
  const c = (counters[r.provider] ??= { calls: 0, errors: 0 });
  c.calls++;
  if (r.status >= 400) c.errors++;
  pending.push(r);
  if (process.env.USAGE_LOG_FILE) {
    import("node:fs")
      .then((fs) => fs.appendFileSync(process.env.USAGE_LOG_FILE!, JSON.stringify({ t: new Date().toISOString(), ...r }) + "\n"))
      .catch(() => {});
  }
}

export const usageSnapshot = () => structuredClone(counters);

export function resetUsage() {
  for (const k of Object.keys(counters)) delete counters[k];
}

/** Write pending call counts to the store. Safe with concurrent jobs: each record is flushed once. */
export async function flushUsage() {
  const batch = pending;
  pending = [];
  if (!batch.length) return;
  const { kv } = await import("./kv");
  const sums: Record<string, number> = {};
  for (const r of batch) {
    sums[`${r.provider}:calls`] = (sums[`${r.provider}:calls`] ?? 0) + 1;
    if (r.status >= 400) sums[`${r.provider}:errors`] = (sums[`${r.provider}:errors`] ?? 0) + 1;
    if (r.status === 429) sums[`${r.provider}:429`] = (sums[`${r.provider}:429`] ?? 0) + 1;
  }
  const key = `usage:${new Date().toISOString().slice(0, 10)}`;
  try {
    for (const [field, by] of Object.entries(sums)) await kv().hincrby(key, field, by, 60 * 86400);
  } catch {
    pending.push(...batch); // keep for the next flush
  }
}

/** Rough cost model for the free tiers (credits per call). Update if plans change. */
export const COST_HINT: Record<string, string> = {
  helius: "100 credits/call (free plan: 1M credits/month)",
  zerion: "1 request/call (demo key: 300/day; free Developer plan: 2,000/day)",
  defillama: "free",
  dexscreener: "free",
  geckoterminal: "free (30 req/min)",
  "solana-rpc": "free public RPC",
  anthropic: "roast: ~1 call per finished lookup (paid)",
};
