// Ask a finished Wrapped a question. Free answers from the numbers unless an AI key is configured.
import { askWallet } from "@/lib/ask";
import { kv } from "@/lib/infra/kv";
import { ipKey } from "@/lib/limits";
import { getJob, isValidId } from "@/lib/store";

export async function POST(req: Request, ctx: RouteContext<"/api/ask/[id]">) {
  const { id } = await ctx.params;
  if (!isValidId(id)) return Response.json({ error: "bad id" }, { status: 400 });
  const ip = ipKey(req.headers);
  const n = await kv().incr(`rl:ask:${ip}:${new Date().toISOString().slice(0, 13)}`, 3600).catch(() => 0);
  if (n > Number(process.env.ASKS_PER_IP_HOUR ?? 60)) return Response.json({ error: "Lots of questions! Try again in a bit." }, { status: 429 });
  let body: { question?: unknown };
  try { body = await req.json(); } catch { return Response.json({ error: "bad json" }, { status: 400 }); }
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return Response.json({ error: "Ask something." }, { status: 400 });
  const s = (await getJob(id))?.stats;
  if (!s) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(await askWallet(s, question));
}
