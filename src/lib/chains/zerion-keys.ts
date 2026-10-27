// Several Zerion keys (ZERION_API_KEYS="key1,key2", or the single ZERION_API_KEY): use the first one
// that still has requests today; when one runs out, remember that until its reset and move on.
import { createHash } from "node:crypto";
import { kv } from "../infra/kv";
import { QuotaError } from "../infra/http";

export const zerionKeys = () =>
  (process.env.ZERION_API_KEYS || process.env.ZERION_API_KEY || "").split(/[\s,]+/).filter(Boolean);

const tag = (k: string) => createHash("sha256").update(k).digest("hex").slice(0, 12); // never store the key itself
const spentKey = (k: string) => `zerion:spent:${tag(k)}`;

/** The first key that isn't out of requests, or throws QuotaError with the soonest reset. */
export async function liveZerionKey(skip: Set<string> = new Set()): Promise<string> {
  const keys = zerionKeys().filter((k) => !skip.has(k));
  let soonest = Infinity;
  for (const k of keys) {
    const until = Number(await kv().get(spentKey(k)).catch(() => null));
    if (!until || until <= Date.now()) return k;
    soonest = Math.min(soonest, until);
  }
  throw new QuotaError("zerion", Number.isFinite(soonest) ? Math.max(1, Math.ceil((soonest - Date.now()) / 3_600_000)) : 24);
}

/** This key hit its daily limit: skip it until it resets. */
export async function markZerionKeySpent(k: string, resetHours: number) {
  const ms = Math.max(10 * 60_000, resetHours * 3_600_000);
  await kv().set(spentKey(k), String(Date.now() + ms), Math.ceil(ms / 1000)).catch(() => {});
}

export const zerionAuth = (k: string) => "Basic " + Buffer.from(`${k}:`).toString("base64");
