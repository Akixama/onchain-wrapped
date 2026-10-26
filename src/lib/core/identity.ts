import type { UnifiedEvent, Venue } from "./types";
import { majorOf } from "./assets";

export const isEvmAddress = (a: string) => /^0x[a-fA-F0-9]{40}$/.test(a);
export const isSolanaAddress = (a: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a);
export const normalizeAddress = (a: string) => (isEvmAddress(a) ? a.toLowerCase() : a.trim());

export interface BridgeHop {
  from: Venue;
  to: Venue;
  ts: number;
  usd: number;
  asset: string;
}

/** Deposit addresses of venues we don't index yet. Sending here = moving money to your own account there. */
const VENUE_DOORS: Record<string, Venue> = {
  "arbitrum:0x2df1c51e09aecf9cacb7bc98cb1742757f163df7": "hyperliquid", // Hyperliquid Bridge2 (USDC)
};

// A labeled DEX/aggregator on an unlabeled transfer means it's a trade settlement, not a bridge.
const DEX_PROTOCOL = /swap|uniswap|sushi|curve|balancer|1inch|0x|paraswap|kyber|odos|cow|aerodrome|velodrome|pancake|jupiter|raydium|orca|meteora|pump/i;

const legsUsd = (legs: UnifiedEvent["in"]) => legs.reduce((s, l) => s + (l.usd ?? 0), 0);

/**
 * ONE PERSON, MANY WALLETS.
 * 1. Transfers whose counterparty is another linked wallet are flagged ownTransfer (ignored by PnL).
 * 2. Deposits to / withdrawals from venues we can't index (Hyperliquid) become journey hops.
 * 3. Bridges: an outflow on chain A matched with an inflow on chain B (any linked wallet) becomes a hop;
 *    both sides become neutral for PnL. Labeled bridges get a loose match, unlabeled ones a strict one.
 */
export function mergeIdentity(events: UnifiedEvent[], wallets: string[]): { events: UnifiedEvent[]; bridges: BridgeHop[] } {
  const own = new Set(wallets.map(normalizeAddress));
  const bridges: BridgeHop[] = [];

  for (const e of events) {
    const legs = [...e.in, ...e.out];
    if (!legs.length) continue;
    if (
      (e.type === "transfer_in" || e.type === "transfer_out") &&
      legs.every((l) => l.counterparty && own.has(normalizeAddress(l.counterparty)))
    ) {
      e.ownTransfer = true;
      continue;
    }
    const cp = legs[0].counterparty;
    const venue = cp ? VENUE_DOORS[`${e.chain}:${normalizeAddress(cp)}`] : undefined;
    if (venue && (e.type === "transfer_out" || e.type === "transfer_in" || e.type.startsWith("bridge"))) {
      const out = e.out.length > 0;
      e.type = out ? "bridge_out" : "bridge_in";
      e.ownTransfer = true;
      bridges.push({
        from: out ? e.chain : venue,
        to: out ? venue : e.chain,
        ts: e.timestamp,
        usd: legsUsd(out ? e.out : e.in),
        asset: legs[0].token.symbol,
      });
    }
  }

  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const outs = sorted.filter((e) => (e.type === "bridge_out" || e.type === "transfer_out") && !e.ownTransfer && e.out.length);
  const ins = sorted.filter((e) => (e.type === "bridge_in" || e.type === "transfer_in") && !e.ownTransfer && e.in.length);
  const used = new Set<string>();

  for (const o of outs) {
    const oVal = legsUsd(o.out);
    if (oVal < 5) continue;
    const labeledOut = o.type === "bridge_out";
    const match = ins.find((i) => {
      if (used.has(i.id) || i.chain === o.chain || i.timestamp < o.timestamp) return false;
      const labeled = labeledOut || i.type === "bridge_in";
      const dt = i.timestamp - o.timestamp;
      const iVal = legsUsd(i.in);
      if (labeled) return dt < 3 * 3600 && within(iVal, oVal, 0.2);
      // Unlabeled on both sides: same kind of money, arrives within the hour, loses at most ~3% in fees.
      return (
        !DEX_PROTOCOL.test(o.protocol ?? "") &&
        !DEX_PROTOCOL.test(i.protocol ?? "") &&
        sameMoney(o, i) &&
        dt < 3600 &&
        iVal <= oVal * 1.005 &&
        iVal >= oVal * 0.97
      );
    });
    if (!match) continue;
    used.add(match.id);
    o.type = "bridge_out";
    match.type = "bridge_in";
    o.ownTransfer = match.ownTransfer = true;
    bridges.push({ from: o.chain, to: match.chain, ts: o.timestamp, usd: oVal, asset: o.out[0].token.symbol });
  }
  return { events, bridges };
}

const within = (a: number, b: number, tol: number) => b > 0 && Math.abs(a - b) / b <= tol;
const sameMoney = (o: UnifiedEvent, i: UnifiedEvent) => {
  const mo = majorOf(o.out[0].token), mi = majorOf(i.in[0].token);
  return !!mo && mo === mi;
};
