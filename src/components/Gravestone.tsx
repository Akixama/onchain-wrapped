// Shared pieces for the graveyard and achievements (story cards and their standalone pages). No hooks.
import type { Grave } from "@/lib/engine/graveyard";
import { CAUSE_EMOJI, CAUSE_LABEL } from "@/lib/engine/graveyard-labels";
import { ACHIEVEMENT_BY_ID, type AchievementDef } from "@/lib/achievements-catalog";
import { rarityLabel, usd } from "./format";

const date = (ts: number, year = true) => new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year ? { year: "2-digit" as const } : {}), timeZone: "UTC" });

export function Gravestone({ g, compact = false }: { g: Grave; compact?: boolean }) {
  return (
    <div className={`relative flex flex-col items-center rounded-t-[999px] border border-white/15 bg-gradient-to-b from-slate-400/25 to-slate-700/20 text-center shadow-[inset_0_2px_0_rgba(255,255,255,0.12)] ${compact ? "px-3 pb-3 pt-6" : "px-5 pb-5 pt-9"}`}>
      <div className={`font-display font-bold tracking-tight ${compact ? "text-lg" : "text-2xl"}`}>RIP ${g.symbol.slice(0, 12)}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wider opacity-60">
        {date(g.bornTs, !compact)} – {g.diedExact ? "" : "~"}{date(g.diedTs, !compact)}
      </div>
      <div className={`mt-2 tabular-nums ${compact ? "text-xs" : "text-sm"}`}>
        Buried <b>{usd(g.putInUsd)}</b> · got back <b>{usd(g.gotOutUsd)}</b>
      </div>
      <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-black/30 px-2 py-0.5 text-[11px]">
        {CAUSE_EMOJI[g.cause]} {CAUSE_LABEL[g.cause]}
      </div>
      {!compact && <p className="mt-3 text-sm italic leading-snug opacity-85">&ldquo;{g.epitaph}&rdquo;</p>}
      <div className="absolute inset-x-0 -bottom-1 h-2 rounded-full bg-emerald-900/50" />
    </div>
  );
}

export function BadgeTile({ id, detail, pct, locked = false }: { id: string; detail?: string; pct?: Record<string, number> | null; locked?: boolean }) {
  const a: AchievementDef = ACHIEVEMENT_BY_ID[id];
  if (locked) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-3 text-center">
        <div className="text-3xl opacity-40 grayscale brightness-0 invert-[.35]">{a.emoji}</div>
        <div className="mt-1 text-sm font-semibold opacity-40">???</div>
        <div className="text-[11px] leading-tight opacity-40">{a.desc}</div>
      </div>
    );
  }
  const glow = { legendary: "border-amber-300/60 bg-amber-300/10", epic: "border-fuchsia-300/50 bg-fuchsia-300/10", rare: "border-sky-300/40 bg-sky-300/10", common: "border-white/15 bg-white/[0.06]" }[a.tier];
  return (
    <div className={`flex flex-col items-center rounded-2xl border p-3 text-center ${glow}`}>
      <div className="text-3xl">{a.emoji}</div>
      <div className="mt-1 text-sm font-semibold leading-tight">{a.name}</div>
      {detail && <div className="text-[11px] leading-tight opacity-70">{detail}</div>}
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider opacity-60">{rarityLabel(id, pct)}</div>
    </div>
  );
}
