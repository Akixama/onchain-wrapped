import type { Metadata } from "next";
import { LandingForm } from "@/components/LandingForm";
import { TipFab } from "@/components/TipJar";
import { PageHero, Rows, SectionTitle, SiteFooter, SiteHeader } from "@/components/site/SiteChrome";

export const metadata: Metadata = { title: "Pump.fun Wrapped · Wrapped Onchain", description: "Your pump.fun year: how many of your coins came from pump.fun, which graduated, and what they did to you." };

const CARDS: [string, string][] = [
  ["Your pump.fun year", "How many of your coins came from pump.fun, and your result on them against everything else."],
  ["Did they graduate?", "Read from pump.fun's own records on the chain: graduated and still trading, graduated then died, or never left the curve."],
  ["Biggest bets", "The five pump.fun coins you put the most into, and what each one did."],
  ["Best and worst pump", "The one that paid and the one that hurt."],
  ["The summary", "Your pump.fun year on one card, ready to share, with every coin on its own page."],
];

export default function PumpHome() {
  return (
    <main className="min-h-[100dvh] bg-ink-1 text-fg">
      <SiteHeader />
      <PageHero title={<>Your pump.fun<br />year.</>} sub="Just the pump.fun coins: how many you bought, how many graduated, and what they did to you.">
        <div className="rounded-2xl border border-line bg-ink-2/85 p-4 backdrop-blur">
          <LandingForm initialView="pump" lockView />
        </div>
      </PageHero>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-16 sm:px-8 sm:py-24">
        <SectionTitle sub="A pump.fun coin is one launched on pump.fun. Same lookup as the full Wrapped, its own story.">Five cards.</SectionTitle>
        <Rows items={CARDS} />
      </div>
      <SiteFooter />
      <TipFab />
    </main>
  );
}
