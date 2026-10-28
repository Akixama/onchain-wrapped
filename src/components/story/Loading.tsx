"use client";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import type { Progress } from "@/lib/pipeline";

const QUIPS = [
  "Counting your 3am apes…",
  "Locating the exact top you bought…",
  "Asking the chain where it all went…",
  "Pricing coins that no longer exist…",
  "Separating trades from wallet shuffles…",
  "Following you across bridges…",
  "Measuring diamond-hand strength…",
  "Tallying the gas you donated…",
  "Finding the one that got away…",
];

const STAGE: Record<Progress["stage"], string> = {
  fetching: "Reading your history",
  pricing: "Looking up prices",
  crunching: "Crunching your PnL",
  done: "Wrapping it up",
};

/** "0:42", "12:05", "1:02:09" */
const clock = (sec: number) => {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h ? `${h}:${String(m).padStart(2, "0")}` : `${m}`) + `:${String(s).padStart(2, "0")}`;
};

export function Loading({ progress, startedAt }: { progress?: Progress; startedAt?: number }) {
  // How long this lookup has been running (from when it was created, so a reload doesn't reset it).
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  const elapsed = startedAt ? Math.max(0, Math.floor((nowMs - startedAt) / 1000)) : null;
  const [q, setQ] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setQ((x) => (x + 1) % QUIPS.length), 2200);
    return () => clearInterval(t);
  }, []);
  const stage = progress?.stage ?? "fetching";
  const steps: Progress["stage"][] = ["fetching", "pricing", "crunching"];
  const at = steps.indexOf(stage === "done" ? "crunching" : stage);
  // The step's own detail line, unless it just repeats the step name.
  const msg = progress?.message ?? "";
  const detail = msg && !/^(Reading .* history|Finding your wallets|Looking up prices|Crunching your PnL|In the queue)( · part \d+)?$/.test(msg) ? msg : "";
  const part = /part (\d+)/.exec(msg)?.[1];

  return (
    <div className="relative grid min-h-[100dvh] place-items-center overflow-hidden bg-[#0B0820] p-6 text-white">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {["#7C3AED", "#14F195", "#3D7BFF"].map((c, i) => (
          <motion.div key={c} className="absolute left-1/2 top-1/2 h-72 w-72 rounded-full blur-3xl" style={{ background: c, opacity: 0.35 }}
            animate={{ x: [`${-50 + i * 30}%`, `${-90 + i * 40}%`, `${-50 + i * 30}%`], y: ["-50%", `${-80 + i * 30}%`, "-50%"], scale: [1, 1.3, 1] }}
            transition={{ duration: 6 + i * 2, repeat: Infinity, ease: "easeInOut" }} />
        ))}
      </div>
      <div className="relative w-full max-w-sm space-y-8 text-center">
        <motion.div className="mx-auto h-20 w-20 rounded-[22px] border-2 border-white/80"
          animate={{ rotate: [0, 90, 180, 270, 360], borderRadius: ["22px", "50%", "22px", "50%", "22px"] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} />
        <div className="h-8 font-display text-xl font-bold">
          <AnimatePresence mode="wait">
            <motion.p key={q} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>{QUIPS[q]}</motion.p>
          </AnimatePresence>
        </div>
        <ol className="space-y-2 text-left text-sm">
          {steps.map((s, n) => (
            <li key={s} className={`rounded-xl px-4 py-3 ${n === at ? "bg-white/15" : "bg-white/5"} ${n > at ? "opacity-40" : ""}`}>
              <div className="flex items-center gap-3">
                <span className="grid h-5 w-5 place-items-center rounded-full border border-white/50 text-[10px]">{n < at ? "✓" : n + 1}</span>
                <span className="flex-1">{STAGE[s]}</span>
                {n === 0 && progress?.fetched ? <span className="tabular-nums opacity-70">{progress.fetched.toLocaleString()} txs</span> : null}
              </div>
              {/* What's happening right now (e.g. "Double-checking trades on-chain (630/4,580) · part 7"). */}
              {n === at && detail ? <div className="mt-1 pl-8 text-xs tabular-nums opacity-70">{detail}</div> : null}
            </li>
          ))}
        </ol>
        {elapsed != null && (
          <p className="font-display text-3xl font-bold tabular-nums" aria-label="Time so far">
            {clock(elapsed)}
            <span className="ml-2 align-middle font-sans text-xs font-normal opacity-60">so far</span>
          </p>
        )}
        <p className="text-xs opacity-60">
          {part ? `Big wallet — reading in parts (part ${part}). Keep this tab open; it picks up where it left off.` : "Most wallets take 1–3 minutes. Very busy ones can take 10 or more. Keep this tab open."}
        </p>
      </div>
    </div>
  );
}
