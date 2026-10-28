// Several Zerion keys (ZERION_API_KEYS="key1,key2", or the single ZERION_API_KEY): use the first one
// that still has requests today; when one runs out, remember that until its reset and move on.
import { createHash } from "node:crypto";
import { kv } from "../infra/kv";
import { QuotaError } from "../infra/http";

export const zerionKeys = () =>
  (process.env.ZERION_API_KEYS || process.env.ZERION_API_KEY || "").split(/[\s,]+/).filter(Boolean);

export const keyTag = (k: string) => createHash("sha256").update(k).digest("hex").slice(0, 12); // never store the key itself
const spentKey = (k: string) => `zerion:spent:${keyTag(k)}`;

/**
 * A key that isn't out of requests (starting from key number `prefer`, so parallel readers spread
 * across keys), or throws QuotaError with the soonest reset.
 */
export async function liveZerionKey(skip: Set<string> = new Set(), prefer = 0): Promise<string> {
  const all = zerionKeys();
  const start = all.length ? prefer % all.length : 0;
  const keys = [...all.slice(start), ...all.slice(0, start)].filter((k) => !skip.has(k));
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

// Our own count of requests per key per UTC day, so we can tell before a lookup how much is left.
const DAILY = () => Number(process.env.ZERION_DAILY_LIMIT ?? 300);
const usedKey = () => `zerion:used:${new Date().toISOString().slice(0, 10)}`;

/** Count one request on this key (fire and forget). */
export function noteZerionUse(k: string) {
  kv().hincrby(usedKey(), keyTag(k), 1, 2 * 86400).catch(() => {});
}

/** Requests left today across keys that aren't marked spent (our count; Zerion's own may differ a bit). */
export async function zerionRequestsLeft(): Promise<number> {
  const used = await kv().hgetall(usedKey()).catch(() => ({} as Record<string, string>));
  let left = 0;
  for (const k of zerionKeys()) {
    const until = Number(await kv().get(spentKey(k)).catch(() => null));
    if (until && until > Date.now()) continue;
    left += Math.max(0, DAILY() - Number(used[keyTag(k)] ?? 0));
  }
  return left;
}
