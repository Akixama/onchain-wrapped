import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Loading } from "@/components/story/Loading";
import { ExtraPage } from "@/components/ExtraPage";
import { Gravestone } from "@/components/Gravestone";
import { num, shareText, usd, whoLabel } from "@/components/format";
import { CAUSE_EMOJI, CAUSE_LABEL, type DeathCause } from "@/lib/engine/graveyard-labels";
import { siteUrl } from "@/lib/site";
import { getJob } from "@/lib/store";

export async function generateMetadata(props: PageProps<"/rip/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const s = (await getJob(id))?.stats;
  if (!s?.graveyard) return { title: "The coin graveyard · Wrapped Onchain", robots: { index: false } };
  const title = `${whoLabel(s)}'s coin graveyard · Wrapped Onchain`;
  const description = shareText(s, "graveyard");
  const image = { url: `/api/og/${id}/graveyard`, width: 1200, height: 630, alt: description };
  return { title, description, openGraph: { title, description, images: [image], url: `/rip/${id}` }, twitter: { card: "summary_large_image", title, description, images: [image.url] } };
}

async function View({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  const s = job.stats;
  if (job.status !== "done" || !s) redirect(`/w/${id}`);
  const g = s.graveyard;
  if (!g || !g.count) redirect(`/w/${id}`);
  const causes = (Object.entries(g.causes) as [DeathCause, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  return (
    <ExtraPage id={id} bg="radial-gradient(ellipse at top, #1e293b, #05060a 65%)" shareText={shareText(s, "graveyard")} shareUrl={`${siteUrl()}/w/${id}/graveyard`}
      title={<>🪦 {whoLabel(s)}&apos;s graveyard</>}
      sub={<>{num(g.count)} coin{g.count === 1 ? "" : "s"} buried with <b className="text-rose-300">{usd(g.buriedUsd)}</b>. {usd(g.gotOutUsd)} dug back out.</>}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Box k="Coins buried" v={num(g.count)} />
        <Box k="USD buried" v={usd(g.buriedUsd)} />
        <Box k="Priciest grave" v={g.mostExpensive ? `$${g.mostExpensive.symbol.slice(0, 10)}` : "-"} sub={g.mostExpensive ? usd(g.mostExpensive.putInUsd) : undefined} />
        <Box k="Top cause" v={g.topCause ? `${CAUSE_EMOJI[g.topCause]} ${CAUSE_LABEL[g.topCause]}` : "-"} />
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        {causes.map(([c, n]) => <span key={c} className="rounded-full bg-white/10 px-3 py-1">{CAUSE_EMOJI[c]} {CAUSE_LABEL[c]}: <b>{num(n)}</b></span>)}
      </div>
      <div className="grid grid-cols-1 gap-x-4 gap-y-6 pt-2 sm:grid-cols-2 lg:grid-cols-3">
        {g.graves.map((x) => <Gravestone key={x.address} g={x} />)}
      </div>
      {g.count > g.graves.length && <p className="text-center text-sm opacity-60">Showing the {g.graves.length} biggest of {num(g.count)} graves.</p>}
    </ExtraPage>
  );
}

function Box({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider opacity-60">{k}</div>
      <div className="mt-1 truncate font-display text-xl font-bold">{v}</div>
      {sub && <div className="text-xs opacity-60">{sub}</div>}
    </div>
  );
}

export default function Page(props: PageProps<"/rip/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <View params={props.params} />
    </Suspense>
  );
}
