// Replace a saved result's numbers with a fresh CLI run (same wallet), keeping its roast and ranking.
//   node --env-file=.env.local --import tsx scripts/refresh-job.mts <jobId> <stats.json>
import { readFileSync } from "node:fs";
import { getJob, putJob } from "../src/lib/store";
import type { WrappedStats } from "../src/lib/engine/stats";

const [id, file] = process.argv.slice(2);
const job = await getJob(id);
if (!job?.stats) throw new Error(`no finished job ${id}`);
const fresh: WrappedStats = JSON.parse(readFileSync(file, "utf8"));
const same = [...fresh.meta.wallets].sort().join() === [...job.stats.meta.wallets].sort().join();
if (!same) throw new Error("wallets differ; refusing to overwrite");
fresh.roast = job.stats.roast;
fresh.percentile = job.stats.percentile;
if (fresh.roast && !fresh.cards.includes("roast")) fresh.cards.splice(Math.max(0, fresh.cards.indexOf("summary")), 0, "roast");
job.stats = fresh;
await putJob(job);
console.log("refreshed", id, "cards:", fresh.cards.join(","), "archetype:", fresh.archetype.title);
