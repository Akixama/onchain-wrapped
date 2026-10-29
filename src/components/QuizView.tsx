"use client";
// "How well do you know this wallet?" One question at a time, answer revealed straight away, score at the end.
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { TipFab } from "./TipJar";
import { useEffect, useState } from "react";
import { scoreLine, type QuizQuestion } from "./quiz";

export function QuizView({ id, who, period, questions, siteUrl }: { id: string; who: string; period: string; questions: QuizQuestion[]; siteUrl: string }) {
  const [i, setI] = useState(-1); // -1 = intro, questions.length = result
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [copied, setCopied] = useState(false);
  const total = questions.length;
  const url = `${siteUrl}/q/${id}`;
  const q = i >= 0 && i < total ? questions[i] : null;
  const [board, setBoard] = useState<Entry[]>([]);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState<{ rank: number } | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/quiz/${id}/scores`).then((r) => r.json()).then((j) => setBoard(j.entries ?? [])).catch(() => {});
  }, [id]);
  const submitScore = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveErr(null);
    try {
      const r = await fetch(`/api/quiz/${id}/scores`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, score }) });
      const j = await r.json();
      if (!r.ok) return setSaveErr(j.error ?? "Couldn't save that.");
      setBoard(j.entries ?? []);
      setSaved({ rank: j.rank });
    } catch { setSaveErr("Couldn't save that."); }
  };

  const pick = (k: number) => {
    if (picked != null || !q) return;
    setPicked(k);
    if (k === q.answer) setScore((s) => s + 1);
  };
  const next = () => { setPicked(null); setI((x) => x + 1); };
  const restart = () => { setScore(0); setPicked(null); setSaved(null); setI(0); };

  return (
    <div className="min-h-[100dvh] bg-[radial-gradient(ellipse_at_top,#2a1460,#0B0820_60%)] px-4 pb-24 pt-8 text-white sm:px-6">
      <TipFab />
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-xl flex-col gap-6">
        <div className="flex items-center justify-between text-sm">
          <Link href="/" className="font-display font-bold">onchain<span className="opacity-60">wrapped</span></Link>
          <Link href={`/w/${id}`} className="rounded-full bg-white/10 px-3 py-1.5 font-semibold hover:bg-white/20">See the Wrapped</Link>
        </div>

        {q && (
          <div className="flex gap-1.5" aria-label={`Question ${i + 1} of ${total}`}>
            {questions.map((_, k) => <div key={k} className={`h-1.5 flex-1 rounded-full ${k < i || (k === i && picked != null) ? "bg-amber-300" : k === i ? "bg-white/50" : "bg-white/15"}`} />)}
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div key={i} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.25 }}
            className="flex flex-1 flex-col justify-center gap-6">
            {i === -1 && (
              <div className="space-y-6 text-center">
                <div className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">Wallet quiz</div>
                <h1 className="font-display text-4xl font-bold leading-tight sm:text-5xl">How well do you know <span className="text-amber-300">{who}</span>?</h1>
                <p className="opacity-75">{total} questions about their {period}. Every answer comes from their real onchain trades.</p>
                <button onClick={() => setI(0)} className="w-full rounded-2xl bg-white py-4 font-display text-lg font-bold text-black active:scale-[0.98]">Start</button>
                {board.length > 0 && <Board entries={board.slice(0, 3)} title="Score to beat" />}
              </div>
            )}

            {q && (
              <div className="space-y-5">
                <div className="text-sm opacity-60">Question {i + 1} of {total}</div>
                <h2 className="font-display text-2xl font-bold leading-snug sm:text-3xl">{q.q}</h2>
                <div className="grid gap-3">
                  {q.options.map((o, k) => {
                    const state = picked == null ? "idle" : k === q.answer ? "right" : k === picked ? "wrong" : "dim";
                    return (
                      <button key={o} onClick={() => pick(k)} disabled={picked != null}
                        className={`rounded-2xl border px-4 py-3.5 text-left font-semibold transition ${
                          state === "right" ? "border-emerald-400 bg-emerald-400/20 text-emerald-200"
                          : state === "wrong" ? "border-red-400 bg-red-400/15 text-red-200"
                          : state === "dim" ? "border-white/10 bg-white/[0.03] opacity-50"
                          : "border-white/15 bg-white/[0.06] hover:border-white/40 hover:bg-white/10 active:scale-[0.99]"}`}>
                        {state === "right" && "✓ "}{state === "wrong" && "✗ "}{o}
                      </button>
                    );
                  })}
                </div>
                {picked != null && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                    <p className="rounded-2xl bg-white/[0.07] px-4 py-3 text-sm">
                      <b className={picked === q.answer ? "text-emerald-300" : "text-red-300"}>{picked === q.answer ? "Right." : "Nope."}</b> {q.reveal}
                    </p>
                    <button onClick={next} className="w-full rounded-2xl bg-white py-3.5 font-display font-bold text-black active:scale-[0.98]">
                      {i + 1 < total ? "Next" : "See my score"}
                    </button>
                  </motion.div>
                )}
              </div>
            )}

            {i === total && (
              <div className="space-y-6 text-center">
                <div className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">Your score</div>
                <div className="font-display text-7xl font-bold tabular-nums">{score}<span className="opacity-40">/{total}</span></div>
                <p className="font-display text-xl font-bold">{scoreLine(score, total)}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <a target="_blank" rel="noopener noreferrer"
                    href={`https://x.com/intent/post?text=${encodeURIComponent(`I got ${score}/${total} on the ${who} wallet quiz. Think you know them better?`)}&url=${encodeURIComponent(url)}`}
                    className="rounded-2xl bg-white py-3.5 text-center font-display font-bold text-black">Post my score</a>
                  <button onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); }}
                    className="rounded-2xl border border-white/25 py-3.5 font-semibold">{copied ? "Link copied" : "Send to a friend"}</button>
                </div>
                {saved ? (
                  <p className="text-sm text-amber-200">You&apos;re #{saved.rank} on the board.</p>
                ) : (
                  <form onSubmit={submitScore} className="flex gap-2">
                    <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="Your name for the board"
                      className="min-w-0 flex-1 rounded-2xl border border-white/20 bg-white/[0.06] px-4 py-3 outline-none placeholder:text-white/40 focus:border-white/50" />
                    <button disabled={!name.trim()} className="rounded-2xl bg-amber-300 px-5 font-bold text-black disabled:opacity-40">Add</button>
                  </form>
                )}
                {saveErr && <p className="text-sm text-red-300">{saveErr}</p>}
                {board.length > 0 && <Board entries={board} title="Scoreboard" highlight={saved ? saved.rank - 1 : -1} />}
                <div className="flex flex-wrap justify-center gap-4 text-sm">
                  <Link href={`/g/${id}`} className="underline-offset-4 opacity-75 hover:underline">Chart game</Link>
                  <Link href={`/ask/${id}`} className="underline-offset-4 opacity-75 hover:underline">Ask this wallet</Link>
                  <button onClick={restart} className="underline-offset-4 opacity-75 hover:underline">Play again</button>
                  <Link href={`/w/${id}`} className="underline-offset-4 opacity-75 hover:underline">See the full Wrapped</Link>
                  <Link href="/" className="underline-offset-4 opacity-75 hover:underline">Make a quiz for your wallet</Link>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

interface Entry { name: string; score: number; total: number }

function Board({ entries, title, highlight = -1 }: { entries: Entry[]; title: string; highlight?: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] opacity-60">{title}</div>
      <ol className="space-y-1.5">
        {entries.map((e, k) => (
          <li key={e.name + k} className={`flex items-center gap-3 rounded-lg px-2 py-1 ${k === highlight ? "bg-amber-300/15 text-amber-100" : ""}`}>
            <span className="w-5 text-right tabular-nums opacity-50">{k + 1}</span>
            <span className="min-w-0 flex-1 truncate font-semibold">{e.name}</span>
            <span className="font-display font-bold tabular-nums">{e.score}/{e.total}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
