import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MomentView } from "./MomentView";
import { formatTimestamp } from "../../lib";

// Shareable moment page. Everything renders from URL params (t, x, k); there
// is no backend record of shares. The quote arrives in the link itself, so a
// pasted link keeps working even if the video is later re-indexed or removed
// from our cache.

const VIDEO_ID_RE = /^[\w-]{5,20}$/;

type Params = { videoId: string };
// Next hands repeated query params over as arrays (?x=a&x=b → ["a","b"]).
// Coerce to the first value instead of calling string methods on an array.
type Search = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

// Caps mirror the extension's buildMomentLink (extension/src/shared/utils.ts):
// quote ≤ 200 there, accepted up to 300 here for slack; keyword ≤ 80 on both
// sides. Change them together or shared links lose their highlight.
function parseMoment(params: Params, searchParams: Search) {
  const videoId = params.videoId;
  const t = Math.max(0, Math.floor(Number(first(searchParams.t) || "0")) || 0);
  if (!VIDEO_ID_RE.test(videoId)) return null;
  const quote = first(searchParams.x).slice(0, 300).trim();
  const keyword = first(searchParams.k).slice(0, 80).trim();
  return { videoId, t, quote, keyword };
}

// Title + channel via oEmbed: no API key, cached a day. A failed lookup only
// costs the attribution line; the page still renders from the URL params.
async function fetchOEmbed(videoId: string): Promise<{ title: string; author: string } | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${videoId}`,
      )}&format=json`,
      { next: { revalidate: 86400 } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string; author_name?: string };
    if (!data.title) return null;
    return { title: data.title, author: data.author_name ?? "" };
  } catch {
    return null;
  }
}

export async function generateMetadata(props: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}): Promise<Metadata> {
  const [params, searchParams] = await Promise.all([props.params, props.searchParams]);
  const moment = parseMoment(params, searchParams);
  if (!moment) return {};
  const oembed = await fetchOEmbed(moment.videoId);

  const quoteBit = moment.quote ? `"${moment.quote.slice(0, 80)}${moment.quote.length > 80 ? "…" : ""}"` : "A YouTube moment";
  const who = oembed?.author ? ` · ${oembed.author}` : "";
  const title = `${quoteBit}${who} · ${formatTimestamp(moment.t)}`;
  const description = "Found with ClipChase. Tap to jump to the exact moment.";

  const og = new URLSearchParams();
  og.set("t", String(moment.t));
  if (moment.quote) og.set("x", moment.quote);
  if (oembed?.author) og.set("c", oembed.author);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: `/m/og?${og.toString()}`, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`/m/og?${og.toString()}`],
    },
  };
}

export default async function MomentPage(props: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const [params, searchParams] = await Promise.all([props.params, props.searchParams]);
  const moment = parseMoment(params, searchParams);
  if (!moment) redirect("/");
  const oembed = await fetchOEmbed(moment.videoId);

  return (
    <MomentView
      videoId={moment.videoId}
      t={moment.t}
      quote={moment.quote}
      keyword={moment.keyword}
      videoTitle={oembed?.title ?? null}
      channel={oembed?.author ?? null}
      timestampLabel={formatTimestamp(moment.t)}
      embed={first(searchParams.embed) === "1"}
    />
  );
}
