import { getJob, publicJob } from "@/lib/store";

export async function GET(_req: Request, ctx: RouteContext<"/api/wrapped/[id]">) {
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(publicJob(job), { headers: { "cache-control": job.status === "done" ? "public, max-age=300" : "no-store" } });
}
