import { timingSafeEqual } from "node:crypto";
import { kv, usingRedis } from "@/lib/infra/kv";

// Your cost dashboard: GET /api/admin/usage?key=ADMIN_KEY  (last 7 days of API calls + lookups).
export async function GET(req: Request) {
  const given = new URL(req.url).searchParams.get("key") ?? "";
  const want = process.env.ADMIN_KEY ?? "";
  const ok = want.length >= 16 && given.length === want.length && timingSafeEqual(Buffer.from(given), Buffer.from(want));
  if (!ok) return Response.json({ error: "Not found" }, { status: 404 });

  const days = Array.from({ length: 7 }, (_, i) => new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10));
  const rows = await Promise.all(
    days.map(async (d) => ({
      day: d,
      lookups: Number((await kv().get(`rl:global:${d}`)) ?? 0),
      calls: Object.fromEntries(Object.entries(await kv().hgetall(`usage:${d}`)).map(([k, v]) => [k, Number(v)])),
    })),
  );
  return Response.json(
    {
      store: usingRedis() ? "upstash-redis" : "local-files",
      limits: {
        lookupsPerDay: Number(process.env.LOOKUPS_PER_DAY ?? 25),
        lookupsPerIpHour: Number(process.env.LOOKUPS_PER_IP_HOUR ?? 5),
        maxTxsPerAddress: Number(process.env.MAX_TXS_PER_ADDRESS ?? 2000),
        roast: process.env.ANTHROPIC_API_KEY && process.env.ROAST_AI !== "off" ? process.env.ROAST_MODEL ?? "claude-opus-5-5" : "free (built-in)",
      },
      days: rows,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
