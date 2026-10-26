// Cost protection. Only NEW lookups count (reusing a recent result is free).
//  - per IP: LOOKUPS_PER_IP_HOUR / LOOKUPS_PER_IP_DAY
//  - everyone together: LOOKUPS_PER_DAY (sized to the data provider's daily quota)
//  - any POST at all: REQUESTS_PER_IP_MINUTE (stops scripted hammering, incl. invalid input)
import { createHash } from "node:crypto";
import { kv } from "./infra/kv";

const n = (name: string, dflt: number) => Number(process.env[name] ?? dflt);
const day = () => new Date().toISOString().slice(0, 10);
const hour = () => new Date().toISOString().slice(0, 13);

/** Client IP from the proxy headers Vercel/Cloudflare set. Hashed: we never store raw IPs. */
export function ipKey(headers: Headers): string {
  const ip =
    headers.get("x-real-ip") ??
    headers.get("cf-connecting-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "local";
  return createHash("sha256").update(`${process.env.IP_HASH_SALT ?? "wrapped"}:${ip}`).digest("hex").slice(0, 20);
}

export class LimitError extends Error {
  constructor(message: string, public retryAfterSec: number) {
    super(message);
  }
}

export async function checkRequestRate(ip: string) {
  const c = await kv().incr(`rl:req:${ip}:${new Date().toISOString().slice(0, 16)}`, 60);
  if (c > n("REQUESTS_PER_IP_MINUTE", 20)) throw new LimitError("Slow down a little — try again in a minute.", 60);
}

/** Call right before creating a new job. Throws LimitError with a friendly message. */
export async function takeLookup(ip: string) {
  // Per-IP first, so one person hitting their limit can't use up everyone's daily budget.
  const perHour = await kv().incr(`rl:ip:${ip}:${hour()}`, 3600);
  if (perHour > n("LOOKUPS_PER_IP_HOUR", 5)) throw new LimitError("You've wrapped a lot of wallets this hour. Try again later.", 3600);
  const perDay = await kv().incr(`rl:ipd:${ip}:${day()}`, 86400);
  if (perDay > n("LOOKUPS_PER_IP_DAY", 15)) throw new LimitError("That's today's limit for you. Come back tomorrow.", secondsToMidnightUtc());
  const global = await kv().incr(`rl:global:${day()}`, 2 * 86400);
  if (global > n("LOOKUPS_PER_DAY", 25)) {
    throw new LimitError("We're at today's free capacity. Peek at the famous wallets below, and come back tomorrow.", secondsToMidnightUtc());
  }
}

export async function lookupsToday(): Promise<number> {
  return Number((await kv().get(`rl:global:${day()}`)) ?? 0);
}

function secondsToMidnightUtc() {
  const now = new Date();
  return Math.ceil((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime()) / 1000);
}
