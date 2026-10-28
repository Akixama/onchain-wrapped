// Extra story stats: profit over time, speed, and narratives. Pure functions of the PnL positions.
import type { ChainId, UnifiedEvent } from "../core/types";
import type { Position } from "./pnl";
import { isMoney } from "../core/assets";

const DAY = 86400;
const r2 = (n: number) => Math.round(n * 100) / 100;

// ---------- Profit over time ----------
export interface ProfitTimeline {
  /** [day start (UTC, seconds), running realized profit at the end of that day] — days with sells only. */
  points: [number, number][];
  bestDay: { ts: number; usd: number } | null;
  worstDay: { ts: number; usd: number } | null;
  /** Still held, at today's prices: added to the line's end to reach the total. */
  openUsd: number;
}

export function profitTimeline(traded: Position[], fromTs: number): ProfitTimeline {
  const byDay = new Map<number, number>();
  for (const p of traded) for (const s of p.sells) {
    const d = Math.floor(s.ts / DAY) * DAY;
    byDay.set(d, (byDay.get(d) ?? 0) + (s.realized ?? 0));
  }
  const days = [...byDay.entries()].sort((a, b) => a[0] - b[0]);
  let run = 0;
  // Start where trading started (a day before the first buy), not at the edge of the period.
  const firstBuy = Math.min(...traded.flatMap((p) => p.buys.map((b) => b.ts)), days[0]?.[0] ?? fromTs);
  const start = Math.max(Math.floor(fromTs / DAY) * DAY, Math.floor(firstBuy / DAY) * DAY - DAY);
  const points: [number, number][] = [[start, 0]];
  for (const [d, v] of days) { run += v; points.push([d, r2(run)]); }
  const best = days.reduce<[number, number] | null>((m, x) => (x[1] > 0 && (!m || x[1] > m[1]) ? x : m), null);
  const worst = days.reduce<[number, number] | null>((m, x) => (x[1] < 0 && (!m || x[1] < m[1]) ? x : m), null);
  return {
    points,
    bestDay: best ? { ts: best[0], usd: r2(best[1]) } : null,
    worstDay: worst ? { ts: worst[0], usd: r2(worst[1]) } : null,
    openUsd: r2(traded.reduce((s, p) => s + p.unrealized, 0)),
  };
}

// ---------- Speed ----------
export interface SpeedStats {
  /** Quickest full round: first buy to last sell, all sold. */
  fastestFlip: { symbol: string; chain: ChainId; address: string; icon?: string; seconds: number; pnlUsd: number } | null;
  /** Typical time from first buy to selling out (median, closed positions). */
  medianHoldSec: number | null;
  /** Share of closed positions sold out within a minute / an hour. */
  underMinutePct: number;
  underHourPct: number;
  tradesPerActiveDay: number;
  busiestDay: { ts: number; trades: number } | null;
  closedCount: number;
}

export function speedStats(traded: Position[], trades: UnifiedEvent[]): SpeedStats {
  const closed = traded
    .filter((p) => p.buys.length && p.sells.length && p.holding === 0 && p.costIn >= 1)
    .map((p) => ({ p, secs: Math.max(0, p.sells[p.sells.length - 1].ts - p.buys[0].ts) }))
    // Bought and sold in the same transaction (or second) is a swap route passing through the token, not a flip.
    .filter((c) => c.secs >= 1 && c.p.buys[0].sig !== c.p.sells[c.p.sells.length - 1].sig);
  const holds = closed.map((c) => c.secs).sort((a, b) => a - b);
  const fast = [...closed].sort((a, b) => a.secs - b.secs || b.p.costIn - a.p.costIn)[0];
  const perDay = new Map<number, number>();
  for (const t of trades) { const d = Math.floor(t.timestamp / DAY) * DAY; perDay.set(d, (perDay.get(d) ?? 0) + 1); }
  const busiest = [...perDay.entries()].sort((a, b) => b[1] - a[1])[0];
  const pct = (n: number) => (holds.length ? Math.round((holds.filter((h) => h <= n).length / holds.length) * 100) : 0);
  return {
    fastestFlip: fast ? { symbol: fast.p.token.symbol, chain: fast.p.chain, address: fast.p.token.address, icon: fast.p.token.icon, seconds: fast.secs, pnlUsd: r2(fast.p.pnl) } : null,
    medianHoldSec: holds.length ? holds[Math.floor(holds.length / 2)] : null,
    underMinutePct: pct(60),
    underHourPct: pct(3600),
    tradesPerActiveDay: perDay.size ? Math.round((trades.length / perDay.size) * 10) / 10 : 0,
    busiestDay: busiest ? { ts: busiest[0], trades: busiest[1] } : null,
    closedCount: holds.length,
  };
}

// ---------- Narratives (by token name) ----------
export type NarrativeId = "dogs" | "cats" | "frogs" | "ai" | "politics" | "celebs" | "animals" | "food" | "anime" | "internet" | "other";
export const NARRATIVE_LABEL: Record<NarrativeId, string> = {
  dogs: "Dog coins", cats: "Cat coins", frogs: "Frog coins", ai: "AI & agents", politics: "Politics", celebs: "Celebrities",
  animals: "Zoo coins", food: "Food coins", anime: "Anime & games", internet: "Internet culture", other: "Everything else",
};
export const NARRATIVE_EMOJI: Record<NarrativeId, string> = {
  dogs: "🐕", cats: "🐈", frogs: "🐸", ai: "🤖", politics: "🏛️", celebs: "⭐", animals: "🦍", food: "🍕", anime: "🎮", internet: "🌐", other: "🎲",
};
// Order matters: the first match wins (e.g. "dogwifhat" is a dog coin, not a hat).
const RULES: [NarrativeId, RegExp][] = [
  ["ai", /\b(ai|a\.i|agi|agents?|gpt|llm|neural|robots?|bots?|sentient|aixbt|virtual|claude|grok|openai|deepseek)\b/i],
  ["politics", /\b(trump|maga|biden|kamala|harris|obama|melania|barron|vance|rfk|kennedy|president|election|senate|congress|potus|usa|america|patriot)\b/i],
  ["celebs", /\b(elon|musk|kanye|drake|taylor|swift|kardashian|mrbeast|beast|snoop|tate|diddy|ronaldo|messi|cr7|jenner|bieber|rihanna|logan|paul|ishowspeed|speed|kai|cenat)\b/i],
  ["dogs", /(dog|doge|inu|shib|puppy|pup\b|wif\b|bonk|corgi|shiba|woof|bork|floki|husky|pitbull|chihuahua|poodle|labrador)/i],
  ["cats", /(cat\b|cats\b|kitty|kitten|meow|\bmew\b|popcat|neko|nyan|purr|tabby)/i],
  ["frogs", /(frog|pepe|toad|ribbit|kek\b|froggy)/i],
  ["animals", /\b(ape|apes|monkey|chimp|gorilla|bear|bull|penguin|pengu|hamster|fish|shark|whale|goat|pig|hippo|moo\w*|deng|cow|horse|duck|chicken|bird|owl|fox|wolf|lion|tiger|panda|rabbit|bunny|bunni|mouse|rat|snake|turtle|crab|otter|sloth|capybara|squirrel|beaver|raccoon)\b/i],
  ["food", /\b(pizza|burger|sushi|banana|apple|kimchi|taco|ramen|noodle|cheese|bread|rice|bean|beans|coffee|tea|milk|cookie|cake|donut|fries|chips|egg|bacon|steak|soup|corn|potato|tomato|mango|peach|cherry|candy|chocolate|honey|juice)\b/i],
  ["anime", /\b(anime|chan|kun|san|waifu|senpai|kawaii|manga|naruto|goku|pikachu|pokemon|game|gamer|gaming|pixel|arcade|mario|sonic|zelda)\b/i],
  ["internet", /\b(meme|chad|wojak|gigachad|based|gm|gn|wagmi|ngmi|moon|lambo|degen|ape\s?in|rug|sigma|rizz|skibidi|brainrot|npc|lol|lmao|bruh|cope|seethe|fren|ser|anon|hodl|pump|sendit|send|vibe|vibes|fart|butt|poop|shit|cum)\b/i],
];

export function narrativeOf(symbol: string, name?: string): NarrativeId {
  const text = `${symbol} ${name ?? ""}`;
  for (const [id, re] of RULES) if (re.test(text)) return id;
  return "other";
}

export interface NarrativeStats {
  /** Up to 5, most traded first ("other" only if nothing else matched). */
  top: { id: NarrativeId; trades: number; tokens: number; pnlUsd: number }[];
  /** Share of traded tokens we could place in a narrative (0..1). */
  coverage: number;
}

export function narrativeStats(traded: Position[]): NarrativeStats {
  const agg = new Map<NarrativeId, { trades: number; tokens: number; pnlUsd: number }>();
  for (const p of traded) {
    if (!p.buys.length && !p.sells.length) continue;
    const id = narrativeOf(p.token.symbol, p.token.name);
    const a = agg.get(id) ?? { trades: 0, tokens: 0, pnlUsd: 0 };
    a.trades += p.buys.length + p.sells.length;
    a.tokens++;
    a.pnlUsd += p.pnl;
    agg.set(id, a);
  }
  const total = [...agg.values()].reduce((s, a) => s + a.tokens, 0);
  const named = [...agg.entries()].filter(([id]) => id !== "other").sort((a, b) => b[1].trades - a[1].trades);
  const list = (named.length ? named : [...agg.entries()]).slice(0, 5);
  return {
    top: list.map(([id, a]) => ({ id, trades: a.trades, tokens: a.tokens, pnlUsd: r2(a.pnlUsd) })),
    coverage: total ? Math.round((1 - (agg.get("other")?.tokens ?? 0) / total) * 100) / 100 : 0,
  };
}

// ---------- Trading app fees ----------
export interface AppFeeStats {
  totalUsd: number;
  /** Swaps that paid an app fee. */
  trades: number;
  /** Most paid first. */
  byApp: { app: string; usd: number; trades: number }[];
  /** Fees as a share of those trades' size (0.01 = 1%). */
  avgRate: number;
  /** Share of Solana swaps we could check for fees (0..1). Lookups from a source without transfer detail are lower. */
  coverage: number;
}

export function appFeeStats(trades: UnifiedEvent[]): AppFeeStats {
  const sol = trades.filter((t) => t.chain === "solana");
  const seen = new Set<string>();
  const by = new Map<string, { usd: number; trades: number }>();
  let total = 0, n = 0, size = 0;
  for (const t of sol) {
    if (!t.appFee?.usd || seen.has(t.txHash)) continue;
    seen.add(t.txHash);
    const a = by.get(t.appFee.app) ?? { usd: 0, trades: 0 };
    a.usd += t.appFee.usd;
    a.trades++;
    by.set(t.appFee.app, a);
    total += t.appFee.usd;
    n++;
    const money = (legs: typeof t.in) => legs.filter((l) => isMoney(l.token)).reduce((s, l) => s + (l.usd ?? 0), 0);
    size += Math.max(money(t.in), money(t.out));
  }
  return {
    totalUsd: r2(total),
    trades: n,
    avgRate: size ? Math.round((total / size) * 10000) / 10000 : 0,
    byApp: [...by].sort((a, b) => b[1].usd - a[1].usd).map(([app, a]) => ({ app, usd: r2(a.usd), trades: a.trades })),
    coverage: sol.length ? Math.round((sol.filter((t) => t.feeScan).length / sol.length) * 100) / 100 : 0,
  };
}

// ---------- Bags still held ----------
export interface BagStats {
  /** Coins they bought (at least $1 of it still held) and still hold. */
  count: number;
  /** What those coins are worth now. Coins nobody can sell (no price / tiny pool) count as $0. */
  valueUsd: number;
  /** What they paid for the part still held. */
  costUsd: number;
  /** Bags worth under 5% of what they paid, or with no price / no pool left. */
  dead: number;
  deadCostUsd: number;
  /** Biggest live bags by value now. */
  top: { symbol: string; chain: ChainId; address: string; icon?: string; valueUsd: number; costUsd: number }[];
}

const MIN_POOL_USD = 1000;

/** Only meaningful when holdings were checked against the real wallet balance (see pipeline). */
export function bagStats(positions: Position[]): BagStats {
  const bags = positions
    .filter((p) => p.buys.length && p.holdingKnown > 0 && p.openCost >= 1)
    .map((p) => {
      const sellable = p.currentPrice > 0 && (p.liquidityUsd === undefined || p.liquidityUsd >= MIN_POOL_USD);
      // Can't sell more than the whole pool is worth, whatever the price says.
      const value = sellable ? Math.min(p.holdingKnown * p.currentPrice, p.liquidityUsd ?? Infinity) : 0;
      return { p, value, cost: p.openCost, dead: value < p.openCost * 0.05 };
    });
  const live = bags.filter((b) => !b.dead).sort((a, b) => b.value - a.value);
  const dead = bags.filter((b) => b.dead);
  return {
    count: bags.length,
    valueUsd: r2(bags.reduce((s, b) => s + b.value, 0)),
    costUsd: r2(bags.reduce((s, b) => s + b.cost, 0)),
    dead: dead.length,
    deadCostUsd: r2(dead.reduce((s, b) => s + b.cost, 0)),
    top: live.slice(0, 3).map(({ p, value, cost }) => ({
      symbol: p.token.symbol, chain: p.chain, address: p.token.address, icon: p.token.icon, valueUsd: r2(value), costUsd: r2(cost),
    })),
  };
}
