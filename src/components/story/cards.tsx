"use client";
import { motion } from "motion/react";
import { Children, isValidElement, type ReactNode } from "react";
import type { CardId, TradeCard, WrappedStats } from "@/lib/engine/stats";
import { CHAIN_COLOR, CHAIN_NAME, capOrPrice, hourLabel, num, pct, periodLabel, usd, whoLabel } from "../format";
import { Big, BigNumber, Chip, CountUp, Kicker, Line, Stat, rise } from "./primitives";
import { TradeChart } from "./TradeChart";

export interface CardCtx {
  tzOffsetH: number; // viewer's UTC offset in hours
  currency: "USD" | "NGN";
  setCurrency: (c: "USD" | "NGN") => void;
  ngnRate: number | null;
}
type CardProps = { s: WrappedStats; ctx: CardCtx };

const money = (n: number, sign = false) => usd(n, { sign });
const gainColor = (n: number) => (n >= 0 ? "#4ADE80" : "#F87171");
/** Marks the part of a card that goes in the right column on wide screens (chart, tiles, lists). */
const R = ({ children }: { children: ReactNode }) => <>{children}</>;
/**
 * Card body. Phones: one column. Wide screens (frame >= 48rem): text + headline number on the left,
 * whatever is wrapped in <R> on the right.
 */
const Body = ({ children, className = "space-y-5" }: { children: ReactNode; className?: string }) => {
  const all = Children.toArray(children);
  const right = all.filter((c) => isValidElement(c) && c.type === R);
  const left = all.filter((c) => !(isValidElement(c) && c.type === R));
  if (!right.length) return <div className={`my-auto pt-4 @3xl:max-w-3xl ${className}`}>{left}</div>;
  return (
    <div className="my-auto w-full pt-4 @3xl:grid @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] @3xl:items-center @3xl:gap-12">
      <div className={className}>{left}</div>
      <div className="mt-4 space-y-4 @3xl:mt-0">{right}</div>
    </div>
  );
};

function TokenTitle({ t }: { t: TradeCard }) {
  return (
    <Line className="flex min-w-0 items-center gap-3">
      {t.icon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={t.icon} alt="" className="h-10 w-10 shrink-0 rounded-full bg-white/10 object-cover" />
      ) : (
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15 font-display text-lg font-bold">{t.symbol.slice(0, 1)}</span>
      )}
      <div className="min-w-0">
        <div className="truncate font-display text-[28px] font-bold leading-tight">${t.symbol}</div>
        <div className="text-sm opacity-60">on {CHAIN_NAME[t.chain]}</div>
      </div>
    </Line>
  );
}

/** Entry / Peak / Exit (or Now) as market cap when we know the supply. */
function Levels({ t }: { t: TradeCard }) {
  const sup = (t.supply ?? t.chart?.supply);
  const tag = sup ? " MC" : "";
  const cells: [string, string][] = [[`Entry${tag}`, capOrPrice(t.avgEntry, sup)]];
  if (t.peakPrice > 0) cells.push([`Peak${tag}`, capOrPrice(Math.max(t.peakPrice, t.avgEntry), sup)]);
  cells.push(t.avgExit ? [`Exit${tag}`, capOrPrice(t.avgExit, sup)] : ["Now", t.holdingValueUsd > 0 ? "holding" : "—"]);
  return (
    <motion.div variants={rise} className="grid grid-cols-3 gap-2">
      {cells.map(([k, v]) => (
        <div key={k} className="rounded-xl border border-white/10 bg-white/[0.06] px-2.5 py-2">
          <div className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider opacity-60">{k}</div>
          <div className="truncate font-display text-[17px] font-bold tabular-nums">{v}</div>
        </div>
      ))}
    </motion.div>
  );
}

const TradeStory = ({ t }: { t: TradeCard }) => (
  <Body className="space-y-4">
    <TokenTitle t={t} />
    <BigNumber className="text-[64px] @3xl:text-[90px]" color={gainColor(t.pnlUsd)}>
      <CountUp value={t.pnlUsd} format={(n) => money(n, true)} />
    </BigNumber>
    <R><Line><TradeChart card={t} /></Line><Levels t={t} /></R>
    <Line className="text-[15px] opacity-80">
      Put in {money(t.costUsd)}, took out {money(t.proceedsUsd)}{t.holdingValueUsd >= 1 ? `, still holding ${money(t.holdingValueUsd)}` : ""}.
      {t.partialHistory ? " Part of this position was bought before the period shown." : ""}
    </Line>
  </Body>
);

const Archetype = ({ s }: CardProps) => (
  <>
    <Kicker>{periodLabel(s)} · {whoLabel(s)}</Kicker>
    <Body className="space-y-6">
      <Line className="text-xl opacity-80">Your onchain personality is</Line>
      <Big className="text-[46px] @3xl:text-[72px]">{s.archetype.title}</Big>
      <Line className="text-lg opacity-80">{s.archetype.tagline}</Line>
      <Line className="flex flex-wrap gap-2">
        {s.overview.chainsUsed.map((c) => <Chip key={c} color={CHAIN_COLOR[c]}>{CHAIN_NAME[c]}</Chip>)}
      </Line>
    </Body>
  </>
);

const Overview = ({ s }: CardProps) => {
  const top = s.overview.topChain;
  const total = s.overview.totalTrades || 1;
  const bars = Object.entries(s.overview.tradesByChain).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  return (
    <>
      <Kicker>The numbers</Kicker>
      <Body>
        <Line className="text-lg opacity-80">You made</Line>
        <BigNumber className="text-[76px] @3xl:text-[106px]"><CountUp value={s.overview.totalTrades} format={(n) => num(Math.round(n))} /></BigNumber>
        <Line className="text-lg opacity-80">trades, moving <b className="font-display text-2xl">{money(s.overview.volumeUsd)}</b> across {s.overview.chainsUsed.length} {s.overview.chainsUsed.length === 1 ? "chain" : "chains"}.</Line>
        <R><motion.div variants={rise} className="space-y-2 pt-2 @3xl:space-y-3">
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
        </motion.div></R>
        {top && <Line className="text-sm opacity-70">Home chain: <b>{CHAIN_NAME[top]}</b> · {s.overview.activeDays} active days</Line>}
      </Body>
    </>
  );
};

const Pnl = ({ s }: CardProps) => {
  const open = Math.abs(s.pnl.unrealizedUsd) >= 1;
  return (
    <>
      <Kicker>The bottom line</Kicker>
      <Body>
        <Line className="text-lg opacity-80">Trading result (estimate)</Line>
        <BigNumber className="text-[76px] @3xl:text-[106px]" color={gainColor(s.pnl.totalUsd)}>
          <CountUp value={s.pnl.totalUsd} format={(n) => money(n, true)} />
        </BigNumber>
        <R><div className="grid grid-cols-2 gap-3 pt-2">
          <Stat label="Win rate">{pct(s.pnl.winRate)}</Stat>
          <Stat label="Wins / losses">{s.pnl.wins} / {s.pnl.losses}</Stat>
          <Stat label="From coins sold">{money(s.pnl.realizedUsd, true)}</Stat>
          <Stat label="Coins still held">{open ? money(s.pnl.unrealizedUsd, true) : "None"}</Stat>
        </div></R>
      </Body>
    </>
  );
};

const Best = ({ s }: CardProps) => (<><Kicker>Best trade</Kicker><TradeStory t={s.bestTrade!} /></>);
const Worst = ({ s }: CardProps) => (<><Kicker>Worst trade</Kicker><TradeStory t={s.worstTrade!} /></>);

const RoundTrip = ({ s }: CardProps) => {
  const r = s.roundTrip!;
  return (
    <>
      <Kicker>The round trip</Kicker>
      <Body className="space-y-4">
        <TokenTitle t={r} />
        <Line className="text-xl">At the top you were up</Line>
        <BigNumber className="text-[60px] @3xl:text-[84px]" color="#4ADE80"><CountUp value={r.peakGainUsd} format={(n) => money(n)} /></BigNumber>
        <R><Line><TradeChart card={r} marks={[{ t: r.peakTs, label: "TOP", color: "#4ADE80" }]} /></Line><Levels t={r} /></R>
        <Line className="text-xl">and walked out with <b style={{ color: gainColor(r.endedWithUsd) }} className="whitespace-nowrap font-display">{money(r.endedWithUsd, true)}</b>.</Line>
      </Body>
    </>
  );
};

const PaperHands = ({ s }: CardProps) => {
  const p = s.paperHands!;
  const sup = (p.supply ?? p.chart?.supply);
  const x = p.laterPeak / p.soldAt;
  return (
    <>
      <Kicker>Paper hands</Kicker>
      <Body className="space-y-4">
        <TokenTitle t={p} />
        <Line className="text-lg">
          You sold at <b className="whitespace-nowrap">{capOrPrice(p.soldAt, sup)}{sup ? " MC" : ""}</b>. It then ran to{" "}
          <b className="whitespace-nowrap">{capOrPrice(p.laterPeak, sup)}{sup ? " MC" : ""}</b> ({x >= 10 ? Math.round(x) : x.toFixed(1)}x).
        </Line>
        <R><Line><TradeChart card={p} marks={[{ t: p.soldTs, label: "YOU SOLD", color: "#F9A8D4" }]} /></Line></R>
        <Line className="text-lg">You left</Line>
        <BigNumber className="text-[60px] @3xl:text-[84px]" color="#F9A8D4"><CountUp value={p.missedUsd} format={(n) => money(n)} /></BigNumber>
        <Line className="text-lg">on the table.</Line>
      </Body>
    </>
  );
};

const DiamondHands = ({ s }: CardProps) => {
  const d = s.diamondHands!;
  return (
    <>
      <Kicker>Diamond hands</Kicker>
      <Body className="space-y-4">
        <TokenTitle t={d} />
        <BigNumber className="text-[76px] @3xl:text-[106px]"><CountUp value={d.daysHeld} format={(n) => `${Math.round(n)} days`} /></BigNumber>
        <R><Line><TradeChart card={d} /></Line><Levels t={d} /></R>
        <Line className="text-xl">{d.stillHolding ? "and still holding." : "before you finally sold."} Worth it: <b className="whitespace-nowrap" style={{ color: gainColor(d.pnlUsd) }}>{money(d.pnlUsd, true)}</b></Line>
      </Body>
    </>
  );
};

const Counterfactual = ({ s }: CardProps) => {
  const c = s.counterfactual;
  const held = c.verdict === "should_have_held";
  return (
    <>
      <Kicker>What if</Kicker>
      <Body className="space-y-6">
        <Line className="text-2xl">If you&apos;d skipped every trade and just held <b>{c.major.replace("+", " & ")}</b>…</Line>
        <BigNumber className="text-[70px] @3xl:text-[98px]" color={held ? "#FBBF24" : "#4ADE80"}><CountUp value={Math.abs(c.justHeldDiffUsd)} format={(n) => money(n)} /></BigNumber>
        <Line className="text-2xl">{held ? "more in your pocket. Ouch." : "less. Your trading actually won."}</Line>
        <R><div className="grid grid-cols-2 gap-3">
          <Stat label="Your trading">{money(c.tradingPnlUsd, true)}</Stat>
          <Stat label={`Just holding ${c.major === "SOL+ETH" ? "majors" : c.major}`}>{money(c.holdPnlUsd, true)}</Stat>
        </div></R>
      </Body>
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
          <motion.div variants={rise} className="flex rounded-full bg-white/10 p-1 text-xs font-semibold" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
            {(["USD", "NGN"] as const).map((c) => (
              <button key={c} onClick={() => ctx.setCurrency(c)} className={`rounded-full px-3 py-1 ${cur === c ? "bg-white text-black" : "opacity-70"}`}>{c}</button>
            ))}
          </motion.div>
        )}
      </div>
      <Body className="space-y-6">
        <Line className="text-xl opacity-80">You paid the network</Line>
        <BigNumber className="text-[76px] @3xl:text-[106px]" color="#FDBA74"><CountUp key={cur} value={s.gas.totalUsd} format={fmt} /></BigNumber>
        <Line className="text-xl opacity-80">over {num(s.gas.txCount)} transactions. Priciest single one: <b className="whitespace-nowrap">{fmt(s.gas.priciestTxUsd)}</b>.</Line>
        <R><motion.div variants={rise} className="flex flex-wrap gap-2">
          {by.map(([c, v]) => <Chip key={c} color={CHAIN_COLOR[c]}>{CHAIN_NAME[c]} {fmt(v ?? 0)}</Chip>)}
        </motion.div></R>
      </Body>
    </>
  );
};

const Rugs = ({ s }: CardProps) => (
  <>
    <Kicker>Rugs</Kicker>
    <Body className="space-y-6">
      <Line className="text-xl opacity-80">Coins you bought that are now dead</Line>
      <R><div className="grid grid-cols-2 gap-3">
        <Stat label="Caught in">{s.rugs.count}</Stat>
        <Stat label="Dodged">{s.rugs.dodged}</Stat>
      </div></R>
      {s.rugs.count > 0 && <Line className="text-xl">They cost you <b className="whitespace-nowrap text-[#FB7185]">{money(s.rugs.lostUsd)}</b>.</Line>}
      {s.rugs.dodged > 0 && <Line className="text-xl">But you got out of {s.rugs.dodged} before they died. Survivor.</Line>}
      <Line className="flex flex-wrap gap-2">{[...s.rugs.tokens.slice(0, 4), ...s.rugs.dodgedTokens.slice(0, 4)].map((t, i) => <Chip key={t + i}>${t}</Chip>)}</Line>
    </Body>
  </>
);

const Airdrops = ({ s }: CardProps) => (
  <>
    <Kicker>Airdrops</Kicker>
    <Body className="space-y-6">
      <BigNumber className="text-[90px] @3xl:text-[126px]"><CountUp value={s.airdrops.count} format={(n) => `${Math.round(n)}`} /></BigNumber>
      <Line className="text-2xl">airdrops claimed, worth about <b>{money(s.airdrops.valueUsd)}</b>.</Line>
      <Line className="flex flex-wrap gap-2">{s.airdrops.tokens.map((t) => <Chip key={t}>${t}</Chip>)}</Line>
    </Body>
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
      <Body>
        <Line className="text-xl opacity-80">Your trading hour</Line>
        <BigNumber className="text-[90px] @3xl:text-[126px]">{hourLabel(peak)}</BigNumber>
        <Line className="text-xl">{local[peak]} trades at that hour{night > 0 ? <>, and <b>{night}</b> between midnight and 6am.</> : "."}</Line>
        <R><motion.div variants={rise} className="flex h-24 items-end gap-[3px] @3xl:h-48">
          {local.map((v, h) => (
            <motion.div key={h} className="flex-1 rounded-t" style={{ background: h === peak ? "#F472B6" : "rgba(255,255,255,0.28)" }}
              initial={{ height: 0 }} animate={{ height: `${Math.max(3, (v / max) * 100)}%` }} transition={{ delay: 0.4 + h * 0.025 }} />
          ))}
        </motion.div>
        <div className="mt-1 flex justify-between text-[11px] opacity-60"><span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span></div></R>
        {s.sleep.topMinuteCount >= 3 && <Line className="text-base opacity-80">Weirdly specific: you traded at exactly <b>{topLocal}</b> {s.sleep.topMinuteCount} times.</Line>}
      </Body>
    </>
  );
};

const Bridges = ({ s }: CardProps) => (
  <>
    <Kicker>Bridge journey</Kicker>
    <Body className="space-y-6">
      <Line className="text-xl opacity-80">Where your money travelled</Line>
      <motion.div variants={rise} className="flex flex-wrap items-center gap-2">
        {s.bridges.journey.map((c, i) => (
          <span key={c} className="flex items-center gap-2">
            {i > 0 && <span className="opacity-50">→</span>}
            <span className="rounded-xl px-3 py-2 font-display text-lg font-bold" style={{ background: `${CHAIN_COLOR[c]}33`, color: CHAIN_COLOR[c] }}>{CHAIN_NAME[c]}</span>
          </span>
        ))}
      </motion.div>
      <R><motion.ul variants={rise} className="space-y-2">
        {s.bridges.routes.slice(0, 4).map((r) => (
          <li key={r.from + r.to} className="flex items-center justify-between rounded-xl bg-white/[0.07] px-4 py-3 text-sm">
            <span>{CHAIN_NAME[r.from]} → {CHAIN_NAME[r.to]}</span>
            <span className="tabular-nums opacity-80">{r.count}× · {money(r.usd)}</span>
          </li>
        ))}
      </motion.ul></R>
      <Line className="text-base opacity-80">{money(s.bridges.totalUsd)} moved across chains.</Line>
    </Body>
  </>
);

const Percentile = ({ s }: CardProps) => (
  <>
    <Kicker>Ranking</Kicker>
    <Body className="space-y-6">
      <BigNumber className="text-[90px] @3xl:text-[126px]">Top {Math.max(1, Math.round(100 - (s.percentile.activity ?? 0)))}%</BigNumber>
      <Line className="text-2xl">most active of everyone who checked.</Line>
    </Body>
  </>
);

/** Trading result per chain, biggest winner first. */
const Chains = ({ s }: CardProps) => {
  const rows = (Object.entries(s.pnl.byChain) as [string, { pnlUsd: number; trades: number; tokens: number }][]).filter(([, v]) => Math.abs(v.pnlUsd) >= 1 || v.trades > 0).sort((a, b) => b[1].pnlUsd - a[1].pnlUsd);
  const maxAbs = Math.max(1, ...rows.map(([, v]) => Math.abs(v.pnlUsd)));
  return (
    <>
      <Kicker>Profit by chain</Kicker>
      <Body className="space-y-5">
        <Line className="text-lg opacity-80">Across every chain, you made</Line>
        <BigNumber className="text-[68px] @3xl:text-[95px]" color={gainColor(s.pnl.totalUsd)}><CountUp value={s.pnl.totalUsd} format={(n) => money(n, true)} /></BigNumber>
        <R><motion.ul variants={rise} className="space-y-2.5">
          {rows.map(([c, v]) => (
            <li key={c} className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 font-semibold"><i className="h-2.5 w-2.5 rounded-full" style={{ background: CHAIN_COLOR[c] }} />{CHAIN_NAME[c]}</span>
                <span className="whitespace-nowrap font-display text-lg font-bold tabular-nums" style={{ color: gainColor(v.pnlUsd) }}>{money(v.pnlUsd, true)}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <motion.div className="h-full rounded-full" style={{ background: gainColor(v.pnlUsd) }}
                  initial={{ width: 0 }} animate={{ width: `${(Math.abs(v.pnlUsd) / maxAbs) * 100}%` }} transition={{ delay: 0.5, duration: 0.8 }} />
              </div>
              <div className="mt-1.5 text-xs opacity-60">{v.trades} trades · {v.tokens} tokens</div>
            </li>
          ))}
        </motion.ul></R>
      </Body>
    </>
  );
};

const Roast = ({ s }: CardProps) => (
  <>
    <Kicker>The roast</Kicker>
    <Body className="space-y-6">
      <Big className="text-6xl">🔥</Big>
      <Line className="font-display text-[26px] font-bold leading-snug">{s.roast!.text}</Line>
      <Line className="text-sm opacity-60">{s.roast!.source === "ai" ? "Written by AI from your stats. No feelings were checked." : "Lovingly generated from your stats."}</Line>
    </Body>
  </>
);

const Summary = ({ s }: CardProps) => {
  const tiles: [string, string, string?][] = [
    ["Trades", num(s.overview.totalTrades)],
    ["Volume", money(s.overview.volumeUsd)],
    ["PnL", money(s.pnl.totalUsd, true), gainColor(s.pnl.totalUsd)],
    ["Gas", money(s.gas.totalUsd)],
  ];
  const chains = (Object.entries(s.pnl.byChain) as [string, { pnlUsd: number }][]).filter(([, v]) => Math.abs(v.pnlUsd) >= 1).sort((a, b) => b[1].pnlUsd - a[1].pnlUsd);
  return (
    <>
      <Kicker>{periodLabel(s)} · {whoLabel(s)}</Kicker>
      <Body className="space-y-3">
        <Big className="text-[34px] @3xl:text-[52px]">{s.archetype.title}</Big>
        <div className="grid grid-cols-2 gap-2">
          {tiles.map(([k, v, c]) => (
            <motion.div key={k} variants={rise} className="rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider opacity-60">{k}</div>
              <div className="truncate font-display text-xl font-bold tabular-nums" style={{ color: c }}>{v}</div>
            </motion.div>
          ))}
        </div>
        <R><motion.div variants={rise} className="space-y-1.5 rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2.5 text-sm @3xl:space-y-2.5 @3xl:px-4 @3xl:py-4 @3xl:text-base">
          {s.bestTrade && <Row k="Best" v={`$${s.bestTrade.symbol}`} n={s.bestTrade.pnlUsd} />}
          {s.worstTrade && <Row k="Worst" v={`$${s.worstTrade.symbol}`} n={s.worstTrade.pnlUsd} />}
          {chains.map(([c, v]) => <Row key={c} k={CHAIN_NAME[c]} n={v.pnlUsd} dot={CHAIN_COLOR[c]} />)}
        </motion.div></R>
      </Body>
    </>
  );
};

function Row({ k, v, n, dot }: { k: string; v?: string; n: number; dot?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2 opacity-80">
        {dot && <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} />}
        <span className="shrink-0">{k}</span>
        {v && <b className="truncate">{v}</b>}
      </span>
      <b className="shrink-0 whitespace-nowrap tabular-nums" style={{ color: gainColor(n) }}>{money(n, true)}</b>
    </div>
  );
}

export const CARDS: Record<CardId, (p: CardProps) => React.ReactNode> = {
  archetype: Archetype, overview: Overview, pnl: Pnl, best: Best, worst: Worst, roundTrip: RoundTrip,
  paperHands: PaperHands, diamondHands: DiamondHands, counterfactual: Counterfactual, gas: Gas, rugs: Rugs,
  airdrops: Airdrops, sleep: Sleep, bridges: Bridges, percentile: Percentile, chains: Chains, roast: Roast, summary: Summary,
};
