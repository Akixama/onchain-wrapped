// Frame for the standalone pages (achievements, Pump.fun): header, share buttons, link back to the story.
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";

export function ExtraPage({ id, title, sub, shareText, shareUrl, children }: { id: string; title: ReactNode; sub: ReactNode; shareText: string; shareUrl: string; bg?: string; children: ReactNode }) {
  const x = `https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
  const tg = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;
  return (
    <div className="min-h-[100dvh] bg-ink-1 px-4 py-5 text-fg sm:px-8">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="flex h-10 items-center justify-between text-sm">
          <Logo />
          <Link href={`/w/${id}`} className="rounded-lg border border-line bg-ink-2 px-3 py-2 font-medium transition-colors hover:bg-ink-3">See the Wrapped</Link>
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <h1 className="font-display text-4xl font-medium leading-[1.08] tracking-[-0.02em] sm:text-5xl">{title}</h1>
            <div className="text-lg text-fg-2">{sub}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={x} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-fg px-4 py-2 text-sm font-medium text-ink-0 transition-colors hover:bg-white">Share on X</a>
            <a href={tg} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-line bg-ink-2 px-4 py-2 text-sm font-medium transition-colors hover:bg-ink-3">Telegram</a>
          </div>
        </div>
        {children}
        <p className="pb-6 text-center text-xs text-fg-3">Prices from public market data. Not financial advice</p>
      </div>
    </div>
  );
}
