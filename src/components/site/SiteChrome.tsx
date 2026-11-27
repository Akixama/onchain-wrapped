"use client";
// Header, footer and page hero shared by every site page (not the story player).
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { LiveChip } from "./live";
import { RibbonField } from "./RibbonField";

const NAV: [string, string][] = [
  ["/", "Wrap"],
  ["/examples", "Examples"],
  ["/pump", "Pump.fun"],
  ["/achievements", "Achievements"],
  ["/how", "How it works"],
];

export function SiteHeader() {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href) && !/^\/pump\/./.test(path));
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink-1/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-8">
        <Logo />
        <nav className="hidden items-center gap-1 whitespace-nowrap text-sm lg:flex">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href}
              className={`rounded-lg px-3 py-1.5 transition-colors ${active(href) ? "bg-ink-3 text-fg" : "text-fg-2 hover:text-fg"}`}>{label}</Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <LiveChip />
          <Link href="/#wrap" className="whitespace-nowrap rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover">Wrap a wallet</Link>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-4 pb-2 text-sm [scrollbar-width:none] lg:hidden">
        {NAV.map(([href, label]) => (
          <Link key={href} href={href}
            className={`shrink-0 rounded-lg px-3 py-1.5 transition-colors ${active(href) ? "bg-ink-3 text-fg" : "text-fg-2"}`}>{label}</Link>
        ))}
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 pr-20 text-sm sm:grid-cols-[1fr_auto] sm:px-8 sm:pr-40">
        <div className="space-y-2">
          <Logo />
          <p className="max-w-md text-fg-3">Your Solana trading year as a story. Read-only: we never ask for keys or signatures, and nothing here can move your funds.</p>
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-fg-2">
          {NAV.map(([href, label]) => <Link key={href} href={href} className="transition-colors hover:text-fg">{label}</Link>)}
        </div>
        <p className="font-mono text-xs text-fg-3 sm:col-span-2">wrappedonchain.com · Solana mainnet · numbers are estimates, not financial or tax advice</p>
      </div>
    </footer>
  );
}

/** Every inner page opens the same way: the ribbon on the right, a big short-sentence title, one line, the main action. */
export function PageHero({ title, sub, children }: { title: ReactNode; sub: ReactNode; children?: ReactNode }) {
  return (
    <section className="relative overflow-hidden border-b border-line">
      <RibbonField variant="side" className="opacity-80" />
      <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-8 sm:py-24">
        <div className="max-w-xl space-y-4 lg:max-w-[560px]">
          <h1 className="display text-[44px] sm:text-[72px]">{title}</h1>
          <p className="text-lg text-fg-2">{sub}</p>
          {children && <div className="relative pt-4">{children}</div>}
        </div>
      </div>
    </section>
  );
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="space-y-2 border-b border-[rgb(238_240_245/0.16)] pb-5">
      <h2 className="h2xl">{children}</h2>
      {sub && <p className="text-fg-2">{sub}</p>}
    </div>
  );
}

/** Numbered hairline rows: number, bold title, one sentence. */
export function Rows({ items }: { items: [string, string][] }) {
  return (
    <ol className="divide-y divide-line">
      {items.map(([t, d], i) => (
        <li key={t} className="grid grid-cols-[40px_1fr] gap-4 py-5 sm:grid-cols-[56px_240px_1fr]">
          <span className="font-mono text-sm text-fg-3">{String(i + 1).padStart(2, "0")}</span>
          <span className="font-display text-lg font-semibold">{t}</span>
          <span className="col-start-2 text-fg-2 sm:col-start-auto">{d}</span>
        </li>
      ))}
    </ol>
  );
}
