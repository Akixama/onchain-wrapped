// Tiny key-value layer. Upstash Redis (REST) when configured — works on Vercel/Cloudflare —
// otherwise local JSON files under .data/kv for development.
import { createHash } from "node:crypto";

export interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec?: number): Promise<void>;
  /** Atomic increment; the TTL is set when the key is first created. */
  incr(key: string, ttlSec: number): Promise<number>;
  hincrby(key: string, field: string, by: number, ttlSec: number): Promise<void>;
  hgetall(key: string): Promise<Record<string, string>>;
  zadd(key: string, score: number, member: string): Promise<void>;
  zcount(key: string, min: number | "-inf", max: number | "+inf"): Promise<number>;
  zcard(key: string): Promise<number>;
}

// Vercel's Upstash integration names them KV_REST_API_*; Upstash's own console uses UPSTASH_REDIS_REST_*.
const restUrl = () => process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const restToken = () => process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
export const usingRedis = () => !!(restUrl() && restToken());

// ---------- Upstash Redis over REST ----------
async function redis<T>(commands: (string | number)[][], timeoutMs = 8000): Promise<T[]> {
  const res = await fetch(`${restUrl()}/pipeline`, {
    method: "POST",
    headers: { authorization: `Bearer ${restToken()}`, "content-type": "application/json" },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Redis ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const out = (await res.json()) as { result?: T; error?: string }[];
  const err = out.find((r) => r.error);
  if (err) throw new Error(`Redis: ${err.error}`);
  return out.map((r) => r.result as T);
}

const redisKV: KV = {
  async get(key) {
    return (await redis<string | null>([["GET", key]], 120_000))[0]; // saved-progress pieces can be large
  },
  async set(key, value, ttl) {
    // Big values (saved progress pieces) get longer to upload.
    await redis([ttl ? ["SET", key, value, "EX", ttl] : ["SET", key, value]], value.length > 100_000 ? 60_000 : 8000);
  },
  async incr(key, ttl) {
    const [n] = await redis<number>([["INCR", key], ["EXPIRE", key, ttl, "NX"]]);
    return n;
  },
  async hincrby(key, field, by, ttl) {
    await redis([["HINCRBY", key, field, by], ["EXPIRE", key, ttl, "NX"]]);
  },
  async hgetall(key) {
    const [flat] = await redis<string[]>([["HGETALL", key]]);
    const o: Record<string, string> = {};
    for (let i = 0; i + 1 < (flat ?? []).length; i += 2) o[flat[i]] = flat[i + 1];
    return o;
  },
  async zadd(key, score, member) {
    await redis([["ZADD", key, score, member]]);
  },
  async zcount(key, min, max) {
    return (await redis<number>([["ZCOUNT", key, min, max]]))[0];
  },
  async zcard(key) {
    return (await redis<number>([["ZCARD", key]]))[0];
  },
};

// ---------- Local files (dev only; not atomic, single process is fine) ----------
type Entry = { v: unknown; exp?: number };
const DIR = () => process.env.DATA_DIR ?? ".data";

async function lpath(key: string) {
  const { join } = await import("node:path");
  return join(DIR(), "kv", createHash("sha1").update(key).digest("hex") + ".json");
}
async function lread(key: string): Promise<Entry | null> {
  const fs = await import("node:fs/promises");
  try {
    const e = JSON.parse(await fs.readFile(await lpath(key), "utf8")) as Entry;
    if (e.exp && e.exp < Date.now()) return null;
    return e;
  } catch {
    return null;
  }
}
async function lwrite(key: string, e: Entry) {
  const fs = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  const p = await lpath(key);
  await fs.mkdir(dirname(p), { recursive: true });
  await fs.writeFile(p + ".tmp", JSON.stringify(e));
  await fs.rename(p + ".tmp", p);
}
const expAt = (ttl?: number) => (ttl ? Date.now() + ttl * 1000 : undefined);

const fileKV: KV = {
  async get(key) {
    const e = await lread(key);
    return e ? (e.v as string) : null;
  },
  async set(key, value, ttl) {
    await lwrite(key, { v: value, exp: expAt(ttl) });
  },
  async incr(key, ttl) {
    const e = await lread(key);
    const n = Number(e?.v ?? 0) + 1;
    await lwrite(key, { v: n, exp: e?.exp ?? expAt(ttl) });
    return n;
  },
  async hincrby(key, field, by, ttl) {
    const e = await lread(key);
    const h = (e?.v as Record<string, number>) ?? {};
    h[field] = (h[field] ?? 0) + by;
    await lwrite(key, { v: h, exp: e?.exp ?? expAt(ttl) });
  },
  async hgetall(key) {
    const e = await lread(key);
    return Object.fromEntries(Object.entries((e?.v as Record<string, number>) ?? {}).map(([k, v]) => [k, String(v)]));
  },
  async zadd(key, score, member) {
    const e = await lread(key);
    const z = (e?.v as Record<string, number>) ?? {};
    z[member] = score;
    await lwrite(key, { v: z });
  },
  async zcount(key, min, max) {
    const z = ((await lread(key))?.v as Record<string, number>) ?? {};
    const lo = min === "-inf" ? -Infinity : min, hi = max === "+inf" ? Infinity : max;
    return Object.values(z).filter((s) => s >= lo && s <= hi).length;
  },
  async zcard(key) {
    return Object.keys(((await lread(key))?.v as Record<string, number>) ?? {}).length;
  },
};

export const kv = (): KV => (usingRedis() ? redisKV : fileKV);
