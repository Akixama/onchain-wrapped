import { getSiteStats } from "@/lib/sitestats";

// Live numbers and recent wraps for the homepage and page heroes. Polled every ~20s.
export async function GET() {
  const v = await getSiteStats().catch(() => null);
  return Response.json(v ?? { wallets: 0, lookups: 0, trades: 0, today: 0, recent: [] }, { headers: { "cache-control": "no-store" } });
}
