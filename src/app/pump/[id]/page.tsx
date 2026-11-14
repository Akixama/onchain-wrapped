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
  alive: ["Graduated · trading", "#4ADE80"],
  graduated: ["Graduated · died", "#FACC15"],
  curve: ["Never graduated", "#F87171"],
  unknown: ["Unknown", "rgba(255,255,255,0.5)"],
};
const sign = (n: number) => (n >= 0 ? "#4ADE80" : "#F87171");

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
    <ExtraPage id={id} bg="radial-gradient(ellipse at top, #14532d, #050a07 65%)" shareText={shareText(s, "pumpYear")} shareUrl={`${siteUrl()}/pump/${id}`}
      title={<>{whoLabel(s)}&apos;s <span className="text-emerald-300">Pump.fun</span> Wrapped</>}
      sub={<>{num(p.coins)} pump.fun coins, {Math.round(p.share * 100)}% of everything traded.</>}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile k="On pump.fun coins" v={usd(p.pnlUsd, { sign: true })} color={sign(p.pnlUsd)} />
        <Tile k="Everything else" v={usd(p.otherPnlUsd, { sign: true })} color={sign(p.otherPnlUsd)} />
        <Tile k="Trades" v={num(p.trades)} />
        <Tile k="Volume" v={usd(p.volumeUsd)} />
      </div>

      <section className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.05] p-5">
        <h2 className="font-display text-2xl font-bold">Did they graduate?</h2>
        <p className="opacity-80">Of the pump.fun coins you bought, <b className="text-emerald-300">{num(p.graduated)}</b> graduated ({known ? Math.round((p.graduated / known) * 100) : 0}%). Read from pump.fun&apos;s own records on the chain.</p>
        <div className="flex h-4 overflow-hidden rounded-full bg-white/10">
          <div style={{ width: seg(p.graduatedAlive), background: "#4ADE80" }} />
          <div style={{ width: seg(dead), background: "#FACC15" }} />
          <div style={{ width: seg(p.neverGraduated), background: "#F87171" }} />
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <Legend c="#4ADE80" k="Graduated, still trading" n={p.graduatedAlive} />
          <Legend c="#FACC15" k="Graduated, then died" n={dead} />
          <Legend c="#F87171" k="Never graduated" n={p.neverGraduated} />
          {p.unchecked > 0 && <Legend c="rgba(255,255,255,0.4)" k="Couldn't check" n={p.unchecked} />}
        </div>
        {(p.launched ?? 0) > 0 && <p className="text-sm opacity-85">You also launched <b>{num(p.launched!)}</b> coin{p.launched === 1 ? "" : "s"} yourself.</p>}
      </section>

      {(p.best || p.worst) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {p.best && <Big label="Best pump" c={p.best} />}
          {p.worst && <Big label="Worst pump" c={p.worst} />}
        </div>
      )}

      <section className="space-y-2">
        <h2 className="font-display text-2xl font-bold">Every pump.fun coin</h2>
        {p.list?.length ? (
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 bg-white/[0.06] px-4 py-2 text-[11px] font-semibold uppercase tracking-wider opacity-60 sm:grid-cols-[1fr_auto_auto_auto_auto]">
              <span>Coin</span><span className="hidden sm:block text-right">Put in</span><span className="hidden sm:block text-right">Got back</span><span className="text-right">Result</span><span className="text-right">Status</span>
            </div>
            {p.list.map((c) => (
              <div key={c.address} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 border-t border-white/5 px-4 py-2.5 text-sm sm:grid-cols-[1fr_auto_auto_auto_auto]">
                <a href={`https://pump.fun/coin/${c.address}`} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate font-semibold hover:underline">${c.symbol}</a>
                <span className="hidden text-right tabular-nums opacity-80 sm:block">{usd(c.costUsd)}</span>
                <span className="hidden text-right tabular-nums opacity-80 sm:block">{usd(c.proceedsUsd)}</span>
                <span className="text-right font-semibold tabular-nums" style={{ color: sign(c.pnlUsd) }}>{usd(c.pnlUsd, { sign: true })}</span>
                <span className="justify-self-end rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ color: STATUS[c.status][1], background: "rgba(255,255,255,0.06)" }}>{STATUS[c.status][0]}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="opacity-70">The coin-by-coin list is in new lookups. Check this wallet again to see every coin.</p>
        )}
        {p.list && p.coins > p.list.length && <p className="text-center text-sm opacity-60">Showing the {p.list.length} biggest of {num(p.coins)}.</p>}
      </section>
    </ExtraPage>
  );
}

function Tile({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider opacity-60">{k}</div>
      <div className="mt-1 truncate font-display text-xl font-bold" style={color ? { color } : undefined}>{v}</div>
    </div>
  );
}
function Legend({ c, k, n }: { c: string; k: string; n: number }) {
  return <span className="inline-flex items-center gap-2"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c }} />{k} <b className="tabular-nums">{num(n)}</b></span>;
}
function Big({ label, c }: { label: string; c: { symbol: string; pnlUsd: number; costUsd: number; proceedsUsd: number } }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5">
      <div className="text-[11px] font-medium uppercase tracking-wider opacity-60">{label}</div>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate font-display text-3xl font-bold">${c.symbol}</span>
        <span className="font-display text-2xl font-bold tabular-nums" style={{ color: sign(c.pnlUsd) }}>{usd(c.pnlUsd, { sign: true })}</span>
      </div>
      <div className="mt-1 text-sm opacity-70">Put in {usd(c.costUsd)}, got back {usd(c.proceedsUsd)}</div>
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
