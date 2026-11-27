import Link from "next/link";
import { Suspense } from "react";
import { ArrowUpRight } from "lucide-react";
import { LandingForm } from "@/components/LandingForm";
import { TipFab } from "@/components/TipJar";
import { Logo } from "@/components/Logo";
import { CHAIN_NAME, num, pct, usd } from "@/components/format";
import { EVM_ENABLED } from "@/lib/site";
import { getJob } from "@/lib/store";

const ALL_DEMOS = [
  { id: "sol-sniper", label: "Solana sniper", sub: "461 memecoin trades" },
  { id: "machi", label: "machibigbrother.eth", sub: "EVM → Hyperliquid", evm: true },
  { id: "sol-memes", label: "Memecoin trader", sub: "28,065 trades" },
  { id: "sol-cluster", label: "One trader, 3 wallets", sub: "Merged identity" },
];
const DEMOS = ALL_DEMOS.filter((d) => EVM_ENABLED || !("evm" in d));
const CHAINS = EVM_ENABLED ? ["solana", "ethereum", "base", "arbitrum", "bsc", "polygon", "optimism"] : ["solana"];
const PREVIEW_ID = "sol-memes";

export default function Home() {
  return (
    <main className="min-h-[100dvh] bg-ink-1 text-fg">
      <div className="mx-auto flex min-h-[100dvh] max-w-6xl flex-col px-4 pb-24 pt-5 sm:px-8">
        <header className="flex h-10 items-center justify-between">
          <Logo />
          <span className="text-sm text-fg-3">Free, no sign-up</span>
        </header>

        <section className="grid flex-1 items-center gap-12 py-12 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] lg:gap-16 lg:py-16">
          <div className="rise-in space-y-8">
            <div className="space-y-4">
              <h1 className="font-display text-[40px] font-medium leading-[1.04] tracking-[-0.02em] sm:text-[60px] sm:tracking-[-0.03em]">
                Your Solana trading year, wrapped
              </h1>
              <p className="max-w-[36rem] text-lg leading-7 text-fg-2">
                Best trade, worst trade, the round trip that hurt, the fees you burned. {EVM_ENABLED ? "Every chain, every wallet, one story." : "Every wallet you own, one story, checked against the chain."}
              </p>
            </div>
            <LandingForm />
          </div>

          <Suspense fallback={<div className="hidden h-[520px] lg:block" />}>
            <Preview />
          </Suspense>
        </section>

        <section className="space-y-3 border-t border-line pt-8">
          <h2 className="text-sm text-fg-2">Or open a real wallet</h2>
          <div className="grid gap-2 sm:grid-cols-3">
            {DEMOS.map((d) => (
              <Link key={d.id} href={`/w/${d.id}`}
                className="group flex items-center justify-between gap-3 rounded-xl border border-line bg-ink-2 px-4 py-3 transition-colors duration-150 hover:bg-ink-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{d.label}</span>
                  <span className="block font-mono text-xs text-fg-3">{d.sub}</span>
                </span>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-fg-3 transition-colors group-hover:text-fg" strokeWidth={1.5} />
              </Link>
            ))}
          </div>
        </section>

        <footer className="mt-8 flex flex-col gap-1 pr-16 text-xs text-fg-3 sm:flex-row sm:justify-between sm:pr-40">
          <span>{CHAINS.map((c) => CHAIN_NAME[c]).join(" · ")} only. Read-only public data</span>
          <span>Numbers are estimates, not financial or tax advice</span>
        </footer>
      </div>
      <TipFab />
    </main>
  );
}

/** What you get: the summary of a real demo Wrapped, as story segments and a receipt. */
async function Preview() {
  const s = (await getJob(PREVIEW_ID))?.stats;
  if (!s) return null;
  const rows: [string, string, string?][] = [
    ["Trades", num(s.overview.totalTrades)],
    ["Coins traded", num(s.overview.tokensTraded)],
    ["Win rate", pct(s.pnl.winRate)],
    ...(s.bestTrade ? [["Best trade", `$${s.bestTrade.symbol}  ${usd(s.bestTrade.pnlUsd, { sign: true })}`, "pos"] as [string, string, string]] : []),
    ...(s.worstTrade ? [["Worst trade", `$${s.worstTrade.symbol}  ${usd(s.worstTrade.pnlUsd, { sign: true })}`, "neg"] as [string, string, string]] : []),
    ["Fees burned", usd(s.gas.totalUsd)],
  ];
  const total = s.pnl.totalUsd;
  return (
    <Link href={`/w/${PREVIEW_ID}`} aria-label="Open this example Wrapped"
      className="rise-in group mx-auto block w-full max-w-[400px] rounded-[20px] border border-line bg-ink-2 p-5 shadow-[0_24px_64px_rgba(0,0,0,0.45)] transition-colors duration-150 [animation-delay:80ms] hover:border-[rgb(238_240_245/0.16)] lg:mr-0">
      <div className="flex gap-1" aria-hidden>
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} className={`h-[3px] flex-1 rounded-full ${i === 0 ? "bg-accent-ink" : "bg-[rgb(238_240_245/0.14)]"}`} />
        ))}
      </div>
      <div className="mt-5 flex items-center justify-between font-mono text-xs text-fg-3">
        <span>Example · last 12 months</span>
        <span>1 / 12</span>
      </div>
      <div className="mt-8 space-y-1">
        <div className="text-sm text-fg-2">{s.archetype.title}</div>
        <div className={`font-mono text-[44px] font-medium leading-none tabular-nums tracking-[-0.02em] ${total >= 0 ? "text-pos" : "text-neg"}`}>
          {usd(total, { sign: true })}
        </div>
        <div className="text-sm text-fg-3">from trading, on {usd(s.overview.volumeUsd)} volume</div>
      </div>
      <dl className="mt-8 divide-y divide-dashed divide-[rgb(238_240_245/0.1)] border-y border-dashed border-[rgb(238_240_245/0.1)]">
        {rows.map(([k, v, tone]) => (
          <div key={k} className="flex items-center justify-between gap-4 py-2.5 text-sm">
            <dt className="text-fg-2">{k}</dt>
            <dd className={`truncate whitespace-pre font-mono tabular-nums ${tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : "text-fg"}`}>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 flex items-center justify-between text-sm">
        <span className="text-fg-3">Checked against the chain</span>
        <span className="inline-flex items-center gap-1 text-fg transition-colors group-hover:text-accent-ink">
          Open it <ArrowUpRight className="h-4 w-4" strokeWidth={1.5} />
        </span>
      </div>
    </Link>
  );
}
