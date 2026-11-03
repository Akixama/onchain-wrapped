// "Guess your stats": questions asked on the waiting screen, answered for real in the story.
// Guesses live in this browser only (localStorage), keyed by the lookup id.
import type { WrappedStats } from "@/lib/engine/stats";

export interface GuessQ {
  id: string;
  q: string;
  /** Short label for the reveal card. */
  short: string;
  options: string[];
  /** Which option is right, from the finished result (tz = viewer's UTC offset in hours). null = no data for it. */
  answer: (s: WrappedStats, tz: number) => number | null;
  /** The real value, as text. */
  real: (s: WrappedStats, tz: number) => string;
}

const bucket = (n: number, edges: number[]) => { let i = 0; while (i < edges.length && n >= edges[i]) i++; return i; };
const usd = (n: number) => `$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
const num = (n: number) => n.toLocaleString("en-US");
const USD4 = ["Under $100", "$100 – $1k", "$1k – $10k", "Over $10k"];
const USD_EDGES = [100, 1000, 10000];
const localHour = (utc: number, tz: number) => ((utc + Math.round(tz)) % 24 + 24) % 24;
const peakHour = (s: WrappedStats) => s.sleep.hourHistogramUtc.indexOf(Math.max(...s.sleep.hourHistogramUtc));
const partOfDay = (h: number) => (h >= 5 && h < 12 ? 0 : h >= 12 && h < 17 ? 1 : h >= 17 && h < 22 ? 2 : 3);
const hourText = (h: number) => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
const dur = (sec: number) => (sec < 60 ? `${sec}s` : sec < 3600 ? `${Math.round(sec / 60)} min` : sec < 86400 ? `${Math.round(sec / 3600)} h` : `${Math.round(sec / 86400)} days`);

export const GUESS_QS: GuessQ[] = [
  {
    id: "trades", q: "How many trades did you make?", short: "Trades", options: ["Under 100", "100 – 1,000", "1,000 – 10,000", "10,000+"],
    answer: (s) => bucket(s.overview.totalTrades, [100, 1000, 10000]),
    real: (s) => num(s.overview.totalTrades),
  },
  {
    id: "upDown", q: "Are you up or down overall?", short: "Up or down", options: ["Up 📈", "Down 📉"],
    answer: (s) => (s.pnl.totalUsd >= 0 ? 0 : 1),
    real: (s) => `${s.pnl.totalUsd >= 0 ? "Up" : "Down"} ${usd(s.pnl.totalUsd)}`,
  },
  {
    id: "pnlSize", q: "By how much?", short: "Profit or loss size", options: USD4,
    answer: (s) => bucket(Math.abs(s.pnl.totalUsd), USD_EDGES),
    real: (s) => usd(s.pnl.totalUsd),
  },
  {
    id: "winRate", q: "What share of your trades made money?", short: "Win rate", options: ["Under 25%", "25 – 50%", "50 – 75%", "Over 75%"],
    answer: (s) => (s.pnl.wins + s.pnl.losses ? bucket(s.pnl.winRate, [0.25, 0.5, 0.75]) : null),
    real: (s) => `${Math.round(s.pnl.winRate * 100)}%`,
  },
  {
    id: "volume", q: "How much did you trade in total (volume)?", short: "Volume", options: ["Under $1k", "$1k – $10k", "$10k – $100k", "Over $100k"],
    answer: (s) => bucket(s.overview.volumeUsd, [1000, 10000, 100000]),
    real: (s) => usd(s.overview.volumeUsd),
  },
  {
    id: "coins", q: "How many different coins did you trade?", short: "Coins traded", options: ["Under 20", "20 – 100", "100 – 1,000", "1,000+"],
    answer: (s) => bucket(s.overview.tokensTraded, [20, 100, 1000]),
    real: (s) => num(s.overview.tokensTraded),
  },
  {
    id: "best", q: "How much did your best trade make?", short: "Best trade", options: USD4,
    answer: (s) => (s.bestTrade ? bucket(Math.max(0, s.bestTrade.pnlUsd), USD_EDGES) : null),
    real: (s) => (s.bestTrade ? `+${usd(s.bestTrade.pnlUsd)} on $${s.bestTrade.symbol}` : "-"),
  },
  {
    id: "worst", q: "How much did your worst trade lose?", short: "Worst trade", options: USD4,
    answer: (s) => (s.worstTrade ? bucket(Math.abs(Math.min(0, s.worstTrade.pnlUsd)), USD_EDGES) : null),
    real: (s) => (s.worstTrade ? `-${usd(s.worstTrade.pnlUsd)} on $${s.worstTrade.symbol}` : "-"),
  },
  {
    id: "hold", q: "Did your trading beat just holding SOL?", short: "Beat holding SOL", options: ["Yes, trading won", "No, should've held"],
    answer: (s) => (s.overview.totalTrades ? (s.counterfactual.verdict === "trading_won" ? 0 : 1) : null),
    real: (s) => (s.counterfactual.verdict === "trading_won" ? "Trading won" : `Holding was ${usd(s.counterfactual.justHeldDiffUsd)} better`),
  },
  {
    id: "time", q: "When do you trade the most?", short: "Busiest time", options: ["Morning", "Afternoon", "Evening", "Late night"],
    answer: (s, tz) => (s.overview.totalTrades >= 5 ? partOfDay(localHour(peakHour(s), tz)) : null),
    real: (s, tz) => `Around ${hourText(localHour(peakHour(s), tz))}`,
  },
  {
    id: "days", q: "On how many days did you trade?", short: "Days active", options: ["Under 10", "10 – 50", "50 – 150", "150+"],
    answer: (s) => bucket(s.overview.activeDays, [10, 50, 150]),
    real: (s) => num(s.overview.activeDays),
  },
  {
    id: "busiest", q: "Most trades you made in a single day?", short: "Busiest day", options: ["Under 10", "10 – 50", "50 – 200", "200+"],
    answer: (s) => (s.speed?.busiestDay ? bucket(s.speed.busiestDay.trades, [10, 50, 200]) : null),
    real: (s) => (s.speed?.busiestDay ? num(s.speed.busiestDay.trades) : "-"),
  },
  {
    id: "flip", q: "Your fastest in-and-out of a coin took…", short: "Fastest flip", options: ["Under a minute", "1 – 10 minutes", "10 – 60 minutes", "Over an hour"],
    answer: (s) => (s.speed?.fastestFlip ? bucket(s.speed.fastestFlip.seconds, [60, 600, 3600]) : null),
    real: (s) => (s.speed?.fastestFlip ? `${dur(s.speed.fastestFlip.seconds)} ($${s.speed.fastestFlip.symbol})` : "-"),
  },
  {
    id: "dead", q: "How many coins you bought are now dead?", short: "Dead coins", options: ["None", "1 – 10", "10 – 100", "100+"],
    answer: (s) => bucket(s.rugs.count + s.rugs.dodged, [1, 10, 100]),
    real: (s) => num(s.rugs.count + s.rugs.dodged),
  },
  {
    id: "gas", q: "How much did you spend on network fees?", short: "Fees", options: ["Under $10", "$10 – $100", "$100 – $1k", "Over $1k"],
    answer: (s) => bucket(s.gas.totalUsd, [10, 100, 1000]),
    real: (s) => `$${s.gas.totalUsd < 10 ? s.gas.totalUsd.toFixed(2) : Math.round(s.gas.totalUsd).toLocaleString("en-US")}`,
  },
];

/** Answer index per question; -1 = "not sure". */
export type Guesses = Record<string, number> & { skipped?: number };

const key = (id: string) => `guess:${id}`;
export function loadGuesses(id: string): Guesses | null {
  try { const raw = localStorage.getItem(key(id)); return raw ? (JSON.parse(raw) as Guesses) : null; } catch { return null; }
}
export function saveGuesses(id: string, g: Guesses) {
  try { localStorage.setItem(key(id), JSON.stringify(g)); } catch { /* private mode: the game still works, just no reveal */ }
}
/** At least one real guess (not "not sure", not skipped). */
export const hasGuesses = (g: Guesses | null): g is Guesses => !!g && GUESS_QS.some((q) => (g[q.id] ?? -1) >= 0);
