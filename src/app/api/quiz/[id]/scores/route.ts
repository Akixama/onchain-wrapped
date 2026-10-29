// Quiz scoreboard per wallet: GET the top scores, POST { name, score } to add one.
// Kept small (top 20) in the same store as everything else — no extra service.
import { buildQuiz } from "@/components/quiz";
import { kv } from "@/lib/infra/kv";
import { ipKey } from "@/lib/limits";
import { getJob, isValidId } from "@/lib/store";

export interface BoardEntry { name: string; score: number; total: number; at: number }
const KEEP = 20, SHOW = 10, TTL = 180 * 86400;
const boardKey = (id: string) => `qsb:${id}`;

async function load(id: string): Promise<BoardEntry[]> {
  try { return JSON.parse((await kv().get(boardKey(id))) ?? "[]"); } catch { return []; }
}

/** Letters, numbers and a few separators; 1–20 characters. */
function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const n = raw.normalize("NFKC").replace(/[^\p{L}\p{N} ._'-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 20);
  return n.length ? n : null;
}

export async function GET(_req: Request, ctx: RouteContext<"/api/quiz/[id]/scores">) {
  const { id } = await ctx.params;
  if (!isValidId(id)) return Response.json({ error: "bad id" }, { status: 400 });
  return Response.json({ entries: (await load(id)).slice(0, SHOW) });
}

export async function POST(req: Request, ctx: RouteContext<"/api/quiz/[id]/scores">) {
  const { id } = await ctx.params;
  if (!isValidId(id)) return Response.json({ error: "bad id" }, { status: 400 });
  const ip = ipKey(req.headers);
  const n = await kv().incr(`rl:qsb:${ip}:${new Date().toISOString().slice(0, 13)}`, 3600).catch(() => 0);
  if (n > 10) return Response.json({ error: "Too many scores this hour. Try later." }, { status: 429 });

  let body: { name?: unknown; score?: unknown };
  try { body = await req.json(); } catch { return Response.json({ error: "bad json" }, { status: 400 }); }
  const name = cleanName(body.name);
  if (!name) return Response.json({ error: "Pick a name (letters and numbers)." }, { status: 400 });
  const s = (await getJob(id))?.stats;
  if (!s) return Response.json({ error: "not found" }, { status: 404 });
  const total = buildQuiz(s, id).length;
  const score = Number(body.score);
  if (!Number.isInteger(score) || score < 0 || score > total) return Response.json({ error: "bad score" }, { status: 400 });

  const entry: BoardEntry = { name, score, total, at: Date.now() };
  // Same name again: keep their best.
  const board = (await load(id)).filter((e) => e.name.toLowerCase() !== name.toLowerCase() || e.score > score);
  if (!board.some((e) => e.name.toLowerCase() === name.toLowerCase())) board.push(entry);
  board.sort((a, b) => b.score - a.score || a.at - b.at);
  await kv().set(boardKey(id), JSON.stringify(board.slice(0, KEEP)), TTL);
  const rank = board.findIndex((e) => e.name.toLowerCase() === name.toLowerCase()) + 1;
  return Response.json({ entries: board.slice(0, SHOW), rank });
}
