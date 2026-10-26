// Shared by the story UI and the OG images (no React, no DOM).
import type { CardId, WrappedStats } from "@/lib/engine/stats";

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
  const body =
    a >= 1e9 ? `${trim(a / 1e9)}B` : a >= 1e6 ? `${trim(a / 1e6)}M` : a >= 1e4 ? `${trim(a / 1e3)}k` : a >= 100 ? Math.round(a).toLocaleString("en-US") : a >= 1 ? a.toFixed(0) : a.toFixed(2);
  const sign = v < 0 ? "−" : opts.sign && v > 0 ? "+" : "";
  return `${sign}${sym}${body}`;
}
const trim = (x: number) => (x >= 100 ? Math.round(x).toString() : x >= 10 ? x.toFixed(1).replace(/\.0$/, "") : x.toFixed(2).replace(/0$/, "").replace(/\.0$/, ""));

export const num = (n: number) => (n >= 1e4 ? `${trim(n / 1e3)}k` : n.toLocaleString("en-US"));

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

export function periodLabel(s: WrappedStats): string {
  if (s.meta.truncated) return `Since ${monthDay(s.meta.fromTs)}`;
  return s.meta.timeframe === "all" ? "All time" : "Last 12 months";
}

export const hourLabel = (h: number) => {
  const hh = ((h % 24) + 24) % 24;
  return hh === 0 ? "12am" : hh < 12 ? `${hh}am` : hh === 12 ? "12pm" : `${hh - 12}pm`;
};

/** Card copy used for both the story and the X share text. */
export function shareText(s: WrappedStats, card: CardId): string {
  const tail = "My onchain Wrapped 👇";
  switch (card) {
    case "archetype": return `I'm a "${s.archetype.title}". ${tail}`;
    case "overview": return `${num(s.overview.totalTrades)} trades, ${usd(s.overview.volumeUsd)} volume across ${s.overview.chainsUsed.length} chains. ${tail}`;
    case "pnl": return `${usd(s.pnl.totalUsd, { sign: true })} trading PnL, ${pct(s.pnl.winRate)} win rate. ${tail}`;
    case "best": return s.bestTrade ? `Best trade: $${s.bestTrade.symbol} ${usd(s.bestTrade.pnlUsd, { sign: true })}. ${tail}` : tail;
    case "worst": return s.worstTrade ? `Worst trade: $${s.worstTrade.symbol} ${usd(s.worstTrade.pnlUsd)}. Pain. ${tail}` : tail;
    case "roundTrip": return s.roundTrip ? `I was up ${usd(s.roundTrip.peakGainUsd)} on $${s.roundTrip.symbol} and walked out with ${usd(s.roundTrip.endedWithUsd)}. ${tail}` : tail;
    case "paperHands": return s.paperHands ? `Sold $${s.paperHands.symbol} right before it ran. Left ${usd(s.paperHands.missedUsd)} on the table. ${tail}` : tail;
    case "diamondHands": return s.diamondHands ? `${s.diamondHands.daysHeld} days of diamond hands on $${s.diamondHands.symbol}. ${tail}` : tail;
    case "counterfactual": return s.counterfactual.verdict === "should_have_held" ? `If I'd just held ${s.counterfactual.major}, I'd have ${usd(s.counterfactual.justHeldDiffUsd)} more. ${tail}` : `My trading beat just holding ${s.counterfactual.major} by ${usd(-s.counterfactual.justHeldDiffUsd)}. ${tail}`;
    case "gas": return `I burned ${usd(s.gas.totalUsd)} on gas. ${tail}`;
    case "rugs": return `Caught in ${s.rugs.count} rugs, dodged ${s.rugs.dodged}. ${tail}`;
    case "airdrops": return `${s.airdrops.count} airdrops claimed, ${usd(s.airdrops.valueUsd)} free money. ${tail}`;
    case "sleep": return `Most active trading hour: ${hourLabel(s.sleep.peakHourUtc)} UTC. Sleep is optional. ${tail}`;
    case "roast": return s.roast ? `"${s.roast.text}" ${tail}` : tail;
    case "percentile": return `Top ${Math.max(1, Math.round(100 - (s.percentile.activity ?? 0)))}% most active of everyone who checked. ${tail}`;
    case "bridges": return `My bridge journey: ${s.bridges.journey.map((c) => CHAIN_NAME[c]).join(" → ")}. ${tail}`;
    default: return `${s.archetype.title}. ${usd(s.pnl.totalUsd, { sign: true })}. ${tail}`;
  }
}

export const CARD_TITLE: Record<CardId, string> = {
  archetype: "Your era", overview: "The numbers", pnl: "The bottom line", best: "Best trade", worst: "Worst trade",
  roundTrip: "The round trip", paperHands: "Paper hands", diamondHands: "Diamond hands", counterfactual: "What if",
  gas: "Gas burned", rugs: "Rugs", airdrops: "Airdrops", sleep: "Sleep schedule", bridges: "Bridge journey",
  percentile: "Ranking", roast: "The roast", summary: "Your Wrapped",
};

/** Per-card background: deep base + two glows. Shared by UI and OG images. */
export const CARD_THEME: Record<CardId, { bg: string; a: string; b: string; ink: string }> = {
  archetype: { bg: "#120B2E", a: "#7C3AED", b: "#14F195", ink: "#F4F1FF" },
  overview: { bg: "#06182B", a: "#0EA5E9", b: "#6366F1", ink: "#EAF6FF" },
  pnl: { bg: "#0B1A12", a: "#22C55E", b: "#0EA5E9", ink: "#EEFFF4" },
  best: { bg: "#0A1F14", a: "#10B981", b: "#FDE047", ink: "#F0FFF6" },
  worst: { bg: "#250A0E", a: "#EF4444", b: "#F97316", ink: "#FFF1F1" },
  roundTrip: { bg: "#1F1206", a: "#F59E0B", b: "#EF4444", ink: "#FFF7EB" },
  paperHands: { bg: "#1A1033", a: "#F472B6", b: "#A78BFA", ink: "#FFF0FA" },
  diamondHands: { bg: "#071A26", a: "#22D3EE", b: "#A5F3FC", ink: "#ECFEFF" },
  counterfactual: { bg: "#14122B", a: "#818CF8", b: "#F59E0B", ink: "#F1F0FF" },
  gas: { bg: "#1C0F05", a: "#FB923C", b: "#FACC15", ink: "#FFF6EC" },
  rugs: { bg: "#1A0A1F", a: "#E11D48", b: "#8B5CF6", ink: "#FFF0F5" },
  airdrops: { bg: "#06201F", a: "#2DD4BF", b: "#FDE68A", ink: "#EFFFFC" },
  sleep: { bg: "#070B24", a: "#6366F1", b: "#EC4899", ink: "#EEF0FF" },
  bridges: { bg: "#03161C", a: "#14F195", b: "#3D7BFF", ink: "#EAFFF8" },
  percentile: { bg: "#151515", a: "#FACC15", b: "#F97316", ink: "#FFFBEA" },
  roast: { bg: "#1F0707", a: "#F97316", b: "#DC2626", ink: "#FFF4EC" },
  summary: { bg: "#0D0A1F", a: "#7C3AED", b: "#F472B6", ink: "#F6F2FF" },
};
