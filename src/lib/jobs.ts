import { InputError, resolveWallets } from "./core/resolve";
import { storyCards } from "./engine/stats";
import { QuotaError } from "./infra/http";
import { flushUsage } from "./infra/usage";
import { LimitError, takeLookup } from "./limits";
import { rankActivity } from "./percentile";
import { runWrapped, type Timeframe } from "./pipeline";
import { makeRoast } from "./roast";
import { findRecent, getJob, lookupKey, newId, putJob, rememberKey, type Job } from "./store";

export { InputError, LimitError };

/**
 * Validate input, reuse a recent identical lookup (free), or — if this IP and the day still
 * have budget — create a queued job. The caller runs it with after().
 */
export async function startJob(rawInput: string | string[], timeframe: Timeframe, ip: string): Promise<{ job: Job; reused: boolean }> {
  const resolved = await resolveWallets(rawInput);
  const wallets = resolved.map((w) => w.address);
  const key = lookupKey(wallets, timeframe);
  const recent = await findRecent(key);
  if (recent) return { job: recent, reused: true };

  await takeLookup(ip);
  const job: Job = {
    id: newId(),
    status: "queued",
    inputs: resolved.map((w) => w.input),
    wallets,
    names: Object.fromEntries(resolved.filter((w) => w.name).map((w) => [w.address, w.name!])),
    timeframe,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    progress: { stage: "fetching", message: "In the queue", fetched: 0 },
  };
  await putJob(job);
  await rememberKey(key, job.id);
  return { job, reused: false };
}

export async function runJob(id: string) {
  const job = await getJob(id);
  if (!job || job.status !== "queued") return;
  job.status = "running";
  await putJob(job);

  // Progress writes cost a store command each; every ~3s is plenty for the loading screen.
  let lastWrite = 0;
  try {
    const { stats } = await runWrapped({
      addresses: job.wallets,
      timeframe: job.timeframe,
      onProgress: (p) => {
        job.progress = p;
        if (Date.now() - lastWrite > 3000) {
          lastWrite = Date.now();
          void putJob({ ...job }).catch(() => {});
        }
      },
    });
    stats.meta.names = job.names;
    job.progress = { stage: "crunching", message: "Writing your roast", fetched: job.progress?.fetched ?? 0 };
    void putJob({ ...job }).catch(() => {});
    const [roast, pct] = await Promise.all([
      makeRoast(stats, job.id),
      rankActivity(job.id, stats.overview.totalTrades).catch(() => null),
    ]);
    stats.roast = roast;
    stats.percentile.activity = pct;
    stats.cards = storyCards(stats);
    job.stats = stats;
    job.status = "done";
    job.progress = { stage: "done", message: "Done", fetched: job.progress?.fetched ?? 0 };
  } catch (e) {
    job.status = "error";
    job.error =
      e instanceof QuotaError
        ? `We've hit today's free data limit. Try again in about ${e.resetHours} hours.`
        : e instanceof InputError
          ? e.message
          : "Something broke while reading this wallet. Try again in a minute.";
    console.error(`[job ${id}]`, e);
  }
  await putJob(job);
  await flushUsage();
}
