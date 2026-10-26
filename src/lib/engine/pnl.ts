import type { ChainId, TokenRef, UnifiedEvent } from "../core/types";
import { tokenKey } from "../core/types";
import { isMoney } from "../core/assets";
import type { PriceBook, PricePoint } from "../prices/pricebook";

// FIFO cost basis per token across ALL linked wallets (one identity).
// SOL/ETH/BNB/POL/stables are treated as "money", not positions: PnL is measured in USD
// on everything the user bought *with* that money. All numbers are estimates.

/** known=false: arrived by transfer, we don't know what they paid -> break-even when sold. */
interface Lot { amount: number; cost: number; ts: number; known: boolean }

export interface Fill { ts: number; amount: number; usd: number; price: number }

export interface Position {
  key: string;
  token: TokenRef;
  chain: ChainId;
  buys: Fill[];
  sells: Fill[];
  costIn: number; // USD spent buying
  proceeds: number; // USD received selling
  realized: number;
  holding: number; // amount still held (all lots)
  holdingKnown: number; // part of holding with a known cost basis (counts toward PnL)
  openCost: number; // cost basis of the known part still held
  currentPrice: number;
  currentValue: number;
  unrealized: number;
  pnl: number; // realized + unrealized
  firstTs: number;
  lastTs: number;
  /** Highest (realized + mark-to-market) gain reached at any point. Powers "round trip". */
  peakGain: number;
  peakGainTs: number;
  peakPrice: number;
  /** Sold more than we saw them buy (bought before the timeframe / via unlinked wallet). */
  partial: boolean;
  /** Amount of bought (known-basis) tokens later sent to an unlinked wallet. */
  sentAwayKnown: number;
  /** Amount that left by a route we couldn't see (found by checking the real balance). */
  untracedExit?: number;
  airdropped: boolean;
  liquidityUsd?: number;
  /** Timeline of holdings, used by stats for paper-hands math. */
  timeline: { ts: number; holding: number; holdingKnown: number; openCost: number; realized: number }[];
}

export interface PnlOptions {
  /** Real current balances (tokenKey -> amount) for chains where we can check them (Solana). */
  actualBalances?: Map<string, number>;
}

export function runPnl(events: UnifiedEvent[], pb: PriceBook, opts: PnlOptions = {}): Map<string, Position> {
  const pos = new Map<string, Position>();
  const lots = new Map<string, Lot[]>();
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);

  const get = (t: TokenRef, ts: number) => {
    const k = tokenKey(t);
    let p = pos.get(k);
    if (!p) {
      p = {
        key: k, token: t, chain: t.chain, buys: [], sells: [], costIn: 0, proceeds: 0, realized: 0,
        holding: 0, holdingKnown: 0, openCost: 0, currentPrice: 0, currentValue: 0, unrealized: 0, pnl: 0,
        firstTs: ts, lastTs: ts, peakGain: 0, peakGainTs: ts, peakPrice: 0, partial: false, sentAwayKnown: 0, airdropped: false, timeline: [],
      };
      pos.set(k, p);
      lots.set(k, []);
    }
    return p;
  };

  const acquire = (p: Position, amount: number, cost: number, ts: number, known = true) => {
    lots.get(p.key)!.push({ amount, cost: known ? cost : 0, ts, known });
    p.holding += amount;
    if (known) { p.holdingKnown += amount; p.openCost += cost; }
  };
  /** Remove `amount` FIFO; returns cost basis removed (null portion if we never saw the buy). */
  /** Remove `amount` FIFO. Returns cost of known lots removed and how much of the amount had a known basis. */
  const dispose = (p: Position, amount: number): { cost: number; knownAmt: number } => {
    const q = lots.get(p.key)!;
    let left = amount, cost = 0, knownAmt = 0;
    while (left > 1e-12 && q.length) {
      const lot = q[0];
      const take = Math.min(lot.amount, left);
      const c = (lot.cost * take) / lot.amount;
      if (lot.known) { knownAmt += take; cost += c; p.holdingKnown = Math.max(0, p.holdingKnown - take); }
      lot.cost -= c; lot.amount -= take; left -= take;
      if (lot.amount <= 1e-12) q.shift();
    }
    p.holding = Math.max(0, p.holding - (amount - left));
    p.openCost = Math.max(0, p.openCost - cost);
    return { cost, knownAmt };
  };
  const snap = (p: Position, ts: number) => {
    p.lastTs = ts;
    p.timeline.push({ ts, holding: p.holding, holdingKnown: p.holdingKnown, openCost: p.openCost, realized: p.realized });
  };

  for (const e of sorted) {
    if (e.ownTransfer) continue;
    const isTrade = e.type === "swap" || (e.type === "mint" && e.out.length > 0);
    for (const l of e.out) {
      if (isMoney(l.token)) continue;
      const p = get(l.token, e.timestamp);
      const usd = l.usd ?? 0;
      const { cost, knownAmt } = dispose(p, l.amount);
      if (isTrade) {
        // Part we never saw them pay for (bought earlier / transferred in): assume break-even, don't invent PnL.
        const knownShare = l.amount > 0 ? knownAmt / l.amount : 1;
        if (knownShare < 0.999) p.partial = true;
        p.realized += usd * knownShare - cost;
        p.proceeds += usd;
        p.sells.push({ ts: e.timestamp, amount: l.amount, usd, price: l.amount ? usd / l.amount : 0 });
      } else {
        p.sentAwayKnown += knownAmt; // bought here, then moved to a wallet we can't see
      }
      snap(p, e.timestamp);
    }
    for (const l of e.in) {
      if (isMoney(l.token)) continue;
      const p = get(l.token, e.timestamp);
      const usd = l.usd ?? 0;
      if (isTrade) {
        acquire(p, l.amount, usd, e.timestamp);
        p.costIn += usd;
        p.buys.push({ ts: e.timestamp, amount: l.amount, usd, price: l.amount ? usd / l.amount : 0 });
      } else if (e.type === "airdrop" || e.type === "mint") {
        acquire(p, l.amount, 0, e.timestamp); // free tokens: zero cost basis
        p.airdropped = true;
      } else {
        acquire(p, l.amount, 0, e.timestamp, false); // transfers in: unknown cost basis
      }
      snap(p, e.timestamp);
    }
  }

  const now = Math.floor(Date.now() / 1000);
  // Reconcile with reality: if we think they still hold more than the chain says, the rest left by a
  // route we couldn't see (bot / delegate / unlinked wallet). Treat it as moved away, not a dead bag.
  if (opts.actualBalances) {
    for (const p of pos.values()) {
      if (p.chain !== "solana" || p.holding <= 0) continue;
      const actual = opts.actualBalances.get(p.key) ?? 0;
      const excess = p.holding - actual;
      if (excess > Math.max(1e-9, p.holding * 0.01)) {
        const { knownAmt } = dispose(p, excess);
        p.sentAwayKnown += knownAmt;
        p.untracedExit = excess;
        snap(p, now);
      }
    }
  }
  for (const p of pos.values()) {
    p.currentPrice = pb.current(p.key) ?? 0; // no price anywhere = dead coin
    p.liquidityUsd = pb.liquidity(p.key);
    p.currentValue = p.holding * p.currentPrice;
    p.unrealized = p.holdingKnown * p.currentPrice - p.openCost;
    p.pnl = p.realized + p.unrealized;
    computePeak(p, pb.series(p.key), now);
  }
  return pos;
}

/** Price points we know for a position: history series + every fill we observed + current. */
export function pricePoints(p: Position, series: PricePoint[], now: number): PricePoint[] {
  const pts = [
    ...series,
    ...p.buys.map((f) => ({ ts: f.ts, price: f.price })),
    ...p.sells.map((f) => ({ ts: f.ts, price: f.price })),
    { ts: now, price: p.currentPrice },
  ].filter((x) => x.price > 0 || x.ts === now);
  return pts.sort((a, b) => a.ts - b.ts);
}

function computePeak(p: Position, series: PricePoint[], now: number) {
  const pts = pricePoints(p, series, now).filter((x) => x.ts >= p.firstTs);
  let i = 0;
  let state = { holding: 0, holdingKnown: 0, openCost: 0, realized: 0 };
  for (const pt of pts) {
    while (i < p.timeline.length && p.timeline[i].ts <= pt.ts) state = p.timeline[i++];
    const gain = state.realized + state.holdingKnown * pt.price - state.openCost;
    if (state.holding > 0 && pt.price > p.peakPrice) p.peakPrice = pt.price;
    if (gain > p.peakGain) { p.peakGain = gain; p.peakGainTs = pt.ts; }
  }
}
