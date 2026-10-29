"use client";
// "Win or lose?" — a coin's chart up to the moment they first bought, the rest hidden. Guess, then see it all.
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { TipFab } from "./TipJar";
import { useState } from "react";
import type { TradeCard } from "@/lib/engine/stats";
import { usd } from "./format";
import { ChartJobContext, TradeChart } from "./story/TradeChart";

import type { ChartRound } from "./chartRounds";

export function ChartGame({ id, who, rounds, siteUrl }: { id: string; who: string; rounds: ChartRound[]; siteUrl: string }) {
  const [i, setI] = useState(-1);
  const [guess, setGuess] = useState<"win" | "lose" | null>(null);
  const [score, setScore] = useState(0);
  const [copied, setCopied] = useState(false);
  const total = rounds.length;
  const r = i >= 0 && i < total ? rounds[i] : null;
  const won = r ? r.card.pnlUsd > 0 : false;
  const url = `${siteUrl}/g/${id}`;

  const answer = (g: "win" | "lose") => {
    if (guess || !r) return;
    setGuess(g);
    if ((g === "win") === won) setScore((s) => s + 1);
  };
  const next = () => { setGuess(null); setI((x) => x + 1); };

  return (
    <ChartJobContext.Provider value={id}>
      <div className="min-h-[100dvh] bg-[radial-gradient(ellipse_at_top,#0f3b46,#07141c_60%)] px-4 pb-24 pt-8 text-white sm:px-6">
      <TipFab />
        <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-2xl flex-col gap-6">
          <div className="flex items-center justify-between text-sm">
            <Link href="/" className="font-display font-bold">onchain<span className="opacity-60">wrapped</span></Link>
            <Link href={`/w/${id}`} className="rounded-full bg-white/10 px-3 py-1.5 font-semibold hover:bg-white/20">See the Wrapped</Link>
          </div>
          {r && (
            <div className="flex gap-1.5">
              {rounds.map((_, k) => <div key={k} className={`h-1.5 flex-1 rounded-full ${k < i || (k === i && guess) ? "bg-cyan-300" : k === i ? "bg-white/50" : "bg-white/15"}`} />)}
            </div>
          )}

          <AnimatePresence mode="wait">
            <motion.div key={i} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.25 }}
              className="flex flex-1 flex-col justify-center gap-5">
              {i === -1 && (
                <div className="space-y-6 text-center">
                  <div className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">Chart game</div>
                  <h1 className="font-display text-4xl font-bold leading-tight sm:text-5xl">Win or lose?</h1>
                  <p className="opacity-75">{total} real trades by <b>{who}</b>. You see the chart up to their buy — the rest is hidden. Did they make money or lose it?</p>
                  <button onClick={() => setI(0)} className="w-full rounded-2xl bg-white py-4 font-display text-lg font-bold text-black active:scale-[0.98]">Start</button>
                </div>
              )}

              {r && (
                <div className="space-y-4">
                  <div className="text-sm opacity-60">Trade {i + 1} of {total}</div>
                  <h2 className="font-display text-2xl font-bold leading-snug sm:text-3xl">They bought <span className="text-cyan-300">${r.card.symbol}</span>. Then what?</h2>
                  <p className="text-sm opacity-70">
                    {new Date(r.cutoff * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    {r.card.costUsd > 0 && <> · {usd(r.card.costUsd)} spent</>}
                  </p>
                  <TradeChart key={`${i}-${guess ? "all" : "cut"}`} card={r.card} cutoff={guess ? undefined : r.cutoff} />
                  {!guess ? (
                    <div className="grid grid-cols-2 gap-3">
                      <button onClick={() => answer("win")} className="rounded-2xl border border-emerald-400/60 bg-emerald-400/15 py-4 font-display text-lg font-bold text-emerald-200 active:scale-[0.98]">Made money</button>
                      <button onClick={() => answer("lose")} className="rounded-2xl border border-red-400/60 bg-red-400/15 py-4 font-display text-lg font-bold text-red-200 active:scale-[0.98]">Lost money</button>
                    </div>
                  ) : (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                      <p className="rounded-2xl bg-white/[0.07] px-4 py-3">
                        <b className={(guess === "win") === won ? "text-emerald-300" : "text-red-300"}>{(guess === "win") === won ? "Right." : "Nope."}</b>{" "}
                        They {won ? "made" : "lost"} <b className={won ? "text-emerald-300" : "text-red-300"}>{usd(Math.abs(r.card.pnlUsd))}</b> on ${r.card.symbol}
                        {r.card.holdingValueUsd >= 1 && <> (still holding some)</>}.
                      </p>
                      <button onClick={next} className="w-full rounded-2xl bg-white py-3.5 font-display font-bold text-black active:scale-[0.98]">{i + 1 < total ? "Next trade" : "See my score"}</button>
                    </motion.div>
                  )}
                </div>
              )}

              {i === total && (
                <div className="space-y-6 text-center">
                  <div className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">Your score</div>
                  <div className="font-display text-7xl font-bold tabular-nums">{score}<span className="opacity-40">/{total}</span></div>
                  <p className="font-display text-xl font-bold">{score === total ? "You read charts like they do. Worrying." : score >= total / 2 ? "Decent instincts." : "The charts fooled you. They fooled them too."}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <a target="_blank" rel="noopener noreferrer"
                      href={`https://x.com/intent/post?text=${encodeURIComponent(`I called ${score}/${total} of ${who}'s trades. Can you read their charts?`)}&url=${encodeURIComponent(url)}`}
                      className="rounded-2xl bg-white py-3.5 text-center font-display font-bold text-black">Post my score</a>
                    <button onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); }}
                      className="rounded-2xl border border-white/25 py-3.5 font-semibold">{copied ? "Link copied" : "Send to a friend"}</button>
                  </div>
                  <div className="flex flex-wrap justify-center gap-4 text-sm">
                    <button onClick={() => { setScore(0); setGuess(null); setI(0); }} className="underline-offset-4 opacity-75 hover:underline">Play again</button>
                    <Link href={`/q/${id}`} className="underline-offset-4 opacity-75 hover:underline">Try the wallet quiz</Link>
                    <Link href={`/ask/${id}`} className="underline-offset-4 opacity-75 hover:underline">Ask this wallet</Link>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </ChartJobContext.Provider>
  );
}
