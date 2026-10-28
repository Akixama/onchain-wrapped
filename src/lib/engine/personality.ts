// The opening card: one personality, chosen from everything the story measured, plus up to three
// traits with the numbers behind them. Runs after every stat is in (sniper and bags come late).
import type { WrappedStats } from "./stats";
import { NARRATIVE_LABEL } from "./extras";

export interface Trait { label: string; detail: string }
interface Candidate { id: string; title: string; tagline: string; strength: number; trait?: Trait }

const pct = (x: number) => `${Math.round(x * 100)}%`;
const money = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1e6 ? `$${(a / 1e6).toFixed(1)}M` : a >= 1e4 ? `$${Math.round(a / 1e3)}k` : a >= 1e3 ? `$${(a / 1e3).toFixed(1)}k` : `$${Math.round(a)}`;
  return n < 0 ? `-${s}` : s;
};
const dur = (sec: number) => (sec < 90 ? `${Math.round(sec)} seconds` : sec < 5400 ? `${Math.round(sec / 60)} minutes` : sec < 2 * 86400 ? `${Math.round(sec / 3600)} hours` : `${Math.round(sec / 86400)} days`);

/**
 * Each candidate's strength is how far past its bar the wallet is (1 = just made it). The strongest
 * becomes the personality; the next ones become traits.
 */
export function personality(s: WrappedStats): WrappedStats["archetype"] {
  const trades = s.overview.totalTrades;
  if (!trades) return { title: "Onchain Ghost", tagline: "Barely a footprint. Mysterious.", style: "ghost", traits: [] };

  const c: Candidate[] = [];
  // Capped: a measure 50x past its bar (profit, volume) shouldn't drown out everything else.
  const add = (x: Candidate | false | null | undefined) => { if (x && x.strength >= 1) c.push({ ...x, strength: Math.min(x.strength, 3) }); };
  const perDay = s.speed?.tradesPerActiveDay ?? trades / Math.max(1, s.overview.activeDays);
  const avgTrade = s.overview.volumeUsd / trades;
  const pnl = s.pnl.totalUsd, win = s.pnl.winRate;
  const closed = s.pnl.wins + s.pnl.losses;
  const sn = s.sniper;
  const snipeShare = sn && sn.checked >= 10 ? sn.within60s / sn.checked : 0;

  add(snipeShare > 0 && {
    id: "sniper", title: "Launch Sniper", tagline: "First in. Usually first out.", strength: snipeShare / 0.5,
    trait: { label: "Launch sniper", detail: `${pct(snipeShare)} of buys within a minute of launch` },
  });
  add(s.speed && s.speed.closedCount >= 20 && {
    id: "scalper", title: "Scalper", tagline: "In and out before the candle closes.", strength: s.speed.underMinutePct / 100 / 0.35, // stored as 0..100
    trait: { label: "Scalper", detail: `${Math.round(s.speed.underMinutePct)}% of coins sold within a minute` },
  });
  add({
    id: "degen", title: "Degen Machine", tagline: "Sleep is a suggestion. Charts are a lifestyle.", strength: perDay / 40,
    trait: { label: "Machine", detail: `${Math.round(perDay).toLocaleString()} trades on an active day` },
  });
  add(closed >= 30 && pnl > 0 && {
    id: "assassin", title: "The Assassin", tagline: "Picks fights, mostly wins them.", strength: win / 0.58,
    trait: { label: "Sharpshooter", detail: `${pct(win)} of coins closed in profit` },
  });
  add(pnl > 0 && closed >= 10 && {
    id: "printer", title: "Profit Printer", tagline: "Whatever this is, it's working.", strength: pnl / 10_000,
    trait: { label: "In the green", detail: `${money(pnl)} for the period` },
  });
  add(s.speed?.medianHoldSec != null && s.speed.closedCount >= 5 && {
    id: "diamond", title: "Diamond Hands", tagline: "Buys, then forgets the password. Respect.", strength: s.speed.medianHoldSec / (30 * 86400),
    trait: { label: "Patient", detail: `holds a coin ${dur(s.speed.medianHoldSec)} on average` },
  });
  const tokens = Math.max(1, s.overview.tokensTraded);
  add(s.rugs.count >= 10 && pnl < 0 && {
    id: "rugmagnet", title: "Rug Magnet", tagline: "Never met a dead coin it didn't like.", strength: s.rugs.count / tokens / 0.35,
    trait: { label: "Rug magnet", detail: `lost money on ${s.rugs.count.toLocaleString()} coins that died` },
  });
  add(s.rugs.dodged >= 10 && {
    id: "survivor", title: "Rug Survivor", tagline: "Smells the exit before the dev does.", strength: s.rugs.dodged / Math.max(1, s.rugs.count + s.rugs.dodged) / 0.5,
    trait: { label: "Survivor", detail: `got out of ${s.rugs.dodged.toLocaleString()} coins before they died` },
  });
  const rv = s.revenge;
  add(rv && rv.revenge.count >= 5 && rv.gapAfterLossSec < rv.gapAfterWinSec && rv.revenge.winRate < rv.normal.winRate && {
    id: "revenge", title: "Revenge Trader", tagline: "Losses make you faster. Not better.", strength: (rv.gapAfterWinSec / Math.max(1, rv.gapAfterLossSec)) / 1.4,
    trait: { label: "Tilted", detail: `buys again ${pct(1 - rv.gapAfterLossSec / Math.max(1, rv.gapAfterWinSec))} faster after a loss` },
  });
  add(trades >= 5 && {
    id: "whale", title: "The Whale", tagline: "Moves the chart just by showing up.", strength: avgTrade / 2_000,
    trait: { label: "Big swings", detail: `${money(avgTrade)} per trade on average` },
  });
  const ph = s.paperHands;
  add(ph && {
    id: "paperhands", title: "Paper Hands", tagline: "Sold right before the moon. More than once.", strength: ph.missedUsd / Math.max(2_000, Math.abs(pnl) * 0.5),
    trait: { label: "Paper hands", detail: `left ${money(ph.missedUsd)} on the table on $${ph.symbol}` },
  });
  const top = s.narratives?.top.find((n) => n.id !== "other");
  const narrShare = top ? top.tokens / tokens : 0;
  add(top && tokens >= 10 && {
    id: "narrative", title: `${NARRATIVE_LABEL[top.id]} Maxi`, tagline: `Picked a lane and stayed in it.`, strength: narrShare / 0.4,
    trait: { label: `${NARRATIVE_LABEL[top.id]} maxi`, detail: `${pct(narrShare)} of coins were ${NARRATIVE_LABEL[top.id].toLowerCase()}` },
  });
  add(s.overview.volumeUsd >= 100_000 && {
    id: "volume", title: "Volume Farmer", tagline: "Millions through the pipes. The bottom line barely moves.",
    strength: (s.overview.volumeUsd >= 1e6 ? 1.2 : 1) * (Math.abs(pnl) < s.overview.volumeUsd * 0.03 ? 1.1 : 0),
    trait: { label: "Volume", detail: `${money(s.overview.volumeUsd)} traded, ${money(pnl)} result` },
  });

  c.sort((a, b) => b.strength - a.strength);
  const main = c[0] ?? (
    trades < 10 ? { id: "tourist", title: "The Tourist", tagline: "Passing through, taking photos.", strength: 1 }
    : perDay >= 8 ? { id: "trader", title: "Day Trader", tagline: "Shows up every day, clocks in at the DEX.", strength: 1 }
    : { id: "swing", title: "Swing Trader", tagline: "Waits for the setup. Sometimes.", strength: 1 });
  const traits = c.filter((x) => x !== main && x.trait).slice(0, 3).map((x) => x.trait!);
  return { title: main.title, tagline: main.tagline, style: main.id, traits };
}
