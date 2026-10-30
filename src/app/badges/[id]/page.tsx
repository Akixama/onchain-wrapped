import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Loading } from "@/components/story/Loading";
import { ExtraPage } from "@/components/ExtraPage";
import { BadgeTile } from "@/components/Gravestone";
import { rarestFirst, shareText, whoLabel } from "@/components/format";
import { ACHIEVEMENTS, RARITY_MIN_WALLETS } from "@/lib/achievements-catalog";
import { getRarity } from "@/lib/rarity";
import { siteUrl } from "@/lib/site";
import { getJob } from "@/lib/store";

export async function generateMetadata(props: PageProps<"/badges/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const s = (await getJob(id))?.stats;
  if (!s?.achievements) return { title: "Achievements · Wrapped Onchain", robots: { index: false } };
  const title = `${whoLabel(s)}'s achievements · Wrapped Onchain`;
  const description = shareText(s, "achievements");
  const image = { url: `/api/og/${id}/achievements`, width: 1200, height: 630, alt: description };
  return { title, description, openGraph: { title, description, images: [image], url: `/badges/${id}` }, twitter: { card: "summary_large_image", title, description, images: [image.url] } };
}

async function View({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  const s = job.stats;
  if (job.status !== "done" || !s) redirect(`/w/${id}`);
  if (!s.achievements) redirect(`/w/${id}`);
  const rarity = await getRarity().catch(() => ({ total: 0, pct: null }));
  const earned = rarestFirst(s.achievements.earned, rarity.pct);
  const have = new Set(earned.map((e) => e.id));
  const locked = rarestFirst(ACHIEVEMENTS.filter((a) => !have.has(a.id)).map((a) => ({ id: a.id })));
  const note = rarity.pct
    ? `Rarity from ${rarity.total.toLocaleString("en-US")} wallets checked.`
    : `Rarity percentages appear once ${RARITY_MIN_WALLETS} wallets have been checked (${rarity.total.toLocaleString("en-US")} so far).`;
  return (
    <ExtraPage id={id} bg="radial-gradient(ellipse at top, #422006, #0b0705 65%)" shareText={shareText(s, "achievements")} shareUrl={`${siteUrl()}/w/${id}/achievements`}
      title={<>🏅 {whoLabel(s)}&apos;s achievements</>}
      sub={<>{earned.length} of {ACHIEVEMENTS.length} unlocked. {note}</>}>
      {earned.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {earned.map((e, i) => <div key={e.id} className={i === 0 ? "col-span-2" : ""}><BadgeTile id={e.id} detail={e.detail} pct={rarity.pct} /></div>)}
        </div>
      )}
      <h2 className="pt-4 font-display text-2xl font-bold opacity-80">Still locked</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {locked.map((e) => <BadgeTile key={e.id} id={e.id} locked />)}
      </div>
    </ExtraPage>
  );
}

export default function Page(props: PageProps<"/badges/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <View params={props.params} />
    </Suspense>
  );
}
