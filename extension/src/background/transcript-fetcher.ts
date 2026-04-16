/**
 * Fetches YouTube transcripts directly from the browser.
 *
 * Ported from cloudflare-worker/src/index.js — same algorithm, no changes to
 * the logic.  The extension has two advantages the Worker didn't:
 *   1. host_permissions on *.youtube.com means CORS is not an obstacle.
 *   2. The user's own youtube.com session cookies are sent automatically,
 *      giving access to richer / premium caption tracks.
 */

import type { Transcript, TranscriptSegment } from "../shared/types";

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

function normalizeLanguageCode(languageCode: string): string {
  return (languageCode ?? "").toLowerCase().split("-")[0];
}

function parsePreferredLangs(raw: string[]): string[] {
  const requested = raw.map((l) => normalizeLanguageCode(l)).filter(Boolean);
  for (const fallback of ["en", "hi"]) {
    if (!requested.includes(fallback)) requested.push(fallback);
  }
  return requested;
}

interface CaptionTrack {
  languageCode: string;
  baseUrl: string;
  kind?: string;
  name?: { simpleText?: string };
}

function pickTrack(tracks: CaptionTrack[], preferredLangs: string[]): CaptionTrack | null {
  for (const lang of preferredLangs) {
    const manual = tracks.find(
      (t) => normalizeLanguageCode(t.languageCode) === lang && t.kind !== "asr"
    );
    if (manual) return manual;

    const generated = tracks.find(
      (t) => normalizeLanguageCode(t.languageCode) === lang
    );
    if (generated) return generated;
  }
  return null;
}

export async function fetchTranscript(
  videoId: string,
  preferredLangs: string[] = ["en", "hi"]
): Promise<Transcript | null> {
  const langs = parsePreferredLangs(preferredLangs);

  // Step 1 — Fetch the YouTube watch page for signed caption URLs.
  // credentials: "include" sends the user's youtube.com cookies automatically —
  // a logged-in session unlocks premium / member-only caption tracks.
  const watchRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: BROWSER_HEADERS,
    credentials: "include",
  });

  if (!watchRes.ok) {
    throw new Error(`Watch page fetch failed: ${watchRes.status}`);
  }

  const html = await watchRes.text();

  // Step 2 — Extract ytInitialPlayerResponse via brace-walking (no regex).
  const marker = "ytInitialPlayerResponse = ";
  const markerIdx = html.indexOf(marker);
  if (markerIdx === -1) {
    throw new Error("ytInitialPlayerResponse not found in watch page");
  }

  let depth = 0;
  let i = markerIdx + marker.length;
  for (; i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}") {
      if (--depth === 0) break;
    }
  }

  const playerData = JSON.parse(html.slice(markerIdx + marker.length, i + 1));
  const tracks: CaptionTrack[] | undefined =
    playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

  if (!tracks?.length) return null; // no captions available

  const track = pickTrack(tracks, langs);
  if (!track) return null; // preferred languages unavailable

  // Step 3 — Fetch the caption XML.
  // credentials: "include" forwards the user's full YouTube cookie store automatically.
  // Do NOT set a Cookie header manually — in extension service workers an explicit
  // Cookie header overrides automatic credential sending, stripping auth cookies and
  // causing YouTube to silently return an empty timedtext response.
  // Timedtext URLs from ytInitialPlayerResponse are signed (they embed auth
  // via signature/expire query params).  Sending credentials: "include" from
  // a service worker adds Origin: chrome-extension://... which YouTube rejects
  // with an empty body.  Omitting credentials lets the signed URL work as-is.
  const captionRes = await fetch(track.baseUrl, {
    headers: {
      ...BROWSER_HEADERS,
      Referer: `https://www.youtube.com/watch?v=${videoId}`,
    },
    credentials: "omit",
  });

  if (!captionRes.ok) {
    throw new Error(`Caption fetch failed: ${captionRes.status}`);
  }

  const xml = await captionRes.text();
  if (!xml.trim()) throw new Error("Caption response was empty");

  // Step 4 — Parse XML into [{text, start, duration}].
  const segments: TranscriptSegment[] = [];
  const re = /<text start="([^"]+)" dur="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const text = m[3]
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\n/g, " ")
      .trim();
    if (text) {
      segments.push({
        text,
        start: parseFloat(m[1]),
        duration: parseFloat(m[2]),
      });
    }
  }

  const languageCode = normalizeLanguageCode(track.languageCode);
  return {
    language_code: languageCode,
    language_label:
      track.name?.simpleText ??
      (languageCode === "hi" ? "Hindi" : languageCode === "en" ? "English" : track.languageCode),
    is_generated: track.kind === "asr",
    segments,
  };
}
