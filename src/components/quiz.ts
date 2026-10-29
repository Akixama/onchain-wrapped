// "How well do you know this wallet?" — multiple-choice questions built only from a finished Wrapped.
// Same wallet -> same quiz (seeded by the result id), so friends play exactly the same questions.
import type { WrappedStats } from "@/lib/engine/stats";
import { NARRATIVE_LABEL } from "@/lib/engine/extras";
import { num, pct, usd } from "./format";

export interface QuizQuestion {
  id: string;
  q: string;
  options: string[];
  answer: number; // index into options
  /** Shown after answering: the real number behind it. */
  reveal: string;
}

/** Small seeded random (mulberry32) so the quiz is the same for everyone. */
function rng(seed: string) {
  let h = 1779033703;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353), (h = (h << 13) | (h >>> 19));
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const shuffle = <T,>(xs: T[], r: () => number) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

/** Builds a question from the right answer and wrong ones; null when there aren't 3 distinct wrong ones. */
function make(id: string, q: string, right: string, wrong: string[], reveal: string, r: () => number): QuizQuestion | null {
  const others = [...new Set(wrong.filter((w) => w && w !== right))];
  if (others.length < 3) return null;
  const options = shuffle([right, ...shuffle(others, r).slice(0, 3)], r);
  return { id, q, options, answer: options.indexOf(right), reveal };
}

/** Rounds to 2 significant figures so wrong answers don't give themselves away by being "too round". */
const sig2 = (n: number) => (n < 10 ? Math.round(n) : Number(n.toPrecision(2)));

/** The right count plus scaled-up/down decoys (rounded the same way). */
function countOptions(n: number, fmt: (x: number) => string, r: () => number) {
  const right = fmt(sig2(n));
  const scales = shuffle([0.25, 0.45, 2.2, 3.5, 6], r);
  const wrong = scales.map((k) => fmt(Math.max(1, sig2(n * k)))).filter((w) => w !== right);
  // Tiny numbers collapse (0.25 x 2 = 1, 0.45 x 2 = 1): top up with nearby whole numbers.
  for (let d = 1; wrong.length < 3; d++) { const w = fmt(sig2(n) + d * 3); if (w !== right && !wrong.includes(w)) wrong.push(w); }
  return { right, wrong };
}

/** Picks the band containing x and up to 3 neighbouring bands as the wrong answers. */
function band<T extends { label: string; hit: boolean }>(bands: T[]) {
  const i = bands.findIndex((b) => b.hit);
  if (i < 0) return null;
  const near = bands.map((b, j) => ({ b, d: Math.abs(j - i) })).filter((x) => x.d > 0).sort((a, b) => a.d - b.d).slice(0, 3);
  return { right: bands[i].label, wrong: near.map((x) => x.b.label) };
}

const TITLES = ["Launch Sniper", "Scalper", "Degen Machine", "The Assassin", "Profit Printer", "Diamond Hands", "Rug Magnet", "Rug Survivor",
  "Revenge Trader", "The Whale", "Paper Hands", "Volume Farmer", "Day Trader", "Swing Trader", "The Tourist"];

export function buildQuiz(s: WrappedStats, seed: string): QuizQuestion[] {
  const r = rng(seed);
  const qs: (QuizQuestion | null)[] = [];
  const money = (n: number) => usd(n, { sign: true });

  // Every coin name the story mentions: the pool for "which coin" decoys.
  const coins = [
    s.bestTrade?.symbol, s.worstTrade?.symbol, s.roundTrip?.symbol, s.paperHands?.symbol, s.diamondHands?.symbol,
    s.speed?.fastestFlip?.symbol, ...(s.bags?.top ?? []).map((b) => b.symbol), ...s.rugs.tokens, ...s.rugs.dodgedTokens, ...s.airdrops.tokens,
  ].filter((x): x is string => !!x).map((x) => `$${x}`);

  qs.push(make("personality", "What personality did this wallet get?", s.archetype.title, shuffle(TITLES, r),
    s.archetype.tagline, r));

  const p = s.pnl.totalUsd;
  const pb = band([
    { label: "Lost over $10k", hit: p <= -10_000 },
    { label: "Lost $1k–$10k", hit: p > -10_000 && p <= -1_000 },
    { label: "Lost under $1k", hit: p > -1_000 && p < 0 },
    { label: "Made under $1k", hit: p >= 0 && p < 1_000 },
    { label: "Made $1k–$10k", hit: p >= 1_000 && p < 10_000 },
    { label: "Made over $10k", hit: p >= 10_000 },
  ]);
  if (pb) qs.push(make("pnl", "How did the period end, money-wise?", pb.right, pb.wrong, `Trading result: ${money(p)}.`, r));

  if (s.overview.totalTrades >= 3) {
    const t = countOptions(s.overview.totalTrades, num, r);
    qs.push(make("trades", "Roughly how many trades?", t.right, t.wrong, `${s.overview.totalTrades.toLocaleString()} trades on ${s.overview.activeDays} active days.`, r));
  }

  if (s.bestTrade && s.bestTrade.pnlUsd > 0)
    qs.push(make("best", "Which coin made them the most money?", `$${s.bestTrade.symbol}`, shuffle(coins, r),
      `$${s.bestTrade.symbol}: ${money(s.bestTrade.pnlUsd)}.`, r));

  if (s.worstTrade && s.worstTrade.pnlUsd < 0)
    qs.push(make("worst", "Which coin hurt the most?", `$${s.worstTrade.symbol}`, shuffle(coins, r),
      `$${s.worstTrade.symbol}: ${money(s.worstTrade.pnlUsd)}.`, r));

  if (s.pnl.wins + s.pnl.losses >= 5) {
    const w = s.pnl.winRate;
    const wb = band([0, 0.2, 0.4, 0.6, 0.8].map((lo) => ({ label: `${Math.round(lo * 100)}–${Math.round(lo * 100) + 20}%`, hit: w >= lo && (w < lo + 0.2 || lo === 0.8) })));
    if (wb) qs.push(make("winrate", "What share of their coins closed in profit?", wb.right, wb.wrong,
      `${pct(w)} — ${s.pnl.wins.toLocaleString()} wins, ${s.pnl.losses.toLocaleString()} losses.`, r));
  }

  if (s.rugs.count >= 2) {
    const t = countOptions(s.rugs.count, num, r);
    qs.push(make("rugs", "How many coins died while they were holding (at a loss)?", t.right, t.wrong,
      `${s.rugs.count.toLocaleString()} rugs, ${usd(Math.abs(s.rugs.lostUsd))} lost on them.`, r));
  }

  if (s.overview.totalTrades >= 10) {
    const h = s.sleep.peakHourUtc;
    const hb = band([
      { label: "Midnight–6am (UTC)", hit: h < 6 }, { label: "6am–noon (UTC)", hit: h >= 6 && h < 12 },
      { label: "Noon–6pm (UTC)", hit: h >= 12 && h < 18 }, { label: "6pm–midnight (UTC)", hit: h >= 18 },
    ]);
    if (hb) qs.push(make("hour", "When are they most active?", hb.right, hb.wrong,
      `Busiest hour: ${h}:00–${h + 1}:00 UTC, ${s.sleep.peakHourCount.toLocaleString()} trades.`, r));
  }

  const fav = s.narratives?.top.find((n) => n.id !== "other");
  if (fav) {
    const others = (Object.keys(NARRATIVE_LABEL) as (keyof typeof NARRATIVE_LABEL)[]).filter((k) => k !== "other" && k !== fav.id).map((k) => NARRATIVE_LABEL[k]);
    qs.push(make("narrative", "Their favourite kind of coin?", NARRATIVE_LABEL[fav.id], shuffle(others, r),
      `${NARRATIVE_LABEL[fav.id]}: ${fav.tokens.toLocaleString()} coins, ${money(fav.pnlUsd)}.`, r));
  }

  const ff = s.speed?.fastestFlip;
  if (ff) {
    const sec = ff.seconds;
    const fb = band([
      { label: "Under 10 seconds", hit: sec < 10 }, { label: "10–60 seconds", hit: sec >= 10 && sec < 60 },
      { label: "1–10 minutes", hit: sec >= 60 && sec < 600 }, { label: "Over 10 minutes", hit: sec >= 600 },
    ]);
    if (fb) qs.push(make("flip", "Their fastest buy-and-sell-out of one coin took…", fb.right, fb.wrong,
      `${sec < 120 ? `${sec} second${sec === 1 ? "" : "s"}` : `${Math.round(sec / 60)} minutes`} on ${ff.symbol} (${money(ff.pnlUsd)}).`, r));
  }

  const ph = s.paperHands;
  if (ph && ph.soldAt > 0 && ph.laterPeak > ph.soldAt * 1.5) {
    const x = ph.laterPeak / ph.soldAt;
    const t = countOptions(x, (v) => `${v}x`, r);
    qs.push(make("paper", `They sold $${ph.symbol}. How much higher did it go after?`, t.right, t.wrong,
      `About ${Math.round(x)}x — ${usd(ph.missedUsd)} left on the table.`, r));
  }

  // Keep the personality first and the rest in a fixed (seeded) order; 8 at most.
  const [first, ...rest] = qs.filter((x): x is QuizQuestion => !!x);
  return first ? [first, ...shuffle(rest, r)].slice(0, 8) : [];
}

export function scoreLine(score: number, total: number): string {
  const f = total ? score / total : 0;
  return f === 1 ? "Perfect. You might actually be this wallet."
    : f >= 0.75 ? "Scary good. You've been watching."
    : f >= 0.5 ? "Not bad. You know the vibes, not the numbers."
    : f >= 0.25 ? "Mostly guessing, weren't you?"
    : "Total stranger. Maybe that's for the best.";
}
