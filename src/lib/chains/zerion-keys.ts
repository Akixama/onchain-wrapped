// Several Zerion keys (ZERION_API_KEYS="key1,key2", or the single ZERION_API_KEY): use the first one
// that still has requests today; when one runs out, remember that until its reset and move on.
import { createHash } from "node:crypto";
import { kv } from "../infra/kv";
import { QuotaError, setThrottleGap } from "../infra/http";

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

// Each Zerion response says the key's daily limit, what's left today and its per-second limit
// (ratelimit-org-*). Keep those, so we know before a lookup how much is left and pace each key right.
const leftKey = (k: string) => `zerion:left:${keyTag(k)}`;
const limitKey = (k: string) => `zerion:limit:${keyTag(k)}`;
const DEFAULT_DAILY = () => Number(process.env.ZERION_DAILY_LIMIT ?? 300);

/** Pass as fetchJson's onHeaders for every Zerion request made with key `k`. */
export function zerionHeaders(k: string) {
  return (h: Headers) => {
    const perSec = Number(h.get("ratelimit-org-second-limit"));
    if (perSec > 0) setThrottleGap(`zerion:${keyTag(k)}`, Math.ceil(1000 / perSec) + 50);
    const left = h.get("ratelimit-org-day-remaining");
    const reset = Number(h.get("ratelimit-org-day-reset"));
    const limit = Number(h.get("ratelimit-org-day-limit"));
    if (left != null && reset > 0) kv().set(leftKey(k), left, Math.ceil(reset)).catch(() => {});
    // Requests left again (plan upgraded, or the day reset early): stop skipping this key.
    if (Number(left) > 0) kv().set(spentKey(k), "0", 60).catch(() => {});
    if (limit > 0) kv().set(limitKey(k), String(limit), 30 * 86400).catch(() => {});
  };
}

/** Requests left today across keys, from Zerion's own last-reported numbers. */
export async function zerionRequestsLeft(): Promise<number> {
  let left = 0;
  for (const k of zerionKeys()) {
    const until = Number(await kv().get(spentKey(k)).catch(() => null));
    if (until && until > Date.now()) continue;
    const reported = await kv().get(leftKey(k)).catch(() => null);
    // Nothing reported since the last reset: the whole daily limit is there.
    left += reported != null ? Number(reported) : Number((await kv().get(limitKey(k)).catch(() => null)) ?? DEFAULT_DAILY());
  }
  return left;
}
