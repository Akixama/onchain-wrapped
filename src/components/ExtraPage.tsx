// Frame for the standalone pages (achievements, Pump.fun): header, share buttons, link back to the story.
import Link from "next/link";
import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { RibbonField } from "@/components/site/RibbonField";

export function ExtraPage({ id, title, sub, shareText, shareUrl, children }: { id: string; title: ReactNode; sub: ReactNode; shareText: string; shareUrl: string; bg?: string; children: ReactNode }) {
  const x = `https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
  const tg = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;
  return (
    <div className="min-h-[100dvh] bg-ink-1 text-fg">
      <SiteHeader />
      <section className="relative overflow-hidden border-b border-line">
        <RibbonField variant="side" className="opacity-60" />
        <div className="relative mx-auto max-w-6xl space-y-5 px-4 py-14 sm:px-8 sm:py-20">
          <h1 className="display text-[40px] sm:text-[64px]">{title}</h1>
          <div className="text-lg text-fg-2">{sub}</div>
          <div className="flex flex-wrap gap-2">
            <a href={x} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-fg px-4 py-2 text-sm font-medium text-ink-0 transition-colors hover:bg-white">Share on X</a>
            <a href={tg} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-line bg-ink-2 px-4 py-2 text-sm font-medium transition-colors hover:bg-ink-3">Telegram</a>
            <Link href={`/w/${id}`} className="rounded-lg border border-line bg-ink-2 px-4 py-2 text-sm font-medium transition-colors hover:bg-ink-3">See the Wrapped</Link>
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-12 sm:px-8">
        {children}
        <p className="text-center text-xs text-fg-3">Prices from public market data. Not financial advice</p>
      </div>
      <SiteFooter />
    </div>
  );
}
