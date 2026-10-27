"use client";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CardId, WrappedStats } from "@/lib/engine/stats";
import type { PublicJob as PublicJobT } from "@/lib/store";
import { CARD_THEME, CARD_TITLE, periodLabel, shareText } from "../format";
import { CARDS, type CardCtx } from "./cards";
import { FitContent, stagger } from "./primitives";
import { Loading } from "./Loading";
import { ChartJobContext } from "./TradeChart";

const CARD_MS = 7000;
const noopSubscribe = () => () => {};

type PublicJob = Pick<PublicJobT, "id" | "status" | "progress" | "error" | "stats">;

export function StoryPlayer({ job: initial, startCard, ngnRate, siteUrl }: { job: PublicJob; startCard?: string; ngnRate: number | null; siteUrl: string }) {
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

  if (job.status === "error") return <ErrorScreen message={job.error ?? "Something went wrong."} />;
  if (job.status !== "done" || !job.stats) return <Loading progress={job.progress} />;
  return <Story id={job.id} s={job.stats} startCard={startCard} ngnRate={ngnRate} siteUrl={siteUrl} />;
}

function Story({ id, s, startCard, ngnRate, siteUrl }: { id: string; s: WrappedStats; startCard?: string; ngnRate: number | null; siteUrl: string }) {
  const cards = s.cards;
  const [i, setI] = useState(() => Math.max(0, cards.indexOf(startCard as CardId)));
  const [dir, setDir] = useState(1);
  const [held, setHeld] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [currency, setCurrency] = useState<"USD" | "NGN">("USD");
  const tz = useSyncExternalStore(noopSubscribe, () => -new Date().getTimezoneOffset() / 60, () => 0);
  const down = useRef<{ x: number; t: number } | null>(null);
  const card = cards[i];
  const theme = CARD_THEME[card];
  const paused = held || sheet;


  const go = useCallback((d: number) => {
    setDir(d);
    setI((x) => Math.min(cards.length - 1, Math.max(0, x + d)));
  }, [cards.length]);

  // Keep the address bar on the current card, so copying the URL shares this card.
  useEffect(() => {
    window.history.replaceState(null, "", `/w/${id}/${card}`);
  }, [id, card]);

  useEffect(() => {
    if (paused || i === cards.length - 1) return;
    const t = setTimeout(() => go(1), CARD_MS);
    return () => clearTimeout(t);
  }, [i, paused, go, cards.length]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") go(1);
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "Escape") setSheet(false);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [go]);

  const ctx: CardCtx = { tzOffsetH: tz, currency, setCurrency, ngnRate };
  const Card = CARDS[card];
  const url = `${siteUrl}/w/${id}/${card}`;

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-black sm:p-3">
      {/* Desktop: the card's colours glow behind the frame instead of a flat black page. */}
      <div className="pointer-events-none absolute inset-0 hidden sm:block" aria-hidden style={{ background: `radial-gradient(60% 70% at 30% 30%, ${theme.a}22, transparent 70%), radial-gradient(50% 60% at 75% 75%, ${theme.b}18, transparent 70%), #050507`, transition: "background 600ms ease" }} />
      <button aria-label="Previous card" onClick={() => go(-1)} disabled={i === 0}
        className="relative z-10 mr-5 hidden h-12 w-12 place-items-center rounded-full bg-white/10 text-xl text-white backdrop-blur transition hover:bg-white/20 disabled:opacity-0 sm:grid">‹</button>
      <div
        className="@container relative h-[100dvh] w-full overflow-hidden text-white sm:h-[calc(100dvh-24px)] sm:max-h-[1040px] sm:w-auto sm:aspect-[9/16] sm:rounded-[28px] sm:shadow-[0_30px_120px_rgba(0,0,0,0.6)] lg:aspect-auto lg:h-[min(820px,calc(100dvh-40px))] lg:w-[min(1280px,calc(100vw-180px))]"
        style={{ background: theme.bg, color: theme.ink, transition: "background 600ms ease" }}
      >
        <Glow a={theme.a} b={theme.b} k={card} />

        {/* progress */}
        <div className="absolute inset-x-0 top-0 z-20 flex gap-1 px-3 pt-3">
          {cards.map((c, n) => (
            <div key={c} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/25">
              <div
                key={n === i ? `${c}-on` : c}
                className="h-full bg-white"
                style={
                  n < i ? { width: "100%" } : n > i ? { width: 0 } :
                    { width: i === cards.length - 1 ? "100%" : 0, animation: i === cards.length - 1 ? undefined : `wrapped-fill ${CARD_MS}ms linear forwards`, animationPlayState: paused ? "paused" : "running" }
                }
              />
            </div>
          ))}
        </div>
        <div className="absolute inset-x-0 top-6 z-20 flex items-center justify-between px-4 pt-2">
          <Link href="/" className="font-display text-sm font-bold tracking-tight opacity-90">onchain<span className="opacity-60">wrapped</span></Link>
          <div className="flex items-center gap-2">
            <button aria-label="Share this card" onClick={() => setSheet(true)} className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold backdrop-blur hover:bg-white/25">Share</button>
            <Link href="/" aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full bg-white/15 text-sm backdrop-blur hover:bg-white/25">✕</Link>
          </div>
        </div>

        {/* card */}
        <div
          className="absolute inset-0 z-10 select-none"
          onPointerDown={(e) => { down.current = { x: e.clientX, t: Date.now() }; setHeld(true); }}
          onPointerUp={(e) => {
            setHeld(false);
            const d = down.current; down.current = null;
            if (!d) return;
            const dx = e.clientX - d.x;
            if (Math.abs(dx) > 50) return go(dx < 0 ? 1 : -1);
            if (Date.now() - d.t < 300) {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              go(e.clientX - r.left < r.width * 0.3 ? -1 : 1);
            }
          }}
          onPointerCancel={() => { setHeld(false); down.current = null; }}
        >
          <AnimatePresence mode="popLayout" custom={dir} initial={false}>
            <motion.section
              key={card}
              custom={dir}
              initial={{ opacity: 0, x: dir * 60, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: dir * -60, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 260, damping: 30 }}
              className={`absolute inset-0 flex flex-col px-6 pt-[72px] sm:px-7 @3xl:px-14 @3xl:pt-[84px] ${card === "summary" ? "pb-[196px] @3xl:pb-[120px]" : "pb-16"}`}
              aria-label={CARD_TITLE[card]}
            >
              <motion.div variants={stagger} initial="hidden" animate="show" className="flex min-h-0 flex-1 flex-col">
                <FitContent>
                  <ChartJobContext.Provider value={id}><Card s={s} ctx={ctx} /></ChartJobContext.Provider>
                </FitContent>
              </motion.div>
            </motion.section>
          </AnimatePresence>
        </div>

        {/* footer */}
        <div className="absolute inset-x-0 bottom-0 z-20 px-5 pb-5">
          {card === "summary" ? (
            <div className="space-y-3 @3xl:px-9">
              <div className="space-y-3 @3xl:flex @3xl:gap-3 @3xl:space-y-0">
                <button onClick={() => setSheet(true)} className="w-full rounded-2xl bg-white py-3.5 font-display text-base font-bold text-black active:scale-[0.98]">Share my Wrapped</button>
                <Link href="/" className="block w-full rounded-2xl border border-white/25 py-3 text-center text-sm font-semibold @3xl:py-3.5">Check another wallet</Link>
              </div>
              <Notes s={s} />
            </div>
          ) : (
            <div className="flex items-center justify-between text-xs">
              <span className="opacity-50">{periodLabel(s)} · estimates</span>
              <Link href="/" className="rounded-full bg-white/15 px-3 py-1.5 font-semibold backdrop-blur hover:bg-white/25">Get your own →</Link>
            </div>
          )}
        </div>

        <AnimatePresence>
          {sheet && <ShareSheet onClose={() => setSheet(false)} url={url} text={shareText(s, card)} image={`/api/og/${id}/${card}`} />}
        </AnimatePresence>
      </div>
      <button aria-label="Next card" onClick={() => go(1)} disabled={i === cards.length - 1}
        className="relative z-10 ml-5 hidden h-12 w-12 place-items-center rounded-full bg-white/10 text-xl text-white backdrop-blur transition hover:bg-white/20 disabled:opacity-0 sm:grid">›</button>
    </div>
  );
}

function Glow({ a, b, k }: { a: string; b: string; k: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <motion.div key={k + "a"} className="absolute -left-1/4 -top-1/4 h-[70%] w-[90%] rounded-full blur-3xl"
        style={{ background: a, opacity: 0.45 }} initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: [1, 1.15, 1], opacity: 0.45, x: [0, 30, 0] }}
        transition={{ default: { duration: 9, repeat: Infinity, ease: "easeInOut" }, opacity: { duration: 0.8 } }} />
      <motion.div key={k + "b"} className="absolute -bottom-1/4 -right-1/4 h-[60%] w-[80%] rounded-full blur-3xl"
        style={{ background: b, opacity: 0.3 }} initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: [1.1, 0.95, 1.1], opacity: 0.3, y: [0, -30, 0] }}
        transition={{ default: { duration: 11, repeat: Infinity, ease: "easeInOut" }, opacity: { duration: 0.8 } }} />
      <div className="absolute inset-0 bg-[radial-gradient(transparent_40%,rgba(0,0,0,0.35))]" />
    </div>
  );
}

function Notes({ s }: { s: WrappedStats }) {
  const lines = useMemo(() => {
    const l = [s.meta.note];
    if (s.meta.truncated && s.meta.txCap) l.push(`Very active wallet: we read the newest ${s.meta.txCap.toLocaleString()} transactions per wallet.`);
    return [...new Set([...l, ...(s.meta.notes ?? [])])];
  }, [s]);
  return (
    <details className="text-[11px] opacity-60" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
      <summary className="cursor-pointer text-center">About these numbers</summary>
      <ul className="mt-2 max-h-24 list-disc space-y-1 overflow-auto pl-4">{lines.map((x) => <li key={x}>{x}</li>)}</ul>
    </details>
  );
}

function ShareSheet({ onClose, url, text, image }: { onClose: () => void; url: string; text: string; image: string }) {
  const [copied, setCopied] = useState(false);
  const xUrl = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  const canShare = typeof navigator !== "undefined" && "share" in navigator;
  return (
    <motion.div className="absolute inset-0 z-30 flex items-end bg-black/60 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        role="dialog" aria-label="Share"
        className="w-full space-y-3 rounded-t-3xl bg-neutral-950 p-5 pb-7 text-white"
        initial={{ y: 300 }} animate={{ y: 0 }} exit={{ y: 300 }} transition={{ type: "spring", stiffness: 300, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-white/30" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="Share preview" className="aspect-[1200/630] w-full rounded-xl bg-white/5 object-cover" />
        <a href={xUrl} target="_blank" rel="noopener noreferrer" className="block rounded-2xl bg-white py-3.5 text-center font-display font-bold text-black">Post on X</a>
        <div className="grid grid-cols-3 gap-2 text-sm font-semibold">
          <button className="rounded-2xl bg-white/10 py-3" onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); }}>{copied ? "Copied" : "Copy link"}</button>
          <a className="rounded-2xl bg-white/10 py-3 text-center" href={image} download="onchain-wrapped.png">Save image</a>
          <button className="rounded-2xl bg-white/10 py-3 disabled:opacity-40" disabled={!canShare} onClick={() => navigator.share?.({ text, url }).catch(() => {})}>More</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-black p-6 text-center text-white">
      <div className="max-w-sm space-y-4">
        <div className="font-display text-3xl font-bold">That didn&apos;t work</div>
        <p className="opacity-75">{message}</p>
        <Link href="/" className="inline-block rounded-2xl bg-white px-6 py-3 font-semibold text-black">Try another wallet</Link>
      </div>
    </div>
  );
}
