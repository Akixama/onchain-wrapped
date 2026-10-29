"use client";
// Candlestick chart for a trade, in the same visual language as Stock Steward's market chart:
// dark plot, faint grid, green/red candles, value axis on the right, time along the bottom,
// a tag for the latest value. Your buys (B) and sells (S) sit on the candles at their real time.
// Candles load here in the viewer's browser (own GeckoTerminal rate limit), cached per session.
import { motion } from "motion/react";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { TradeCard } from "@/lib/engine/stats";
import { fetchCandles, topPool, type Candle, type JsonFetcher } from "@/lib/gecko";
import { usd } from "../format";

const UP = "#37d4a0", DOWN = "#f06472", GRID = "rgba(255,255,255,0.08)", AXIS = "rgba(255,255,255,0.55)";

type Mark = { t: number; label: string; color: string };
type Loaded = { candles: Candle[]; interval: string } | "loading" | "none" | "too-old";


const browserGet: JsonFetcher = async (url) => {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

/** The result being viewed, so a chart can ask the server to rebuild candles from the chain. */
export const ChartJobContext = createContext<string | null>(null);

// Fewer candles than this in the trade's window means the chart site barely indexed the token.
const ENOUGH_CANDLES = 8;

function useCandles(card: TradeCard): Loaded {
  const jobId = useContext(ChartJobContext);
  const tooOld = !!card.window?.tooOld; // set by the server: past the free 180-day candle history
  const canRebuild = !!jobId && card.chain === "solana" && !!card.fills?.length;
  const initial: Loaded = card.chart?.candles?.length
    ? { candles: card.chart.candles, interval: card.chart.interval }
    : !card.window || card.address === "native" ? "none" : tooOld && !canRebuild ? "too-old" : "loading";
  const [state, setState] = useState<Loaded>(initial);
  useEffect(() => {
    if (state !== "loading" || !card.window) return;
    const key = `wrapped-candles2:${card.chain}:${card.address}:${card.window.start}:${card.window.end}`;
    let alive = true;
    (async () => {
      try {
        const cached = sessionStorage.getItem(key);
        if (cached) { if (alive) setState(JSON.parse(cached)); return; }
      } catch {}
      let best: Loaded = tooOld ? "too-old" : "none";
      if (!tooOld) {
        try {
          const pool = await topPool(browserGet, card.chain, card.address);
          if (pool) {
            const res = await fetchCandles(browserGet, card.chain, pool, card.address, card.window!.start, card.window!.end);
            if (res.candles.length >= 3) best = res;
          }
        } catch {}
      }
      // Thin or missing chart data (common for fresh pump.fun launches): rebuild it from the chain.
      if (canRebuild && (typeof best !== "object" || best.candles.length < ENOUGH_CANDLES)) {
        try {
          const res = await browserGet<{ candles: Candle[]; interval: string }>(`/api/chart/${jobId}?mint=${encodeURIComponent(card.address)}`);
          if (res.candles?.length >= 3 && (typeof best !== "object" || res.candles.length > best.candles.length)) best = res;
        } catch {}
      }
      try { sessionStorage.setItem(key, JSON.stringify(best)); } catch {}
      if (alive) setState(best);
    })();
    return () => { alive = false; };
  }, [state, card.chain, card.address, card.window, tooOld, canRebuild, jobId]);
  return state;
}

/** `cutoff` (unix s): hide everything after it — the time axis still spans the whole trade (chart game). */
export function TradeChart({ card, marks = [], height, cutoff }: { card: TradeCard; marks?: Mark[]; height?: number; cutoff?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const ro = new ResizeObserver((e) => setWidth(Math.max(220, Math.round(e[0].contentRect.width))));
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  const h = height ?? Math.round(Math.min(340, Math.max(170, width * 0.52)));

  const loaded = useCandles(card);
  const supply = card.supply ?? card.chart?.supply ?? null;
  const val = (p: number) => (supply ? p * supply : p); // plot market cap when we know the supply
  const fmt = (v: number) => (supply ? usd(v) : smallPrice(v));
  const allCandles = typeof loaded === "object" ? loaded.candles : [];
  const allFills = card.fills ?? [];
  const hasCandles = allCandles.length >= 3;
  const candles = cutoff ? allCandles.filter((c) => c[0] <= cutoff) : allCandles;
  const fills = cutoff ? allFills.filter((f) => f.t <= cutoff) : allFills;
  // A candle covers [open time, open time + its length); draw it in the middle of that slot, or
  // buys and sells (plotted at their exact second) sit to the right of the candle they belong to.
  const candleSec = hasCandles ? Math.min(...allCandles.slice(1).map((c, i) => c[0] - allCandles[i][0]).filter((d) => d > 0)) || 60 : 0;

  const geo = useMemo(() => {
    const left = 6, right = 62, top = 12, bottom = 22;
    const pw = width - left - right, ph = h - top - bottom;
    // Time axis: the whole trade even when the end is hidden; price axis: only what's visible (no spoilers).
    const times = [...(hasCandles ? allCandles.flatMap((c) => [c[0], c[0] + candleSec]) : []), ...allFills.map((f) => f.t)];
    const t0 = Math.min(...times), t1 = Math.max(...times, t0 + 60);
    const fillValues = fills.map((f) => val(f.price)).filter((v) => v > 0);
    // Scale to candle bodies + your fills; extreme one-candle wicks would flatten everything else.
    const bodies = candles.length ? candles.flatMap((c) => [val(c[1]), val(c[4])]) : fillValues;
    let lo = Math.min(...bodies, ...fillValues), hi = Math.max(...bodies, ...fillValues);
    if (!(hi > lo)) { hi = hi * 1.1 || 1; lo = lo * 0.9; }
    const pad = (hi - lo) * 0.12;
    lo = Math.max(0, lo - pad); hi += pad;
    const x = (t: number) => left + ((t - t0) / (t1 - t0)) * pw;
    const y = (v: number) => top + ((hi - Math.min(hi, Math.max(lo, v))) / (hi - lo)) * ph;
    const step = hasCandles ? (candleSec / (t1 - t0)) * pw : 0;
    return { left, right, top, ph, x, y, lo, hi, t0, t1, step };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, h, hasCandles, candles, fills, allCandles, allFills, supply, candleSec]);

  if (loaded === "loading") {
    return (
      <div ref={ref} className="w-full rounded-2xl border border-white/10 bg-black/35 p-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">Loading chart…</div>
        <div className="animate-pulse rounded-lg bg-white/[0.06]" style={{ height: h - 30 }} />
      </div>
    );
  }
  if (!hasCandles && fills.length < (cutoff ? 1 : 2)) return <div ref={ref} />;

  const { left, right, top, ph, x, y, lo, hi, t0, t1, step } = geo;
  const last = candles.length ? val(candles[candles.length - 1][4]) : val(fills[fills.length - 1].price);
  const ticks = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * i) / 3);
  const span = t1 - t0;
  const timeFmt = (t: number) =>
    new Date(t * 1000).toLocaleString("en-US", span < 2 * 86400 ? { hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric" });
  const bw = Math.max(1.5, Math.min(10, step * 0.7));
  const many = fills.length > 14;
  // Fallback labels: skip any that would land on top of an earlier one.
  const placed: { x: number; y: number }[] = [];
  const labelAt = (lx: number, ly: number) => {
    if (placed.some((p) => Math.abs(p.x - lx) < 46 && Math.abs(p.y - ly) < 14)) return false;
    placed.push({ x: lx, y: ly });
    return true;
  };
  const interval = typeof loaded === "object" ? loaded.interval : "";

  return (
    <div ref={ref} className="w-full rounded-2xl border border-white/10 bg-black/35 p-2 backdrop-blur-sm">
      <div className="flex items-center justify-between px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">
        <span>{supply ? "Market cap" : "Price"}{interval ? ` · ${interval}` : ""}</span>
        <span className="flex gap-3">
          <span><i className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: UP }} />Buy</span>
          <span><i className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: DOWN }} />Sell</span>
        </span>
      </div>
      <svg width="100%" viewBox={`0 0 ${width} ${h}`} role="img" aria-label={`${card.symbol} ${supply ? "market cap" : "price"} with your buys and sells`}>
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={left} x2={width - right + 4} y1={y(v)} y2={y(v)} stroke={GRID} />
            {/* The latest-value tag wins over an axis label it would cover. */}
            {Math.abs(y(v) - y(last)) >= 14 && <text x={width - right + 8} y={y(v) + 3.5} fill={AXIS} fontSize="10" fontFamily="ui-monospace, monospace">{fmt(v)}</text>}
          </g>
        ))}
        {[t0, (t0 + t1) / 2, t1].map((t, i) => (
          <text key={i} x={x(t)} y={h - 6} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"} fill={AXIS} fontSize="10">{timeFmt(t)}</text>
        ))}
        {cutoff && (
          <rect x={x(cutoff)} y={top} width={Math.max(0, width - right - x(cutoff))} height={ph} fill="rgba(255,255,255,0.04)" />
        )}
        {cutoff && <text x={(x(cutoff) + width - right) / 2} y={top + ph / 2} textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize="13" fontWeight="700">?</text>}
        {hasCandles
          ? candles.map((c, i) => {
              const o = val(c[1]), hh = val(c[2]), l = val(c[3]), cl = val(c[4]);
              const color = cl >= o ? UP : DOWN;
              const cx = x(c[0] + candleSec / 2);
              const yt = y(Math.max(o, cl)), yb = y(Math.min(o, cl));
              return (
                <motion.g key={c[0]} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 + (i / candles.length) * 0.5 }}>
                  <line x1={cx} x2={cx} y1={y(hh)} y2={y(l)} stroke={color} strokeWidth="1" />
                  <rect x={cx - bw / 2} y={yt} width={bw} height={Math.max(1.5, yb - yt)} fill={color} />
                </motion.g>
              );
            })
          : (
            <motion.polyline
              points={fills.flatMap((f, i) => (i ? [`${x(f.t)},${y(val(fills[i - 1].price))}`, `${x(f.t)},${y(val(f.price))}`] : [`${x(f.t)},${y(val(f.price))}`])).join(" ")}
              fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" strokeDasharray="4 4"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1 }}
            />
          )}
        {marks.map((m) => (
          <g key={m.label + m.t}>
            <line x1={x(m.t)} x2={x(m.t)} y1={top} y2={top + ph} stroke={m.color} strokeDasharray="3 4" opacity=".7" />
            <text x={Math.min(x(m.t) + 4, width - right - 50)} y={top + 10} fill={m.color} fontSize="10" fontWeight="700">{m.label}</text>
          </g>
        ))}
        {fills.map((f, i) => {
          const fx = x(f.t), fy = y(val(f.price)), c = f.side === "buy" ? UP : DOWN;
          return many ? (
            <circle key={i} cx={fx} cy={fy} r={2.8} fill={c} stroke="#0b0b0f" strokeWidth="1" />
          ) : (
            <g key={i}>
              <circle cx={fx} cy={fy} r={7} fill={c} stroke="#0b0b0f" strokeWidth="1.5" />
              <text x={fx} y={fy + 3.3} textAnchor="middle" fontSize="9" fontWeight="800" fill="#0b0b0f">{f.side === "buy" ? "B" : "S"}</text>
              {!hasCandles && (() => {
                const lx = Math.min(Math.max(fx, left + 24), width - right - 26), ly = fy > top + 24 ? fy - 12 : fy + 20;
                return labelAt(lx, ly) ? <text x={lx} y={ly} textAnchor="middle" fontSize="10" fontWeight="700" fill="rgba(255,255,255,0.85)">{fmt(val(f.price))}</text> : null;
              })()}
            </g>
          );
        })}
        <line x1={left} x2={width - right + 4} y1={y(last)} y2={y(last)} stroke="#b7c4ff" strokeDasharray="3 4" opacity=".6" />
        <rect x={width - right + 4} y={y(last) - 9} width={right - 6} height="18" rx="3" fill="#d6dcff" />
        <text x={width - right + 8} y={y(last) + 3.5} fill="#101116" fontSize="10" fontWeight="700">{fmt(last)}</text>
      </svg>
      {!hasCandles && (
        <p className="px-1 pt-1 text-[10px] text-white/50">
          {loaded === "too-old"
            ? "This trade is older than 180 days, beyond the free chart data — showing your actual buys and sells."
            : "No candle data for this token — showing your actual buys and sells."}
        </p>
      )}
    </div>
  );
}

function smallPrice(p: number) {
  return "$" + new Intl.NumberFormat("en-US", { maximumSignificantDigits: 2, maximumFractionDigits: 12 }).format(p);
}
