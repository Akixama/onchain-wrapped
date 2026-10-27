// Flag a saved result as cut short by the daily data limit, so the next lookup re-reads it.
//   node --env-file=.env.local --import tsx scripts/mark-quota-cut.mts <jobId>
import { getJob, putJob } from "../src/lib/store";
const [id] = process.argv.slice(2);
const job = await getJob(id);
if (!job?.stats) throw new Error(`no finished job ${id}`);
job.stats.meta.quotaCut = true;
await putJob(job);
console.log("marked", id, "notes:", job.stats.meta.notes?.[0]);
