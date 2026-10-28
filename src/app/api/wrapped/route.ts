import { isTimeframe } from "@/lib/core/types";
import { after } from "next/server";
import { InputError, LimitError, runJob, startJob } from "@/lib/jobs";
import { checkRequestRate, ipKey } from "@/lib/limits";

// Heavy wallets can take a while; the job keeps running after we've answered (Vercel Hobby max: 300s).
export const maxDuration = 300;

export async function POST(req: Request) {
  const ip = ipKey(req.headers);
  let body: { input?: string | string[]; timeframe?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Send JSON: { input, timeframe }" }, { status: 400 });
  }
  // All time is retired for new lookups (a busy history can take hours and blow the daily data limit);
  // results made with it still open.
  const timeframe = isTimeframe(body.timeframe) && body.timeframe !== "all" ? body.timeframe : "12m";
  try {
    await checkRequestRate(ip);
    const { job, reused } = await startJob(body.input ?? "", timeframe, ip);
    if (!reused) after(() => runJob(job.id));
    return Response.json({ id: job.id, reused });
  } catch (e) {
    if (e instanceof InputError) return Response.json({ error: e.message }, { status: 400 });
    if (e instanceof LimitError)
      return Response.json({ error: e.message }, { status: 429, headers: { "retry-after": String(e.retryAfterSec) } });
    console.error(e);
    return Response.json({ error: "Couldn't start that lookup. Try again." }, { status: 500 });
  }
}
