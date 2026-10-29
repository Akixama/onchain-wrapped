// Roast mode: a short, playful summary of someone's trading year.
// Uses Claude when ANTHROPIC_API_KEY is set (paid, ~1 call per finished lookup), otherwise a free
// rule-based roast. Only stats go to the model — never wallet addresses or names.
import Anthropic from "@anthropic-ai/sdk";
import type { WrappedStats } from "./engine/stats";
import { logUsage } from "./infra/usage";
import { usd } from "@/components/format";

export interface Roast {
  text: string;
  source: "ai" | "canned";
}

const SYSTEM = `You write the "roast" card for a shareable recap of someone's crypto trading year.
Be funny and a little savage about the TRADES, never about the person: no insults about intelligence, looks, identity, wealth or mental health, no profanity, no financial advice.
Write 2 or 3 short sentences, under 280 characters in total. Plain text, no hashtags, at most one emoji.
Use only the numbers in the fact sheet; never invent figures or token names. Dollar amounts are estimates, so round them.`;

export function factSheet(s: WrappedStats): string {
  const f: string[] = [
    `Archetype: ${s.archetype.title}`,
    `Trades: ${s.overview.totalTrades} on ${s.overview.chainsUsed.join(", ") || "no chains"}, volume ${usd(s.overview.volumeUsd)}`,
    `Trading PnL: ${usd(s.pnl.totalUsd, { sign: true })}, win rate ${Math.round(s.pnl.winRate * 100)}%`,
    `Gas spent: ${usd(s.gas.totalUsd)}`,
  ];
  if (s.bestTrade) f.push(`Best trade: $${s.bestTrade.symbol} ${usd(s.bestTrade.pnlUsd, { sign: true })}`);
  if (s.worstTrade) f.push(`Worst trade: $${s.worstTrade.symbol} ${usd(s.worstTrade.pnlUsd)}`);
  if (s.roundTrip) f.push(`Round trip: was up ${usd(s.roundTrip.peakGainUsd)} on $${s.roundTrip.symbol}, ended at ${usd(s.roundTrip.endedWithUsd, { sign: true })}`);
  if (s.paperHands) f.push(`Paper hands: sold $${s.paperHands.symbol}, missed ${usd(s.paperHands.missedUsd)} of upside`);
  if (s.counterfactual.verdict === "should_have_held") f.push(`Just holding ${s.counterfactual.major} would have made ${usd(s.counterfactual.justHeldDiffUsd)} more`);
  if (s.rugs.count) f.push(`Rugged coins held: ${s.rugs.count}`);
  if (s.sleep.peakHourCount) f.push(`Busiest trading hour (UTC): ${s.sleep.peakHourUtc}:00`);
  return f.join("\n");
}

export async function makeRoast(s: WrappedStats, seed: string): Promise<Roast> {
  if (process.env.ANTHROPIC_API_KEY && process.env.ROAST_AI !== "off" && s.overview.totalTrades > 0) {
    const ai = await aiRoast(s).catch((e) => {
      console.error("[roast]", e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e);
      return null;
    });
    if (ai) return { text: ai, source: "ai" };
  }
  return { text: cannedRoast(s, seed), source: "canned" };
}

async function aiRoast(s: WrappedStats): Promise<string | null> {
  const client = new Anthropic({ timeout: 25_000, maxRetries: 1 });
  const t0 = Date.now();
  let status = 200;
  try {
    const res = await client.beta.messages.create({
      model: process.env.ROAST_MODEL ?? "claude-opus-5-5",
      max_tokens: 2000, // includes thinking; the roast itself is ~80 tokens
      output_config: { effort: "low" },
      // If a safety classifier declines, the API retries on a fallback model inside the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [{ role: "user", content: `Fact sheet:\n${factSheet(s)}\n\nWrite the roast.` }],
    });
    if (res.stop_reason === "refusal") return null;
    const text = res.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join(" ")
      .trim();
    return text && text.length <= 400 ? text : null;
  } catch (e) {
    status = e instanceof Anthropic.APIError && e.status ? e.status : 599;
    throw e;
  } finally {
    logUsage({ provider: "anthropic", endpoint: "messages", status, ms: Date.now() - t0 });
  }
}

/** Free fallback: pick the two juiciest facts and template them. Deterministic per result. */
export function cannedRoast(s: WrappedStats, seed: string): string {
  // [weight, line, token it's about] — two lines about the same token read as a repeat.
  const lines: [number, string, string?][] = [];
  const m = (n: number) => usd(n);
  if (s.roundTrip) lines.push([s.roundTrip.peakGainUsd, `You were up ${m(s.roundTrip.peakGainUsd)} on $${s.roundTrip.symbol} and rode it all the way back down. Round trips are cheaper on airlines.`, s.roundTrip.symbol]);
  if (s.paperHands) lines.push([s.paperHands.missedUsd, `You sold $${s.paperHands.symbol} and it immediately ran. ${m(s.paperHands.missedUsd)} left on the table, tipped generously.`, s.paperHands.symbol]);
  if (s.counterfactual.verdict === "should_have_held" && s.counterfactual.justHeldDiffUsd > 50)
    lines.push([s.counterfactual.justHeldDiffUsd, `Doing absolutely nothing with your ${s.counterfactual.major} would have beaten you by ${m(s.counterfactual.justHeldDiffUsd)}.`]);
  if (s.worstTrade) lines.push([-s.worstTrade.pnlUsd, `$${s.worstTrade.symbol} took ${m(-s.worstTrade.pnlUsd)} from you and didn't even say thanks.`, s.worstTrade.symbol]);
  if (s.rugs.count >= 3) lines.push([s.rugs.count * 50, `${s.rugs.count} coins you bought are now dead. You're not a trader, you're a pallbearer.`]);
  if (s.sleep.peakHourCount >= 5 && [0, 1, 2, 3, 4, 5].includes(s.sleep.peakHourUtc))
    lines.push([200, `Most active at ${s.sleep.peakHourUtc}am UTC. Your sleep schedule is also a rug.`]);
  if (s.gas.totalUsd >= 100) lines.push([s.gas.totalUsd, `You paid ${m(s.gas.totalUsd)} in gas. Validators thank you for your service.`]);
  if (s.pnl.totalUsd > 0 && s.bestTrade) lines.push([s.pnl.totalUsd / 2, `Somehow up ${m(s.pnl.totalUsd)}. $${s.bestTrade.symbol} carried you like a group project.`, s.bestTrade.symbol]);
  if (!lines.length) return `${s.overview.totalTrades} trades and not one great story. Even your wallet is bored.`;
  lines.sort((a, b) => b[0] - a[0]);
  // Rotate among the top facts so two similar wallets don't get identical roasts.
  const top = lines.slice(0, 3);
  const h = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const first = top[h % top.length];
  const second = lines.find((l) => l !== first && (!l[2] || l[2] !== first[2]));
  return second ? `${first[1]} ${second[1]}` : first[1];
}
