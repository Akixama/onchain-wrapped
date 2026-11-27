import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import { LandingForm } from "@/components/LandingForm";
import { TipFab } from "@/components/TipJar";
import { RibbonField } from "@/components/site/RibbonField";
import { LiveNumbers, RecentWraps } from "@/components/site/live";
import { StatusBadge } from "@/components/site/StatusBadge";
import { Rows, SectionTitle, SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { ExampleCard } from "@/components/site/ExampleCard";

const INSIDE: [string, string][] = [
  ["Your era", "The kind of trader your year says you are, from how you actually traded."],
  ["The bottom line", "Profit or loss from trading, at the prices when you traded, with wins and losses counted."],
  ["Best and worst trade", "The coin that paid the most and the one that cost the most, each with its chart."],
  ["The round trip", "The coin that was up big while you held it and gave it all back."],
  ["Paper hands", "The coin you sold early, and what it would have been worth if you'd held."],
  ["Rugs and snipes", "Coins that died in your bag, the ones you got out of, and how fast you bought new launches."],
  ["Sleep schedule", "The hour you trade most, read from your own transactions."],
  ["The roast", "A short, honest roast of your year to share."],
];

const REAL: [string, string][] = [
  ["Read from the chain", "Every transaction comes from Solana itself, not from an app's history."],
  ["Prices at the time", "Each trade is valued at the price when it happened, from public market data."],
  ["Your own transfers", "Moving coins between wallets you add together is not counted as a trade."],
  ["Estimates", "Some tiny coins have no reliable price; the story says when numbers are partial."],
  ["Read-only", "No wallet connect, no keys, no signatures. Anyone can wrap any public wallet."],
];

export default function Home() {
  return (
    <main className="min-h-[100dvh] bg-ink-1 text-fg">
      <SiteHeader />

      <section id="wrap" className="relative flex min-h-[calc(100svh-56px)] scroll-mt-14 items-center overflow-hidden border-b border-line">
        <RibbonField variant="center" />
        <div className="relative mx-auto w-full max-w-5xl px-4 pb-36 pt-10 text-center sm:px-8 sm:pb-40">
          <div className="rise-in space-y-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-ink-2/80 px-3 py-1 text-xs text-fg-2 backdrop-blur">
              <StatusBadge kind="live" /> Updating live
            </span>
            <h1 className="display text-[52px] sm:text-[80px] lg:text-[100px]">
              Your trading year,<br /><span className="text-fg-2">wrapped.</span>
            </h1>
            <p className="mx-auto max-w-xl text-lg text-fg-2">
              Paste a Solana wallet. Get your best trade, your worst, the round trip that hurt and the fees you burned, as a story checked against the chain.
            </p>
            <div className="mx-auto max-w-2xl"><LandingForm variant="hero" /></div>
            <Link href="/examples" className="inline-flex items-center gap-1 text-sm text-fg-2 transition-colors hover:text-fg">
              or open a real example <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
            </Link>
          </div>
          <LiveNumbers className="mx-auto mt-10 max-w-2xl" />
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-24 px-4 py-20 sm:space-y-32 sm:px-8 sm:py-28">
        <section className="space-y-8">
          <SectionTitle sub="Lookups as they finish. Only the kind of trader and the size, never the wallet.">Watch it wrap.</SectionTitle>
          <RecentWraps />
        </section>

        <section className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-16">
          <div className="space-y-6">
            <SectionTitle sub="Up to 30 swipeable cards, only the ones your year earned.">What&apos;s inside.</SectionTitle>
            <Rows items={INSIDE} />
          </div>
          <div className="lg:pt-24">
            <Suspense fallback={<div className="h-[560px] rounded-[20px] border border-line bg-ink-2" />}>
              <ExampleCard id="sol-memes" label="Memecoin trader" />
            </Suspense>
          </div>
        </section>

        <section className="space-y-6">
          <SectionTitle sub="What the numbers are built from, so you can trust them or argue with them.">What is real, and what is not.</SectionTitle>
          <dl className="divide-y divide-line">
            {REAL.map(([k, v]) => (
              <div key={k} className="grid gap-1 py-4 sm:grid-cols-[240px_1fr] sm:gap-6">
                <dt className="font-display font-semibold">{k}</dt>
                <dd className="text-fg-2">{v}</dd>
              </div>
            ))}
          </dl>
          <Link href="/how" className="inline-flex items-center gap-1 text-sm text-fg-2 transition-colors hover:text-fg">How it works <ArrowRight className="h-4 w-4" strokeWidth={1.5} /></Link>
        </section>
      </div>

      <SiteFooter />
      <TipFab />
    </main>
  );
}
