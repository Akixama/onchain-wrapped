import type { UnifiedEvent } from "./types";
import { tokenKey } from "./types";
import { majorOf } from "./assets";

const SPAM_TEXT = /https?:|www\.|\.(com|io|org|net|xyz|app|gift|site|top|lat|vip)\b|t\.me|claim|reward|visit|voucher|airdrop|giveaway|\bfree\b/i;

/**
 * Drop unsolicited junk: tokens that arrived with no payment, were never traded, and are
 * worthless or look like phishing. Returns how many legs were removed (shown as a fun stat).
 */
export function filterSpam(events: UnifiedEvent[], current: (key: string) => number | undefined): number {
  const traded = new Set<string>();
  for (const e of events)
    if (e.type === "swap" || e.type === "mint") for (const l of [...e.in, ...e.out]) traded.add(tokenKey(l.token));

  let removed = 0;
  for (const e of events) {
    if (e.spam) { removed += e.in.length; e.in = []; continue; }
    if (e.out.length) continue; // they paid for it -> not spam
    e.in = e.in.filter((l) => {
      if (majorOf(l.token)) return l.usd === null || l.usd >= 0.01; // dust SOL/ETH pokes
      const k = tokenKey(l.token);
      const looksSpammy = SPAM_TEXT.test(`${l.token.symbol} ${l.token.name ?? ""}`);
      const worthless = (l.usd ?? 0) < 1 && !(current(k) && current(k)! * l.amount >= 1);
      const keep = !looksSpammy && (traded.has(k) || !worthless);
      if (!keep) removed++;
      return keep;
    });
  }
  return removed;
}
