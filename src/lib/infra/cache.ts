// Tiny file cache for raw provider results, so re-running the same wallet doesn't spend API quota.
// Phase 4 replaces this with KV/Redis (same get/set shape) for Vercel/Cloudflare.
import { createHash } from "node:crypto";

const TTL_H = () => Number(process.env.CACHE_TTL_HOURS ?? 12);
const DIR = () => process.env.CACHE_DIR ?? ".cache";

const file = async (key: string) => {
  const { join } = await import("node:path");
  return join(DIR(), createHash("sha1").update(key).digest("hex") + ".json");
};

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (process.env.CACHE_DISABLED) return null;
  try {
    const fs = await import("node:fs/promises");
    const raw = JSON.parse(await fs.readFile(await file(key), "utf8"));
    if (Date.now() - raw.t > TTL_H() * 3600_000) return null;
    return raw.v as T;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, v: unknown) {
  if (process.env.CACHE_DISABLED) return;
  try {
    const fs = await import("node:fs/promises");
    await fs.mkdir(DIR(), { recursive: true });
    await fs.writeFile(await file(key), JSON.stringify({ t: Date.now(), v }));
  } catch {
    /* read-only disk (serverless): just skip */
  }
}
