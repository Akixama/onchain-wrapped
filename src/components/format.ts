// Shared by the story UI and the OG images (no React, no DOM).
import type { CardId, TradeCard, WrappedStats } from "@/lib/engine/stats";
import type { Timeframe } from "@/lib/core/types";
import { NARRATIVE_LABEL } from "@/lib/engine/extras";
import { ACHIEVEMENT_BY_ID, TIER_LABEL, TIER_ORDER } from "@/lib/achievements-catalog";
import { CAUSE_LABEL, type DeathCause } from "@/lib/engine/graveyard-labels";

export { CAUSE_LABEL, type DeathCause };

type Earned = { id: string; detail?: string };
/** Rarest first: by real percentage once there are enough wallets, else by tier. */
export function rarestFirst<T extends Earned>(earned: T[], pct?: Record<string, number> | null): T[] {
  return [...earned].filter((e) => ACHIEVEMENT_BY_ID[e.id]).sort((a, b) =>
    pct ? (pct[a.id] ?? 0) - (pct[b.id] ?? 0) : TIER_ORDER[ACHIEVEMENT_BY_ID[a.id].tier] - TIER_ORDER[ACHIEVEMENT_BY_ID[b.id].tier]);
}
/** "Legendary" until enough wallets are counted, then "3.2% of wallets". */
export function rarityLabel(id: string, pct?: Record<string, number> | null): string {
  const p = pct?.[id];
  if (p !== undefined) return p < 1 ? "<1% of wallets" : `${Math.round(p)}% of wallets`;
  return TIER_LABEL[ACHIEVEMENT_BY_ID[id].tier];
}

export type Venue = WrappedStats["bridges"]["journey"][number];

export const CHAIN_NAME: Record<string, string> = {
  solana: "Solana", ethereum: "Ethereum", base: "Base", arbitrum: "Arbitrum", bsc: "BNB Chain",
  polygon: "Polygon", optimism: "Optimism", hyperliquid: "Hyperliquid",
};
export const CHAIN_COLOR: Record<string, string> = {
  solana: "#14F195", ethereum: "#8A9DFF", base: "#3D7BFF", arbitrum: "#4DB5FF", bsc: "#F3BA2F",
  polygon: "#A47BFF", optimism: "#FF4D5E", hyperliquid: "#97FCE4",
};

export function usd(n: number, opts: { sign?: boolean; currency?: "USD" | "NGN"; ngnRate?: number } = {}): string {
  const cur = opts.currency ?? "USD";
  const v = cur === "NGN" ? n * (opts.ngnRate ?? 0) : n;
  const sym = cur === "NGN" ? "₦" : "$";
  const a = Math.abs(v);
  if (a < 0.005) return `${sym}0`;
  const body =
    a >= 1e9 ? `${trim(a / 1e9)}B` : a >= 1e6 ? `${trim(a / 1e6)}M` : a >= 1e4 ? `${trim(a / 1e3)}k` : a >= 100 ? Math.round(a).toLocaleString("en-US") : a >= 1 ? a.toFixed(0) : a.toFixed(2);
  const sign = v < 0 ? "−" : opts.sign && v > 0 ? "+" : "";
  return `${sign}${sym}${body}`;
}
const trim = (x: number) => (x >= 100 ? Math.round(x).toString() : x >= 10 ? x.toFixed(1).replace(/\.0$/, "") : x.toFixed(2).replace(/0$/, "").replace(/\.0$/, ""));

export const num = (n: number) => (n >= 1e4 ? `${trim(n / 1e3)}k` : n.toLocaleString("en-US"));

/** Market cap from a token price when we know the supply, otherwise the plain price. */
export function capOrPrice(p: number, supply: number | null | undefined): string {
  if (!p) return "$0";
  return supply ? usd(p * supply) : price(p);
}

/** Token prices: 3 significant digits, never scientific notation ($0.0000346). */
export function price(p: number): string {
  if (!p) return "$0";
  return "$" + new Intl.NumberFormat("en-US", { maximumSignificantDigits: 3, maximumFractionDigits: 12 }).format(p);
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;

export const shortAddr = (a: string) => (a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);

export function whoLabel(s: WrappedStats): string {
  const names = s.meta.names ?? {};
  const ws = s.meta.wallets;
  if (ws.length === 1) return names[ws[0]] ?? shortAddr(ws[0]);
  const first = ws.map((w) => names[w]).find(Boolean);
  return first ? `${first} + ${ws.length - 1} more` : `${ws.length} wallets`;
}

export function monthDay(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** "Oct 28", or "Oct 28, 2025" when it's not this year (else last year's date reads like today). */
function sinceDate(ts: number): string {
  const d = new Date(ts * 1000);
  return d.getUTCFullYear() === new Date().getUTCFullYear()
    ? monthDay(ts)
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export const TIMEFRAME_LABEL: Record<Timeframe, string> = {
  "1m": "Last 30 days", "3m": "Last 3 months", "6m": "Last 6 months", "12m": "Last 12 months", all: "All time", custom: "Custom dates",
};
/** "this year" / "this month" / "in the last 3 months" / "all time", for share text. */
export function periodPhrase(t: Timeframe): string {
  return ({ "1m": "this month", "3m": "in the last 3 months", "6m": "in the last 6 months", "12m": "this year", all: "all time", custom: "in that stretch" } as const)[t] ?? "this year";
}

export function periodLabel(s: WrappedStats): string {
  // History cut short (a cap, or today's data limit ran out): say so, or "Since Aug 7" looks like a bug.
  if (s.meta.truncated) return s.meta.txCap ? `Latest ${num(s.meta.txCap)} txns · since ${sinceDate(s.meta.fromTs)}` : `Partial · since ${sinceDate(s.meta.fromTs)}`;
  if (s.meta.timeframe === "custom") return `${sinceDate(s.meta.fromTs)} – ${sinceDate(s.meta.toTs)}`;
  return TIMEFRAME_LABEL[s.meta.timeframe] ?? "Last 12 months";
}

export const hourLabel = (h: number) => {
  const hh = ((h % 24) + 24) % 24;
  return hh === 0 ? "12am" : hh < 12 ? `${hh}am` : hh === 12 ? "12pm" : `${hh - 12}pm`;
};

/** "the same second" / "8 seconds" / "3 minutes" / "2 hours" (how long after a coin launched). */
export function afterLaunch(sec: number): string {
  if (sec <= 0) return "the same second";
  if (sec < 60) return `${sec} second${sec === 1 ? "" : "s"}`;
  if (sec < 3600) { const m = Math.round(sec / 60); return `${m} minute${m === 1 ? "" : "s"}`; }
  const h = Math.round(sec / 3600); return `${h} hour${h === 1 ? "" : "s"}`;
}

/** "under a minute" / "4 minutes" / "2 hours" / "3 days" (a wait between trades). */
export function waitLabel(sec: number): string {
  if (sec < 60) return "under a minute";
  if (sec < 3600) { const m = Math.round(sec / 60); return `${m} minute${m === 1 ? "" : "s"}`; }
  if (sec < 86400 * 2) { const h = Math.round(sec / 3600); return `${h} hour${h === 1 ? "" : "s"}`; }
  return `${Math.round(sec / 86400)} days`;
}

/** Card copy used for both the story and the X share text. */
export function shareText(s: WrappedStats, card: CardId): string {
  const tail = "My Wrapped Onchain 👇";
  switch (card) {
    case "archetype": return `I'm a "${s.archetype.title}". ${tail}`;
    case "overview": return `${num(s.overview.totalTrades)} trades, ${usd(s.overview.volumeUsd)} volume${s.overview.chainsUsed.length > 1 ? ` across ${s.overview.chainsUsed.length} chains` : ""}. ${tail}`;
    case "pnl": return `${usd(s.pnl.totalUsd, { sign: true })} trading PnL, ${pct(s.pnl.winRate)} win rate. ${tail}`;
    case "best": return s.bestTrade ? `Best trade: $${s.bestTrade.symbol} ${usd(s.bestTrade.pnlUsd, { sign: true })}. ${tail}` : tail;
    case "worst": return s.worstTrade ? `Worst trade: $${s.worstTrade.symbol} ${usd(s.worstTrade.pnlUsd)}. Pain. ${tail}` : tail;
    case "roundTrip": return s.roundTrip ? `I was up ${usd(s.roundTrip.peakGainUsd)} on $${s.roundTrip.symbol} and walked out with ${usd(s.roundTrip.endedWithUsd)}. ${tail}` : tail;
    case "paperHands": return s.paperHands ? `Sold $${s.paperHands.symbol} right before it ran. Left ${usd(s.paperHands.missedUsd)} on the table. ${tail}` : tail;
    case "diamondHands": return s.diamondHands ? `${s.diamondHands.daysHeld} days of diamond hands on $${s.diamondHands.symbol}. ${tail}` : tail;
    case "counterfactual": return s.counterfactual.verdict === "should_have_held" ? `If I'd just held ${s.counterfactual.major}, I'd have ${usd(s.counterfactual.justHeldDiffUsd)} more. ${tail}` : `My trading beat just holding ${s.counterfactual.major} by ${usd(-s.counterfactual.justHeldDiffUsd)}. ${tail}`;
    case "revenge": {
      const r = s.revenge; if (!r) return tail;
      return `After a loss I bought my next coin in ${waitLabel(r.gapAfterLossSec)}. Trades right after a loss won ${Math.round(r.revenge.winRate * 100)}% of the time (normally ${Math.round(r.normal.winRate * 100)}%). ${tail}`;
    }
    case "sniper": {
      const n = s.sniper; if (!n) return tail;
      const f = n.fastest;
      return `I bought ${Math.round((n.within60s / n.checked) * 100)}% of my coins within a minute of launch${f ? `. Fastest: $${f.symbol}, ${f.sec <= 0 ? "the same second it launched" : `${afterLaunch(f.sec)} after launch`}` : ""}. ${tail}`;
    }
    case "bags": return s.bags ? `Still holding ${s.bags.count} bag${s.bags.count === 1 ? "" : "s"} worth ${usd(s.bags.valueUsd)}. Paid ${usd(s.bags.costUsd)} for them. ${tail}` : tail;
    case "appFees": return s.appFees ? `I paid ${s.appFees.byApp[0]?.app ?? "trading apps"} ${usd(s.appFees.totalUsd)} in fees ${periodPhrase(s.meta.timeframe)}. ${tail}` : tail;
    case "gas": return `I burned ${usd(s.gas.totalUsd)} on gas. ${tail}`;
    case "rugs": return `Caught in ${s.rugs.count} rugs, dodged ${s.rugs.dodged}. ${tail}`;
    case "graveyard": {
      const g = s.graveyard; if (!g) return tail;
      return `I buried ${num(g.count)} coin${g.count === 1 ? "" : "s"} and ${usd(g.buriedUsd)}${g.mostExpensive ? `. Most expensive grave: $${g.mostExpensive.symbol}` : ""}. 🪦 ${tail}`;
    }
    case "achievements": {
      const e = s.achievements?.earned ?? []; if (!e.length) return tail;
      const top = rarestFirst(e).slice(0, 3).map((x) => `${ACHIEVEMENT_BY_ID[x.id].emoji} ${ACHIEVEMENT_BY_ID[x.id].name}`).join(", ");
      return `I unlocked ${e.length} achievement${e.length === 1 ? "" : "s"}: ${top}. ${tail}`;
    }
    case "airdrops": return `${s.airdrops.count} airdrops claimed, ${usd(s.airdrops.valueUsd)} free money. ${tail}`;
    case "sleep": return `Most active trading hour: ${hourLabel(s.sleep.peakHourUtc)} UTC. Sleep is optional. ${tail}`;
    case "chains": {
      const parts = Object.entries(s.pnl.byChain).sort((a, b) => b[1]!.pnlUsd - a[1]!.pnlUsd).map(([c, v]) => `${CHAIN_NAME[c]} ${usd(v!.pnlUsd, { sign: true })}`);
      return `Profit by chain: ${parts.join(", ")}. ${tail}`;
    }
    case "roast": return s.roast ? `"${s.roast.text}" ${tail}` : tail;
    case "percentile": return `Top ${Math.max(1, Math.round(100 - (s.percentile.activity ?? 0)))}% most active of everyone who checked. ${tail}`;
    case "profitTime": {
      const t = s.profitTimeline;
      const final = t ? (t.points.at(-1)?.[1] ?? 0) + t.openUsd : s.pnl.totalUsd;
      return `${s.meta.timeframe === "12m" ? "My year" : s.meta.timeframe === "all" ? "My all-time" : TIMEFRAME_LABEL[s.meta.timeframe]} in profit: ${usd(final, { sign: true })}${t?.bestDay && t.bestDay.usd > 0 ? `, best day ${usd(t.bestDay.usd, { sign: true })}` : ""}. ${tail}`;
    }
    case "speed": {
      const f = s.speed?.fastestFlip;
      return f ? `Fastest flip: in and out of ${f.symbol} in ${f.seconds < 90 ? `${f.seconds}s` : `${Math.round(f.seconds / 60)} min`}. ${tail}` : tail;
    }
    case "narrative": {
      const n = s.narratives?.top[0];
      return n ? `My favourite narrative: ${NARRATIVE_LABEL[n.id]} (${n.trades} trades, ${usd(n.pnlUsd, { sign: true })}). ${tail}` : tail;
    }
    case "bridges": return `My bridge journey: ${s.bridges.journey.map((c) => CHAIN_NAME[c]).join(" → ")}. ${tail}`;
    default: return `${s.archetype.title}. ${usd(s.pnl.totalUsd, { sign: true })}. ${tail}`;
  }
}

export const CARD_TITLE: Record<CardId, string> = {
  archetype: "Your era", overview: "The numbers", pnl: "The bottom line", profitTime: "Profit over time", best: "Best trade", worst: "Worst trade",
  speed: "Speed", narrative: "Favourite narrative",
  roundTrip: "The round trip", paperHands: "Paper hands", diamondHands: "Diamond hands", counterfactual: "What if",
  revenge: "Revenge trading", sniper: "Launch sniper", bags: "Bags still held", appFees: "App fees", gas: "Gas burned", rugs: "Rugs", airdrops: "Airdrops", sleep: "Sleep schedule", bridges: "Bridge journey",
  percentile: "Ranking", chains: "Profit by chain", roast: "The roast", summary: "Your Wrapped",
  graveyard: "The coin graveyard", achievements: "Achievements",
};

/** Per-card background: deep base + two glows. Shared by UI and OG images. */
export const CARD_THEME: Record<CardId, { bg: string; a: string; b: string; ink: string }> = {
  archetype: { bg: "#120B2E", a: "#7C3AED", b: "#14F195", ink: "#F4F1FF" },
  overview: { bg: "#06182B", a: "#0EA5E9", b: "#6366F1", ink: "#EAF6FF" },
  pnl: { bg: "#0B1A12", a: "#22C55E", b: "#0EA5E9", ink: "#EEFFF4" },
  profitTime: { bg: "#08151C", a: "#22C55E", b: "#38BDF8", ink: "#EFFBFF" },
  speed: { bg: "#1A1405", a: "#FACC15", b: "#F97316", ink: "#FFFBEA" },
  narrative: { bg: "#170B24", a: "#C084FC", b: "#34D399", ink: "#F8F0FF" },
  best: { bg: "#0A1F14", a: "#10B981", b: "#FDE047", ink: "#F0FFF6" },
  worst: { bg: "#250A0E", a: "#EF4444", b: "#F97316", ink: "#FFF1F1" },
  roundTrip: { bg: "#1F1206", a: "#F59E0B", b: "#EF4444", ink: "#FFF7EB" },
  paperHands: { bg: "#1A1033", a: "#F472B6", b: "#A78BFA", ink: "#FFF0FA" },
  diamondHands: { bg: "#071A26", a: "#22D3EE", b: "#A5F3FC", ink: "#ECFEFF" },
  counterfactual: { bg: "#14122B", a: "#818CF8", b: "#F59E0B", ink: "#F1F0FF" },
  revenge: { bg: "#1A0A0A", a: "#EF4444", b: "#F97316", ink: "#FFF5F5" },
  sniper: { bg: "#0A1020", a: "#38BDF8", b: "#E879F9", ink: "#F0F9FF" },
  bags: { bg: "#0B1A14", a: "#10B981", b: "#A3E635", ink: "#ECFDF5" },
  appFees: { bg: "#1F0A16", a: "#F43F5E", b: "#F59E0B", ink: "#FFF1F4" },
  gas: { bg: "#1C0F05", a: "#FB923C", b: "#FACC15", ink: "#FFF6EC" },
  rugs: { bg: "#1A0A1F", a: "#E11D48", b: "#8B5CF6", ink: "#FFF0F5" },
  graveyard: { bg: "#0B0D12", a: "#64748B", b: "#7C3AED", ink: "#F1F5F9" },
  achievements: { bg: "#17110A", a: "#F59E0B", b: "#A855F7", ink: "#FFF8EB" },
  airdrops: { bg: "#06201F", a: "#2DD4BF", b: "#FDE68A", ink: "#EFFFFC" },
  sleep: { bg: "#070B24", a: "#6366F1", b: "#EC4899", ink: "#EEF0FF" },
  bridges: { bg: "#03161C", a: "#14F195", b: "#3D7BFF", ink: "#EAFFF8" },
  percentile: { bg: "#151515", a: "#FACC15", b: "#F97316", ink: "#FFFBEA" },
  roast: { bg: "#1F0707", a: "#F97316", b: "#DC2626", ink: "#FFF4EC" },
  chains: { bg: "#06141F", a: "#14F195", b: "#3D7BFF", ink: "#EEFBFF" },
  summary: { bg: "#0D0A1F", a: "#7C3AED", b: "#F472B6", ink: "#F6F2FF" },
};

/**
 * "Put in / got back" for a trade card, in pieces that add up to its result. Sales of coins bought
 * before the period (and coins moved to another wallet) are named separately: they aren't counted.
 */
export function tradeMath(t: TradeCard, fmt: (n: number) => string = (n) => usd(n)): { main: string; notes: string[] } {
  if (t.knownProceedsUsd == null) {
    // Results made before the split was recorded: the totals would mix in uncounted sales.
    return t.partialHistory
      ? { main: `Put in ${fmt(t.costUsd)}.`, notes: ["Some of this coin was bought before the period shown; only what was bought in it counts."] }
      : { main: `Put in ${fmt(t.costUsd)}, took out ${fmt(t.proceedsUsd)}${t.holdingValueUsd >= 1 ? `, still holding ${fmt(t.holdingValueUsd)}` : ""}.`, notes: [] };
  }
  const held = t.knownHoldingUsd ?? 0;
  const notes: string[] = [];
  if ((t.outsideProceedsUsd ?? 0) >= 1) notes.push(`Also sold ${fmt(t.outsideProceedsUsd!)} of $${t.symbol} bought before this period, not counted here.`);
  if ((t.movedCostUsd ?? 0) >= 1) notes.push(`${fmt(t.movedCostUsd!)} worth was moved to another wallet, not counted as a loss.`);
  return { main: `Put in ${fmt(t.costUsd)}, got back ${fmt(t.knownProceedsUsd)}${held >= 1 ? `, still holding ${fmt(held)}` : ""}.`, notes };
}
