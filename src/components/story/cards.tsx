"use client";
import { motion } from "motion/react";
import type { CardId, TradeCard, WrappedStats } from "@/lib/engine/stats";
import { CHAIN_COLOR, CHAIN_NAME, hourLabel, num, pct, periodLabel, price, usd, whoLabel } from "../format";
import { Arc, Big, Chip, CountUp, Kicker, Line, Stat, rise } from "./primitives";

export interface CardCtx {
  tzOffsetH: number; // viewer's UTC offset in hours
  currency: "USD" | "NGN";
  setCurrency: (c: "USD" | "NGN") => void;
  ngnRate: number | null;
}
type CardProps = { s: WrappedStats; ctx: CardCtx };

const money = (n: number, sign = false) => usd(n, { sign });
const gainColor = (n: number) => (n >= 0 ? "#4ADE80" : "#F87171");

function TokenTitle({ t }: { t: TradeCard }) {
  return (
    <Line className="flex items-center gap-3">
      {t.icon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={t.icon} alt="" className="h-11 w-11 rounded-full bg-white/10 object-cover" />
      ) : (
        <span className="grid h-11 w-11 place-items-center rounded-full bg-white/15 font-display text-lg font-bold">{t.symbol.slice(0, 1)}</span>
      )}
      <div>
        <div className="font-display text-3xl font-bold">${t.symbol}</div>
        <div className="text-sm opacity-60">on {CHAIN_NAME[t.chain]}</div>
      </div>
    </Line>
  );
}

function tradeArc(t: TradeCard) {
  const pts = [{ label: "In", sub: price(t.avgEntry), value: t.avgEntry }];
  if (t.peakPrice > Math.max(t.avgEntry, t.avgExit ?? 0) * 1.05) pts.push({ label: "Peak", sub: price(t.peakPrice), value: t.peakPrice });
  if (t.avgExit) pts.push({ label: "Out", sub: price(t.avgExit), value: t.avgExit });
  return pts.length >= 2 ? pts : null;
}

const Archetype = ({ s }: CardProps) => (
  <>
    <Kicker>{periodLabel(s)} · {whoLabel(s)}</Kicker>
    <div className="mt-auto mb-auto space-y-6">
      <Line className="text-xl opacity-80">Your onchain personality is</Line>
      <Big className="text-[44px] sm:text-5xl">{s.archetype.title}</Big>
      <Line className="text-lg opacity-80">{s.archetype.tagline}</Line>
      <Line className="flex flex-wrap gap-2">
        {s.overview.chainsUsed.map((c) => <Chip key={c} color={CHAIN_COLOR[c]}>{CHAIN_NAME[c]}</Chip>)}
      </Line>
    </div>
  </>
);

const Overview = ({ s }: CardProps) => {
  const top = s.overview.topChain;
  const total = s.overview.totalTrades || 1;
  const bars = Object.entries(s.overview.tradesByChain).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  return (
    <>
      <Kicker>The numbers</Kicker>
      <div className="my-auto space-y-5">
        <Line className="text-lg opacity-80">You made</Line>
        <Big className="text-7xl"><CountUp value={s.overview.totalTrades} format={(n) => num(Math.round(n))} /></Big>
        <Line className="text-lg opacity-80">trades, moving <b className="font-display text-2xl">{money(s.overview.volumeUsd)}</b> across {s.overview.chainsUsed.length} {s.overview.chainsUsed.length === 1 ? "chain" : "chains"}.</Line>
        <motion.div variants={rise} className="space-y-2 pt-2">
          {bars.map(([c, n]) => (
            <div key={c} className="flex items-center gap-3 text-sm">
              <span className="w-20 opacity-80">{CHAIN_NAME[c]}</span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/10">
                <motion.div className="h-full rounded-full" style={{ background: CHAIN_COLOR[c] }}
                  initial={{ width: 0 }} animate={{ width: `${((n ?? 0) / total) * 100}%` }} transition={{ delay: 0.6, duration: 0.9 }} />
              </div>
              <span className="w-10 text-right tabular-nums opacity-80">{n}</span>
            </div>
          ))}
        </motion.div>
        {top && <Line className="text-sm opacity-70">Home chain: <b>{CHAIN_NAME[top]}</b> · {s.overview.activeDays} active days</Line>}
      </div>
    </>
  );
};

const Pnl = ({ s }: CardProps) => (
  <>
    <Kicker>The bottom line</Kicker>
    <div className="my-auto space-y-5">
      <Line className="text-lg opacity-80">Trading result (estimate)</Line>
      <Big className="text-7xl" ><span style={{ color: gainColor(s.pnl.totalUsd) }}><CountUp value={s.pnl.totalUsd} format={(n) => money(n, true)} /></span></Big>
      <div className="grid grid-cols-2 gap-3 pt-2">
        <Stat label="Win rate">{pct(s.pnl.winRate)}</Stat>
        <Stat label="Wins / losses">{s.pnl.wins} / {s.pnl.losses}</Stat>
        <Stat label="Taken profit">{money(s.pnl.realizedUsd, true)}</Stat>
        <Stat label="Still riding">{money(s.pnl.unrealizedUsd, true)}</Stat>
      </div>
    </div>
  </>
);

const TradeStory = ({ t, good }: { t: TradeCard; good: boolean }) => {
  const arc = tradeArc(t);
  return (
    <div className="my-auto space-y-6">
      <TokenTitle t={t} />
      <Big className="text-7xl"><span style={{ color: gainColor(t.pnlUsd) }}><CountUp value={t.pnlUsd} format={(n) => money(n, true)} /></span></Big>
      {arc && <Arc points={arc} color={good ? "#4ADE80" : "#F87171"} />}
      <Line className="text-base opacity-80">
        Put in {money(t.costUsd)}, took out {money(t.proceedsUsd)}{t.holdingValueUsd >= 1 ? `, still holding ${money(t.holdingValueUsd)}` : ""}.
      </Line>
    </div>
  );
};

const Best = ({ s }: CardProps) => (<><Kicker>Best trade</Kicker><TradeStory t={s.bestTrade!} good /></>);
const Worst = ({ s }: CardProps) => (<><Kicker>Worst trade</Kicker><TradeStory t={s.worstTrade!} good={false} /></>);

const RoundTrip = ({ s }: CardProps) => {
  const r = s.roundTrip!;
  return (
    <>
      <Kicker>The round trip</Kicker>
      <div className="my-auto space-y-6">
        <TokenTitle t={r} />
        <Line className="text-2xl">At the top you were up</Line>
        <Big className="text-7xl text-[#4ADE80]"><CountUp value={r.peakGainUsd} format={(n) => money(n)} /></Big>
        <Line className="text-2xl">You walked out with</Line>
        <Big className="text-6xl" ><span style={{ color: gainColor(r.endedWithUsd) }}>{money(r.endedWithUsd, true)}</span></Big>
        <Line className="text-base opacity-70">Round trips: the most expensive kind of travel.</Line>
      </div>
    </>
  );
};

const PaperHands = ({ s }: CardProps) => {
  const p = s.paperHands!;
  const x = p.laterPeak / p.soldAt;
  return (
    <>
      <Kicker>Paper hands</Kicker>
      <div className="my-auto space-y-6">
        <TokenTitle t={p} />
        <Line className="text-xl">You sold at {price(p.soldAt)}. It then ran <b>{x >= 10 ? Math.round(x) : x.toFixed(1)}x</b>.</Line>
        <Arc points={[{ label: "You sold", sub: price(p.soldAt), value: p.soldAt }, { label: "It ran to", sub: price(p.laterPeak), value: p.laterPeak }]} color="#F472B6" />
        <Line className="text-xl">You left</Line>
        <Big className="text-7xl text-[#F9A8D4]"><CountUp value={p.missedUsd} format={(n) => money(n)} /></Big>
        <Line className="text-xl">on the table.</Line>
      </div>
    </>
  );
};

const DiamondHands = ({ s }: CardProps) => {
  const d = s.diamondHands!;
  return (
    <>
      <Kicker>Diamond hands</Kicker>
      <div className="my-auto space-y-6">
        <TokenTitle t={d} />
        <Big className="text-8xl"><CountUp value={d.daysHeld} format={(n) => `${Math.round(n)}`} /><span className="ml-2 text-3xl opacity-70">days</span></Big>
        <Line className="text-xl">{d.stillHolding ? "and you're still holding." : "before you finally sold."}</Line>
        <Line className="text-2xl">Worth it: <b style={{ color: gainColor(d.pnlUsd) }}>{money(d.pnlUsd, true)}</b></Line>
      </div>
    </>
  );
};

const Counterfactual = ({ s }: CardProps) => {
  const c = s.counterfactual;
  const held = c.verdict === "should_have_held";
  return (
    <>
      <Kicker>What if</Kicker>
      <div className="my-auto space-y-6">
        <Line className="text-2xl">If you&apos;d skipped every trade and just held <b>{c.major.replace("+", " & ")}</b>…</Line>
        <Big className="text-7xl"><span style={{ color: held ? "#FBBF24" : "#4ADE80" }}><CountUp value={Math.abs(c.justHeldDiffUsd)} format={(n) => money(n)} /></span></Big>
        <Line className="text-2xl">{held ? "more in your pocket. Ouch." : "less. Your trading actually won."}</Line>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Your trading">{money(c.tradingPnlUsd, true)}</Stat>
          <Stat label={`Just holding ${c.major === "SOL+ETH" ? "majors" : c.major}`}>{money(c.holdPnlUsd, true)}</Stat>
        </div>
      </div>
    </>
  );
};

const Gas = ({ s, ctx }: CardProps) => {
  const cur = ctx.currency;
  const fmt = (n: number) => usd(n, { currency: cur, ngnRate: ctx.ngnRate ?? 0 });
  const by = Object.entries(s.gas.byChain).filter(([, v]) => (v ?? 0) >= 0.01).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  return (
    <>
      <div className="flex items-center justify-between">
        <Kicker>Gas burned</Kicker>
        {ctx.ngnRate && (
          <motion.div variants={rise} className="flex rounded-full bg-white/10 p-1 text-xs font-semibold" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            {(["USD", "NGN"] as const).map((c) => (
              <button key={c} onClick={() => ctx.setCurrency(c)} className={`rounded-full px-3 py-1 ${cur === c ? "bg-white text-black" : "opacity-70"}`}>{c}</button>
            ))}
          </motion.div>
        )}
      </div>
      <div className="my-auto space-y-6">
        <Line className="text-xl opacity-80">You paid the network</Line>
        <Big className="text-7xl text-[#FDBA74]"><CountUp key={cur} value={s.gas.totalUsd} format={fmt} /></Big>
        <Line className="text-xl opacity-80">over {num(s.gas.txCount)} transactions. Priciest single one: <b>{fmt(s.gas.priciestTxUsd)}</b>.</Line>
        <motion.div variants={rise} className="flex flex-wrap gap-2">
          {by.map(([c, v]) => <Chip key={c} color={CHAIN_COLOR[c]}>{CHAIN_NAME[c]} {fmt(v ?? 0)}</Chip>)}
        </motion.div>
      </div>
    </>
  );
};

const Rugs = ({ s }: CardProps) => (
  <>
    <Kicker>Rugs</Kicker>
    <div className="my-auto space-y-6">
      <Line className="text-xl opacity-80">Coins you bought that are now dead</Line>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Caught in">{s.rugs.count}</Stat>
        <Stat label="Dodged">{s.rugs.dodged}</Stat>
      </div>
      {s.rugs.count > 0 && <Line className="text-xl">They cost you <b className="text-[#FB7185]">{money(s.rugs.lostUsd)}</b>.</Line>}
      {s.rugs.dodged > 0 && <Line className="text-xl">But you got out of {s.rugs.dodged} before they died. Survivor.</Line>}
      <Line className="flex flex-wrap gap-2">{[...s.rugs.tokens.slice(0, 4), ...s.rugs.dodgedTokens.slice(0, 4)].map((t, i) => <Chip key={t + i}>${t}</Chip>)}</Line>
    </div>
  </>
);

const Airdrops = ({ s }: CardProps) => (
  <>
    <Kicker>Airdrops</Kicker>
    <div className="my-auto space-y-6">
      <Big className="text-8xl"><CountUp value={s.airdrops.count} format={(n) => `${Math.round(n)}`} /></Big>
      <Line className="text-2xl">airdrops claimed, worth about <b>{money(s.airdrops.valueUsd)}</b>.</Line>
      <Line className="flex flex-wrap gap-2">{s.airdrops.tokens.map((t) => <Chip key={t}>${t}</Chip>)}</Line>
    </div>
  </>
);

const Sleep = ({ s, ctx }: CardProps) => {
  const shift = Math.round(ctx.tzOffsetH);
  const local = Array.from({ length: 24 }, (_, h) => s.sleep.hourHistogramUtc[(((h - shift) % 24) + 24) % 24]);
  const peak = local.indexOf(Math.max(...local));
  const max = Math.max(...local, 1);
  const night = local.slice(0, 6).reduce((a, b) => a + b, 0);
  const [hh, mm] = (s.sleep.topMinuteUtc || "00:00").split(":").map(Number);
  const topLocal = `${hourLabel(hh + shift).replace(/(am|pm)/, "")}:${String(mm).padStart(2, "0")}${hourLabel(hh + shift).slice(-2)}`;
  return (
    <>
      <Kicker>Sleep schedule</Kicker>
      <div className="my-auto space-y-6">
        <Line className="text-xl opacity-80">Your trading hour</Line>
        <Big className="text-8xl">{hourLabel(peak)}</Big>
        <Line className="text-xl">{local[peak]} trades at that hour{night > 0 ? <>, and <b>{night}</b> between midnight and 6am.</> : "."}</Line>
        <motion.div variants={rise} className="flex h-24 items-end gap-[3px]">
          {local.map((v, h) => (
            <motion.div key={h} className="flex-1 rounded-t" style={{ background: h === peak ? "#F472B6" : "rgba(255,255,255,0.28)" }}
              initial={{ height: 0 }} animate={{ height: `${Math.max(3, (v / max) * 100)}%` }} transition={{ delay: 0.4 + h * 0.025 }} />
          ))}
        </motion.div>
        <div className="-mt-4 flex justify-between text-[11px] opacity-60"><span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span></div>
        {s.sleep.topMinuteCount >= 3 && <Line className="text-base opacity-80">Weirdly specific: you traded at exactly <b>{topLocal}</b> {s.sleep.topMinuteCount} times.</Line>}
      </div>
    </>
  );
};

const Bridges = ({ s }: CardProps) => (
  <>
    <Kicker>Bridge journey</Kicker>
    <div className="my-auto space-y-6">
      <Line className="text-xl opacity-80">Where your money travelled</Line>
      <motion.div variants={rise} className="flex flex-wrap items-center gap-2">
        {s.bridges.journey.map((c, i) => (
          <span key={c} className="flex items-center gap-2">
            {i > 0 && <span className="opacity-50">→</span>}
            <span className="rounded-xl px-3 py-2 font-display text-lg font-bold" style={{ background: `${CHAIN_COLOR[c]}33`, color: CHAIN_COLOR[c] }}>{CHAIN_NAME[c]}</span>
          </span>
        ))}
      </motion.div>
      <motion.ul variants={rise} className="space-y-2">
        {s.bridges.routes.slice(0, 4).map((r) => (
          <li key={r.from + r.to} className="flex items-center justify-between rounded-xl bg-white/[0.07] px-4 py-3 text-sm">
            <span>{CHAIN_NAME[r.from]} → {CHAIN_NAME[r.to]}</span>
            <span className="tabular-nums opacity-80">{r.count}× · {money(r.usd)}</span>
          </li>
        ))}
      </motion.ul>
      <Line className="text-base opacity-80">{money(s.bridges.totalUsd)} moved across chains.</Line>
    </div>
  </>
);

const Percentile = ({ s }: CardProps) => (
  <>
    <Kicker>Ranking</Kicker>
    <div className="my-auto space-y-6">
      <Big className="text-8xl">Top {Math.max(1, Math.round(100 - (s.percentile.activity ?? 0)))}%</Big>
      <Line className="text-2xl">most active of everyone who checked.</Line>
    </div>
  </>
);

const Roast = ({ s }: CardProps) => (
  <>
    <Kicker>The roast</Kicker>
    <div className="my-auto space-y-6">
      <Big className="text-6xl">🔥</Big>
      <Line className="font-display text-[26px] font-bold leading-snug">{s.roast!.text}</Line>
      <Line className="text-sm opacity-60">{s.roast!.source === "ai" ? "Written by AI from your stats. No feelings were checked." : "Lovingly generated from your stats."}</Line>
    </div>
  </>
);

const Summary = ({ s }: CardProps) => {
  const items: [string, string][] = [
    ["Trades", num(s.overview.totalTrades)],
    ["Volume", money(s.overview.volumeUsd)],
    ["PnL", money(s.pnl.totalUsd, true)],
    ["Gas", money(s.gas.totalUsd)],
  ];
  if (s.bestTrade) items.push(["Best", `$${s.bestTrade.symbol} ${money(s.bestTrade.pnlUsd, true)}`]);
  if (s.worstTrade) items.push(["Worst", `$${s.worstTrade.symbol} ${money(s.worstTrade.pnlUsd)}`]);
  return (
    <>
      <Kicker>{periodLabel(s)} · {whoLabel(s)}</Kicker>
      <div className="my-auto space-y-5">
        <Big className="text-4xl">{s.archetype.title}</Big>
        <div className="grid grid-cols-2 gap-3">
          {items.map(([k, v]) => <Stat key={k} label={k}>{v}</Stat>)}
        </div>
      </div>
    </>
  );
};

export const CARDS: Record<CardId, (p: CardProps) => React.ReactNode> = {
  archetype: Archetype, overview: Overview, pnl: Pnl, best: Best, worst: Worst, roundTrip: RoundTrip,
  paperHands: PaperHands, diamondHands: DiamondHands, counterfactual: Counterfactual, gas: Gas, rugs: Rugs,
  airdrops: Airdrops, sleep: Sleep, bridges: Bridges, percentile: Percentile, roast: Roast, summary: Summary,
};
