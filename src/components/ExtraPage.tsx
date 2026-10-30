// Frame for the standalone graveyard / achievements pages: header, share buttons, link back to the story.
import Link from "next/link";
import type { ReactNode } from "react";

export function ExtraPage({ id, title, sub, shareText, shareUrl, bg, children }: { id: string; title: ReactNode; sub: ReactNode; shareText: string; shareUrl: string; bg: string; children: ReactNode }) {
  const x = `https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
  const tg = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;
  return (
    <div className="min-h-[100dvh] px-4 py-6 text-white sm:px-6" style={{ background: bg }}>
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between text-sm">
          <Link href="/" className="font-display font-bold">Wrapped <span className="opacity-60">Onchain</span></Link>
          <Link href={`/w/${id}`} className="rounded-full bg-white/10 px-3 py-1.5 font-semibold hover:bg-white/20">See the Wrapped</Link>
        </div>
        <div className="space-y-2">
          <h1 className="font-display text-4xl font-bold sm:text-5xl">{title}</h1>
          <div className="text-lg opacity-80">{sub}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={x} target="_blank" rel="noopener noreferrer" className="rounded-full bg-white px-4 py-2 text-sm font-bold text-black hover:bg-white/90">Share on X</a>
          <a href={tg} target="_blank" rel="noopener noreferrer" className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20">Telegram</a>
        </div>
        {children}
        <p className="pb-6 text-center text-xs opacity-50">Prices from public market data. Death dates marked ~ are estimates (the last time you traded the coin). Not financial advice.</p>
      </div>
    </div>
  );
}
