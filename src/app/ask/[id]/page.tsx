import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { AskView } from "@/components/AskView";
import { whoLabel } from "@/components/format";
import { Loading } from "@/components/story/Loading";
import { SUGGESTED } from "@/lib/ask";
import { getJob } from "@/lib/store";

export async function generateMetadata(props: PageProps<"/ask/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const s = (await getJob(id))?.stats;
  if (!s) return { title: "Wrapped Onchain: ask a wallet", robots: { index: false } };
  const title = `Ask ${whoLabel(s)} · Wrapped Onchain`;
  const description = "Ask a wallet about its own trades: best, worst, rugs, fees, timing.";
  const image = { url: `/api/og/${id}/summary`, width: 1200, height: 630, alt: title };
  return { title, description, openGraph: { title, description, images: [image], url: `/ask/${id}` }, twitter: { card: "summary_large_image", title, description, images: [image.url] } };
}

async function View({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  if (job.status !== "done" || !job.stats) redirect(`/w/${id}`);
  return <AskView id={id} who={whoLabel(job.stats)} suggested={SUGGESTED} />;
}

export default function Page(props: PageProps<"/ask/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <View params={props.params} />
    </Suspense>
  );
}
