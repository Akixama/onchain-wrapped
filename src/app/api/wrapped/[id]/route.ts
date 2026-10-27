import { after } from "next/server";
import { recoverIfStalled, runJob } from "@/lib/jobs";
import { getJob, publicJob } from "@/lib/store";

// A restarted part runs here, after the response.
export const maxDuration = 300;

export async function GET(_req: Request, ctx: RouteContext<"/api/wrapped/[id]">) {
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job) return Response.json({ error: "Not found" }, { status: 404 });
  // The loading screen polls this: a part that died without handing off gets restarted here.
  if (await recoverIfStalled(job).catch(() => false)) after(() => runJob(id));
  return Response.json(publicJob(job), { headers: { "cache-control": job.status === "done" ? "public, max-age=300" : "no-store" } });
}
