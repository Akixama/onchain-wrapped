import { maxOf, minOf } from "../core/num";
import type { Timeframe } from "../core/types";
import type { ChainId, UnifiedEvent, Venue } from "../core/types";
import { CHAIN_LABEL, counterfactualMajor, isMoney } from "../core/assets";
import type { BridgeHop } from "../core/identity";
import type { PriceBook } from "../prices/pricebook";
import { type Position, pricePoints } from "./pnl";
import { appFeeStats, revengeStats, type BagStats, type RevengeStats, narrativeStats, profitTimeline, speedStats, type AppFeeStats, type NarrativeStats, type ProfitTimeline, type SpeedStats } from "./extras";
import type { SniperStats } from "../launch";

// Everything the cards need, as plain JSON. The UI never recomputes anything.

const r2 = (n: number) => Math.round(n * 100) / 100;
const DAY = 86400;

export interface TradeCard {
  symbol: string;
  name?: string;
  icon?: string;
  chain: ChainId;
  address: string;
  pnlUsd: number;
  costUsd: number;
  proceedsUsd: number;
  holdingValueUsd: number;
  avgEntry: number;
  peakPrice: number;
  avgExit: number | null;
  firstTs: number;
  lastTs: number;
  partialHistory: boolean;
  /** The user's own buys/sells of this token (for chart markers). */
  fills?: { t: number; side: "buy" | "sell"; price: number; usd: number; sig?: string }[];
  /** SOL price (USD) around the trade, for charts rebuilt from on-chain swaps. */
  solUsd?: number;
  /** Real candles (USD price) when available; supply turns prices into market cap. */
  chart?: TradeChart;
  /** Token supply from the chain (market cap = price x supply). */
  supply?: number | null;
  /** Time range the chart should cover (unix seconds). */
  window?: { start: number; end: number; tooOld?: boolean };
}

export interface TradeChart {
  candles: [number, number, number, number, number][]; // time, open, high, low, close
  interval: string; // "5m" | "1h" | "1d"
  supply: number | null;
}

export interface WrappedStats {
  meta: {
    wallets: string[];
    /** Data-quality notes to show under the story ("filled 18 missing txs"). */
    notes?: string[];
    /** address -> ENS / SNS name the user typed */
    names?: Record<string, string>;
    timeframe: Timeframe;
    fromTs: number;
    toTs: number;
    generatedAt: string;
    eventCount: number;
    truncated: boolean;
    /** Cut short by a provider's daily limit: a later lookup can read further. */
    quotaCut?: boolean;
    txCap: number;
    spamFiltered: number;
    note: string;
  };
  archetype: { title: string; tagline: string; style: string; traits?: { label: string; detail: string }[] };
  overview: {
    totalTrades: number;
    volumeUsd: number;
    chainsUsed: ChainId[];
    topChain: ChainId | null;
    tradesByChain: Partial<Record<ChainId, number>>;
    tokensTraded: number;
    activeDays: number;
  };
  pnl: {
    realizedUsd: number; unrealizedUsd: number; totalUsd: number; winRate: number; wins: number; losses: number;
    /** Trading result per chain (memecoin/token positions, same rules as the total). */
    byChain: Partial<Record<ChainId, { pnlUsd: number; trades: number; tokens: number }>>;
  };
  bestTrade: TradeCard | null;
  worstTrade: TradeCard | null;
  roundTrip: (TradeCard & { peakGainUsd: number; peakTs: number; endedWithUsd: number }) | null;
  paperHands: (TradeCard & { soldAt: number; soldTs: number; laterPeak: number; missedUsd: number }) | null;
  diamondHands: (TradeCard & { daysHeld: number; stillHolding: boolean }) | null;
  counterfactual: {
    major: "SOL" | "ETH" | "SOL+ETH";
    tradingPnlUsd: number; // trading result at the prices when it happened
    tradingUnits?: number | null; // the same result in SOL/ETH (one major only)
    tradingNowUsd?: number; // ...valued at today's SOL/ETH price
    /** @deprecated older results only */
    holdPnlUsd?: number;
    justHeldDiffUsd: number;
    verdict: "trading_won" | "should_have_held";
  };
  gas: { totalUsd: number; byChain: Partial<Record<ChainId, number>>; txCount: number; priciestTxUsd: number };
  /** Tokens they bought that are now dead. "caught" = lost money on it, "dodged" = got out even or better. */
  rugs: { count: number; lostUsd: number; tokens: string[]; dodged: number; dodgedTokens: string[] };
  airdrops: { count: number; valueUsd: number; tokens: string[] };
  sleep: { hourHistogramUtc: number[]; peakHourUtc: number; peakHourCount: number; topMinuteUtc: string; topMinuteCount: number };
  bridges: { hops: BridgeHop[]; journey: Venue[]; routes: { from: Venue; to: Venue; count: number; usd: number }[]; totalUsd: number };
  percentile: { activity: number | null }; // % of other lookups with fewer trades (null until the pool is big enough)
  roast?: { text: string; source: "ai" | "canned" };
  /** Newer stats (absent on results saved before they existed). */
  profitTimeline?: ProfitTimeline;
  speed?: SpeedStats;
  narratives?: NarrativeStats;
  appFees?: AppFeeStats;
  /** Only set when holdings were checked against the real wallet balance. */
  bags?: BagStats;
  sniper?: SniperStats;
  revenge?: RevengeStats;
  /** Story order, only cards with something worth saying. The UI renders exactly these. */
  cards: CardId[];
}

export type CardId =
  | "archetype" | "overview" | "pnl" | "profitTime" | "best" | "worst" | "roundTrip" | "paperHands" | "diamondHands" | "bags" | "speed" | "sniper" | "revenge" | "narrative"
  | "counterfactual" | "appFees" | "gas" | "rugs" | "airdrops" | "sleep" | "bridges" | "percentile" | "chains" | "roast" | "summary";

export function storyCards(s: Omit<WrappedStats, "cards">): CardId[] {
  const t = s.overview.totalTrades;
  const c: [CardId, boolean][] = [
    ["archetype", true],
    ["overview", t > 0],
    ["pnl", s.pnl.wins + s.pnl.losses > 0],
    ["profitTime", (s.profitTimeline?.points.length ?? 0) >= 3],
    ["best", !!s.bestTrade],
    ["worst", !!s.worstTrade],
    ["roundTrip", !!s.roundTrip],
    ["paperHands", !!s.paperHands],
    ["diamondHands", !!s.diamondHands],
    ["bags", (s.bags?.count ?? 0) > 0 && (s.bags?.costUsd ?? 0) >= 10],
    ["sniper", (s.sniper?.checked ?? 0) >= 10 && (s.sniper?.within60s ?? 0) >= 3],
    ["revenge", (s.revenge?.revenge.count ?? 0) >= 5],
    ["speed", (s.speed?.closedCount ?? 0) >= 3 && !!s.speed?.fastestFlip],
    ["narrative", !!s.narratives?.top.length && s.narratives.top[0].id !== "other" && s.narratives.coverage >= 0.15],
    ["counterfactual", Math.abs(s.counterfactual.justHeldDiffUsd) >= 50],
    ["appFees", (s.appFees?.totalUsd ?? 0) >= 1 && (s.appFees?.coverage ?? 0) >= 0.8],
    ["gas", s.gas.totalUsd >= 1],
    ["rugs", s.rugs.count + s.rugs.dodged > 0],
    ["airdrops", s.airdrops.count > 0],
    ["sleep", t >= 10],
    ["bridges", s.bridges.hops.length > 0],
    ["percentile", s.percentile.activity !== null],
    ["chains", Object.keys(s.pnl.byChain).length > 0],
    ["roast", !!s.roast?.text],
    ["summary", true],
  ];
  return c.filter(([, ok]) => ok).map(([id]) => id);
}

const card = (p: Position): TradeCard => {
  const boughtAmt = p.buys.reduce((s, f) => s + f.amount, 0);
  const soldAmt = p.sells.reduce((s, f) => s + f.amount, 0);
  return {
    symbol: p.token.symbol,
    name: p.token.name,
    icon: p.token.icon,
    chain: p.chain,
    address: p.token.address,
    pnlUsd: r2(p.pnl),
    costUsd: r2(p.costIn),
    proceedsUsd: r2(p.proceeds),
    holdingValueUsd: r2(p.currentValue),
    avgEntry: boughtAmt ? p.costIn / boughtAmt : 0,
    peakPrice: p.peakPrice,
    avgExit: soldAmt ? p.proceeds / soldAmt : null,
    firstTs: p.firstTs,
    lastTs: p.lastTs,
    partialHistory: p.partial,
  };
};

export function computeStats(input: {
  wallets: string[];
  timeframe: Timeframe;
  fromTs: number;
  events: UnifiedEvent[];
  positions: Map<string, Position>;
  bridges: BridgeHop[];
  pb: PriceBook;
  truncated: boolean;
  txCap: number;
  spamFiltered: number;
}): WrappedStats {
  const { events, positions, pb } = input;
  const now = Math.floor(Date.now() / 1000);
  // Every swap counts as a trade (incl. USDC->ETH). Best/worst cards only look at non-base tokens.
  const trades = events.filter((e) => !e.ownTransfer && (e.type === "swap" || (e.type === "mint" && e.out.length > 0)));
  const traded = [...positions.values()].filter((p) => p.buys.length || p.sells.length);

  // Overview
  const tradesByChain: Partial<Record<ChainId, number>> = {};
  let volume = 0;
  const days = new Set<number>();
  const hours = new Array(24).fill(0);
  const minutes = new Map<string, number>();
  for (const t of trades) {
    tradesByChain[t.chain] = (tradesByChain[t.chain] ?? 0) + 1;
    volume += Math.max(sum(t.in), sum(t.out));
    days.add(Math.floor(t.timestamp / DAY));
    const d = new Date(t.timestamp * 1000);
    hours[d.getUTCHours()]++;
    const hm = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
    minutes.set(hm, (minutes.get(hm) ?? 0) + 1);
  }
  const chainsUsed = [...new Set(events.filter((e) => e.in.length || e.out.length || e.gasNative).map((e) => e.chain))];
  const topChain = (Object.entries(tradesByChain).sort((a, b) => b[1] - a[1])[0]?.[0] as ChainId) ?? chainsUsed[0] ?? null;

  // PnL
  const realized = traded.reduce((s, p) => s + p.realized, 0);
  const unrealized = traded.reduce((s, p) => s + p.unrealized, 0);
  const closedish = traded.filter((p) => p.buys.length);
  const wins = closedish.filter((p) => p.pnl >= 1).length;
  const losses = closedish.filter((p) => p.pnl <= -1).length;

  const byPnl = [...closedish].sort((a, b) => b.pnl - a.pnl);
  const best = byPnl[0] && byPnl[0].pnl >= 1 ? byPnl[0] : null;
  const worst = byPnl.at(-1) && byPnl.at(-1)!.pnl <= -1 ? byPnl.at(-1)! : null;

  // Each story card prefers a token no earlier card used, so one coin doesn't take over the story.
  const used = new Set([best?.key, worst?.key].filter(Boolean) as string[]);
  const pick = <T extends { p: Position }>(cands: T[]): T | undefined => {
    const c = cands.find((x) => !used.has(x.p.key)) ?? cands[0];
    if (c) used.add(c.p.key);
    return c;
  };

  // Paper hands: biggest money left on the table after a sell (within 90 days, by known prices).
  const paperCands: { p: Position; s: Position["sells"][number]; peak: number; missed: number }[] = [];
  for (const p of traded) {
    const pts = pricePoints(p, pb.series(p.key), now);
    let bestForP: (typeof paperCands)[number] | undefined;
    for (const s of p.sells) {
      if (!s.price) continue;
      // Bought back in later: from then on they were holding again, so a run after that wasn't
      // missed by this sell (and their own top-buy price isn't a peak they "left on the table").
      const rebuy = minOf(p.buys.filter((b) => b.ts > s.ts).map((b) => b.ts));
      const later = pts.filter((x) => x.ts > s.ts && x.ts < rebuy && x.ts <= s.ts + 90 * DAY);
      const peak = maxOf(later.map((x) => x.price), 0);
      const missed = s.amount * (peak - s.price);
      if (peak > s.price * 1.5 && missed > 25 && missed > (bestForP?.missed ?? 0)) bestForP = { p, s, peak, missed };
    }
    if (bestForP) paperCands.push(bestForP);
  }
  const pp = pick(paperCands.sort((a, b) => b.missed - a.missed));
  const paper: WrappedStats["paperHands"] = pp
    ? { ...card(pp.p), soldAt: pp.s.price, soldTs: pp.s.ts, laterPeak: pp.peak, missedUsd: r2(pp.missed) }
    : null;

  // Round trip: biggest gap between peak gain and where they ended up.
  const rt = pick(
    closedish
      .filter((p) => traceable(p) && p.peakGain > 50 && p.pnl < p.peakGain * 0.3)
      .sort((a, b) => b.peakGain - b.pnl - (a.peakGain - a.pnl))
      .map((p) => ({ p })),
  )?.p;

  // Diamond hands: longest profitable hold (at least a week).
  const dh = pick(
    closedish
      .filter((p) => p.pnl >= 1 && !p.partial && traceable(p))
      .map((p) => ({ p, held: (p.holding > 0 ? now : p.lastTs) - p.buys[0].ts }))
      .filter((x) => x.held >= 7 * DAY)
      .sort((a, b) => b.held - a.held || b.p.pnl - a.p.pnl),
  );

  // "If you'd skipped every trade and just held SOL/ETH": trades are paid for in SOL (Solana) / ETH
  // (EVM) and sold back into it, so not trading would leave you with exactly the SOL/ETH your trades
  // won or lost: each position's result converted at the price when it was realized, valued today.
  // (Summing every buy as fresh money would count the same recycled stack over and over.)
  let actualPnl = 0, tradingNow = 0;
  const units: Partial<Record<"SOL" | "ETH", number>> = {};
  for (const p of closedish) {
    const m = counterfactualMajor(p.chain);
    const pNow = pb.majorNow(m);
    const pThen = pb.majorAt(m, p.lastTs) ?? pNow;
    if (!pNow || !pThen) continue;
    actualPnl += p.pnl;
    const u = p.realized / pThen + p.unrealized / pNow; // SOL/ETH won or lost on this token
    units[m] = (units[m] ?? 0) + u;
    tradingNow += u * pNow;
  }
  const usedMajors = (["SOL", "ETH"] as const).filter((m) => trades.some((t) => counterfactualMajor(t.chain) === m));

  // Gas
  const gasByChain: Partial<Record<ChainId, number>> = {};
  let gasTotal = 0, gasTx = 0, priciest = 0;
  const seenTx = new Set<string>();
  for (const e of events) {
    if (!e.gasUsd || seenTx.has(e.chain + e.txHash)) continue;
    seenTx.add(e.chain + e.txHash);
    gasByChain[e.chain] = (gasByChain[e.chain] ?? 0) + e.gasUsd; // round once at the end, not per fee
    gasTotal += e.gasUsd;
    gasTx++;
    priciest = Math.max(priciest, e.gasUsd);
  }

  // Rugs: bought it, it's now worth ~nothing or has no liquidity left.
  const rugged = closedish.filter(
    (p) =>
      p.costIn >= 10 &&
      (p.currentPrice === 0 || (p.liquidityUsd !== undefined && p.liquidityUsd < 1000) || (p.peakPrice > 0 && p.currentPrice < p.peakPrice * 0.05)),
  );

  // Airdrops
  const drops = events.filter((e) => e.type === "airdrop" && !e.ownTransfer && e.in.length);

  const peakHour = hours.indexOf(Math.max(...hours));
  const topMinute = [...minutes.entries()].sort((a, b) => b[1] - a[1])[0];

  const hops = [...input.bridges].sort((a, b) => a.ts - b.ts);
  const journey = journeyPath(routes(hops));

  const overview = {
    totalTrades: trades.length,
    volumeUsd: r2(volume),
    chainsUsed,
    topChain,
    tradesByChain,
    tokensTraded: traded.length,
    activeDays: days.size,
  };
  const winRate = wins + losses ? wins / (wins + losses) : 0;

  return {
    meta: {
      wallets: input.wallets,
      timeframe: input.timeframe,
      fromTs: input.fromTs,
      toTs: now,
      generatedAt: new Date().toISOString(),
      eventCount: events.length,
      truncated: input.truncated,
      txCap: input.txCap,
      spamFiltered: input.spamFiltered,
      note: "All USD figures are estimates from public price data. Coins with no price are valued at $0.",
    },
    archetype: archetype(overview, winRate, closedish, input.truncated ? events[0]?.timestamp ?? input.fromTs : input.fromTs, now),
    overview,
    pnl: { realizedUsd: r2(realized), unrealizedUsd: r2(unrealized), totalUsd: r2(realized + unrealized), winRate: r2(winRate), wins, losses, byChain: pnlByChain(traded, tradesByChain) },
    bestTrade: best ? card(best) : null,
    worstTrade: worst ? card(worst) : null,
    roundTrip: rt ? { ...card(rt), peakGainUsd: r2(rt.peakGain), peakTs: rt.peakGainTs, endedWithUsd: r2(rt.pnl) } : null,
    paperHands: paper,
    diamondHands: dh ? { ...card(dh.p), daysHeld: Math.round(dh.held / DAY), stillHolding: dh.p.holding > 0 } : null,
    counterfactual: {
      major: usedMajors.length === 2 ? "SOL+ETH" : usedMajors[0] ?? "ETH",
      tradingPnlUsd: r2(actualPnl),
      tradingUnits: usedMajors.length === 1 ? Math.round((units[usedMajors[0]] ?? 0) * 1e4) / 1e4 : null,
      tradingNowUsd: r2(tradingNow),
      justHeldDiffUsd: r2(-tradingNow), // > 0: not trading would have left you this much more
      verdict: tradingNow >= 0 ? "trading_won" : "should_have_held",
    },
    gas: { totalUsd: r2(gasTotal), byChain: Object.fromEntries(Object.entries(gasByChain).map(([c, v]) => [c, r2(v!)])), txCount: gasTx, priciestTxUsd: r2(priciest) },
    rugs: (() => {
      const caught = rugged.filter((p) => p.pnl <= -1);
      const dodged = rugged.filter((p) => p.pnl > -1);
      const names = (ps: Position[]) => [...new Set(ps.map((p) => p.token.symbol))].slice(0, 10);
      return {
        count: caught.length,
        lostUsd: r2(caught.reduce((s, p) => s + p.pnl, 0)),
        tokens: names(caught.sort((a, b) => a.pnl - b.pnl)),
        dodged: dodged.length,
        dodgedTokens: names(dodged.sort((a, b) => b.pnl - a.pnl)),
      };
    })(),
    airdrops: {
      count: drops.length,
      valueUsd: r2(drops.reduce((s, e) => s + sum(e.in), 0)),
      tokens: [...new Set(drops.flatMap((e) => e.in.map((l) => l.token.symbol)))].slice(0, 10),
    },
    sleep: {
      hourHistogramUtc: hours,
      peakHourUtc: peakHour,
      peakHourCount: hours[peakHour],
      topMinuteUtc: topMinute?.[0] ?? "",
      topMinuteCount: topMinute?.[1] ?? 0,
    },
    bridges: { hops: hops.slice(-50), journey, routes: routes(hops), totalUsd: r2(hops.reduce((s, h) => s + h.usd, 0)) },
    percentile: { activity: null },
    profitTimeline: profitTimeline(traded, input.fromTs),
    speed: speedStats(traded.filter((p) => !isMoney(p.token)), trades),
    narratives: narrativeStats(traded.filter((p) => !isMoney(p.token))),
    appFees: appFeeStats(trades),
    revenge: revengeStats(traded),
    cards: [],
  };
}

const sum = (legs: { usd: number | null }[]) => legs.reduce((s, l) => s + (l.usd ?? 0), 0);

function archetype(
  o: { totalTrades: number; tradesByChain: Partial<Record<ChainId, number>>; activeDays: number },
  winRate: number,
  positions: Position[],
  fromTs: number,
  now: number,
): WrappedStats["archetype"] {
  // Pace over the time you were actually trading (a wallet that started last month isn't a
  // once-a-month trader because the window is a year).
  const firstTrade = minOf(positions.map((p) => p.firstTs), now);
  const months = Math.max(1, (now - Math.max(fromTs, firstTrade)) / (30 * DAY));
  const perMonth = o.totalTrades / months;
  const holds = positions.filter((p) => p.sells.length).map((p) => p.sells[0].ts - p.firstTs);
  const medianHold = holds.length ? holds.sort((a, b) => a - b)[Math.floor(holds.length / 2)] : Infinity;
  const ranked = (Object.entries(o.tradesByChain) as [ChainId, number][]).sort((a, b) => b[1] - a[1]);
  const [top, second] = ranked;

  let style = "tourist";
  if (perMonth >= 150) style = "degen";
  else if (perMonth >= 40) style = "trader";
  else if (perMonth >= 8) style = "swing trader";
  if (perMonth >= 20 && medianHold < 3600) style = "sniper";
  if (perMonth >= 8 && winRate >= 0.6) style = "assassin";
  if (o.totalTrades > 0 && perMonth < 8 && medianHold > 60 * DAY) style = "diamond-handed holder";

  if (!top) return { title: "Onchain Ghost", tagline: "Barely a footprint. Mysterious.", style: "ghost" };
  const title = `${CHAIN_LABEL[top[0]]} ${style}`;
  const side = second && second[1] / o.totalTrades >= 0.15 ? ` with a ${CHAIN_LABEL[second[0]]} side hustle` : "";
  const tagline =
    style === "degen" ? "Sleep is a suggestion. Charts are a lifestyle." :
    style === "sniper" ? "In and out before the candle closes." :
    style === "assassin" ? "Picks fights, mostly wins them." :
    style === "diamond-handed holder" ? "Buys, then forgets the password. Respect." :
    style === "trader" ? "Shows up every day, clocks in at the DEX." :
    style === "swing trader" ? "Waits for the setup. Sometimes." :
    "Passing through, taking photos.";
  return { title: `${title}${side}`, tagline, style };
}

function routes(hops: BridgeHop[]) {
  const m = new Map<string, { from: Venue; to: Venue; count: number; usd: number }>();
  for (const h of hops) {
    const k = h.from + ">" + h.to;
    const r = m.get(k) ?? { from: h.from, to: h.to, count: 0, usd: 0 };
    r.count++; r.usd = r2(r.usd + h.usd);
    m.set(k, r);
  }
  return [...m.values()].sort((a, b) => b.count - a.count);
}

/** We saw how this position ended: mostly sold or still held, not moved to wallets we can't see. */
function traceable(p: Position): boolean {
  const bought = p.buys.reduce((s, f) => s + f.amount, 0);
  return !p.untracedExit && (!bought || p.sentAwayKnown <= bought * 0.5);
}

/**
 * The story path: start from the most-used route, follow the most-used route out of its end,
 * then walk back from its start. "Ethereum → Arbitrum → Hyperliquid" rather than hop order.
 */
function journeyPath(rs: { from: Venue; to: Venue; count: number; usd: number }[]): Venue[] {
  if (!rs.length) return [];
  const sorted = [...rs].sort((a, b) => b.count - a.count || b.usd - a.usd);
  const path: Venue[] = [sorted[0].from, sorted[0].to];
  for (let next; (next = sorted.find((r) => r.from === path.at(-1) && !path.includes(r.to))); ) path.push(next.to);
  for (let prev; (prev = sorted.find((r) => r.to === path[0] && !path.includes(r.from))); ) path.unshift(prev.from);
  for (const r of sorted) for (const v of [r.from, r.to]) if (!path.includes(v)) path.push(v);
  return path.slice(0, 8);
}

function pnlByChain(traded: Position[], tradesByChain: Partial<Record<ChainId, number>>) {
  const out: Partial<Record<ChainId, { pnlUsd: number; trades: number; tokens: number }>> = {};
  for (const p of traded) {
    const c = (out[p.chain] ??= { pnlUsd: 0, trades: tradesByChain[p.chain] ?? 0, tokens: 0 });
    c.pnlUsd += p.pnl;
    c.tokens++;
  }
  for (const c of Object.values(out)) c!.pnlUsd = r2(c!.pnlUsd);
  return out;
}
