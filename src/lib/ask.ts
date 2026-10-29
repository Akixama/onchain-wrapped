// "Ask your wallet": answers questions about one finished Wrapped.
// Free by default — matches the question to a topic and answers from the real numbers.
// With ANTHROPIC_API_KEY set (paid) and ASK_AI not "off", Claude answers from the same fact sheet.
import Anthropic from "@anthropic-ai/sdk";
import type { WrappedStats } from "./engine/stats";
import { NARRATIVE_LABEL } from "./engine/extras";
import { factSheet } from "./roast";
import { logUsage } from "./infra/usage";
import { pct, tradeMath, usd } from "@/components/format";

export interface AskAnswer { text: string; source: "ai" | "numbers" }

/** Starter questions shown as buttons. */
export const SUGGESTED = [
  "How did I do overall?", "What was my best trade?", "What was my worst trade?", "Should I have just held SOL?",
  "How many rugs did I catch?", "When do I trade most?", "Did I sell anything too early?", "What's my trading style?",
  "How much did I spend on fees?", "Roast me",
];

const m = (n: number) => usd(n, { sign: true });
const dur = (sec: number) => (sec < 90 ? `${Math.round(sec)} seconds` : sec < 5400 ? `${Math.round(sec / 60)} minutes` : sec < 2 * 86400 ? `${Math.round(sec / 3600)} hours` : `${Math.round(sec / 86400)} days`);

/** Each topic: words that point to it, and the answer built from the numbers (null = no data for it). Checked in order. */
const TOPICS: { id: string; words: RegExp; answer: (s: WrappedStats) => string | null }[] = [
  { id: "advice", words: /\b(should i (buy|sell|ape)|buy now|what (coin|token) (to|should)|price prediction|next 100x|financial advice|invest)\b/i,
    answer: () => "I only know what this wallet already did, not what any coin will do next, so no tips here. Ask me about the trades instead." },
  { id: "roast", words: /\b(roast|savage|be mean|clown)\b/i, answer: (s) => s.roast?.text ?? null },
  { id: "hold", words: /\b(held|hold(ing)? (sol|eth)|just (held|holding)|instead of trading|hodl)\b/i, answer: (s) => {
      const c = s.counterfactual;
      if (!c) return null;
      return c.verdict === "should_have_held"
        ? `Honestly? Yes. Just holding ${c.major} would have left you about ${usd(Math.abs(c.justHeldDiffUsd))} better off than all that trading (${m(c.tradingPnlUsd)}).`
        : `No: trading beat just holding ${c.major} by about ${usd(Math.abs(c.justHeldDiffUsd))}. Trading result: ${m(c.tradingPnlUsd)}.`;
    } },
  { id: "paper", words: /\b(paper|sold (too )?early|too early|left on the table|missed)\b/i, answer: (s) => {
      const p = s.paperHands;
      return p ? `$${p.symbol}. You sold, then it went about ${Math.round(p.laterPeak / Math.max(1e-18, p.soldAt))}x higher: roughly ${usd(p.missedUsd)} left on the table.`
        : "Nothing stands out: no coin ran much higher after you sold it.";
    } },
  { id: "best", words: /\b(best|biggest win|top trade|most money|winner|greatest)\b/i, answer: (s) => s.bestTrade && s.bestTrade.pnlUsd > 0
      ? `$${s.bestTrade.symbol}: ${m(s.bestTrade.pnlUsd)} ${[tradeMath(s.bestTrade).main, ...tradeMath(s.bestTrade).notes].join(" ")}`
      : "No coin made money in this period, so there's no best trade to brag about." },
  { id: "worst", words: /\b(worst|biggest loss|lost the most|loser|hurt|pain)\b/i, answer: (s) => s.worstTrade && s.worstTrade.pnlUsd < 0
      ? `$${s.worstTrade.symbol}: ${m(s.worstTrade.pnlUsd)} ${[tradeMath(s.worstTrade).main, ...tradeMath(s.worstTrade).notes].join(" ")}`
      : "No coin lost money in this period. Rare." },
  { id: "rugs", words: /\b(rug|rugs|rugged|dead coins?|died|scam)\b/i, answer: (s) => s.rugs.count
      ? `${s.rugs.count.toLocaleString()} coins died while you held them at a loss, costing ${usd(Math.abs(s.rugs.lostUsd))}${s.rugs.tokens.length ? ` (including $${s.rugs.tokens.slice(0, 3).join(", $")})` : ""}.${s.rugs.dodged ? ` You got out of ${s.rugs.dodged.toLocaleString()} others before they died.` : ""}`
      : `No rugs caught.${s.rugs.dodged ? ` You got out of ${s.rugs.dodged.toLocaleString()} coins before they died.` : ""}` },
  { id: "fees", words: /\b(fee|fees|gas|spent on|network cost)\b/i, answer: (s) =>
      `${usd(s.gas.totalUsd)} on network fees across ${s.gas.txCount.toLocaleString()} transactions${s.appFees?.totalUsd ? `, plus about ${usd(s.appFees.totalUsd)} in trading-app fees` : ""}.` },
  { id: "time", words: /\b(when|what time|hour|night|sleep|morning|busiest)\b/i, answer: (s) => {
      const busy = s.speed?.busiestDay;
      return `Your busiest hour is ${s.sleep.peakHourUtc}:00–${s.sleep.peakHourUtc + 1}:00 UTC (${s.sleep.peakHourCount.toLocaleString()} trades).${busy ? ` Busiest single day: ${new Date(busy.ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${busy.trades.toLocaleString()} trades.` : ""}`;
    } },
  { id: "style", words: /\b(style|personality|who am i|what kind|type of trader|archetype)\b/i, answer: (s) =>
      `${s.archetype.title}. ${s.archetype.tagline}${s.archetype.traits?.length ? ` Also: ${s.archetype.traits.map((t) => `${t.label.toLowerCase()} (${t.detail})`).join("; ")}.` : ""}` },
  { id: "speed", words: /\b(fast|fastest|flip|quick|hold time|how long)\b/i, answer: (s) => {
      const sp = s.speed;
      if (!sp) return null;
      return `${sp.fastestFlip ? `Fastest flip: ${dur(sp.fastestFlip.seconds)} on $${sp.fastestFlip.symbol} (${m(sp.fastestFlip.pnlUsd)}). ` : ""}${sp.medianHoldSec != null ? `You usually hold a coin ${dur(sp.medianHoldSec)}; ` : ""}${Math.round(sp.underMinutePct)}% of coins sold within a minute.`;
    } },
  { id: "snipe", words: /\b(snip\w*|launch\w*|first buyer)\b/i, answer: (s) => {
      const sn = s.sniper;
      if (!sn || !sn.checked) return null;
      return `${pct(sn.within60s / sn.checked)} of the coins checked were bought within a minute of launch (${pct(sn.within10s / sn.checked)} within 10 seconds).`;
    } },
  { id: "revenge", words: /\b(revenge|tilt|tilted|after a loss|streak)\b/i, answer: (s) => {
      const r = s.revenge;
      if (!r) return null;
      return `After a loss you buy the next coin in about ${dur(r.gapAfterLossSec)}, vs ${dur(r.gapAfterWinSec)} after a win. Revenge buys win ${pct(r.revenge.winRate)} of the time, others ${pct(r.normal.winRate)}. Longest losing streak: ${r.longestLosingStreak}.`;
    } },
  { id: "narrative", words: /\b(narrative|favou?rite|dogs?|cats?|frogs?|ai coins?|politic\w*|kind of coins?)\b/i, answer: (s) => {
      const top = s.narratives?.top.filter((n) => n.id !== "other").slice(0, 3);
      return top?.length ? `Mostly ${top.map((n) => `${NARRATIVE_LABEL[n.id].toLowerCase()} (${n.tokens.toLocaleString()} coins, ${m(n.pnlUsd)})`).join(", ")}.` : null;
    } },
  { id: "bags", words: /\b(bag|bags|still hold\w*|holding|portfolio)\b/i, answer: (s) => s.bags
      ? `You still hold ${s.bags.count.toLocaleString()} coins you bought, worth ${usd(s.bags.valueUsd)} now (you paid ${usd(s.bags.costUsd)}). ${s.bags.dead.toLocaleString()} of them are basically dead.`
      : null },
  { id: "winrate", words: /\b(win rate|winrate|how often|wins?|losses|hit rate)\b/i, answer: (s) =>
      `${pct(s.pnl.winRate)} of coins closed in profit: ${s.pnl.wins.toLocaleString()} wins, ${s.pnl.losses.toLocaleString()} losses.` },
  { id: "volume", words: /\b(how many trades|trades|volume|how much did i trade|active)\b/i, answer: (s) =>
      `${s.overview.totalTrades.toLocaleString()} trades in ${s.overview.tokensTraded.toLocaleString()} coins, ${usd(s.overview.volumeUsd)} of volume over ${s.overview.activeDays} active days.` },
  { id: "pnl", words: /\b(overall|profit|pnl|up|down|make|made|lose|lost|money|result|how did i do)\b/i, answer: (s) =>
      `${s.pnl.totalUsd >= 0 ? "Up" : "Down"} ${usd(Math.abs(s.pnl.totalUsd))} from trading (${usd(s.pnl.realizedUsd, { sign: true })} closed${Math.abs(s.pnl.unrealizedUsd) >= 1 ? `, ${usd(s.pnl.unrealizedUsd, { sign: true })} on coins still held` : ""}). Win rate ${pct(s.pnl.winRate)}.` },
];

export function numbersAnswer(s: WrappedStats, question: string): string {
  for (const t of TOPICS) if (t.words.test(question)) { const a = t.answer(s); if (a) return a; }
  return "I only know this wallet's numbers. Try one of the questions below: best and worst trades, rugs, fees, timing, style, or whether holding SOL would have won.";
}

const SYSTEM = `You answer questions about one person's crypto trading period, using ONLY the fact sheet.
Be short (1–3 sentences), plain and a little playful. Never invent numbers or coin names; if the fact sheet doesn't cover it, say so.
Never give financial advice or predictions about any coin. No profanity, no insults about the person.`;

export async function askWallet(s: WrappedStats, question: string): Promise<AskAnswer> {
  const q = question.slice(0, 300);
  if (process.env.ANTHROPIC_API_KEY && process.env.ASK_AI !== "off") {
    const t0 = Date.now();
    let status = 200;
    try {
      const client = new Anthropic({ timeout: 20_000, maxRetries: 1 });
      const res = await client.messages.create({
        model: process.env.ASK_MODEL ?? "claude-haiku-5-5",
        max_tokens: 300,
        system: SYSTEM,
        messages: [{ role: "user", content: `Fact sheet:\n${factSheet(s)}\n\nQuestion: ${q}` }],
      });
      const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(" ").trim();
      if (text) return { text, source: "ai" };
    } catch (e) {
      status = e instanceof Anthropic.APIError && e.status ? e.status : 599;
    } finally {
      logUsage({ provider: "anthropic", endpoint: "ask", status, ms: Date.now() - t0 });
    }
  }
  return { text: numbersAnswer(s, q), source: "numbers" };
}
