// One-off: fill the "recent wraps" feed from lookups that finished before it existed, using each
// result's real finish time.   node --env-file=.env.local --import tsx scripts/backfill-feed.mts
import { kv } from "../src/lib/infra/kv";
import { getJob } from "../src/lib/store";
import { recordWrap } from "../src/lib/sitestats";

const ids = (await kv().zrange("pct:trades", 0, -1)).map(([m]) => m);
const done: { id: string; at: number }[] = [];
for (let i = 0; i < ids.length; i += 20) {
  const jobs = await Promise.all(ids.slice(i, i + 20).map((id) => getJob(id).catch(() => null)));
  for (const j of jobs) if (j?.status === "done" && j.stats && j.updatedAt) done.push({ id: j.id, at: j.updatedAt });
}
done.sort((a, b) => b.at - a.at);
for (const d of done.slice(0, 60).reverse()) {
  const j = await getJob(d.id);
  if (j?.stats) await recordWrap(j.id, j.stats, d.at);
}
console.log(`lookups in pool: ${ids.length}, still saved: ${done.length}, added to feed: ${Math.min(60, done.length)}`);
