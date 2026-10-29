"use client";
// Two Wrapped results side by side. Waits for either lookup that's still running.
import { motion } from "motion/react";
import Link from "next/link";
import { TipFab } from "./TipJar";
import { useEffect, useState } from "react";
import type { PublicJob } from "@/lib/store";
import { compareRows, compareScore, type Tone } from "./compare";
import { whoLabel } from "./format";
import { Loading } from "./story/Loading";

type J = Pick<PublicJob, "id" | "status" | "progress" | "error" | "stats">;

function usePolledJob(initial: J) {
  const [job, setJob] = useState(initial);
  useEffect(() => {
    if (job.status === "done" || job.status === "error") return;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/wrapped/${job.id}`, { cache: "no-store" });
        if (r.ok) setJob(await r.json());
      } catch {}
    }, 2500);
    return () => clearInterval(t);
  }, [job.id, job.status]);
  return job;
}

export function CompareView({ a: a0, b: b0, siteUrl }: { a: J; b: J; siteUrl: string }) {
  const a = usePolledJob(a0), b = usePolledJob(b0);
  const [copied, setCopied] = useState(false);
  const failed = [a, b].find((j) => j.status === "error");
  if (failed) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-black p-6 text-center text-white">
        <div className="max-w-sm space-y-4">
          <div className="font-display text-3xl font-bold">That didn&apos;t work</div>
          <p className="opacity-75">{failed.error ?? "Something went wrong."}</p>
          <Link href={`/w/${a.id}`} className="inline-block rounded-2xl bg-white px-6 py-3 font-bold text-black">Back to my Wrapped</Link>
        </div>
      </div>
    );
  }
  const pending = [b, a].find((j) => j.status !== "done" || !j.stats);
  if (pending) return <Loading progress={pending.progress} />;

  const sa = a.stats!, sb = b.stats!;
  const rows = compareRows(sa, sb);
  const score = compareScore(rows);
  const nameA = whoLabel(sa), nameB = whoLabel(sb);
  const verdict = score.a === score.b ? "Dead even." : `${score.a > score.b ? nameA : nameB} takes it.`;
  const url = `${siteUrl}/vs/${a.id}/${b.id}`;
  const text = `${nameA} vs ${nameB} on Wrapped Onchain: ${score.a}–${score.b}. ${verdict}`;

  return (
    <div className="min-h-[100dvh] bg-[#0B0820] px-4 pb-24 pt-8 text-white sm:px-6">
      <TipFab />
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between text-sm">
          <Link href="/" className="font-display font-bold">Wrapped <span className="opacity-60">Onchain</span></Link>
          <Link href={`/w/${a.id}`} className="rounded-full bg-white/10 px-3 py-1.5 font-semibold hover:bg-white/20">← Back</Link>
        </div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
          <Side name={nameA} title={sa.archetype.title} href={`/w/${a.id}`} lead={score.a > score.b} />
          <div className="font-display text-4xl font-bold tabular-nums sm:text-6xl">{score.a}<span className="opacity-40">–</span>{score.b}</div>
          <Side name={nameB} title={sb.archetype.title} href={`/w/${b.id}`} lead={score.b > score.a} />
        </motion.div>
        <p className="text-center font-display text-xl font-bold">{verdict}</p>

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
          {rows.map((r, i) => (
            <motion.div key={r.label} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 + i * 0.05 }}
              className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-white/5 px-3 py-3 last:border-0 sm:px-5">
              <Cell v={r.a} on={r.winner === "a"} tone={r.toneA} align="right" />
              <div className="w-24 text-center text-[11px] font-semibold uppercase tracking-wider opacity-60 sm:w-32">{r.label}</div>
              <Cell v={r.b} on={r.winner === "b"} tone={r.toneB} align="left" />
            </motion.div>
          ))}
        </div>

        <p className="-mt-3 text-center text-xs opacity-60"><span className="text-amber-300">◂ ▸</span> points to who wins each row · <span className="text-emerald-300">green</span> = made money, <span className="text-red-400">red</span> = lost money</p>

        <div className="grid gap-2 sm:grid-cols-2">
          <a href={`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer"
            className="rounded-2xl bg-white py-3.5 text-center font-display font-bold text-black">Post on X</a>
          <button className="rounded-2xl border border-white/25 py-3.5 font-semibold" onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); }}>
            {copied ? "Link copied" : "Copy link"}
          </button>
        </div>
        <p className="text-center text-xs opacity-50">Estimates from public onchain data · same period for both</p>
      </div>
    </div>
  );
}

function Side({ name, title, href, lead }: { name: string; title: string; href: string; lead: boolean }) {
  return (
    <Link href={href} className={`min-w-0 rounded-2xl border px-3 py-4 ${lead ? "border-emerald-400/60 bg-emerald-400/10" : "border-white/10 bg-white/[0.05]"}`}>
      <div className="truncate font-display text-lg font-bold">{name}</div>
      <div className="mt-1 line-clamp-2 text-xs opacity-70">{title}</div>
    </Link>
  );
}

/** Colour says gain or loss (money rows only); the arrow and brightness say who won the row. */
function Cell({ v, on, tone, align }: { v: string; on: boolean; tone?: Tone; align: "left" | "right" }) {
  const color = tone === "gain" ? "text-emerald-300" : tone === "loss" ? "text-red-400" : "";
  const arrow = <span className="text-amber-300">{align === "left" ? "▸ " : " ◂"}</span>;
  return (
    <div className={`min-w-0 truncate font-display text-sm font-bold tabular-nums sm:text-lg ${align === "right" ? "text-right" : "text-left"} ${color} ${on ? "" : "opacity-60"}`}>
      {on && align === "left" && arrow}{v}{on && align === "right" && arrow}
    </div>
  );
}
