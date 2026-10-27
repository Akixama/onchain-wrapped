import Link from "next/link";
import { LandingForm } from "@/components/LandingForm";
import { CHAIN_COLOR, CHAIN_NAME } from "@/components/format";
import { EVM_ENABLED } from "@/lib/site";

const ALL_DEMOS = [
  { id: "sol-sniper", label: "Solana sniper", sub: "461 memecoin trades" },
  { id: "machi", label: "machibigbrother.eth", sub: "EVM → Hyperliquid", evm: true },
  { id: "sol-memes", label: "Memecoin trader", sub: "28,065 trades" },
  { id: "sol-cluster", label: "One trader, 3 wallets", sub: "Merged identity" },
];
const DEMOS = ALL_DEMOS.filter((d) => EVM_ENABLED || !("evm" in d));
const CHAINS = EVM_ENABLED ? ["solana", "ethereum", "base", "arbitrum", "bsc", "polygon", "optimism"] : ["solana"];

export default function Home() {
  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#0B0820]">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-[#7C3AED] opacity-40 blur-3xl" />
        <div className="absolute -bottom-48 -right-32 h-[520px] w-[520px] rounded-full bg-[#14F195] opacity-25 blur-3xl" />
      </div>
      <div className="relative mx-auto flex min-h-[100dvh] max-w-xl flex-col px-4 py-6 sm:px-6">
        <header className="flex items-center justify-between">
          <span className="font-display text-lg font-bold tracking-tight">onchain<span className="opacity-60">wrapped</span></span>
          <span className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/70">Free · no sign-up</span>
        </header>

        <section className="my-auto space-y-8 py-10">
          <div className="space-y-4">
            <h1 className="font-display text-[44px] font-bold leading-[0.95] tracking-tight sm:text-6xl">
              Your onchain year,<br /><span className="bg-gradient-to-r from-[#C4B5FD] via-[#F0ABFC] to-[#6EE7B7] bg-clip-text text-transparent">wrapped.</span>
            </h1>
            <p className="text-lg text-white/75">Best trade, worst trade, the round trip that hurt, the gas you burned. {EVM_ENABLED ? "Every chain, every wallet, one story." : "Every Solana wallet you own, one story."}</p>
          </div>
          <LandingForm />
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">Or peek at a real wallet</p>
            <div className="grid grid-cols-2 gap-2">
              {DEMOS.map((d) => (
                <Link key={d.id} href={`/w/${d.id}`} className="last:odd:col-span-2 rounded-2xl border border-white/10 bg-white/[0.05] p-3 transition hover:border-white/30 hover:bg-white/10">
                  <div className="truncate text-sm font-semibold">{d.label}</div>
                  <div className="text-xs text-white/55">{d.sub}</div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <footer className="space-y-3 pb-2">
          <div className="flex flex-wrap gap-2">
            {CHAINS.map((c) => (
              <span key={c} className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-xs text-white/70">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: CHAIN_COLOR[c] }} />{CHAIN_NAME[c]}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-white/40">Read-only public data. Numbers are estimates, not financial or tax advice.</p>
        </footer>
      </div>
    </main>
  );
}
