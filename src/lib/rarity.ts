// Achievement rarity: how many processed wallets earned each badge. Each wallet (or wallet group) counts
// once, the first time a lookup of it finishes; rarity % = wallets with it / wallets counted.
import { createHash } from "node:crypto";
import { kv } from "./infra/kv";
import { RARITY_MIN_WALLETS } from "./achievements-catalog";

const TOTAL = "ach:total", COUNTS = "ach:counts";
const KEEP = 10 * 365 * 86400;

export async function recordAchievements(wallets: string[], ids: string[]): Promise<void> {
  const who = createHash("sha1").update([...wallets].sort().join(",")).digest("hex").slice(0, 20);
  if ((await kv().incr(`ach:seen:${who}`, KEEP)) !== 1) return; // already counted
  await kv().incr(TOTAL, KEEP);
  await Promise.all(ids.map((id) => kv().hincrby(COUNTS, id, 1, KEEP)));
}

export interface Rarity { total: number; pct: Record<string, number> | null }

/** Percentages only once enough wallets are counted; before that `pct` is null (show tiers). */
export async function getRarity(): Promise<Rarity> {
  const [t, counts] = await Promise.all([kv().get(TOTAL), kv().hgetall(COUNTS)]);
  const total = Number(t ?? 0);
  if (total < Number(process.env.RARITY_MIN_WALLETS ?? RARITY_MIN_WALLETS)) return { total, pct: null };
  return { total, pct: Object.fromEntries(Object.entries(counts).map(([id, n]) => [id, Math.round((Number(n) / total) * 1000) / 10])) };
}
