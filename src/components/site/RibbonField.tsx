"use client";
// The hero object: trades stream in along lanes and get tied into the four-loop ribbon (the logo),
// which is what a lookup does. Each real new wrap (from the live feed) sends a pulse through the knot.
import { useEffect, useRef } from "react";

type Variant = "center" | "side";
const CREAM = [251, 238, 228], CORAL = [242, 165, 142], WIN = [76, 195, 138], LOSS = [229, 72, 77];

export function RibbonField({ variant = "center", className = "" }: { variant?: Variant; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, dpr = 1, raf = 0, visible = true, last = performance.now(), t = 0;
    let pulse = 0; // 0..1, set to 1 by a real new wrap
    const side = variant === "side";

    // Lanes: quadratic curves from the edges into the knot.
    type Lane = { x0: number; y0: number; cx: number; cy: number };
    let lanes: Lane[] = [];
    let knot = { x: 0, y: 0, r: 0 };
    type Tick = { lane: number; p: number; v: number; c: number[] };
    let ticks: Tick[] = [];

    const layout = () => {
      const r = cv.getBoundingClientRect();
      w = r.width; h = r.height; dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const small = w < 640;
      knot = side
        ? { x: w * (small ? 0.86 : 0.78), y: h * 0.5, r: Math.min(small ? 56 : 120, h * 0.24) }
        : { x: w * 0.5, y: h * (small ? 0.92 : 0.9), r: Math.min(small ? 40 : 56, h * 0.07) };
      const n = small ? 8 : 12;
      lanes = [];
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n;
        if (side) {
          lanes.push({ x0: -20, y0: h * (0.05 + 0.9 * f), cx: knot.x - w * 0.25, cy: h * (0.2 + 0.6 * f) });
        } else {
          const left = i % 2 === 0;
          const k = Math.floor(i / 2) / (n / 2);
          lanes.push({ x0: left ? -20 : w + 20, y0: h * (0.12 + 0.7 * k), cx: left ? w * 0.22 : w * 0.78, cy: knot.y - h * 0.05 });
        }
      }
      ticks = [];
    };

    const at = (l: Lane, p: number) => {
      const q = 1 - p;
      return { x: q * q * l.x0 + 2 * q * p * l.cx + p * p * knot.x, y: q * q * l.y0 + 2 * q * p * l.cy + p * p * knot.y };
    };

    const spawn = () => {
      const roll = Math.random();
      ticks.push({ lane: Math.floor(Math.random() * lanes.length), p: 0, v: 0.08 + Math.random() * 0.08, c: roll < 0.18 ? WIN : roll < 0.36 ? LOSS : CREAM });
    };

    // One petal of the ribbon: out from the centre gap and back, along angle a.
    const petal = (a: number, R: number, twist: number) => {
      const pts: { x: number; y: number; wd: number }[] = [];
      const gap = R * 0.16;
      for (let s = 0; s <= 48; s++) {
        const th = -Math.PI / 4 + (s / 48) * (Math.PI / 2);
        const r = gap + R * Math.pow(Math.max(0, Math.cos(2 * th)), 0.75) * 0.84;
        const ang = a + th * 0.92;
        pts.push({ x: Math.cos(ang) * r, y: Math.sin(ang) * r, wd: 0.25 + 0.75 * Math.abs(Math.cos(th * 2.2 + twist)) });
      }
      return pts;
    };

    const drawKnot = () => {
      const { x, y, r } = knot;
      const glow = 0.35 + pulse * 0.5;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
      g.addColorStop(0, `rgba(242,165,142,${0.12 * glow})`);
      g.addColorStop(0.45, `rgba(242,165,142,${0.04 * glow})`);
      g.addColorStop(1, "rgba(242,165,142,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r * 3, 0, Math.PI * 2); ctx.fill();
      const rot = t * 0.08;
      const scale = 1 + pulse * 0.06;
      for (let k = 0; k < 4; k++) {
        const pts = petal(rot + k * (Math.PI / 2) - Math.PI / 2, r * scale, t * 0.6 + k);
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i];
          const f = i / pts.length;
          const c = CREAM.map((v, j) => Math.round(v + (CORAL[j] - v) * Math.sin(f * Math.PI) * 0.8));
          const lw = Math.max(1, r * 0.2 * b.wd);
          ctx.strokeStyle = `rgba(30,8,50,0.55)`; ctx.lineWidth = lw + 2; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(x + a.x, y + a.y + 1.5); ctx.lineTo(x + b.x, y + b.y + 1.5); ctx.stroke();
          ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.55 + 0.45 * b.wd})`; ctx.lineWidth = lw;
          ctx.beginPath(); ctx.moveTo(x + a.x, y + a.y); ctx.lineTo(x + b.x, y + b.y); ctx.stroke();
        }
      }
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!still) t += dt;
      ctx.clearRect(0, 0, w, h);
      // lanes
      ctx.lineWidth = 1;
      for (const l of lanes) {
        ctx.strokeStyle = side ? "rgba(238,240,245,0.05)" : "rgba(238,240,245,0.07)";
        ctx.beginPath(); ctx.moveTo(l.x0, l.y0); ctx.quadraticCurveTo(l.cx, l.cy, knot.x, knot.y); ctx.stroke();
      }
      // ticks: trades travelling in
      if (!still && Math.random() < dt * (side ? 9 : 16)) spawn();
      for (const k of ticks) {
        k.p += k.v * dt * (1 + k.p * 1.6);
        const a = at(lanes[k.lane], Math.min(1, k.p)), b = at(lanes[k.lane], Math.max(0, k.p - 0.025));
        const fade = Math.min(1, k.p * 6) * (1 - Math.max(0, (k.p - 0.9) * 10));
        ctx.strokeStyle = `rgba(${k.c[0]},${k.c[1]},${k.c[2]},${0.85 * fade})`;
        ctx.lineWidth = 2; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(a.x, a.y); ctx.stroke();
      }
      const before = ticks.length;
      ticks = ticks.filter((k) => k.p < 1);
      if (ticks.length < before) pulse = Math.min(1, pulse + 0.04 * (before - ticks.length));
      drawKnot();
      // a real new wrap: a ring runs out of the knot
      if (pulse > 0.5) {
        const rr = knot.r * (1.2 + (1 - pulse) * 4);
        ctx.strokeStyle = `rgba(251,238,228,${(pulse - 0.5) * 0.6})`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(knot.x, knot.y, rr, 0, Math.PI * 2); ctx.stroke();
      }
      pulse = Math.max(0, pulse - dt * 0.6);
      if (visible && !still) raf = requestAnimationFrame(frame);
    };

    layout();
    if (still) { for (let i = 0; i < 24; i++) { spawn(); ticks[i].p = Math.random() * 0.9; } }
    raf = requestAnimationFrame(frame);
    const ro = new ResizeObserver(() => { layout(); if (still) frame(performance.now()); });
    ro.observe(cv);
    const io = new IntersectionObserver(([e]) => {
      const was = visible;
      visible = e.isIntersecting && !document.hidden;
      if (visible && !was && !still) { last = performance.now(); raf = requestAnimationFrame(frame); }
    });
    io.observe(cv);
    const onWrap = () => { pulse = 1; };
    window.addEventListener("wrap:new", onWrap);
    const onVis = () => { const was = visible; visible = !document.hidden; if (visible && !was && !still) { last = performance.now(); raf = requestAnimationFrame(frame); } };
    document.addEventListener("visibilitychange", onVis);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); window.removeEventListener("wrap:new", onWrap); document.removeEventListener("visibilitychange", onVis); };
  }, [variant]);

  return <canvas ref={ref} aria-hidden className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} />;
}
