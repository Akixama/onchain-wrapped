// Show the saved lookup a wallet + timeframe would reuse.
//   node --env-file=.env.local --import tsx scripts/find-job.mts <address> [12m|all]
import { kv } from "../src/lib/infra/kv";
import { getJob, lookupKey } from "../src/lib/store";

const [address, tf = "all"] = process.argv.slice(2);
for (const t of (tf === "all" ? ["all", "12m"] : ["12m", "all"]) as ("all" | "12m")[]) {
  const id = await kv().get(`idx:${lookupKey([address], t)}`);
  const job = id ? await getJob(id) : null;
  console.log(t, id ?? "(none)", job ? {
    status: job.status, error: job.error, created: new Date(job.createdAt).toISOString(), segment: job.segment,
    truncated: job.stats?.meta.truncated, txCap: job.stats?.meta.txCap, from: job.stats ? new Date(job.stats.meta.fromTs * 1000).toISOString().slice(0, 10) : null,
    trades: job.stats?.overview.totalTrades, notes: job.stats?.meta.notes,
  } : "");
}
