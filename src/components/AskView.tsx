"use client";
// "Ask this wallet": a small chat about one finished Wrapped. Answers come from its real numbers.
import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

interface Msg { from: "you" | "wallet"; text: string }

export function AskView({ id, who, suggested }: { id: string; who: string; suggested: string[] }) {
  const [msgs, setMsgs] = useState<Msg[]>([{ from: "wallet", text: `I'm ${who}'s trading history. Ask me anything about it.` }]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setDraft("");
    setMsgs((m) => [...m, { from: "you", text: q }]);
    setBusy(true);
    try {
      const r = await fetch(`/api/ask/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: q }) });
      const j = await r.json();
      setMsgs((m) => [...m, { from: "wallet", text: j.text ?? j.error ?? "Something went wrong." }]);
    } catch {
      setMsgs((m) => [...m, { from: "wallet", text: "Couldn't reach the server. Try again." }]);
    } finally {
      setBusy(false);
    }
  };
  const asked = new Set(msgs.filter((m) => m.from === "you").map((m) => m.text));

  return (
    <div className="min-h-[100dvh] bg-[radial-gradient(ellipse_at_top,#3b1d4a,#0d0a18_60%)] px-4 py-6 text-white sm:px-6">
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-2xl flex-col gap-4">
        <div className="flex items-center justify-between text-sm">
          <Link href="/" className="font-display font-bold">Wrapped <span className="opacity-60">Onchain</span></Link>
          <Link href={`/w/${id}`} className="rounded-full bg-white/10 px-3 py-1.5 font-semibold hover:bg-white/20">See the Wrapped</Link>
        </div>
        <h1 className="font-display text-3xl font-bold">Ask <span className="text-fuchsia-300">{who}</span></h1>

        <div className="flex-1 space-y-3">
          {msgs.map((m, k) => (
            <motion.div key={k} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className={`max-w-[85%] rounded-2xl px-4 py-3 ${m.from === "you" ? "ml-auto bg-white text-black" : "bg-white/[0.08]"}`}>
              {m.text}
            </motion.div>
          ))}
          {busy && <div className="w-16 animate-pulse rounded-2xl bg-white/[0.08] px-4 py-3 text-center">…</div>}
          <div ref={end} />
        </div>

        <div className="sticky bottom-0 space-y-3 bg-gradient-to-t from-[#0d0a18] via-[#0d0a18]/95 pb-2 pt-4">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {suggested.filter((q) => !asked.has(q)).map((q) => (
              <button key={q} onClick={() => ask(q)} disabled={busy}
                className="shrink-0 rounded-full border border-white/20 bg-white/[0.06] px-3.5 py-2 text-sm hover:bg-white/15 disabled:opacity-50">{q}</button>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); ask(draft); }} className="flex gap-2">
            <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={300} placeholder="Ask about the trades…"
              className="min-w-0 flex-1 rounded-2xl border border-white/20 bg-white/[0.06] px-4 py-3 outline-none placeholder:text-white/40 focus:border-white/50" />
            <button disabled={!draft.trim() || busy} className="rounded-2xl bg-fuchsia-300 px-5 font-bold text-black disabled:opacity-40">Ask</button>
          </form>
          <p className="text-center text-xs opacity-50">Answers come from this wallet&apos;s numbers. Not financial advice.</p>
        </div>
      </div>
    </div>
  );
}
