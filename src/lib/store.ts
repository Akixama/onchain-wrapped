// Results + job store on top of the KV layer (Upstash Redis in production, local files in dev).
import { createHash, randomBytes } from "node:crypto";
import type { WrappedStats } from "./engine/stats";
import type { Progress, Timeframe } from "./pipeline";
import { kv } from "./infra/kv";

export interface Job {
  id: string;
  status: "queued" | "running" | "done" | "error";
  inputs: string[];
  wallets: string[];
  names: Record<string, string>;
  timeframe: Timeframe;
  createdAt: number;
  updatedAt: number;
  progress?: Progress;
  stats?: WrappedStats;
  error?: string;
  demo?: boolean;
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

/** Same wallets + timeframe -> same result for RESULT_TTL_HOURS (never recompute twice). */
export const lookupKey = (wallets: string[], timeframe: Timeframe) =>
  createHash("sha1").update(`${timeframe}|${[...wallets].sort().join(",")}`).digest("hex");

export async function findRecent(key: string): Promise<Job | null> {
  const id = await kv().get(`idx:${key}`);
  if (!id) return null;
  const job = await getJob(id);
  return job && job.status !== "error" ? job : null;
}

export async function rememberKey(key: string, id: string, ttlSec = Number(process.env.RESULT_TTL_HOURS ?? 24) * 3600) {
  await kv().set(`idx:${key}`, id, ttlSec);
}
