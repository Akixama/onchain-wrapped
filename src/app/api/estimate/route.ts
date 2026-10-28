import { isTimeframe } from "@/lib/core/types";
import { resolveWallets } from "@/lib/core/resolve";
import { estimateSize } from "@/lib/estimate";
import { kv } from "@/lib/infra/kv";
import { ipKey } from "@/lib/limits";

export const maxDuration = 30;

/** POST { input, timeframe } -> how big the wallet(s) are and whether today's data budget covers them. */
export async function POST(req: Request) {
  const ip = ipKey(req.headers);
  // Each check spends a little of the shared daily budget: keep it to a sane number per person.
  const n = await kv().incr(`rl:est:${ip}:${new Date().toISOString().slice(0, 13)}`, 3600).catch(() => 0);
  if (n > Number(process.env.ESTIMATES_PER_IP_HOUR ?? 30)) return Response.json({ error: "rate" }, { status: 429 });
  let body: { input?: string | string[]; timeframe?: string };
  try { body = await req.json(); } catch { return Response.json({ error: "bad json" }, { status: 400 }); }
  const timeframe = isTimeframe(body.timeframe) && body.timeframe !== "all" ? body.timeframe : "12m";
  try {
    const wallets = await resolveWallets(body.input ?? "");
    return Response.json(await estimateSize(wallets.map((w) => w.address), timeframe));
  } catch {
    return Response.json({ error: "unavailable" }, { status: 200 });
  }
}
