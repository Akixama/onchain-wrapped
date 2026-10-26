"use client";
// Candlestick chart for a trade, in the same visual language as Stock Steward's market chart:
// dark plot, faint grid, green/red candles, value axis on the right, time along the bottom,
// a tag for the latest value. Your buys (B) and sells (S) sit on the candles at their real time.
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { TradeCard } from "@/lib/engine/stats";
import { usd } from "../format";

const UP = "#37d4a0", DOWN = "#f06472", GRID = "rgba(255,255,255,0.08)", AXIS = "rgba(255,255,255,0.55)";

type Mark = { t: number; label: string; color: string };

export function TradeChart({ card, marks = [], height = 190 }: { card: TradeCard; marks?: Mark[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const ro = new ResizeObserver((e) => setWidth(Math.max(220, Math.round(e[0].contentRect.width))));
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const supply = card.chart?.supply ?? null;
  const val = (p: number) => (supply ? p * supply : p); // plot market cap when we know the supply
  const fmt = (v: number) => (supply ? usd(v) : smallPrice(v));
  const candles = card.chart?.candles ?? [];
  const fills = card.fills ?? [];
  const hasCandles = candles.length >= 3;

  const geo = useMemo(() => {
    const left = 6, right = 58, top = 12, bottom = 22;
    const pw = width - left - right, ph = height - top - bottom;
    const times = hasCandles ? candles.map((c) => c[0]) : fills.map((f) => f.t);
    const fillTimes = fills.map((f) => f.t);
    const t0 = Math.min(...times, ...fillTimes), t1 = Math.max(...times, ...fillTimes, t0 + 1);
    const values = hasCandles ? candles.flatMap((c) => [val(c[2]), val(c[3])]) : fills.map((f) => val(f.price));
    const fillValues = fills.map((f) => val(f.price)).filter((v) => v > 0);
    // Scale to the candles' closes/bodies + your fills; ignore extreme wicks so the chart stays readable.
    const bodies = hasCandles ? candles.flatMap((c) => [val(c[1]), val(c[4])]) : values;
    let lo = Math.min(...bodies, ...fillValues), hi = Math.max(...bodies, ...fillValues);
    if (!(hi > lo)) { hi = hi * 1.1 || 1; lo = lo * 0.9; }
    const pad = (hi - lo) * 0.12;
    lo = Math.max(0, lo - pad); hi += pad;
    const x = (t: number) => left + ((t - t0) / (t1 - t0)) * pw;
    const y = (v: number) => top + ((hi - Math.min(hi, Math.max(lo, v))) / (hi - lo)) * ph;
    const step = hasCandles ? pw / candles.length : 0;
    return { left, right, top, bottom, pw, ph, x, y, lo, hi, t0, t1, step };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, hasCandles, candles, fills, supply]);

  if (!hasCandles && fills.length < 2) return null;
  const { left, right, top, ph, x, y, lo, hi, t0, t1, step } = geo;
  const last = hasCandles ? val(candles[candles.length - 1][4]) : val(fills[fills.length - 1].price);
  const ticks = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * i) / 3);
  const span = t1 - t0;
  const timeFmt = (t: number) =>
    new Date(t * 1000).toLocaleString("en-US", span < 2 * 86400 ? { hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric" });
  const bw = Math.max(1.5, Math.min(9, step * 0.7));
  const many = fills.length > 14;

  return (
    <div ref={ref} className="w-full rounded-2xl border border-white/10 bg-black/35 p-2 backdrop-blur-sm">
      <div className="flex items-center justify-between px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">
        <span>{supply ? "Market cap" : "Price"}{hasCandles ? ` · ${card.chart!.interval}` : ""}</span>
        <span className="flex gap-3">
          <span><i className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: UP }} />Buy</span>
          <span><i className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: DOWN }} />Sell</span>
        </span>
      </div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${card.symbol} ${supply ? "market cap" : "price"} with your buys and sells`}>
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={left} x2={width - right + 4} y1={y(v)} y2={y(v)} stroke={GRID} />
            <text x={width - right + 8} y={y(v) + 3.5} fill={AXIS} fontSize="10" fontFamily="var(--font-mono, ui-monospace)">{fmt(v)}</text>
          </g>
        ))}
        {[t0, (t0 + t1) / 2, t1].map((t, i) => (
          <text key={i} x={x(t)} y={height - 6} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"} fill={AXIS} fontSize="10">{timeFmt(t)}</text>
        ))}
        {hasCandles
          ? candles.map((c, i) => {
              const o = val(c[1]), h = val(c[2]), l = val(c[3]), cl = val(c[4]);
              const color = cl >= o ? UP : DOWN;
              const cx = x(c[0]) + 0;
              const yt = y(Math.max(o, cl)), yb = y(Math.min(o, cl));
              return (
                <motion.g key={c[0]} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 + (i / candles.length) * 0.6 }}>
                  <line x1={cx} x2={cx} y1={y(h)} y2={y(l)} stroke={color} strokeWidth="1" />
                  <rect x={cx - bw / 2} y={yt} width={bw} height={Math.max(1.5, yb - yt)} fill={color} />
                </motion.g>
              );
            })
          : (
            <motion.polyline
              points={fills.map((f) => `${x(f.t)},${y(val(f.price))}`).join(" ")}
              fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" strokeDasharray="4 4"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1 }}
            />
          )}
        {marks.map((m) => (
          <g key={m.label + m.t}>
            <line x1={x(m.t)} x2={x(m.t)} y1={top} y2={top + ph} stroke={m.color} strokeDasharray="3 4" opacity=".7" />
            <text x={Math.min(x(m.t) + 4, width - right - 40)} y={top + 10} fill={m.color} fontSize="10" fontWeight="700">{m.label}</text>
          </g>
        ))}
        {fills.map((f, i) => {
          const fx = x(f.t), fy = y(val(f.price)), c = f.side === "buy" ? UP : DOWN;
          return many ? (
            <circle key={i} cx={fx} cy={fy} r={2.6} fill={c} stroke="#0b0b0f" strokeWidth="1" />
          ) : (
            <motion.g key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.9 + i * 0.05 }} style={{ transformOrigin: `${fx}px ${fy}px` }}>
              <circle cx={fx} cy={fy} r={7} fill={c} stroke="#0b0b0f" strokeWidth="1.5" />
              <text x={fx} y={fy + 3.3} textAnchor="middle" fontSize="9" fontWeight="800" fill="#0b0b0f">{f.side === "buy" ? "B" : "S"}</text>
            </motion.g>
          );
        })}
        <line x1={left} x2={width - right + 4} y1={y(last)} y2={y(last)} stroke="#b7c4ff" strokeDasharray="3 4" opacity=".6" />
        <rect x={width - right + 4} y={y(last) - 9} width={right - 6} height="18" rx="3" fill="#d6dcff" />
        <text x={width - right + 8} y={y(last) + 3.5} fill="#101116" fontSize="10" fontWeight="700">{fmt(last)}</text>
      </svg>
      {!hasCandles && <p className="px-1 pt-1 text-[10px] text-white/50">No price history for this period — showing your own trade prices.</p>}
    </div>
  );
}

function smallPrice(p: number) {
  return "$" + new Intl.NumberFormat("en-US", { maximumSignificantDigits: 2, maximumFractionDigits: 12 }).format(p);
}
