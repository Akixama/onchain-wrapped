// A real saved Wrapped shown as a receipt: story segments on top, the bottom line, then the key facts.
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { num, pct, usd, periodLabel } from "@/components/format";
import { getJob } from "@/lib/store";

export async function ExampleCard({ id, label, className = "" }: { id: string; label?: string; className?: string }) {
  const s = (await getJob(id))?.stats;
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
  const segs = Math.min(14, s.cards.length);
  return (
    <Link href={`/w/${id}`} aria-label={`Open the ${label ?? s.archetype.title} Wrapped`}
      className={`group block w-full rounded-[20px] border border-line bg-ink-2 p-5 shadow-[0_24px_64px_rgba(0,0,0,0.45)] transition-colors duration-150 hover:border-[rgb(238_240_245/0.2)] ${className}`}>
      <div className="flex gap-1" aria-hidden>
        {Array.from({ length: segs }, (_, i) => (
          <span key={i} className={`h-[3px] flex-1 rounded-full ${i === 0 ? "bg-fg" : "bg-[rgb(238_240_245/0.14)]"}`} />
        ))}
      </div>
      <div className="mt-5 flex items-center justify-between font-mono text-xs text-fg-3">
        <span>{label ?? "Example"} · {periodLabel(s).toLowerCase()}</span>
        <span>{s.cards.length} cards</span>
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
        <span className="inline-flex items-center gap-1 text-fg transition-colors group-hover:text-white">
          Open it <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={1.5} />
        </span>
      </div>
    </Link>
  );
}
