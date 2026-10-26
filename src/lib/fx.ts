import { cacheLife } from "next/cache";

/** USD -> NGN for the gas card toggle. Free, no key. null = hide the toggle. */
export async function ngnRate(): Promise<number | null> {
  "use cache";
  cacheLife("hours");
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(5000) });
    const j = (await r.json()) as { rates?: Record<string, number> };
    return j.rates?.NGN ?? null;
  } catch {
    return null;
  }
}
