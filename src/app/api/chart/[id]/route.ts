// Candles rebuilt from on-chain swaps, for trade cards whose token the free chart API doesn't cover
// (fresh pump.fun launches). Only for tokens on a saved result's trade cards; built once, then cached.
import { getJob } from "@/lib/store";
import { kv } from "@/lib/infra/kv";
import { checkRequestRate, ipKey, LimitError } from "@/lib/limits";
import { solanaChainCandles } from "@/lib/onchain-candles";
import type { TradeCard } from "@/lib/engine/stats";

export const maxDuration = 60;

export async function GET(req: Request, ctx: RouteContext<"/api/chart/[id]">) {
  const { id } = await ctx.params;
  const mint = new URL(req.url).searchParams.get("mint") ?? "";
  const job = await getJob(id);
  const s = job?.status === "done" ? job.stats : null;
  const card = s && ([s.bestTrade, s.worstTrade, s.roundTrip, s.diamondHands, s.paperHands] as (TradeCard | null | undefined)[])
    .find((c) => c && c.chain === "solana" && c.address === mint);
  if (!card || !card.window) return Response.json({ error: "Not found" }, { status: 404 });

  const key = `chart:${id}:${mint}`;
  const cached = await kv().get(key);
  if (cached) return new Response(cached, { headers: { "content-type": "application/json", "cache-control": "public, max-age=86400" } });

  try {
    await checkRequestRate(ipKey(req.headers));
  } catch (e) {
    if (e instanceof LimitError) return Response.json({ error: e.message }, { status: 429 });
    throw e;
  }
  const anchors = (card.fills ?? []).map((f) => ({ sig: f.sig, t: f.t, price: f.price }));
  const out = await solanaChainCandles(mint, card.window.start, card.window.end, anchors, card.solUsd ?? null).catch(() => null);
  const body = JSON.stringify(out ?? { candles: [], interval: "" });
  // Keep a built chart for as long as results live; retry an empty one after a few hours.
  await kv().set(key, body, out ? 90 * 86400 : 6 * 3600);
  return new Response(body, { headers: { "content-type": "application/json", "cache-control": "public, max-age=86400" } });
}
