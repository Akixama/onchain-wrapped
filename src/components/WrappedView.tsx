import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CardId } from "@/lib/engine/stats";
import { ngnRate } from "@/lib/fx";
import { getJob, publicJob } from "@/lib/store";
import { siteUrl } from "@/lib/site";
import { CARD_TITLE, shareText, whoLabel } from "./format";
import { StoryPlayer } from "./story/StoryPlayer";

/** Server part of a public result page: loads the job, hands it to the client story. */
export async function WrappedView({ params }: { params: Promise<{ id: string; card?: string }> }) {
  const { id, card } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  return <StoryPlayer job={publicJob(job)} startCard={card} ngnRate={await ngnRate()} siteUrl={siteUrl()} />;
}

export async function wrappedMetadata(params: Promise<{ id: string; card?: string }>): Promise<Metadata> {
  const { id, card } = await params;
  const job = await getJob(id);
  const s = job?.stats;
  if (!s) return { title: "Wrapped Onchain", robots: { index: false } };
  const c = (s.cards.includes(card as CardId) ? card : "summary") as CardId;
  const title = `Wrapped Onchain: ${whoLabel(s)} · ${CARD_TITLE[c]}`;
  const description = shareText(s, c);
  const image = { url: `/api/og/${id}/${c}`, width: 1200, height: 630, alt: description };
  return {
    title,
    description,
    openGraph: { title, description, images: [image], type: "website", url: `/w/${id}/${c}` },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}
