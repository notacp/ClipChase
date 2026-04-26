// extension/src/background/service-worker.ts
import { listVideos, matchTranscript } from "./api-client";
import type { MessageResponse, Transcript } from "../shared/types";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// Find the YouTube tab the user already has open.
// The extension runs alongside the user's YouTube session — no new tab needed.
async function getYouTubeTabId(): Promise<number | null> {
  // currentWindow: true is undefined in service worker context — use lastFocusedWindow instead.
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (active?.id && active.url?.includes("youtube.com")) return active.id;
  const [any] = await chrome.tabs.query({ url: "*://*.youtube.com/*" });
  return any?.id ?? null;
}

// ─── Runs in MAIN world on YouTube page ───────────────────────────────────────
// Must run from YouTube tab so fetch() carries Origin: https://www.youtube.com.
// Service worker origin (chrome-extension://) gets 403 bot-captcha from YouTube.
//
// Strategy 1 — Android API: POST /youtubei/v1/player with ANDROID client.
//   Returns track baseUrls WITHOUT exp=xpe bot-guard. This was the fix for 403s
//   that plagued the original ytInitialPlayerResponse approach.
//
// Strategy 2 — ytInitialPlayerResponse fallback: read the object YouTube already
//   injected into the page. Reliable when the Android API call itself fails.
async function fetchTranscriptInPage(
  videoId: string,
  preferredLangs: string[],
): Promise<{
  _debug: string;
  segments?: { text: string; start: number; duration: number }[];
  langCode?: string;
}> {
  function pickBestTrack(tracks: any[], langs: string[]): any | null {
    for (const lang of langs) {
      const normalized = lang.toLowerCase().split("-")[0];
      const manual = tracks.find(
        (t) => t.languageCode?.toLowerCase().split("-")[0] === normalized && t.kind !== "asr",
      );
      if (manual) return manual;
      const generated = tracks.find(
        (t) => t.languageCode?.toLowerCase().split("-")[0] === normalized,
      );
      if (generated) return generated;
    }
    return tracks[0] ?? null;
  }

  function decodeEntities(s: string): string {
    return s
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'");
  }

  function parseXml(xml: string): { text: string; start: number; duration: number }[] {
    const segs: { text: string; start: number; duration: number }[] = [];

    // Format 1: <text start="1.23" dur="0.56">text</text>  (standard timedtext)
    const re1 = /<text\s[^>]*\bstart="([^"]+)"[^>]*\bdur="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g;
    let m: RegExpExecArray | null;
    while ((m = re1.exec(xml)) !== null) {
      const text = decodeEntities(m[3].replace(/<[^>]+>/g, "")).trim();
      if (text) segs.push({ text, start: parseFloat(m[1]), duration: parseFloat(m[2]) });
    }
    if (segs.length) return segs;

    // Format 2: <p t="1230" d="560">text</p>  (Android API, milliseconds)
    // Attribute order is NOT guaranteed — extract t and d independently.
    const re2 = /<p\b([^>]*)>([\s\S]*?)<\/p>/g;
    while ((m = re2.exec(xml)) !== null) {
      const attrs = m[1];
      const tM = attrs.match(/\bt="(\d+)"/);
      const dM = attrs.match(/\bd="(\d+)"/);
      if (!tM || !dM) continue;
      const text = decodeEntities(m[2].replace(/<[^>]+>/g, "")).trim();
      if (text) segs.push({ text, start: parseInt(tM[1], 10) / 1000, duration: parseInt(dM[1], 10) / 1000 });
    }
    return segs;
  }

  async function fetchXml(baseUrl: string): Promise<{ xml: string | null; err: string }> {
    const delays = [0, 1500, 3000]; // ms to wait before attempt 0, 1, 2
    for (let attempt = 0; attempt < delays.length; attempt++) {
      if (delays[attempt]) await new Promise<void>((r) => setTimeout(r, delays[attempt]));
      try {
        const res = await fetch(baseUrl);
        if (res.status === 429) continue; // rate limited — retry after delay
        if (!res.ok) return { xml: null, err: `status=${res.status}` };
        const text = await res.text();
        if (text.length <= 10) return { xml: null, err: `empty len=${text.length}` };
        return { xml: text, err: "" };
      } catch (e) {
        return { xml: null, err: `threw=${String(e)}` };
      }
    }
    return { xml: null, err: "status=429 after retries" };
  }

  // Strategy 1: Android API (bot-guard-free track URLs)
  try {
    const res = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context: { client: { clientName: "ANDROID", clientVersion: "20.10.38" } },
        videoId,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (tracks?.length) {
        const track = pickBestTrack(tracks, preferredLangs);
        if (track?.baseUrl) {
          const { xml, err } = await fetchXml(track.baseUrl);
          if (xml) {
            const segments = parseXml(xml);
            if (segments.length) return { _debug: "android-ok", segments, langCode: track.languageCode };
            return { _debug: `android-parse-empty xml_len=${xml.length} snippet=${xml.slice(0, 80)}` };
          }
          return { _debug: `android-xml-failed err=${err}` };
        }
        return { _debug: `android-no-baseUrl tracks=${tracks.length}` };
      }
      return { _debug: `android-no-tracks keys=${Object.keys(data ?? {}).join(",")}` };
    }
  } catch {
    // fall through to strategy 2
  }

  // Strategy 2: ytInitialPlayerResponse already on the page.
  // Only useful if injected into the specific video's watch page — not a channel page.
  // Check once (no polling) since we're likely on a non-video page.
  const yt = (window as any).ytInitialPlayerResponse;
  const ytiprTracks = yt?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (ytiprTracks?.length) {
    const track = pickBestTrack(ytiprTracks, preferredLangs);
    if (track?.baseUrl) {
      const { xml, err } = await fetchXml(track.baseUrl);
      if (xml) {
        const segments = parseXml(xml);
        if (segments.length) return { _debug: "ytipr-ok", segments, langCode: track.languageCode };
        return { _debug: `ytipr-parse-empty xml_len=${xml.length}` };
      }
      return { _debug: `ytipr-xml-failed err=${err}` };
    }
  }

  return { _debug: "no-tracks-either-strategy" };
}

chrome.runtime.onMessage.addListener(
  (msg: { type: string; [key: string]: unknown }, _sender, sendResponse) => {
    (async () => {
      try {
        let data: unknown;

        switch (msg.type) {
          case "list-videos":
            data = await listVideos(msg.params as Parameters<typeof listVideos>[0]);
            break;

          case "fetch-transcript": {
            const videoId = msg.videoId as string;
            const preferredLangs = (msg.preferredLangs as string[] | undefined) ?? ["en", "hi"];

            const tabId = await getYouTubeTabId();
            if (!tabId) {
              console.warn("[TS] no YouTube tab found for", videoId);
              data = null;
              break;
            }

            const res = await chrome.scripting.executeScript({
              target: { tabId },
              func: fetchTranscriptInPage,
              args: [videoId, preferredLangs],
              world: "MAIN" as chrome.scripting.ExecutionWorld,
            });

            const extracted = res[0]?.result;
            console.log("[TS-DBG]", videoId, extracted?._debug);

            if (extracted?.segments?.length) {
              const langCode = extracted.langCode ?? "en";
              data = {
                language_code: langCode,
                language_label: langCode === "hi" ? "Hindi" : "English",
                is_generated: true,
                segments: extracted.segments,
              } satisfies Transcript;
            } else {
              data = null;
            }
            console.log("[TS]", videoId, data ? `${(data as Transcript).segments.length} segs` : "null");
            break;
          }

          case "match-transcript":
            data = await matchTranscript(msg.params as Parameters<typeof matchTranscript>[0]);
            break;

          default:
            sendResponse({ ok: false, error: `Unknown message type: ${msg.type}` } satisfies MessageResponse<never>);
            return;
        }

        sendResponse({ ok: true, data } satisfies MessageResponse<unknown>);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        console.error("[TS] error:", message);
        sendResponse({ ok: false, error: message } satisfies MessageResponse<never>);
      }
    })();
    return true;
  }
);
