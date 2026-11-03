"use client";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import type { Progress } from "@/lib/pipeline";
import { GUESS_QS, loadGuesses, saveGuesses, type Guesses } from "../guesses";

const QUIPS = [
  "Counting your 3am apes…",
  "Locating the exact top you bought…",
  "Asking the chain where it all went…",
  "Pricing coins that no longer exist…",
  "Separating trades from wallet shuffles…",
  "Measuring diamond-hand strength…",
  "Tallying the gas you donated…",
  "Finding the one that got away…",
];

// Fun facts about Solana, shown one at a time at the bottom of the waiting screen.
const FACTS = [
  "Solana's mainnet beta went live in March 2020.",
  "A new Solana block (a \"slot\") comes about every 400 milliseconds.",
  "Solana is named after Solana Beach, California, near where its founders lived and surfed.",
  "Founder Anatoly Yakovenko spent over a decade at Qualcomm before starting Solana.",
  "1 SOL = 1,000,000,000 lamports, named after computer scientist Leslie Lamport.",
  "The base fee for a Solana transaction is 0.000005 SOL, a tiny fraction of a cent.",
  "Proof of History is Solana's built-in clock: validators agree on when things happened without asking each other.",
  "Sealevel lets Solana run many smart contracts at the same time instead of one by one.",
  "Solana has no mempool: Gulf Stream forwards transactions straight to the upcoming block leaders.",
  "Turbine, Solana's way of spreading blocks, was inspired by BitTorrent.",
  "Block leaders rotate every 4 slots, so a new validator takes the wheel every 1.6 seconds.",
  "An epoch is 432,000 slots, about 2 days.",
  "A Solana transaction can be at most 1,232 bytes, small enough to fit in one network packet.",
  "Most Solana programs are written in Rust.",
  "BONK was airdropped to the Solana community on Christmas Day 2022.",
  "After the FTX collapse in late 2022, SOL dropped below $10.",
  "Pump.fun launched in January 2024 and has since minted millions of tokens.",
  "dogwifhat, a dog in a pink knit hat, hit a multi-billion-dollar market cap in 2024.",
  "Firedancer is a second, independent Solana validator client built by Jump Crypto.",
  "Solana Mobile released the Saga, a crypto phone, in 2023.",
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
const day = (ts: number) => new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;

export function Loading({ progress, startedAt, jobId }: { progress?: Progress; startedAt?: number; jobId?: string }) {
  // How long this lookup has been running (from when it was created, so a reload doesn't reset it).
  // The clock starts in the browser (0 until then): the page is also pre-rendered, where "now" isn't allowed.
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const tick = () => setNowMs(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [startedAt]);
  const elapsed = startedAt && nowMs ? Math.max(0, Math.floor((nowMs - startedAt) / 1000)) : null;
  const [q, setQ] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setQ((x) => (x + 1) % QUIPS.length), 2600);
    return () => clearInterval(t);
  }, []);
  // A random fact first (picked in the browser), then the next one every 7 seconds.
  const [fact, setFact] = useState(-1);
  useEffect(() => {
    const first = setTimeout(() => setFact(Math.floor(Math.random() * FACTS.length)), 0);
    const t = setInterval(() => setFact((x) => (x + 1) % FACTS.length), 7000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, []);

  // Guess game: questions first, then the sneak peeks (so a peek never gives an answer away).
  const [guesses, setGuesses] = useState<Guesses | null>(null);
  useEffect(() => {
    if (!jobId) return;
    const t = setTimeout(() => setGuesses(loadGuesses(jobId) ?? {}), 0);
    return () => clearTimeout(t);
  }, [jobId]);
  const nextQ = guesses && !guesses.skipped ? GUESS_QS.find((x) => guesses[x.id] === undefined) : undefined;
  const answer = (id: string, i: number) => {
    if (!jobId || !guesses) return;
    const g = { ...guesses, [id]: i };
    setGuesses(g);
    saveGuesses(jobId, g);
  };
  const skip = () => {
    if (!jobId || !guesses) return;
    const g = { ...guesses, skipped: 1 };
    setGuesses(g);
    saveGuesses(jobId, g);
  };

  // "Tell me when it's ready": ask for notification permission on a tap (browsers require one).
  const [notify, setNotify] = useState<"unsupported" | "ask" | "on" | "off">("unsupported");
  useEffect(() => {
    const t = setTimeout(() => {
      if (typeof Notification === "undefined") return;
      setNotify(Notification.permission === "granted" ? "on" : Notification.permission === "denied" ? "off" : "ask");
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const askNotify = async () => {
    try { setNotify((await Notification.requestPermission()) === "granted" ? "on" : "off"); } catch { setNotify("off"); }
  };

  const stage = progress?.stage ?? "fetching";
  const steps: Progress["stage"][] = ["fetching", "pricing", "crunching"];
  const at = steps.indexOf(stage === "done" ? "crunching" : stage);
  // The step's own detail line, unless it just repeats the step name.
  const msg = progress?.message ?? "";
  const detail = msg && !/^(Reading .* history|Finding your wallets|Looking up prices|Crunching your PnL|In the queue)( · part \d+)?$/.test(msg) ? msg : "";
  const part = /part (\d+)/.exec(msg)?.[1];
  const p = progress?.preview;
  const tz = nowMs ? -new Date(nowMs).getTimezoneOffset() / 60 : 0;
  const favHour = p ? (p.hours.indexOf(Math.max(...p.hours)) + tz + 24) % 24 : 0;
  const peeks: [string, string][] = p && p.trades
    ? ([
        [`${p.trades.toLocaleString("en-US")} trades`, `across ${p.coins.toLocaleString("en-US")} coins`],
        p.firstTs && ["First trade", day(p.firstTs)],
        p.busiestDay && ["Busiest day", `${day(p.busiestDay.ts)} · ${p.busiestDay.trades.toLocaleString("en-US")} trades`],
        ["Favourite hour", `${hourLabel(Math.round(favHour))} your time`],
        p.topCoin && ["Most traded", `$${p.topCoin.symbol} · ${p.topCoin.trades.toLocaleString("en-US")} trades`],
        ["Days active", p.activeDays.toLocaleString("en-US")],
      ].filter(Boolean) as [string, string][])
    : [];

  return (
    <div className="relative grid min-h-[100dvh] place-items-center overflow-hidden bg-[#0B0820] p-6 text-white">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {["#7C3AED", "#14F195", "#3D7BFF"].map((c, i) => (
          <motion.div key={c} className="absolute left-1/2 top-1/2 h-72 w-72 rounded-full blur-3xl" style={{ background: c, opacity: 0.3 }}
            animate={{ x: [`${-50 + i * 30}%`, `${-90 + i * 40}%`, `${-50 + i * 30}%`], y: ["-50%", `${-80 + i * 30}%`, "-50%"], scale: [1, 1.3, 1] }}
            transition={{ duration: 6 + i * 2, repeat: Infinity, ease: "easeInOut" }} />
        ))}
      </div>
      <div className="relative w-full max-w-sm space-y-6 text-center">
        <div className="flex items-center justify-center gap-3">
          <motion.div className="h-8 w-8 shrink-0 rounded-[9px] border-2 border-white/80"
            animate={{ rotate: [0, 90, 180, 270, 360], borderRadius: ["9px", "50%", "9px", "50%", "9px"] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} />
          <div className="h-6 min-w-0 text-left font-display text-base font-bold">
            <AnimatePresence mode="wait">
              <motion.p key={q} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="truncate">{QUIPS[q]}</motion.p>
            </AnimatePresence>
          </div>
        </div>

        {/* The main panel: guess game, then sneak peeks. */}
        <AnimatePresence mode="wait">
          {nextQ ? (
            <motion.div key={nextQ.id} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
              className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.07] p-5 text-left backdrop-blur">
              <div className="flex items-center justify-between text-xs uppercase tracking-wider opacity-60">
                <span>Guess while you wait</span>
                <span>{GUESS_QS.indexOf(nextQ) + 1} / {GUESS_QS.length}</span>
              </div>
              <p className="font-display text-2xl font-bold leading-tight">{nextQ.q}</p>
              <div className="grid grid-cols-2 gap-2">
                {nextQ.options.map((o, i) => (
                  <button key={o} onClick={() => answer(nextQ.id, i)}
                    className="min-h-14 rounded-2xl border border-white/15 bg-white/[0.06] px-3 py-3 text-left text-[15px] font-semibold leading-tight transition hover:border-white/40 hover:bg-white/15 active:scale-[0.98]">
                    {o}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between text-xs">
                <button onClick={() => answer(nextQ.id, -1)} className="opacity-60 hover:opacity-90">Not sure</button>
                <button onClick={skip} className="opacity-40 hover:opacity-80">Skip the game</button>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-white/60 transition-all" style={{ width: `${(GUESS_QS.indexOf(nextQ) / GUESS_QS.length) * 100}%` }} />
              </div>
            </motion.div>
          ) : peeks.length ? (
            <motion.div key="peeks" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2 text-left">
              <p className="text-center text-xs uppercase tracking-wider opacity-60">Sneak peek</p>
              {peeks.map(([k, v], i) => (
                <motion.div key={k} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 + i * 0.35 }}
                  className="flex items-baseline justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 backdrop-blur">
                  <span className={i === 0 ? "font-display text-xl font-bold" : "text-sm opacity-70"}>{k}</span>
                  <span className={`text-right ${i === 0 ? "text-sm opacity-70" : "font-semibold"}`}>{v}</span>
                </motion.div>
              ))}
              <p className="pt-1 text-center text-xs opacity-60">Prices, profit and your best and worst trades are next.</p>
            </motion.div>
          ) : guesses && jobId ? (
            <motion.p key="wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-3xl border border-white/10 bg-white/[0.05] p-5 text-sm opacity-80">
              {guesses.skipped ? "" : "Locked in. "}Your first sneak peek shows up here as soon as your history is read.
            </motion.p>
          ) : null}
        </AnimatePresence>

        <ol className="space-y-1.5 text-left text-sm">
          {steps.map((s, n) => (
            <li key={s} className={`rounded-xl px-4 py-2 ${n === at ? "bg-white/15" : "bg-white/5"} ${n > at ? "opacity-40" : ""}`}>
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

        <div className="flex items-center justify-center gap-4">
          {elapsed != null && (
            <p className="font-display text-2xl font-bold tabular-nums" aria-label="Time so far">
              {clock(elapsed)}<span className="ml-1.5 align-middle font-sans text-xs font-normal opacity-60">so far</span>
            </p>
          )}
          {notify === "ask" && (
            <button onClick={askNotify} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20">🔔 Notify me when ready</button>
          )}
          {notify === "on" && <span className="text-xs opacity-60">🔔 We&apos;ll ping you</span>}
        </div>
        <div className="min-h-16 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider opacity-50">Solana fun fact</div>
          <AnimatePresence mode="wait">
            {fact >= 0 && (
              <motion.p key={fact} initial={{ opacity: 0 }} animate={{ opacity: 0.85 }} exit={{ opacity: 0 }} transition={{ duration: 0.8 }} className="mt-1 text-sm leading-snug">
                {FACTS[fact]}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
        <p className="text-xs opacity-60">
          {part ? `Big wallet: reading in parts (part ${part}). Keep this tab open; it picks up where it left off.` : "Most wallets take 1–3 minutes. Very busy ones can take 10 or more. You can switch tabs; this one will tell you when it's ready."}
        </p>
      </div>
    </div>
  );
}
