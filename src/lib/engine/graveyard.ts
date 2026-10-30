// The Coin Graveyard: every coin the user held that has since died, with a cause of death and an epitaph.
// Works from data the lookup already has (positions, current price, pool size, 24h volume). The biggest
// graves also get real candles, which give an actual death date and tell a crash from a slow bleed.
import { isMoney } from "../core/assets";
import type { ChainId } from "../core/types";
import { fetchJson } from "../infra/http";
import { fetchCandles, GT_NETWORK, topPool, type Candle, type JsonFetcher } from "../gecko";
import type { PriceBook } from "../prices/pricebook";
import type { Position } from "./pnl";

import { CAUSE_LABEL, type DeathCause } from "./graveyard-labels";
export { CAUSE_LABEL, type DeathCause };

export interface Grave {
  symbol: string;
  name?: string;
  icon?: string;
  chain: ChainId;
  address: string;
  /** First time this wallet touched the coin. */
  bornTs: number;
  /** When it died. `diedExact` = read from real candles; otherwise our best estimate. */
  diedTs: number;
  diedExact: boolean;
  /** USD put in / got out of this coin (the same numbers as the PnL). */
  putInUsd: number;
  gotOutUsd: number;
  cause: DeathCause;
  epitaph: string;
  /** How far it fell from its peak (0.97 = -97%); null when there's no price left at all. */
  dropFromPeak: number | null;
}

export interface Graveyard {
  /** Every dead coin (the list below is the biggest ones). */
  count: number;
  buriedUsd: number;
  gotOutUsd: number;
  causes: Record<DeathCause, number>;
  topCause: DeathCause | null;
  mostExpensive: Grave | null;
  graves: Grave[];
  epitaphSource: "ai" | "canned";
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const DAY = 86400;
const MIN_BURIED = Number(process.env.GRAVE_MIN_USD ?? 5); // ignore dust
const MAX_GRAVES = Number(process.env.GRAVE_MAX ?? 60);
const CANDLE_GRAVES = Number(process.env.GRAVE_CANDLES ?? 6);

interface Death { dead: boolean; noPrice: boolean; pulled: boolean; drop: number | null }

/**
 * Dead = no price anywhere any more, OR the pool was pulled (under $1k), OR down 95%+ from its peak with
 * little left behind it (pool under $10k or under $500 traded in 24h). When the pool wasn't checked, the
 * 95% drop alone counts.
 */
export function deathOf(p: Position, pb: PriceBook): Death {
  const price = pb.current(p.key);
  const liq = p.liquidityUsd ?? pb.liquidity(p.key);
  const vol = pb.volume24h?.(p.key);
  const noPrice = !price;
  const pulled = liq !== undefined && liq < 1000;
  const drop = p.peakPrice > 0 && price ? 1 - price / p.peakPrice : null;
  const crashed = drop !== null && drop >= 0.95;
  const quiet = (liq !== undefined && liq < 10_000) || (vol !== undefined && vol < 500) || liq === undefined;
  return { dead: noPrice || pulled || (crashed && quiet), noPrice, pulled, drop };
}

/** From the user's own fills: did the price lose 90% within 3 days of the top fill? Returns when. */
function fastCrash(p: Position): number | null {
  const fills = [...p.buys, ...p.sells].filter((f) => f.price > 0).sort((a, b) => a.ts - b.ts);
  let top = fills[0];
  for (const f of fills) {
    if (!top || f.price > top.price) top = f;
    else if (f.price < top.price * 0.1 && f.ts - top.ts <= 3 * DAY) return f.ts;
  }
  return null;
}

/** Cause and date from real candles: a fall to 10% of the peak in two days or less is a rug. */
function fromCandles(c: Candle[], now: number): { cause: DeathCause; ts: number } | null {
  if (c.length < 2) return null;
  let peak = 0, peakAt = 0;
  for (let i = 0; i < c.length; i++) if (Math.max(c[i][1], c[i][4]) > peak) { peak = Math.max(c[i][1], c[i][4]); peakAt = i; }
  for (let i = peakAt; i < c.length; i++) {
    if (c[i][4] < peak * 0.1) return { cause: c[i][0] - c[peakAt][0] <= 2 * DAY ? "rug" : "slow_bleed", ts: c[i][0] };
    if (c[i][1] > 0 && c[i][4] < c[i][1] * 0.2) return { cause: "rug", ts: c[i][0] }; // one candle -80%
  }
  // Never crashed but trading stopped: the last candle is long ago.
  const last = c[c.length - 1][0];
  if (now - last > 14 * DAY) return { cause: "abandoned", ts: last };
  return null;
}

function heuristic(p: Position, d: Death, pb: PriceBook): { cause: DeathCause; ts: number; exact: boolean } {
  const crash = fastCrash(p);
  const vol = pb.volume24h?.(p.key);
  // Their last real buy or sell (later dust/spam transfers don't count as the coin being alive).
  const lastSeen = Math.max(p.buys.at(-1)?.ts ?? 0, p.sells.at(-1)?.ts ?? 0) || p.lastTs;
  if (d.pulled && (crash !== null || p.lastTs - p.firstTs <= 3 * DAY)) return { cause: "rug", ts: crash ?? lastSeen, exact: false };
  if (crash !== null) return { cause: "rug", ts: crash, exact: false };
  if (!d.noPrice && vol !== undefined && vol < 100) return { cause: "abandoned", ts: lastSeen, exact: false };
  if (d.drop !== null && d.drop >= 0.95) return { cause: "slow_bleed", ts: lastSeen, exact: false };
  if (d.pulled) return { cause: "rug", ts: lastSeen, exact: false };
  // No price and no pool anywhere: the market for it simply stopped existing (typical of launchpad coins
  // that never took off). Only when we know nothing at all is the cause unknown.
  if (d.noPrice && p.buys.some((f) => f.price > 0)) return { cause: "abandoned", ts: lastSeen, exact: false };
  return { cause: "unknown", ts: lastSeen, exact: false };
}

// ---- Epitaphs -------------------------------------------------------------------------------------

const TEMPLATES: Record<DeathCause, string[]> = {
  rug: [
    "Here lies $S. The devs left. So did the liquidity. So did you, a bit late.",
    "$S: launched with love, rugged with precision.",
    "Gone before the chart finished loading. RIP $S.",
    "$S promised the moon. Delivered a crater.",
    "The dev said \"trust me.\" $S's last words.",
    "$S didn't die. It was taken out back.",
  ],
  slow_bleed: [
    "$S died the way it lived: one red candle at a time.",
    "Every dip was a buying opportunity. Until $S ran out of dips.",
    "$S bled out slowly while you said \"it'll come back.\"",
    "Down only, but consistently. Rest easy, $S.",
    "$S fought the chart for months. The chart won.",
    "$S's last words: \"just a healthy pullback.\"",
  ],
  abandoned: [
    "$S: no rug, no crash. Everyone just... left.",
    "Last seen with one holder and zero volume. RIP $S.",
    "$S didn't die. It was ghosted.",
    "The chat went quiet, then the chart did. Farewell $S.",
    "Nobody came to $S's funeral. Nobody came to its chart either.",
  ],
  unknown: [
    "$S is gone. The chain won't say how.",
    "Cause of death: unclear. Your money: also unclear.",
    "$S vanished without a trace, unlike your loss.",
    "We searched every DEX. $S is no more.",
  ],
};

// For coins they got out of with a profit before it died: the jokes about losses don't fit.
const ESCAPED = [
  "$S died. You left the funeral early, with a profit.",
  "You sold $S before the shovels came out. Respect.",
  "$S went to zero. You went to the bank.",
  "Got out of $S green. It didn't get out at all.",
];

const hash = (s: string) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
const tidy = (sym: string) => (sym.startsWith("$") ? sym : `$${sym}`).slice(0, 14);
export const cannedEpitaph = (g: Pick<Grave, "symbol" | "address" | "cause" | "putInUsd" | "gotOutUsd">) => {
  const list = g.gotOutUsd > g.putInUsd ? ESCAPED : TEMPLATES[g.cause];
  return list[hash(g.address) % list.length].replace(/\$S/g, tidy(g.symbol));
};

async function aiEpitaphs(graves: Grave[]): Promise<string[] | null> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const { logUsage } = await import("../infra/usage");
  const client = new Anthropic({ timeout: 25_000, maxRetries: 1 });
  const t0 = Date.now();
  let status = 200;
  const facts = graves.map((g, i) => `${i + 1}. ${tidy(g.symbol)} | cause: ${CAUSE_LABEL[g.cause]} | put in $${Math.round(g.putInUsd)} | got out $${Math.round(g.gotOutUsd)} | lived ${Math.max(1, Math.round((g.diedTs - g.bornTs) / DAY))} days`).join("\n");
  try {
    const res = await client.messages.create({
      model: process.env.ROAST_MODEL ?? "claude-opus-5-5",
      max_tokens: 2500,
      output_config: { effort: "low" },
      system: "You write short, funny gravestone epitaphs for dead memecoins in a crypto year-in-review. One line each, under 90 characters, no hashtags, no emojis, never mention people or wallets. Punch at the coin and the trade, not the reader. Reply with a JSON array of strings, one per coin, in order.",
      messages: [{ role: "user", content: facts }],
    });
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
    const arr = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1));
    return Array.isArray(arr) && arr.length === graves.length && arr.every((x) => typeof x === "string" && x.length <= 120) ? arr : null;
  } catch (e) {
    status = 599;
    console.error("[graveyard]", String(e).slice(0, 160));
    return null;
  } finally {
    logUsage({ provider: "anthropic", endpoint: "messages", status, ms: Date.now() - t0 });
  }
}

// ---- Build ----------------------------------------------------------------------------------------

const gt: JsonFetcher = (url) => fetchJson("geckoterminal", url, { endpoint: url.includes("/ohlcv/") ? "ohlcv" : "token-pools" }, 3);

export async function buildGraveyard(positions: Iterable<Position>, pb: PriceBook, now: number, stopAt?: number): Promise<Graveyard> {
  const dead: { p: Position; d: Death }[] = [];
  for (const p of positions) {
    if (p.token.address === "native" || isMoney(p.token) || p.costIn < MIN_BURIED) continue;
    const d = deathOf(p, pb);
    if (d.dead) dead.push({ p, d });
  }
  dead.sort((a, b) => b.p.costIn - a.p.costIn);

  const graves: Grave[] = dead.map(({ p, d }) => {
    const h = heuristic(p, d, pb);
    const g: Grave = {
      symbol: p.token.symbol, name: p.token.name, icon: p.token.icon, chain: p.chain, address: p.token.address,
      bornTs: p.firstTs, diedTs: Math.max(h.ts, p.firstTs), diedExact: false,
      putInUsd: r2(p.costIn), gotOutUsd: r2(p.proceeds), cause: h.cause, epitaph: "",
      dropFromPeak: d.drop === null ? null : Math.round(d.drop * 1000) / 1000,
    };
    return g;
  });

  // Real candles for the biggest graves: exact death date and crash vs bleed. Best effort, time-boxed.
  const queue = graves.slice(0, CANDLE_GRAVES).filter((g) => GT_NETWORK[g.chain] && now - g.bornTs < 179 * DAY);
  await Promise.all(Array.from({ length: 2 }, async () => {
    for (let g = queue.shift(); g && !(stopAt && Date.now() > stopAt); g = queue.shift()) {
      try {
        const key = `${g.chain}:${g.address}`;
        const pool = pb.pool?.(key) ?? (await topPool(gt, g.chain, g.address));
        if (!pool) continue;
        const { candles } = await fetchCandles(gt, g.chain, pool, g.address, g.bornTs - DAY, now, true);
        const r = fromCandles(candles, now);
        if (r) { g.cause = r.cause; g.diedTs = Math.max(r.ts, g.bornTs); g.diedExact = true; }
      } catch {}
    }
  }));

  const shown = graves.slice(0, MAX_GRAVES);
  for (const g of shown) g.epitaph = cannedEpitaph(g);
  let epitaphSource: Graveyard["epitaphSource"] = "canned";
  if (process.env.ANTHROPIC_API_KEY && process.env.GRAVE_AI !== "off" && shown.length && !(stopAt && Date.now() > stopAt)) {
    const top = shown.slice(0, 10);
    const ai = await aiEpitaphs(top).catch(() => null);
    if (ai) { top.forEach((g, i) => (g.epitaph = ai[i])); epitaphSource = "ai"; }
  }

  const causes: Record<DeathCause, number> = { rug: 0, slow_bleed: 0, abandoned: 0, unknown: 0 };
  for (const g of graves) causes[g.cause]++;
  const known = (Object.entries(causes) as [DeathCause, number][]).filter(([c, n]) => n > 0 && c !== "unknown").sort((a, b) => b[1] - a[1]);
  return {
    count: graves.length,
    buriedUsd: r2(graves.reduce((s, g) => s + g.putInUsd, 0)),
    gotOutUsd: r2(graves.reduce((s, g) => s + g.gotOutUsd, 0)),
    causes,
    topCause: known[0]?.[0] ?? (graves.length ? "unknown" : null),
    mostExpensive: shown[0] ?? null,
    graves: shown,
    epitaphSource,
  };
}
