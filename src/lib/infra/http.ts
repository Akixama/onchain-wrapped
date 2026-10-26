import { logUsage } from "./usage";

// Per-provider throttle: minimum gap between requests so we stay under free-tier RPS.
const MIN_GAP_MS: Record<string, number> = {
  helius: 550, // free plan: 2 req/s on enhanced APIs
  zerion: 1050, // demo keys: 1 req/s + 300/day (headers: ratelimit-org-*). Developer plan: 3 req/s
  "solana-rpc": 300, // public RPC: ~40 req/10s per method
  defillama: 120,
  dexscreener: 220, // 300 req/min
  geckoterminal: 2100, // ~30 req/min
};

const lastCall: Record<string, number> = {};
const queues: Record<string, Promise<void>> = {};

async function throttle(provider: string) {
  const gap = MIN_GAP_MS[provider] ?? 100;
  const prev = queues[provider] ?? Promise.resolve();
  let release!: () => void;
  queues[provider] = new Promise<void>((r) => (release = r));
  await prev;
  const wait = (lastCall[provider] ?? 0) + gap - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall[provider] = Date.now();
  release();
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class HttpError extends Error {
  constructor(public status: number, public url: string, public body: string) {
    super(`HTTP ${status} for ${url.replace(/api-key=[^&]+/, "api-key=***")}: ${body.slice(0, 200)}`);
  }
}

/** A provider's daily quota is used up. The UI shows "come back in N hours" instead of a crash. */
export class QuotaError extends Error {
  constructor(public provider: string, public resetHours: number) {
    super(`${provider} daily request limit reached (resets in ~${resetHours}h)`);
  }
}

export async function fetchJson<T>(
  provider: string,
  url: string,
  init: RequestInit & { endpoint?: string } = {},
  retries = 4,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    await throttle(provider);
    const t0 = Date.now();
    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
    } catch (e) {
      if (attempt >= retries) throw e;
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    logUsage({ provider, endpoint: init.endpoint ?? new URL(url).pathname, status: res.status, ms: Date.now() - t0 });
    if (res.ok) return (await res.json()) as T;
    const body = await res.text();
    // Daily quota gone (Zerion sends ratelimit-org-day-remaining): retrying won't help, fail fast.
    if (res.status === 429 && res.headers.get("ratelimit-org-day-remaining") === "0") {
      const resetH = Math.ceil(Number(res.headers.get("ratelimit-org-day-reset") ?? 0) / 3600);
      throw new QuotaError(provider, resetH);
    }
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const retryAfter = Number(res.headers.get("retry-after")) * 1000;
      await sleep(retryAfter || 1500 * 2 ** attempt);
      continue;
    }
    throw new HttpError(res.status, url, body);
  }
}
