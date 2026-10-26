import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CardId, WrappedStats } from "@/lib/engine/stats";
import { getJob } from "@/lib/store";
import { CARD_THEME, CHAIN_COLOR, CHAIN_NAME, hourLabel, num, pct, periodLabel, price, usd, whoLabel } from "@/components/format";

// Fonts are the same for every request: read once.
const fontDir = join(process.cwd(), "assets", "fonts");
const [display, body, bodySemi] = await Promise.all([
  readFile(join(fontDir, "space-grotesk-latin-700-normal.woff")),
  readFile(join(fontDir, "inter-latin-400-normal.woff")),
  readFile(join(fontDir, "inter-latin-600-normal.woff")),
]);

const W = 1200, H = 630;
const green = "#4ADE80", red = "#F87171";
const signColor = (n: number) => (n >= 0 ? green : red);
const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

interface Content { kicker: string; lead?: string; big: string; bigColor?: string; sub?: string; chips?: { label: string; color?: string }[] }

function content(s: WrappedStats, card: CardId): Content {
  const m = (n: number, sign = false) => usd(n, { sign });
  switch (card) {
    case "archetype":
      return { kicker: "My onchain personality", big: s.archetype.title, sub: s.archetype.tagline, chips: s.overview.chainsUsed.map((c) => ({ label: CHAIN_NAME[c], color: CHAIN_COLOR[c] })) };
    case "overview":
      return { kicker: "The numbers", big: `${num(s.overview.totalTrades)} trades`, sub: `${m(s.overview.volumeUsd)} volume across ${s.overview.chainsUsed.length} chains · ${s.overview.activeDays} active days` };
    case "pnl":
      return { kicker: "Trading result", big: m(s.pnl.totalUsd, true), bigColor: signColor(s.pnl.totalUsd), sub: `${pct(s.pnl.winRate)} win rate · ${s.pnl.wins} wins, ${s.pnl.losses} losses` };
    case "best": {
      const t = s.bestTrade!;
      return { kicker: "Best trade", lead: `$${t.symbol}`, big: m(t.pnlUsd, true), bigColor: green, sub: `In at ${price(t.avgEntry)}${t.avgExit ? `, out at ${price(t.avgExit)}` : ""}` };
    }
    case "worst": {
      const t = s.worstTrade!;
      return { kicker: "Worst trade", lead: `$${t.symbol}`, big: m(t.pnlUsd), bigColor: red, sub: `Put in ${m(t.costUsd)}, took out ${m(t.proceedsUsd)}` };
    }
    case "roundTrip": {
      const r = s.roundTrip!;
      return { kicker: "The round trip", lead: `Up ${m(r.peakGainUsd)} on $${r.symbol}…`, big: `walked out with ${m(r.endedWithUsd, true)}`, bigColor: signColor(r.endedWithUsd) };
    }
    case "paperHands": {
      const p = s.paperHands!;
      return { kicker: "Paper hands", lead: `Sold $${p.symbol} before it ran ${Math.round(p.laterPeak / p.soldAt)}x`, big: `${m(p.missedUsd)} left on the table`, bigColor: "#F9A8D4" };
    }
    case "diamondHands": {
      const d = s.diamondHands!;
      return { kicker: "Diamond hands", lead: `$${d.symbol}`, big: `${d.daysHeld} days`, sub: `${d.stillHolding ? "Still holding" : "Then sold"} · ${m(d.pnlUsd, true)}` };
    }
    case "counterfactual": {
      const c = s.counterfactual;
      const held = c.verdict === "should_have_held";
      return { kicker: `If I'd just held ${c.major.replace("+", " & ")}`, big: held ? `${m(c.justHeldDiffUsd)} richer` : `${m(-c.justHeldDiffUsd)} poorer`, bigColor: held ? "#FBBF24" : green, sub: held ? "Should've just held." : "My trading actually won." };
    }
    case "gas":
      return { kicker: "Gas burned", big: m(s.gas.totalUsd), bigColor: "#FDBA74", sub: `${num(s.gas.txCount)} transactions · priciest ${m(s.gas.priciestTxUsd)}` };
    case "rugs":
      return { kicker: "Rugs", big: `${s.rugs.count} caught · ${s.rugs.dodged} dodged`, sub: s.rugs.count ? `Cost me ${m(s.rugs.lostUsd)}` : "Untouchable." };
    case "airdrops":
      return { kicker: "Airdrops", big: `${s.airdrops.count} claimed`, sub: `about ${m(s.airdrops.valueUsd)} of free money` };
    case "sleep":
      return { kicker: "Sleep schedule", lead: "Most active trading hour", big: `${hourLabel(s.sleep.peakHourUtc)} UTC`, sub: `${s.sleep.peakHourCount} trades at that hour` };
    case "roast":
      return { kicker: "The roast", big: s.roast?.text ?? "", sub: undefined };
    case "percentile":
      return { kicker: "Ranking", big: `Top ${Math.max(1, Math.round(100 - (s.percentile.activity ?? 0)))}%`, sub: "most active of everyone who checked" };
    case "bridges":
      return { kicker: "Bridge journey", big: s.bridges.journey.map((c) => CHAIN_NAME[c]).join(" → "), sub: `${m(s.bridges.totalUsd)} moved across chains` };
    default:
      return {
        kicker: "My onchain Wrapped", big: s.archetype.title,
        sub: [`${num(s.overview.totalTrades)} trades`, m(s.pnl.totalUsd, true) + " PnL", s.bestTrade && `best: $${s.bestTrade.symbol}`].filter(Boolean).join(" · "),
      };
  }
}

export async function GET(_req: Request, ctx: RouteContext<"/api/og/[id]/[card]">) {
  const { id, card: rawCard } = await ctx.params;
  const job = await getJob(id);
  const s = job?.stats;
  const card = (rawCard.replace(/\.png$/, "") as CardId) || "summary";
  const valid = s && (s.cards.includes(card) || card === "summary");
  const c: Content = valid ? content(s, card) : { kicker: "Onchain Wrapped", big: "Your onchain year, wrapped.", sub: "Paste any wallet. Solana + EVM." };
  const t = CARD_THEME[valid ? card : "summary"];
  const bigSize = c.big.length > 120 ? 40 : c.big.length > 60 ? 48 : c.big.length > 28 ? 64 : c.big.length > 18 ? 84 : 112;

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", position: "relative", background: t.bg, color: t.ink, fontFamily: "Inter", overflow: "hidden" }}>
        {/* Satori clips blur() to a box, so the glows are radial gradients instead. */}
        <div style={{ position: "absolute", left: 0, top: 0, width: 1000, height: 760, display: "flex", backgroundImage: `radial-gradient(circle at 15% 10%, ${rgba(t.a, 0.55)} 0%, ${rgba(t.a, 0)} 60%)` }} />
        <div style={{ position: "absolute", left: 620, top: 160, width: 900, height: 900, display: "flex", backgroundImage: `radial-gradient(circle, ${rgba(t.b, 0.35)} 0%, ${rgba(t.b, 0)} 65%)` }} />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 72px", width: "100%", position: "relative" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: 4, textTransform: "uppercase", opacity: 0.75 }}>{c.kicker}</div>
            <div style={{ display: "flex", fontFamily: "SpaceGrotesk", fontSize: 28 }}>
              onchain<span style={{ opacity: 0.6 }}>wrapped</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {c.lead && <div style={{ fontSize: 44, fontWeight: 600, opacity: 0.9 }}>{c.lead}</div>}
            <div style={{ fontFamily: "SpaceGrotesk", fontSize: bigSize, lineHeight: 1, letterSpacing: -2, color: c.bigColor ?? t.ink }}>{c.big}</div>
            {c.sub && <div style={{ fontSize: 32, opacity: 0.8 }}>{c.sub}</div>}
            {c.chips && (
              <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                {c.chips.slice(0, 6).map((x) => (
                  <div key={x.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 18px", borderRadius: 999, background: "rgba(255,255,255,0.12)", fontSize: 24 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 99, background: x.color ?? "#fff" }} />
                    {x.label}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, opacity: 0.7 }}>
            <span>{s ? `${whoLabel(s)} · ${periodLabel(s)}` : "Solana · Ethereum · Base · Arbitrum · BNB · Polygon · Optimism"}</span>
            <span>Get yours →</span>
          </div>
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: [
        { name: "SpaceGrotesk", data: display, weight: 700, style: "normal" },
        { name: "Inter", data: body, weight: 400, style: "normal" },
        { name: "Inter", data: bodySemi, weight: 600, style: "normal" },
      ],
      headers: { "cache-control": job?.status === "done" ? "public, max-age=86400, immutable" : "no-store" },
    },
  );
}

