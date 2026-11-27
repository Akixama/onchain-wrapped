import type { Metadata } from "next";
import Link from "next/link";
import { TipFab } from "@/components/TipJar";
import { PageHero, Rows, SectionTitle, SiteFooter, SiteHeader } from "@/components/site/SiteChrome";

export const metadata: Metadata = { title: "How it works · Wrapped Onchain", description: "How Wrapped Onchain reads a Solana wallet and turns it into a story, and what it can and can't see." };

const STEPS: [string, string][] = [
  ["Paste a wallet", "Any public Solana address or .sol name. Add up to six if you trade from more than one."],
  ["Read the chain", "Every transaction in the period is read from Solana, page by page. Big wallets take a few minutes."],
  ["Price every trade", "Each swap is valued at the price when it happened, from public market data."],
  ["Match buys and sells", "Buys and sells of the same coin are matched into positions; transfers between your own wallets are left out."],
  ["Tell the story", "The cards your year earned are picked, ranked and written up, ready to swipe and share."],
];

// Same settings the store uses, so this page can't drift from what the code does.
const KEEP_DAYS = Number(process.env.RESULT_KEEP_DAYS ?? 90);
const REUSE_HOURS = Number(process.env.RESULT_TTL_HOURS ?? 24);
const WHO: [string, string, string][] = [
  ["Your wallet address", "Anyone you share the link with", "It is in the result link. Results are public to anyone who has the link."],
  ["Your keys and funds", "No one here", "There is no wallet connect and nothing to sign. The site can only read public data."],
  ["Your result", `Saved for ${KEEP_DAYS} days`, `So shared links keep working. The same wallet and period is reused for ${REUSE_HOURS} hours instead of read again.`],
  ["The live feed", "Every visitor", "Shows the kind of trader, trade count and result of finished wraps. Never the address, never a link."],
  ["Achievement rarity", "Every visitor", "Counts how many wallets earned each badge. Each wallet is counted once."],
];

const FAQ: [string, string][] = [
  ["Is this only Solana?", "Yes. Only Solana wallets work, and only trades on Solana are counted."],
  ["Why is my result different from my wallet app?", "Wallet apps usually show today's value of what you hold. This counts what you made or lost on trades in the period, at the prices when they happened, plus what you still hold at today's prices."],
  ["Does sending coins to another wallet count as a loss?", "No. A transfer isn't a trade. Add both wallets together and moves between them are ignored entirely."],
  ["Why does a big wallet take so long?", "Every transaction is read from the chain. A bot-heavy wallet can have hundreds of thousands. You can play the guessing game while it reads, and the tab tells you when it's done."],
  ["What is Pump.fun Wrapped?", "The same lookup, showing only coins launched on pump.fun: how many you bought, which graduated (read from pump.fun's own records on the chain) and your result on them."],
  ["How accurate is it?", "Trades and amounts come straight from the chain. Prices come from public market data; a few tiny coins have none, and the story notes when a number is partial. Treat it as a good estimate, not tax figures."],
  ["Does it cost anything?", "No. It's free with no sign-up. There's a tip button if it made you laugh."],
];

export default function How() {
  return (
    <main className="min-h-[100dvh] bg-ink-1 text-fg">
      <SiteHeader />
      <PageHero title={<>How it<br />works.</>} sub="Read-only, from the chain, priced at the time. Here is exactly what happens to a wallet you paste.">
        <Link href="/#wrap" className="inline-flex h-12 items-center rounded-xl bg-fg px-6 font-display font-medium text-ink-0 transition-colors hover:bg-white">Wrap a wallet</Link>
      </PageHero>
      <div className="mx-auto max-w-6xl space-y-24 px-4 py-16 sm:px-8 sm:py-24">
        <section className="space-y-6">
          <SectionTitle>Five steps.</SectionTitle>
          <Rows items={STEPS} />
        </section>

        <section className="space-y-6">
          <SectionTitle sub="The catch, stated plainly.">Who sees what.</SectionTitle>
          <div className="overflow-hidden rounded-2xl border border-line">
            <div className="hidden grid-cols-[200px_200px_1fr] gap-6 bg-ink-2 px-5 py-3 text-xs text-fg-3 sm:grid"><span>What</span><span>Who</span><span>Details</span></div>
            {WHO.map(([a, b, c]) => (
              <div key={a} className="grid gap-1 border-t border-line px-5 py-4 first:border-t-0 sm:grid-cols-[200px_200px_1fr] sm:gap-6 sm:first:border-t">
                <span className="font-display font-semibold">{a}</span>
                <span className="text-fg">{b}</span>
                <span className="text-fg-2">{c}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <SectionTitle>Questions.</SectionTitle>
          <div className="divide-y divide-line border-b border-line">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 font-display text-xl font-semibold [&::-webkit-details-marker]:hidden">
                  {q}
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line text-fg-2 transition-transform duration-200 group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 max-w-3xl text-fg-2">{a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
      <SiteFooter />
      <TipFab />
    </main>
  );
}
