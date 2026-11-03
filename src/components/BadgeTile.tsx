// One achievement tile (story card and the /badges page). No hooks.
import { ACHIEVEMENT_BY_ID, type AchievementDef } from "@/lib/achievements-catalog";
import { rarityLabel } from "./format";

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
