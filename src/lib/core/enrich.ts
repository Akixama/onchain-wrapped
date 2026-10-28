import type { Leg, UnifiedEvent } from "./types";
import { tokenKey } from "./types";
import { NATIVE, canonicalToken, isMoney, majorOf } from "./assets";
import { type PriceBook, priceAt } from "../prices/pricebook";

/**
 * Fill USD values and gas, and canonicalize wrapped natives.
 * Swaps are valued by their "money side" (SOL/ETH/stables) when present: that price is reliable,
 * and it gives us an implied price for memecoins that no price API covers.
 */
export function enrichEvents(events: UnifiedEvent[], pb: PriceBook): UnifiedEvent[] {
  for (const e of events) {
    for (const l of [...e.in, ...e.out]) l.token = canonicalToken(l.token);
    mergeSameToken(e);

    const majorPx = pb.majorAt(NATIVE[e.chain].major, e.timestamp) ?? 0;
    if (e.gasUsd === null) e.gasUsd = e.gasNative * majorPx;
    if (e.appFee && e.appFee.usd == null) e.appFee.usd = majorPx ? e.appFee.native * majorPx : null;

    for (const l of [...e.in, ...e.out]) {
      const m = majorOf(l.token);
      const px = m ? pb.majorAt(m, e.timestamp) : null;
      // The provider's own USD value (priced at the exact transaction time) wins; otherwise use our
      // hourly price. Never overwrite with 0.
      if (m && px && !(l.usd && l.usd > 0)) l.usd = l.amount * px;
    }

    if (e.type === "swap" || e.type === "mint") {
      const baseIn = sumBase(e.in), baseOut = sumBase(e.out);
      const tradeValue = baseOut ?? baseIn; // what was paid, or what was received
      // A swap that also hands back a dust amount of another coin (a few raw units, seen on pump.fun
      // pools) would otherwise get half the cost split onto that dust: drop the dust legs.
      for (const side of ["in", "out"] as const) {
        const coins = e[side].filter((l) => !isMoney(l.token));
        const real = coins.filter((l) => !isDust(l));
        if (coins.length > 1 && real.length && real.length < coins.length) e[side] = e[side].filter((l) => isMoney(l.token) || !isDust(l));
      }
      const otherSide = baseOut !== null ? e.in : e.out;
      const nonBase = otherSide.filter((l) => !isMoney(l.token));
      if (tradeValue !== null && nonBase.length) {
        const known = nonBase.reduce((s, l) => s + (l.usd ?? 0), 0);
        for (const l of nonBase) l.usd = known > 0 ? (tradeValue * (l.usd ?? 0)) / known : tradeValue / nonBase.length;
      }
    }

    for (const l of [...e.in, ...e.out]) {
      if (l.usd === null) {
        const p = priceAt(pb.series(tokenKey(l.token)), e.timestamp);
        l.usd = p !== null ? p * l.amount : null;
      }
    }
  }
  return events;
}

/** At most a thousand of the coin's smallest units (e.g. 0.000001 of a 6-decimal coin). */
const isDust = (l: Leg) => l.token.decimals != null && l.amount * 10 ** l.token.decimals <= 1000;

function sumBase(legs: Leg[]): number | null {
  const b = legs.filter((l) => isMoney(l.token) && (majorOf(l.token) || l.usd !== null));
  return b.length ? b.reduce((s, l) => s + (l.usd ?? 0), 0) : null;
}

function mergeSameToken(e: UnifiedEvent) {
  // After canonicalization WETH+ETH might both appear on one side; collapse them.
  for (const side of ["in", "out"] as const) {
    const m = new Map<string, Leg>();
    for (const l of e[side]) {
      const k = tokenKey(l.token);
      const cur = m.get(k);
      if (cur) {
        cur.amount += l.amount;
        cur.usd = cur.usd === null || l.usd === null ? null : cur.usd + l.usd;
      } else m.set(k, { ...l });
    }
    e[side] = [...m.values()];
  }
  // Same token on both sides (wrap/unwrap) -> net it out.
  for (const i of e.in) {
    const o = e.out.find((x) => tokenKey(x.token) === tokenKey(i.token));
    if (!o) continue;
    const net = i.amount - o.amount;
    if (net >= 0) { i.amount = net; o.amount = 0; } else { o.amount = -net; i.amount = 0; }
  }
  e.in = e.in.filter((l) => l.amount > 0);
  e.out = e.out.filter((l) => l.amount > 0);
  if (e.type === "swap" && (!e.in.length || !e.out.length)) {
    e.type = e.in.length ? "transfer_in" : e.out.length ? "transfer_out" : "other";
  }
}
