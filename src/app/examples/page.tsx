import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { TipFab } from "@/components/TipJar";
import { ExampleCard } from "@/components/site/ExampleCard";
import { PageHero, SectionTitle, SiteFooter, SiteHeader } from "@/components/site/SiteChrome";

export const metadata: Metadata = { title: "Examples · Wrapped Onchain", description: "Real Solana wallets, wrapped. Open any of them and swipe through the story." };

const DEMOS = [
  { id: "sol-memes", label: "Memecoin trader", what: "28,065 trades across 7,700 coins in a year." },
  { id: "sol-sniper", label: "Solana sniper", what: "Buys new launches within seconds of them going live." },
  { id: "sol-cluster", label: "One trader, 3 wallets", what: "Three wallets wrapped together, transfers between them ignored." },
];

export default function Examples() {
  return (
    <main className="min-h-[100dvh] bg-ink-1 text-fg">
      <SiteHeader />
      <PageHero title={<>Real wallets,<br />wrapped.</>} sub="Public Solana wallets run through the same lookup you'd get. Open one and swipe.">
        <Link href="/#wrap" className="accent-glow inline-flex h-12 items-center rounded-xl bg-accent px-6 font-display font-medium text-white transition-colors hover:bg-accent-hover">Wrap your own</Link>
      </PageHero>
      <div className="mx-auto max-w-6xl space-y-10 px-4 py-16 sm:px-8 sm:py-24">
        <SectionTitle sub="Each one is a saved result, not a mock-up.">Pick one.</SectionTitle>
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {DEMOS.map((d) => (
            <div key={d.id} className="space-y-4">
              <div>
                <h3 className="font-display text-xl font-semibold">{d.label}</h3>
                <p className="text-sm text-fg-2">{d.what}</p>
              </div>
              <Suspense fallback={<div className="h-[560px] rounded-[20px] border border-line bg-ink-2" />}>
                <ExampleCard id={d.id} label={d.label} />
              </Suspense>
            </div>
          ))}
        </div>
      </div>
      <SiteFooter />
      <TipFab />
    </main>
  );
}
