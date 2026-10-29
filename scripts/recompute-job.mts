// Recompute a saved result with the current engine and replace it (same wallets + period).
//   node --env-file=.env.local --import tsx scripts/_run.mts <jobId>
import { runWrapped } from "../src/lib/pipeline";
import { cannedRoast } from "../src/lib/roast";
import { getJob, putJob } from "../src/lib/store";
const id = process.argv[2];
const job = await getJob(id);
if (!job?.stats) throw new Error("no finished job");
const r = await runWrapped({ addresses: job.wallets, timeframe: job.timeframe, range: job.range });
if (r.partial) throw new Error("partial");
const fresh = r.stats;
fresh.percentile = job.stats.percentile;
fresh.roast = job.stats.roast?.source === "ai" ? job.stats.roast : { text: cannedRoast(fresh, id), source: "canned" };
if (!fresh.cards.includes("roast")) fresh.cards.splice(Math.max(0, fresh.cards.indexOf("summary")), 0, "roast");
const before = job.stats.paperHands;
job.stats = fresh;
await putJob(job);
console.log(id, job.timeframe, "paper hands:", before ? `${before.symbol} $${before.missedUsd}` : "-", "->", fresh.paperHands ? `${fresh.paperHands.symbol} $${fresh.paperHands.missedUsd}` : "-", "| pnl", fresh.pnl.totalUsd);
process.exit(0);
