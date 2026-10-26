// "Top 6% most active of everyone who checked": every finished lookup adds its trade count to a
// sorted set; rank = share of earlier lookups with fewer trades. Hidden until the pool is big enough.
import { kv } from "./infra/kv";

const KEY = "pct:trades";

export async function rankActivity(id: string, trades: number): Promise<number | null> {
  await kv().zadd(KEY, trades, id);
  const [below, total] = await Promise.all([kv().zcount(KEY, "-inf", trades - 1), kv().zcard(KEY)]);
  if (total < Number(process.env.MIN_PERCENTILE_POOL ?? 30)) return null;
  return Math.round((below / total) * 1000) / 10; // percent of lookups this one beats
}
