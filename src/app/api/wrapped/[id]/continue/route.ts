// Next part of a big lookup, started by the previous part right before its time ran out.
import { after } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { continueKey, runJob } from "@/lib/jobs";

export const maxDuration = 300;

export async function POST(req: Request, ctx: RouteContext<"/api/wrapped/[id]/continue">) {
  const { id } = await ctx.params;
  const got = Buffer.from(req.headers.get("x-continue-key") ?? "");
  const want = Buffer.from(continueKey());
  if (got.length !== want.length || !timingSafeEqual(got, want)) return Response.json({ error: "Forbidden" }, { status: 403 });
  after(() => runJob(id));
  return Response.json({ ok: true }, { status: 202 });
}
