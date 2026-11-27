import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Loading } from "@/components/story/Loading";
import { ExtraPage } from "@/components/ExtraPage";
import { num, shareText, usd, whoLabel } from "@/components/format";
import type { PumpRow } from "@/lib/engine/pumpfun";
import { siteUrl } from "@/lib/site";
import { getJob } from "@/lib/store";

export async function generateMetadata(props: PageProps<"/pump/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const s = (await getJob(id))?.stats;
  if (!s?.pumpfun) return { title: "Pump.fun Wrapped · Wrapped Onchain", robots: { index: false } };
  const title = `${whoLabel(s)}'s Pump.fun Wrapped · Wrapped Onchain`;
  const description = shareText(s, "pumpYear");
  const image = { url: `/api/og/${id}/pumpYear`, width: 1200, height: 630, alt: description };
  return { title, description, openGraph: { title, description, images: [image], url: `/pump/${id}` }, twitter: { card: "summary_large_image", title, description, images: [image.url] } };
}

const STATUS: Record<PumpRow["status"], [string, string]> = {
  alive: ["Graduated · trading", "#4cc38a"],
  graduated: ["Graduated · died", "#e5b454"],
  curve: ["Never graduated", "#e5484d"],
  unknown: ["Unknown", "#7a8296"],
};
const sign = (n: number) => (n >= 0 ? "#4cc38a" : "#e5484d");

async function View({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  const s = job.stats;
  if (job.status !== "done" || !s) redirect(`/w/${id}`);
  const p = s.pumpfun;
  if (!p) redirect(`/w/${id}`);
  const known = p.graduated + p.neverGraduated;
  const dead = p.graduated - p.graduatedAlive;
  const seg = (n: number) => (known ? `${(n / known) * 100}%` : "0%");
  return (
    <ExtraPage id={id} shareText={shareText(s, "pumpYear")} shareUrl={`${siteUrl()}/pump/${id}`}
      title={<>{whoLabel(s)}&apos;s Pump.fun Wrapped</>}
      sub={<>{num(p.coins)} pump.fun coins, {Math.round(p.share * 100)}% of everything traded.</>}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile k="On pump.fun coins" v={usd(p.pnlUsd, { sign: true })} color={sign(p.pnlUsd)} />
        <Tile k="Everything else" v={usd(p.otherPnlUsd, { sign: true })} color={sign(p.otherPnlUsd)} />
        <Tile k="Trades" v={num(p.trades)} />
        <Tile k="Volume" v={usd(p.volumeUsd)} />
      </div>

      <section className="space-y-4 rounded-2xl border border-line bg-ink-2 p-5">
        <h2 className="font-display text-2xl font-medium">Did they graduate?</h2>
        {known ? <p className="text-fg-2">Of the pump.fun coins we could check, <b className="font-medium text-fg">{num(p.graduated)}</b> graduated ({Math.round((p.graduated / known) * 100)}%). Read from pump.fun&apos;s own records on the chain.</p>
          : <p className="text-fg-2">Graduation status couldn&apos;t be checked for this lookup. Try this wallet again later.</p>}
        <div className="flex h-3 gap-0.5 overflow-hidden rounded bg-ink-3">
          <div style={{ width: seg(p.graduatedAlive), background: "#4cc38a" }} />
          <div style={{ width: seg(dead), background: "#e5b454" }} />
          <div style={{ width: seg(p.neverGraduated), background: "#e5484d" }} />
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-fg-2">
          {known > 0 && <>
            <Legend c="#4cc38a" k="Graduated, still trading" n={p.graduatedAlive} />
            <Legend c="#e5b454" k="Graduated, then died" n={dead} />
            <Legend c="#e5484d" k="Never graduated" n={p.neverGraduated} />
          </>}
          {p.unchecked > 0 && <Legend c="#7a8296" k="Couldn't check" n={p.unchecked} />}
        </div>
        {(p.launched ?? 0) > 0 && <p className="text-sm text-fg-2">You also launched <b>{num(p.launched!)}</b> coin{p.launched === 1 ? "" : "s"} yourself.</p>}
      </section>

      {(p.best || p.worst) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {p.best && <Big label="Best pump" c={p.best} />}
          {p.worst && <Big label="Worst pump" c={p.worst} />}
        </div>
      )}

      <section className="space-y-2">
        <h2 className="font-display text-2xl font-medium">Every pump.fun coin</h2>
        {p.list?.length ? (
          <div className="overflow-hidden rounded-2xl border border-line bg-ink-2">
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 bg-ink-3 px-4 py-2 text-xs text-fg-3 sm:grid-cols-[1fr_auto_auto_auto_auto]">
              <span>Coin</span><span className="hidden sm:block text-right">Put in</span><span className="hidden sm:block text-right">Got back</span><span className="text-right">Result</span><span className="text-right">Status</span>
            </div>
            {p.list.map((c) => (
              <div key={c.address} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 border-t border-line px-4 py-2.5 text-sm sm:grid-cols-[1fr_auto_auto_auto_auto]">
                <a href={`https://pump.fun/coin/${c.address}`} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate font-medium hover:underline">${c.symbol}</a>
                <span className="hidden text-right font-mono tabular-nums text-fg-2 sm:block">{usd(c.costUsd)}</span>
                <span className="hidden text-right font-mono tabular-nums text-fg-2 sm:block">{usd(c.proceedsUsd)}</span>
                <span className="text-right font-mono tabular-nums" style={{ color: sign(c.pnlUsd) }}>{usd(c.pnlUsd, { sign: true })}</span>
                <span className="justify-self-end inline-flex items-center gap-1.5 text-xs text-fg-2"><i className="inline-block h-2 w-2 rounded-full" style={{ background: STATUS[c.status][1] }} /><span>{STATUS[c.status][0]}</span></span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-fg-2">The coin-by-coin list is in new lookups. Check this wallet again to see every coin.</p>
        )}
        {p.list && p.coins > p.list.length && <p className="text-center text-sm text-fg-3">Showing the {p.list.length} biggest of {num(p.coins)}.</p>}
      </section>
    </ExtraPage>
  );
}

function Tile({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div className="rounded-xl border border-line bg-ink-2 p-4">
      <div className="text-xs text-fg-3">{k}</div>
      <div className="mt-2 truncate font-mono text-2xl font-medium tabular-nums" style={color ? { color } : undefined}>{v}</div>
    </div>
  );
}
function Legend({ c, k, n }: { c: string; k: string; n: number }) {
  return <span className="inline-flex items-center gap-2"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c }} />{k} <b className="font-mono font-medium tabular-nums text-fg">{num(n)}</b></span>;
}
function Big({ label, c }: { label: string; c: { symbol: string; pnlUsd: number; costUsd: number; proceedsUsd: number } }) {
  return (
    <div className="rounded-2xl border border-line bg-ink-2 p-5">
      <div className="text-xs text-fg-3">{label}</div>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate font-display text-3xl font-medium">${c.symbol}</span>
        <span className="font-mono text-2xl font-medium tabular-nums" style={{ color: sign(c.pnlUsd) }}>{usd(c.pnlUsd, { sign: true })}</span>
      </div>
      <div className="mt-2 text-sm text-fg-3">Put in {usd(c.costUsd)}, got back {usd(c.proceedsUsd)}</div>
    </div>
  );
}

export default function Page(props: PageProps<"/pump/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <View params={props.params} />
    </Suspense>
  );
}
