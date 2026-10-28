import type { DateRange } from "./core/types";
import { InputError, resolveWallets } from "./core/resolve";
import { storyCards } from "./engine/stats";
import { QuotaError } from "./infra/http";
import { flushUsage } from "./infra/usage";
import { LimitError, takeLookup } from "./limits";
import { rankActivity } from "./percentile";
import { runWrapped, type FetchSlots, type Timeframe } from "./pipeline";
import { makeRoast } from "./roast";
import { clearCheckpoint, findRecent, getJob, loadCheckpoint, lookupKey, newId, putJob, rememberKey, saveCheckpoint, type Job } from "./store";
import { kv } from "./infra/kv";
import { liveZerionKey } from "./chains/zerion-keys";
import { siteUrl } from "./site";
import { createHash } from "node:crypto";

export { InputError, LimitError };

/**
 * Validate input, reuse a recent identical lookup (free), or — if this IP and the day still
 * have budget — create a queued job. The caller runs it with after().
 */
export async function startJob(rawInput: string | string[], timeframe: Timeframe, ip: string, range?: DateRange): Promise<{ job: Job; reused: boolean }> {
  const resolved = await resolveWallets(rawInput);
  const wallets = resolved.map((w) => w.address);
  const key = lookupKey(wallets, timeframe, range);
  const recent = await findRecent(key);
  // A result cut short by the daily data limit is re-run once a key has requests again: the new
  // lookup carries on from where that one stopped.
  const canContinue = recent?.stats?.meta.quotaCut && (await liveZerionKey().then(() => true, () => false));
  if (recent && !canContinue) return { job: recent, reused: true };

  await takeLookup(ip);
  const job: Job = {
    id: newId(),
    status: "queued",
    inputs: resolved.map((w) => w.input),
    wallets,
    names: Object.fromEntries(resolved.filter((w) => w.name).map((w) => [w.address, w.name!])),
    timeframe,
    ...(range ? { range } : {}),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    progress: { stage: "fetching", message: "In the queue", fetched: 0 },
  };
  await putJob(job);
  await rememberKey(key, job.id);
  return { job, reused: false };
}

// A serverless run is cut off at 300s (Vercel Hobby). Read for this long, leaving room to save,
// or to analyse when reading finishes in time; then save progress and start the next part.
const PART_MS = () => Number(process.env.JOB_PART_SECONDS ?? 200) * 1000;
// A part that hasn't written progress for this long died (crash, timeout, deploy): restart it.
const STALL_MS = Number(process.env.JOB_STALL_SECONDS ?? 330) * 1000;
// A handoff not picked up within this long gets started by the next status poll. Vercel blocks a
// function calling itself more than ~5 times in a row (loop protection), so long chains rely on this:
// the loading screen's poll is a fresh request.
const HANDOFF_MS = 8_000;
// Restarts in a row without a part finishing normally, before giving up.
const MAX_RECOVERIES = 5;

/** Shared secret for the part-to-part handoff, so nobody else can poke the continue endpoint. */
export const continueKey = () =>
  createHash("sha256").update(`continue:${process.env.ADMIN_KEY ?? process.env.IP_HASH_SALT ?? "dev"}`).digest("hex");

/** Start the next part in a fresh serverless run. If this is refused or lost, the next status poll starts it. */
async function startNextPart(id: string) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const r = await fetch(`${siteUrl()}/api/wrapped/${id}/continue`, {
        method: "POST",
        headers: { "x-continue-key": continueKey() },
        signal: AbortSignal.timeout(25_000), // a cold start can take a while
      });
      if (r.ok) return;
      console.error(`[job ${id}] next part: HTTP ${r.status}`);
      if (r.status === 508) return; // loop protection: retrying won't help, the poll takes over
    } catch (e) {
      console.error(`[job ${id}] next part attempt ${attempt} failed`, e);
    }
  }
}

/**
 * Called on every status poll. Returns true if the caller should start runJob:
 * - a handoff that nobody picked up (blocked or lost): start that part now;
 * - a part that died without handing off (no progress for 5+ minutes): restart from the last save.
 */
export async function recoverIfStalled(job: Job): Promise<boolean> {
  if (job.status !== "running" && job.status !== "queued") return false;
  const quiet = Date.now() - job.updatedAt;
  const seg = job.segment ?? 0;
  const pending = job.status === "queued" || !!job.handoffAt;
  if (pending && quiet >= HANDOFF_MS && !(await kv().get(`run:${job.id}:${seg}`))) {
    // Nobody has claimed this part yet: start it (runJob's lock keeps it to one run).
    return (await kv().incr(`pickup:${job.id}:${seg}`, 3600)) === 1;
  }
  if (quiet < STALL_MS) return false;
  if ((await kv().incr(`stall:${job.id}:${seg}`, 3600)) !== 1) return false; // another poll got it
  if ((job.recoveries ?? 0) >= MAX_RECOVERIES) {
    job.status = "error";
    job.error = "This wallet keeps timing out. Try again in a bit.";
    await putJob(job);
    return false;
  }
  job.recoveries = (job.recoveries ?? 0) + 1;
  job.segment = seg + 1; // resumes from the last saved part
  job.status = "running";
  await putJob(job);
  return true;
}

export async function runJob(id: string) {
  const job = await getJob(id);
  if (!job || (job.status !== "queued" && job.status !== "running")) return;
  const seg = job.segment ?? 0;
  // Exactly one run per part, even if the handoff and the watchdog both fire.
  if ((await kv().incr(`run:${id}:${seg}`, 6 * 3600)) !== 1) return;
  const t0 = Date.now();
  job.status = "running";
  job.handoffAt = undefined; // claimed
  await putJob(job);

  // A part can be replaced (the watchdog restarted it, or the job ended): from then on this run
  // must not write anything, or it would overwrite newer progress or a finished result.
  const mine = async () => {
    const cur = await getJob(id);
    return !!cur && (cur.segment ?? 0) === seg && (cur.status === "running" || cur.status === "queued");
  };
  const save = async (j: Job) => { if (await mine()) await putJob(j); };

  // Progress writes cost a store command each; every ~3s is plenty for the loading screen.
  let lastWrite = 0;
  let lastStage = "", lastMsg = "";
  try {
    const resume = seg > 0 ? (await loadCheckpoint<FetchSlots>(id)) ?? undefined : undefined;
    const run = await runWrapped({
      addresses: job.wallets,
      timeframe: job.timeframe,
      range: job.range,
      deadline: t0 + PART_MS(),
      resume,
      onProgress: (p) => {
        // Never let the counter on the loading screen jump back to 0 at the start of a part.
        const fetched = p.stage === "fetching" ? Math.max(p.fetched, job.progress?.fetched ?? 0) : p.fetched;
        job.progress = seg > 0 && p.stage === "fetching" ? { ...p, fetched, message: `${p.message} · part ${seg + 1}` } : { ...p, fetched };
        // A new stage always shows (else "Looking up prices" can be skipped and the screen looks stuck).
        const newStage = p.stage !== lastStage || (p.stage !== "fetching" && p.message !== lastMsg);
        lastStage = p.stage; lastMsg = p.message;
        if (newStage || Date.now() - lastWrite > 3000) {
          lastWrite = Date.now();
          void save({ ...job }).catch(() => {});
        }
      },
    });
    if (run.partial) {
      // Big history: save what we have and carry on in a fresh run.
      if (!(await mine())) return;
      await saveCheckpoint(id, run.partial);
      job.segment = seg + 1;
      job.handoffAt = Date.now();
      job.recoveries = 0; // this part finished normally
      job.progress = { stage: "fetching", message: `Big history — still reading (part ${seg + 2})`, fetched: run.fetched };
      await putJob(job);
      await flushUsage();
      await startNextPart(id);
      return;
    }
    const { stats } = run;
    stats.meta.names = job.names;
    job.progress = { stage: "crunching", message: "Writing your roast", fetched: job.progress?.fetched ?? 0 };
    void save({ ...job }).catch(() => {});
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
        ? e.provider === "zerion-flooded"
          ? `This wallet is flooded with bot transactions, so it needs our backup data source, which is out of free requests for today. Try again in about ${e.resetHours} hours.`
          : `We've hit today's free data limit. Try again in about ${e.resetHours} hours.`
        : e instanceof InputError
          ? e.message
          : "Something broke while reading this wallet. Try again in a minute.";
    console.error(`[job ${id}]`, e);
  }
  if (!(await mine())) return;
  await putJob(job);
  if ((job.segment ?? 0) > 0) await clearCheckpoint(id).catch(() => {});
  await flushUsage();
}
