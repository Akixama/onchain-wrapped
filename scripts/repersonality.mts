// Recompute the personality on saved results (after the personality rules change).
//   node --env-file=.env.local --import tsx scripts/repersonality.mts <jobId...>
import { getJob, putJob } from "../src/lib/store";
import { personality } from "../src/lib/engine/personality";
for (const id of process.argv.slice(2)) {
  const j = await getJob(id);
  if (!j?.stats) { console.log(id, "no stats"); continue; }
  j.stats.archetype = personality(j.stats);
  await putJob(j);
  console.log(id, "->", j.stats.archetype.title, (j.stats.archetype.traits ?? []).map((t) => t.label).join(", "));
}
process.exit(0);
