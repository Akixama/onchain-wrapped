// Several Helius keys (HELIUS_API_KEYS="key1,key2,key3", or the single HELIUS_API_KEY): use the first one
// that still has credits; when Helius answers "max usage reached", remember that and move to the next.
// Request URLs carry the key (?api-key=...), so the shared fetch swaps it in place and retries.
import { createHash } from "node:crypto";
import { kv } from "../infra/kv";

export const heliusKeys = () =>
  (process.env.HELIUS_API_KEYS || process.env.HELIUS_API_KEY || "").split(/[\s,]+/).filter(Boolean);

const tag = (k: string) => createHash("sha256").update(k).digest("hex").slice(0, 12); // never store the key itself
const spentKey = (k: string) => `helius:spent:${tag(k)}`;
// Helius credits renew monthly on each account's own date: look again after a few hours rather than guess it.
const RECHECK_MS = Number(process.env.HELIUS_SPENT_RECHECK_H ?? 6) * 3_600_000;

const spentUntil = new Map<string, number>(); // this instance's view, filled from KV by loadHeliusKeys()

/** The key to use right now (sync, for building URLs). Empty when none are configured. */
export function heliusKey(): string {
  const keys = heliusKeys();
  return keys.find((k) => (spentUntil.get(k) ?? 0) <= Date.now()) ?? keys[0] ?? "";
}

/** Read which keys are used up (shared across server instances). Call once at the start of a lookup. */
export async function loadHeliusKeys(): Promise<void> {
  await Promise.all(heliusKeys().map(async (k) => {
    const until = Number(await kv().get(spentKey(k)).catch(() => null));
    if (until > Date.now()) spentUntil.set(k, until); else spentUntil.delete(k);
  }));
}

/** This key is out of credits. Returns the next live key, or null when every key is used up. */
export async function heliusKeySpent(k: string): Promise<string | null> {
  const until = Date.now() + RECHECK_MS;
  spentUntil.set(k, until);
  await kv().set(spentKey(k), String(until), Math.ceil(RECHECK_MS / 1000)).catch(() => {});
  const next = heliusKey();
  return next && (spentUntil.get(next) ?? 0) <= Date.now() ? next : null;
}

/** Put the current key into a Helius URL (SOLANA_RPC_URL may hold a key that has since run out). */
export function withHeliusKey(url: string): string {
  const k = heliusKey();
  return k && /helius-rpc\.com/.test(url) ? url.replace(/api-key=[^&]+/, `api-key=${k}`) : url;
}
