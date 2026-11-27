import { getSiteStats } from "@/lib/sitestats";

// Live numbers and recent wraps for the homepage and page heroes. Polled every ~20s.
export async function GET() {
  const s = await getSiteStats().catch(() => null);
  // Never send result ids: they open the wallet's Wrapped. The feed is keyed by time instead.
  const v = s && { ...s, recent: s.recent.map((r) => ({ ...r, id: String(r.t) })) };
  return Response.json(v ?? { wallets: 0, lookups: 0, trades: 0, today: 0, recent: [] }, { headers: { "cache-control": "no-store" } });
}
