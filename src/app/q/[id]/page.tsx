import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { QuizView } from "@/components/QuizView";
import { buildQuiz } from "@/components/quiz";
import { periodLabel, whoLabel } from "@/components/format";
import { Loading } from "@/components/story/Loading";
import { getJob } from "@/lib/store";
import { siteUrl } from "@/lib/site";

export async function generateMetadata(props: PageProps<"/q/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const s = (await getJob(id))?.stats;
  if (!s) return { title: "Onchain Wrapped: wallet quiz", robots: { index: false } };
  const title = `How well do you know ${whoLabel(s)}? · Wallet quiz`;
  const description = "A quiz built from their real onchain trades. Think you can beat my score?";
  const image = { url: `/api/og/${id}/archetype`, width: 1200, height: 630, alt: title };
  return {
    title, description,
    openGraph: { title, description, images: [image], type: "website", url: `/q/${id}` },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

async function View({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  // Still running (or failed): the story page shows progress / the error.
  if (job.status !== "done" || !job.stats) redirect(`/w/${id}`);
  const s = job.stats;
  const questions = buildQuiz(s, id);
  if (questions.length < 4) redirect(`/w/${id}`); // too little activity to make a quiz from
  const p = periodLabel(s);
  return <QuizView id={id} who={whoLabel(s)} period={p.charAt(0).toLowerCase() + p.slice(1)} questions={questions} siteUrl={siteUrl()} />;
}

export default function Page(props: PageProps<"/q/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <View params={props.params} />
    </Suspense>
  );
}
