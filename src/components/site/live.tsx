"use client";
// One shared poll of /api/site for every live piece on the page (header chip, hero numbers, feed).
import { useEffect, useState, useSyncExternalStore } from "react";
import type { FeedItem, SiteStats } from "@/lib/sitestats";
import { num, usd } from "@/components/format";
import { StatusBadge } from "./StatusBadge";

let state: SiteStats | null = null;
const subs = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

async function poll() {
  try {
    const r = await fetch("/api/site", { cache: "no-store" });
    if (!r.ok) return;
    const next = (await r.json()) as SiteStats;
    const newest = state?.recent[0]?.t ?? 0;
    if (state && (next.recent[0]?.t ?? 0) > newest) window.dispatchEvent(new Event("wrap:new"));
    state = next;
    subs.forEach((f) => f());
  } catch { /* keep the last numbers */ }
}

function subscribe(f: () => void) {
  subs.add(f);
  if (!timer) { void poll(); timer = setInterval(poll, 20_000); }
  return () => { subs.delete(f); if (!subs.size && timer) { clearInterval(timer); timer = null; } };
}

export function useSite(): SiteStats | null {
  return useSyncExternalStore(subscribe, () => state, () => null);
}

/** Re-render every `ms` so "4m ago" stays true. */
function useNow(ms = 15_000) {
  const [now, setNow] = useState(0);
  useEffect(() => { const f = () => setNow(Date.now()); f(); const t = setInterval(f, ms); return () => clearInterval(t); }, [ms]);
  return now;
}

export function ago(t: number, now: number) {
  if (!now) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

const TF: Record<string, string> = { "1m": "30 days", "3m": "3 months", "6m": "6 months", "12m": "12 months", custom: "custom dates" };

/** Three big numbers, no boxes. */
export function LiveNumbers({ className = "" }: { className?: string }) {
  const s = useSite();
  const now = useNow();
  const lastT = s?.recent[0]?.t;
  const items: [string, string][] = [
    [s ? num(s.lookups) : "—", "wallets wrapped"],
    [s ? num(s.trades) : "—", "trades read"],
    [lastT ? ago(lastT, now) : "—", "since the last wrap"],
  ];
  return (
    <div className={`grid grid-cols-3 divide-x divide-line ${className}`}>
      {items.map(([v, k]) => (
        <div key={k} className="px-3 text-center sm:px-8">
          <div className="whitespace-nowrap font-mono text-[26px] font-medium leading-none tabular-nums tracking-[-0.02em] sm:text-[44px]">{v}</div>
          <div className="mt-2 text-xs text-fg-3 sm:text-sm">{k}</div>
        </div>
      ))}
    </div>
  );
}

/** Header chip: total wraps with a live pulse. */
export function LiveChip() {
  const s = useSite();
  return (
    <span className="hidden items-center gap-2 whitespace-nowrap rounded-lg border border-line bg-ink-2 px-3 py-1.5 font-mono text-xs text-fg-2 xl:inline-flex">
      <StatusBadge kind="live" />
      {s ? `${num(s.lookups)} wrapped` : "live"}
    </span>
  );
}

/** Recent finished lookups. Only the trader type, size and when: never the wallet. */
export function RecentWraps({ limit = 6 }: { limit?: number }) {
  const s = useSite();
  const now = useNow();
  const items = (s?.recent ?? []).filter((r) => r.trades > 0).slice(0, limit);
  if (!s) return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: limit }, (_, i) => <div key={i} className="h-[104px] rounded-2xl border border-line bg-ink-2" />)}</div>;
  if (!items.length) return <p className="text-fg-2">No wraps yet today. Be the first →</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((r, i) => <WrapCard key={r.id} r={r} now={now} fresh={i === 0 && now - r.t < 10 * 60_000} />)}
    </div>
  );
}

function WrapCard({ r, now, fresh }: { r: FeedItem; now: number; fresh: boolean }) {
  return (
    <div className={`rise-in rounded-2xl border bg-ink-2 p-4 ${fresh ? "border-[rgb(238_240_245/0.22)]" : "border-line"}`}>
      <div className="flex items-center justify-between text-xs text-fg-3">
        <span className="inline-flex items-center gap-1.5"><StatusBadge kind="done" />Wrapped · {TF[r.tf] ?? r.tf}</span>
        <span className="font-mono">{ago(r.t, now)}</span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-display text-lg font-semibold">{r.title}</div>
          <div className="font-mono text-xs text-fg-3">{num(r.trades)} trades{r.pump ? ` · ${num(r.pump)} pump.fun coins` : ""}</div>
        </div>
        <div className={`shrink-0 font-mono text-lg tabular-nums ${r.pnl >= 0 ? "text-pos" : "text-neg"}`}>{usd(r.pnl, { sign: true })}</div>
      </div>
    </div>
  );
}
