import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CompareView } from "@/components/CompareView";
import { compareRows, compareScore } from "@/components/compare";
import { whoLabel } from "@/components/format";
import { Loading } from "@/components/story/Loading";
import { getJob, publicJob } from "@/lib/store";
import { siteUrl } from "@/lib/site";

export async function generateMetadata(props: PageProps<"/vs/[a]/[b]">): Promise<Metadata> {
  const { a, b } = await props.params;
  const [ja, jb] = await Promise.all([getJob(a), getJob(b)]);
  if (!ja?.stats || !jb?.stats) return { title: "Wrapped Onchain: head to head", robots: { index: false } };
  const s = compareScore(compareRows(ja.stats, jb.stats));
  const title = `${whoLabel(ja.stats)} vs ${whoLabel(jb.stats)} · ${s.a}–${s.b} · Wrapped Onchain`;
  const image = { url: `/api/og-vs/${a}/${b}`, width: 1200, height: 630, alt: title };
  return {
    title,
    description: "Two onchain years, head to head.",
    openGraph: { title, images: [image], type: "website", url: `/vs/${a}/${b}` },
    twitter: { card: "summary_large_image", title, images: [image.url] },
  };
}

async function View({ params }: { params: Promise<{ a: string; b: string }> }) {
  const { a, b } = await params;
  const [ja, jb] = await Promise.all([getJob(a), getJob(b)]);
  if (!ja || !jb) notFound();
  return <CompareView a={publicJob(ja)} b={publicJob(jb)} siteUrl={siteUrl()} />;
}

export default function Page(props: PageProps<"/vs/[a]/[b]">) {
  return (
    <Suspense fallback={<Loading />}>
      <View params={props.params} />
    </Suspense>
  );
}
