import type { Metadata } from "next";
import { Suspense } from "react";
import { BadgeTile } from "@/components/BadgeTile";
import { TipFab } from "@/components/TipJar";
import { num } from "@/components/format";
import { PageHero, SectionTitle, SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { ACHIEVEMENTS, RARITY_MIN_WALLETS } from "@/lib/achievements-catalog";
import { getRarity } from "@/lib/rarity";

export const metadata: Metadata = { title: "Achievements · Wrapped Onchain", description: "Every badge a Solana trading year can earn, and how rare each one is." };

async function Counted() {
  const r = await getRarity().catch(() => ({ total: 0, pct: null }));
  return (
    <div>
      <div className="font-mono text-[56px] font-medium leading-none tabular-nums tracking-[-0.02em]">{num(r.total)}</div>
      <div className="mt-2 text-sm text-fg-3">wallets counted so far{r.pct ? "" : `; percentages show from ${RARITY_MIN_WALLETS}`}</div>
    </div>
  );
}

async function Grid() {
  const r = await getRarity().catch(() => ({ total: 0, pct: null }));
  const order = { legendary: 0, epic: 1, rare: 2, common: 3 } as const;
  const list = [...ACHIEVEMENTS].sort((a, b) => (r.pct ? (r.pct[a.id] ?? 0) - (r.pct[b.id] ?? 0) : order[a.tier] - order[b.tier]));
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {list.map((a) => <BadgeTile key={a.id} id={a.id} detail={a.desc} pct={r.pct} />)}
    </div>
  );
}

export default function Achievements() {
  return (
    <main className="min-h-[100dvh] bg-ink-1 text-fg">
      <SiteHeader />
      <PageHero title={<>Collect them<br />all.</>} sub={`${ACHIEVEMENTS.length} badges a trading year can earn. Each wrap unlocks the ones it earned; rarity is counted from every wallet wrapped.`}>
        <Suspense fallback={null}><Counted /></Suspense>
      </PageHero>
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-16 sm:px-8 sm:py-24">
        <SectionTitle sub="Rarest first.">Every badge.</SectionTitle>
        <Suspense fallback={<div className="h-96" />}><Grid /></Suspense>
      </div>
      <SiteFooter />
      <TipFab />
    </main>
  );
}
