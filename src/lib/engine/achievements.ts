// Detects which badges a lookup earned. Each rule reads the finished stats plus the raw positions/events.
// Rarity (share of wallets with the badge) is counted in lib/rarity.ts when the lookup is saved.
import { isMoney } from "../core/assets";
import type { UnifiedEvent } from "../core/types";
import type { PriceBook } from "../prices/pricebook";
import { ACHIEVEMENTS } from "../achievements-catalog";
import type { Position } from "./pnl";
import type { WrappedStats } from "./stats";

export interface AchievementResult {
  /** Earned badge ids with a short proof ("143 trades on Mar 3"). */
  earned: { id: string; detail?: string }[];
}

interface Ctx { stats: Omit<WrappedStats, "cards">; positions: Position[]; events: UnifiedEvent[]; pb: PriceBook; now: number }
type Rule = (c: Ctx, d: Derived) => string | boolean | undefined | null;

const DAY = 86400;
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const day = (ts: number) => new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

interface Derived {
  trades: UnifiedEvent[];
  coins: Position[];
  perDay: Map<number, number>;
  hours: number[];
}

function derive(c: Ctx): Derived {
  const trades = c.events.filter((e) => e.type === "swap" && !e.spam && !e.ownTransfer);
  const perDay = new Map<number, number>();
  const hours = new Array(24).fill(0);
  for (const e of trades) {
    const d = Math.floor(e.timestamp / DAY);
    perDay.set(d, (perDay.get(d) ?? 0) + 1);
    hours[new Date(e.timestamp * 1000).getUTCHours()]++;
  }
  const coins = c.positions.filter((p) => p.token.address !== "native" && !isMoney(p.token) && p.buys.length > 0);
  return { trades, coins, perDay, hours };
}

const share = (h: number[], from: number, to: number) => {
  const total = h.reduce((a, b) => a + b, 0);
  let n = 0;
  for (let i = from; i < to; i++) n += h[i];
  return total ? n / total : 0;
};

const RULES: Record<string, Rule> = {
  green_year: ({ stats: s }) => s.overview.totalTrades >= 10 && s.pnl.totalUsd > 0 && `+${usd(s.pnl.totalUsd)}`,
  six_figures: ({ stats: s }) => s.pnl.totalUsd >= 100_000 && `+${usd(s.pnl.totalUsd)}`,
  sharpshooter: ({ stats: s }) => s.pnl.wins + s.pnl.losses >= 50 && s.pnl.winRate >= 0.6 && `${Math.round(s.pnl.winRate * 100)}% of ${s.pnl.wins + s.pnl.losses}`,
  ten_bagger: (_c, d) => {
    const p = d.coins.filter((p) => p.costIn >= 20 && p.proceeds >= 10 * p.costIn).sort((a, b) => b.proceeds / b.costIn - a.proceeds / a.costIn)[0];
    return p && `$${p.token.symbol} ${Math.round(p.proceeds / p.costIn)}x`;
  },
  moonshot: (_c, d) => {
    const p = d.coins.find((p) => p.costIn >= 20 && p.proceeds >= 100 * p.costIn);
    return p && `$${p.token.symbol} ${Math.round(p.proceeds / p.costIn)}x`;
  },
  comeback_kid: ({ pb }, d) => {
    for (const p of d.coins) {
      if (p.costIn < 20 || !p.sells.length) continue;
      const entry = p.costIn / Math.max(1e-12, p.buys.reduce((s, f) => s + f.amount, 0));
      const first = p.buys[0].ts;
      // Lowest price while still holding, from real price history and their own fills.
      const held = (ts: number) => { let h = 0; for (const t of p.timeline) { if (t.ts > ts) break; h = t.holding; } return h > 0; };
      const pts = [...pb.series(p.key).map((x) => ({ ts: x.ts, price: x.price })), ...p.buys, ...p.sells].filter((x) => x.ts > first && held(x.ts));
      const low = pts.reduce((m, x) => (x.price > 0 && x.price < m.price ? x : m), { ts: 0, price: Infinity });
      if (low.price > entry * 0.1) continue;
      const recovered = p.sells.find((f) => f.ts > low.ts && f.price >= entry);
      if (recovered) return `$${p.token.symbol}`;
    }
    return false;
  },
  diamond_hands: ({ stats: s }) => !!s.diamondHands && s.diamondHands.daysHeld >= 180 && s.diamondHands.pnlUsd > 0 && `$${s.diamondHands.symbol}, ${s.diamondHands.daysHeld} days`,
  paper_hands: ({ stats: s }) => !!s.paperHands && s.paperHands.soldAt > 0 && s.paperHands.laterPeak >= 10 * s.paperHands.soldAt && `$${s.paperHands.symbol}`,
  top_blaster: ({ pb }, d) => {
    for (const p of d.coins) {
      // The peak must come from real price history, not just their own fills (else any top buy counts).
      const hist = pb.series(p.key);
      if (p.peakPrice <= 0 || hist.length < 3 || Math.max(...hist.map((x) => x.price)) < p.peakPrice * 0.99) continue;
      const cur = pb.current(p.key) ?? 0;
      const f = p.buys.find((b) => b.usd >= 20 && b.price >= p.peakPrice * 0.99 && cur < b.price * 0.5);
      if (f) return `$${p.token.symbol}`;
    }
    return false;
  },
  round_tripper: ({ stats: s }) => !!s.roundTrip && s.roundTrip.peakGainUsd >= 1000 && s.roundTrip.endedWithUsd <= 0 && `$${s.roundTrip.symbol}, up ${usd(s.roundTrip.peakGainUsd)}`,
  rug_survivor: ({ stats: s }) => { const n = s.graveyard?.causes.rug ?? 0; return n >= 10 && `${n} rugs`; },
  grave_digger: ({ stats: s }) => (s.graveyard?.count ?? 0) >= 100 && `${s.graveyard!.count} coins`,
  undertaker: ({ stats: s }) => (s.graveyard?.buriedUsd ?? 0) >= 10_000 && usd(s.graveyard!.buriedUsd),
  rug_proof: ({ stats: s }, d) => d.coins.length >= 50 && s.rugs.count === 0 && `${d.coins.length} coins`,
  escape_artist: ({ stats: s }) => s.rugs.dodged >= 5 && `${s.rugs.dodged} coins`,
  bag_collector: ({ stats: s }) => (s.bags?.count ?? 0) >= 20 && `${s.bags!.count} bags`,
  revenge_arc: ({ stats: s }) => (s.revenge?.revenge.count ?? 0) >= 5 && `${s.revenge!.revenge.count} times`,
  click_frenzy: (_c, d) => { const top = [...d.perDay.entries()].sort((a, b) => b[1] - a[1])[0]; return !!top && top[1] >= 100 && `${top[1].toLocaleString("en-US")} on ${day(top[0] * DAY)}`; },
  human_hft: (_c, d) => { const top = [...d.perDay.entries()].sort((a, b) => b[1] - a[1])[0]; return !!top && top[1] >= 1000 && `${top[1].toLocaleString("en-US")} on ${day(top[0] * DAY)}`; },
  no_days_off: (_c, d) => {
    const days = [...d.perDay.keys()].sort((a, b) => a - b);
    let best = 0, run = 0;
    for (let i = 0; i < days.length; i++) { run = i && days[i] === days[i - 1] + 1 ? run + 1 : 1; best = Math.max(best, run); }
    return best >= 30 && `${best} days`;
  },
  speedrunner: ({ stats: s }) => !!s.speed?.fastestFlip && s.speed.fastestFlip.seconds < 60 && `$${s.speed.fastestFlip.symbol} in ${s.speed.fastestFlip.seconds}s`,
  sniper: ({ stats: s }) => !!s.sniper && !s.sniper.sampled && s.sniper.within60s >= 10 && `${s.sniper.within60s} coins`,
  coin_collector: ({ stats: s }) => s.overview.tokensTraded >= 100 && `${s.overview.tokensTraded.toLocaleString("en-US")} coins`,
  index_fund: ({ stats: s }) => s.overview.tokensTraded >= 1000 && `${s.overview.tokensTraded.toLocaleString("en-US")} coins`,
  volume_100k: ({ stats: s }) => s.overview.volumeUsd >= 100_000 && usd(s.overview.volumeUsd),
  volume_1m: ({ stats: s }) => s.overview.volumeUsd >= 1_000_000 && usd(s.overview.volumeUsd),
  high_roller: (_c, d) => {
    let top: { usd: number; sym: string } | null = null;
    for (const p of d.coins) for (const b of p.buys) if (b.usd >= 10_000 && (!top || b.usd > top.usd)) top = { usd: b.usd, sym: p.token.symbol };
    return top && `${usd(top.usd)} of $${top.sym}`;
  },
  night_owl: (_c, d) => d.trades.length >= 20 && share(d.hours, 1, 5) >= 0.4 && `${Math.round(share(d.hours, 1, 5) * 100)}% of trades`,
  early_bird: (_c, d) => d.trades.length >= 20 && share(d.hours, 5, 9) >= 0.4 && `${Math.round(share(d.hours, 5, 9) * 100)}% of trades`,
  weekend_warrior: (_c, d) => {
    if (d.trades.length < 20) return false;
    const wk = d.trades.filter((e) => [0, 6].includes(new Date(e.timestamp * 1000).getUTCDay())).length / d.trades.length;
    return wk >= 0.5 && `${Math.round(wk * 100)}% of trades`;
  },
  gas_lord: ({ stats: s }) => s.gas.totalUsd >= 1000 && usd(s.gas.totalUsd),
  fee_machine: ({ stats: s }) => (s.appFees?.totalUsd ?? 0) >= 1000 && usd(s.appFees!.totalUsd),
  airdrop_hunter: ({ stats: s }) => s.airdrops.count >= 5 && `${s.airdrops.count} airdrops`,
};

export function detectAchievements(c: Ctx): AchievementResult {
  const d = derive(c);
  const earned: AchievementResult["earned"] = [];
  for (const a of ACHIEVEMENTS) {
    const rule = RULES[a.id];
    if (!rule) continue;
    let r: ReturnType<Rule>;
    try { r = rule(c, d); } catch { r = false; }
    if (r) earned.push(typeof r === "string" ? { id: a.id, detail: r } : { id: a.id });
  }
  return { earned };
}
