"use client";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

const onVisibility = (cb: () => void) => {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
};

export const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.14, delayChildren: 0.15 } },
};
export const rise = {
  hidden: { opacity: 0, y: 24, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { type: "spring" as const, stiffness: 140, damping: 18 } },
};
export const pop = {
  hidden: { opacity: 0, scale: 0.6 },
  show: { opacity: 1, scale: 1, transition: { type: "spring" as const, stiffness: 180, damping: 14 } },
};

export function Kicker({ children }: { children: ReactNode }) {
  return (
    <motion.p variants={rise} className="text-[13px] font-semibold uppercase tracking-[0.22em] opacity-70">
      {children}
    </motion.p>
  );
}

export function Line({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={rise} className={className}>
      {children}
    </motion.div>
  );
}

export function Big({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={pop} className={`font-display font-bold leading-[0.92] tracking-tight ${className}`}>
      {children}
    </motion.div>
  );
}

/** Animated number. `format` turns the in-between values into text. */
export function CountUp({ value, format, duration = 1.1 }: { value: number; format: (n: number) => string; duration?: number }) {
  const reduce = useReducedMotion();
  // No animation for reduced motion, or when the page isn't visible (timers are throttled there).
  const visible = useSyncExternalStore(onVisibility, () => document.visibilityState === "visible", () => true);
  const instant = !!reduce || !visible;
  const [v, setV] = useState(0);
  useEffect(() => {
    if (instant) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / (duration * 1000));
      const eased = 1 - Math.pow(1 - k, 3);
      setV(value * eased);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    const start = setTimeout(() => (raf = requestAnimationFrame(tick)), 250);
    // rAF pauses in background tabs; always land on the real number.
    const done = setTimeout(() => setV(value), 250 + duration * 1000 + 100);
    return () => { clearTimeout(start); clearTimeout(done); cancelAnimationFrame(raf); };
  }, [value, duration, instant]);
  return <span className="tabular-nums">{format(instant ? value : v)}</span>;
}

export function Chip({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[13px] font-medium backdrop-blur"
    >
      {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
      {children}
    </span>
  );
}

export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <motion.div variants={rise} className="rounded-2xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur-sm">
      <div className="text-[12px] font-medium uppercase tracking-wider opacity-60">{label}</div>
      <div className="mt-1 font-display text-2xl font-bold tabular-nums">{children}</div>
    </motion.div>
  );
}

/** Entry -> peak -> exit price arc, drawn in. Labels sit in a row below so tiny prices never collide. */
export function Arc({ points, color }: { points: { label: string; sub?: string; value: number }[]; color: string }) {
  const w = 300, h = 120, pad = 14;
  const max = Math.max(...points.map((p) => p.value), 1e-18);
  const xs = points.map((_, i) => pad + (i * (w - pad * 2)) / Math.max(1, points.length - 1));
  const ys = points.map((p) => h - pad - (p.value / max) * (h - pad * 2));
  const d = xs.map((x, i) => `${i ? "L" : "M"}${x},${ys[i]}`).join(" ");
  return (
    <motion.div variants={rise}>
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full overflow-visible">
      <motion.path
        d={d} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, delay: 0.5, ease: "easeInOut" }}
      />
      {points.map((p, i) => (
        <motion.circle key={p.label} cx={xs[i]} cy={ys[i]} r={6} fill={color} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.5 + i * 0.4 }} />
      ))}
    </svg>
    <div className="mt-1 flex justify-between gap-2 text-[11px] leading-tight">
      {points.map((p, i) => (
        <div key={p.label} className={i === 0 ? "text-left" : i === points.length - 1 ? "text-right" : "text-center"}>
          <div className="uppercase tracking-wider opacity-60">{p.label}</div>
          {p.sub && <div className="font-semibold tabular-nums opacity-90">{p.sub}</div>}
        </div>
      ))}
    </div>
    </motion.div>
  );
}

/**
 * Keeps a card inside its frame on any screen: measures the content and scales it down (never up)
 * until it fits the space above the footer. Children keep their normal flex layout.
 */
export function FitContent({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ k: 1, h: 0 });
  useLayoutEffect(() => {
    const o = outer.current, i = inner.current;
    if (!o || !i) return;
    const measure = () => {
      const avail = o.clientHeight;
      let need = 0;
      for (const c of Array.from(i.children) as HTMLElement[]) need += c.offsetHeight;
      need += 28; // breathing room between kicker and body
      const k = need > avail ? Math.max(0.5, avail / need) : 1;
      // Ignore tiny changes (count-up digits, chart loading) so the card never jitters.
      setFit((f) => (Math.abs(f.k - k) < 0.03 && f.h === avail ? f : { k, h: avail }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(o);
    for (const c of Array.from(i.children)) ro.observe(c);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={outer} className="relative min-h-0 flex-1">
      <div
        ref={inner}
        className="absolute left-0 top-0 flex flex-col"
        style={{ transform: `scale(${fit.k})`, transformOrigin: "top center", width: "100%", height: fit.h ? fit.h / fit.k : "100%" }}
      >
        {children}
      </div>
    </div>
  );
}

/** One-line headline number that shrinks to fit the card width instead of wrapping. */
export function BigNumber({ children, className = "", color }: { children: ReactNode; className?: string; color?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  const [k, setK] = useState(1);
  useLayoutEffect(() => {
    const b = box.current, t = text.current;
    if (!b || !t) return;
    const measure = () => {
      const kk = t.scrollWidth > b.clientWidth ? b.clientWidth / t.scrollWidth : 1;
      setK((x) => (Math.abs(x - kk) < 0.01 ? x : kk));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(b);
    ro.observe(t);
    return () => ro.disconnect();
  }, []);
  return (
    <motion.div variants={pop} ref={box} className={`w-full overflow-visible font-display font-bold leading-[0.95] tracking-tight ${className}`}>
      <span ref={text} className="inline-block whitespace-nowrap" style={{ transform: `scale(${k})`, transformOrigin: "left center", color }}>
        {children}
      </span>
    </motion.div>
  );
}
