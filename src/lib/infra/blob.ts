// Large JSON values in the KV store: gzip + base64, split into pieces small enough for one request each.
import { gunzipSync, gzipSync } from "node:zlib";
import { kv } from "./kv";

const CHUNK = 500_000;

export async function saveBlob(key: string, data: unknown, ttlSec: number): Promise<number> {
  const packed = gzipSync(Buffer.from(JSON.stringify(data))).toString("base64");
  const parts = Math.max(1, Math.ceil(packed.length / CHUNK));
  for (let i = 0; i < parts; i++) await kv().set(`${key}:${i}`, packed.slice(i * CHUNK, (i + 1) * CHUNK), ttlSec);
  await kv().set(`${key}:n`, String(parts), ttlSec); // written last: a half-saved value is never read
  return packed.length;
}

export async function loadBlob<T>(key: string): Promise<T | null> {
  const n = Number(await kv().get(`${key}:n`));
  if (!n) return null;
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const p = await kv().get(`${key}:${i}`);
    if (p == null) return null;
    parts.push(p);
  }
  return JSON.parse(gunzipSync(Buffer.from(parts.join(""), "base64")).toString()) as T;
}

export async function clearBlob(key: string) {
  await kv().set(`${key}:n`, "0", 60); // the pieces expire on their own
}
