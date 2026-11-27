import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CardId } from "@/lib/engine/stats";
import { ngnRate } from "@/lib/fx";
import { getJob, publicJob } from "@/lib/store";
import { siteUrl } from "@/lib/site";
import { getRarity } from "@/lib/rarity";
import { CARD_TITLE, liveCards, pumpStoryCards, shareText, whoLabel } from "./format";
import { StoryPlayer } from "./story/StoryPlayer";

/** Server part of a public result page: loads the job, hands it to the client story. */
export async function WrappedView({ params, searchParams }: { params: Promise<{ id: string; card?: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { id, card } = await params;
  const view = (await searchParams)?.view;
  const job = await getJob(id);
  if (!job) notFound();
  const [rate, rarity] = await Promise.all([ngnRate(), getRarity().then((r) => r.pct).catch(() => null)]);
  // Keyed by view: going from the Pump.fun story to the full one (same wallet, same id) must start fresh.
  const v = typeof view === "string" ? view : undefined;
  return <StoryPlayer key={`${id}:${v ?? "all"}`} job={publicJob(job)} startCard={card} ngnRate={rate} siteUrl={siteUrl()} rarity={rarity} view={v} />;
}

export async function wrappedMetadata(params: Promise<{ id: string; card?: string }>): Promise<Metadata> {
  const { id, card } = await params;
  const job = await getJob(id);
  const s = job?.stats;
  if (!s) return { title: "Wrapped Onchain", robots: { index: false } };
  const c = (liveCards(s).includes(card as CardId) || pumpStoryCards(s).includes(card as CardId) ? card : "summary") as CardId;
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
