// "Guess your stats": questions asked on the waiting screen, answered for real in the story.
// Guesses live in this browser only (localStorage), keyed by the lookup id.
import type { WrappedStats } from "@/lib/engine/stats";

export interface GuessQ {
  id: "trades" | "winRate" | "upDown";
  q: string;
  options: string[];
  /** Which option is right, from the finished result. */
  answer: (s: WrappedStats) => number;
  /** The real number, as text. */
  real: (s: WrappedStats) => string;
}

const bucket = (n: number, edges: number[]) => { let i = 0; while (i < edges.length && n >= edges[i]) i++; return i; };

export const GUESS_QS: GuessQ[] = [
  {
    id: "trades", q: "How many trades did you make?", options: ["Under 100", "100 – 1,000", "1,000 – 10,000", "10,000+"],
    answer: (s) => bucket(s.overview.totalTrades, [100, 1000, 10000]),
    real: (s) => `${s.overview.totalTrades.toLocaleString("en-US")} trades`,
  },
  {
    id: "winRate", q: "What share of your trades made money?", options: ["Under 25%", "25 – 50%", "50 – 75%", "Over 75%"],
    answer: (s) => bucket(s.pnl.winRate, [0.25, 0.5, 0.75]),
    real: (s) => `${Math.round(s.pnl.winRate * 100)}% won`,
  },
  {
    id: "upDown", q: "Are you up or down overall?", options: ["Up 📈", "Down 📉"],
    answer: (s) => (s.pnl.totalUsd >= 0 ? 0 : 1),
    real: (s) => `${s.pnl.totalUsd >= 0 ? "Up" : "Down"} $${Math.round(Math.abs(s.pnl.totalUsd)).toLocaleString("en-US")}`,
  },
];

export type Guesses = Partial<Record<GuessQ["id"], number>> & { skipped?: boolean };

const key = (id: string) => `guess:${id}`;
export function loadGuesses(id: string): Guesses | null {
  try { const raw = localStorage.getItem(key(id)); return raw ? (JSON.parse(raw) as Guesses) : null; } catch { return null; }
}
export function saveGuesses(id: string, g: Guesses) {
  try { localStorage.setItem(key(id), JSON.stringify(g)); } catch { /* private mode: the game still works, just no reveal */ }
}
/** At least one real guess (not skipped). */
export const hasGuesses = (g: Guesses | null): g is Guesses => !!g && GUESS_QS.some((q) => g[q.id] !== undefined);
