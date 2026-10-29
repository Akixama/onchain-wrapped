import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { ChartGame } from "@/components/ChartGame";
import { chartRounds } from "@/components/chartRounds";
import { whoLabel } from "@/components/format";
import { Loading } from "@/components/story/Loading";
import { getJob } from "@/lib/store";
import { siteUrl } from "@/lib/site";

export async function generateMetadata(props: PageProps<"/g/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const s = (await getJob(id))?.stats;
  if (!s) return { title: "Wrapped Onchain: chart game", robots: { index: false } };
  const title = `Win or lose? Guess ${whoLabel(s)}'s trades · Wrapped Onchain`;
  const description = "See the chart up to their buy. Did they make money or lose it?";
  const image = { url: `/api/og/${id}/best`, width: 1200, height: 630, alt: title };
  return {
    title, description,
    openGraph: { title, description, images: [image], type: "website", url: `/g/${id}` },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

async function View({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  if (job.status !== "done" || !job.stats) redirect(`/w/${id}`);
  const s = job.stats;
  const rounds = chartRounds([s.bestTrade, s.worstTrade, s.roundTrip, s.paperHands, s.diamondHands], id);
  if (rounds.length < 2) redirect(`/w/${id}`); // not enough trades with a clear result
  return <ChartGame id={id} who={whoLabel(s)} rounds={rounds} siteUrl={siteUrl()} />;
}

export default function Page(props: PageProps<"/g/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <View params={props.params} />
    </Suspense>
  );
}
