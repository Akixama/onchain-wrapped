// Results + job store on top of the KV layer (Upstash Redis in production, local files in dev).
import { createHash, randomBytes } from "node:crypto";
import type { WrappedStats } from "./engine/stats";
import type { Progress, Timeframe } from "./pipeline";
import type { DateRange } from "./core/types";
import { kv } from "./infra/kv";
import { clearBlob, loadBlob, saveBlob } from "./infra/blob";

export interface Job {
  id: string;
  status: "queued" | "running" | "done" | "error";
  inputs: string[];
  wallets: string[];
  names: Record<string, string>;
  timeframe: Timeframe;
  /** Set when timeframe is "custom". */
  range?: DateRange;
  createdAt: number;
  updatedAt: number;
  progress?: Progress;
  stats?: WrappedStats;
  error?: string;
  demo?: boolean;
  /** Big histories are read in parts (one serverless run each); this is the part in progress. */
  segment?: number;
  /** Restarts by the watchdog since a part last finished normally. */
  recoveries?: number;
  /** Set when a part hands off to the next; cleared when the next part starts. */
  handoffAt?: number;
}

/** What we send to browsers: no raw inputs or wallet list beyond what the stats already show. */
export type PublicJob = Omit<Job, "inputs" | "wallets">;
export function publicJob(job: Job): PublicJob {
  const { inputs, wallets, ...pub } = job;
  void inputs; void wallets;
  return pub;
}

const DAY = 86400;
const keepDays = () => Number(process.env.RESULT_KEEP_DAYS ?? 90);

export const newId = () =>
  [...randomBytes(8)].map((b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");

export const isValidId = (id: string) => /^[a-z0-9-]{3,40}$/.test(id);

export async function getJob(id: string): Promise<Job | null> {
  if (!isValidId(id)) return null;
  const raw = await kv().get(`job:${id}`);
  return raw ? (JSON.parse(raw) as Job) : null;
}

export async function putJob(job: Job) {
  job.updatedAt = Date.now();
  // Demo results never expire; finished results live RESULT_KEEP_DAYS; unfinished jobs a day.
  const ttl = job.demo ? undefined : job.status === "done" ? keepDays() * DAY : DAY;
  await kv().set(`job:${job.id}`, JSON.stringify(job), ttl);
}

// ---------- Saved progress between parts of a big lookup (kept for a day) ----------
export const saveCheckpoint = (id: string, data: unknown) => saveBlob(`ckpt:${id}`, data, DAY);
export const loadCheckpoint = <T>(id: string) => loadBlob<T>(`ckpt:${id}`);
export const clearCheckpoint = (id: string) => clearBlob(`ckpt:${id}`);

/** Same wallets + timeframe -> same result for RESULT_TTL_HOURS (never recompute twice). */
export const lookupKey = (wallets: string[], timeframe: Timeframe, range?: DateRange) =>
  createHash("sha1").update(`${timeframe}${range ? `:${range.from}-${range.to}` : ""}|${[...wallets].sort().join(",")}`).digest("hex");

export async function findRecent(key: string): Promise<Job | null> {
  const id = await kv().get(`idx:${key}`);
  if (!id) return null;
  const job = await getJob(id);
  if (!job || job.status === "error") return null;
  // Made under the old per-wallet cap (newest 2,000 txs only): read the whole history again.
  if (job.stats?.meta.truncated && job.stats.meta.txCap > 0 && !process.env.MAX_TXS_PER_ADDRESS) return null;
  return job;
}

export async function rememberKey(key: string, id: string, ttlSec = Number(process.env.RESULT_TTL_HOURS ?? 24) * 3600) {
  await kv().set(`idx:${key}`, id, ttlSec);
}
