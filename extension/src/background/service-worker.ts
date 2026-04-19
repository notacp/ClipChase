// extension/src/background/service-worker.ts
import { listVideos, matchTranscript } from "./api-client";
import type { MessageResponse, Transcript } from "../shared/types";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

async function createVideoTab(videoId: string): Promise<number> {
  const tab = await chrome.tabs.create({
    url: `https://www.youtube.com/watch?v=${videoId}`,
    active: false,
  });
  const tabId = tab.id!;
  await new Promise<void>((resolve) => {
    chrome.tabs.onUpdated.addListener(function listener(tid, info) {
      if (tid === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    });
  });
  return tabId;
}

// ─── Phase 1: Runs in MAIN world on YouTube page ──────────────────────────────
// Extracts caption track info from ytInitialPlayerResponse.
// Does NOT fetch anything — just reads the page's JS globals.
function extractCaptionTracks(): {
  tracks: {
    baseUrl: string;
    languageCode: string;
    label: string;
    kind: string;
  }[];
  _debug: string;
} {
  try {
    const w = window as unknown as Record<string, unknown>;

    const ytpr = w["ytInitialPlayerResponse"] as {
      captions?: {
        playerCaptionsTracklistRenderer?: {
          captionTracks?: {
            baseUrl?: string;
            languageCode?: string;
            name?: { simpleText?: string };
            kind?: string;
          }[];
        };
      };
    } | undefined;

    const raw = ytpr?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!raw || raw.length === 0) {
      return {
        tracks: [],
        _debug: `no-tracks hasYtpr=${!!ytpr} hasCaptions=${!!ytpr?.captions}`,
      };
    }

    const tracks = raw
      .filter((t): t is typeof t & { baseUrl: string } => !!t.baseUrl)
      .map(t => ({
        baseUrl: t.baseUrl,
        languageCode: t.languageCode ?? "en",
        label: t.name?.simpleText ?? "",
        kind: t.kind ?? "",
      }));

    return { tracks, _debug: `found ${tracks.length} tracks` };
  } catch (e) {
    return { tracks: [], _debug: `threw: ${String(e)}` };
  }
}

// ─── Phase 2: Runs in service worker ──────────────────────────────────────────
// Fetches the timedtext URL directly using the extension's network stack.
// This bypasses YouTube's service worker which was returning empty responses.
async function fetchTimedText(
  baseUrl: string
): Promise<{ text: string; start: number; duration: number }[] | null> {
  const ttUrl = new URL(baseUrl);

  // Try json3 first, then default XML
  for (const fmt of ["json3", ""]) {
    if (fmt) {
      ttUrl.searchParams.set("fmt", fmt);
    } else {
      ttUrl.searchParams.delete("fmt");
    }

    const res = await fetch(ttUrl.toString());
    if (!res.ok) {
      console.log("[TS-DBG] timedtext fetch failed:", res.status, fmt);
      continue;
    }

    const rawText = await res.text();
    if (!rawText || rawText.length < 2) {
      console.log("[TS-DBG] timedtext empty for fmt:", fmt);
      continue;
    }

    // JSON3 format
    if (rawText.trimStart().startsWith("{")) {
      const data = JSON.parse(rawText) as {
        events?: {
          tStartMs?: number;
          dDurationMs?: number;
          segs?: { utf8?: string }[];
        }[];
      };
      if (!data.events) continue;

      const segments: { text: string; start: number; duration: number }[] = [];
      for (const event of data.events) {
        if (!event.segs || event.tStartMs === undefined) continue;
        const text = event.segs.map(s => s.utf8 ?? "").join("").replace(/\n/g, " ").trim();
        if (!text) continue;
        segments.push({
          text,
          start: (event.tStartMs ?? 0) / 1000,
          duration: (event.dDurationMs ?? 0) / 1000,
        });
      }
      if (segments.length > 0) return segments;
    }

    // XML format
    if (rawText.trimStart().startsWith("<")) {
      // Service worker doesn't have DOMParser — parse XML with regex
      const segments: { text: string; start: number; duration: number }[] = [];
      const regex = /<text\s+start="([^"]*)"(?:\s+dur="([^"]*)")?[^>]*>([\s\S]*?)<\/text>/g;
      let match;
      while ((match = regex.exec(rawText)) !== null) {
        const start = parseFloat(match[1]);
        const dur = parseFloat(match[2] ?? "0");
        const text = match[3]
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\n/g, " ")
          .trim();
        if (text) {
          segments.push({ text, start, duration: dur });
        }
      }
      if (segments.length > 0) return segments;
    }
  }

  return null;
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

            const tabId = await createVideoTab(videoId);
            try {
              // Wait for YouTube's JS to initialise (up to 5s)
              let result: Transcript | null = null;
              for (let attempt = 0; attempt < 10; attempt++) {
                if (attempt > 0) await new Promise<void>(r => setTimeout(r, 500));

                // Phase 1: Extract caption track URLs from the page
                const res = await chrome.scripting.executeScript({
                  target: { tabId },
                  func: extractCaptionTracks,
                  args: [],
                  world: "MAIN" as chrome.scripting.ExecutionWorld,
                });
                const extracted = res[0]?.result;
                if (!extracted || extracted.tracks.length === 0) {
                  console.log("[TS-DBG]", videoId, "extract:", extracted?._debug ?? "null");
                  continue;
                }

                console.log("[TS-DBG]", videoId, extracted._debug);

                // Prefer English, then first manual, then first auto-generated
                const tracks = extracted.tracks;
                const preferred =
                  tracks.find(t => t.languageCode === "en" && t.kind !== "asr") ??
                  tracks.find(t => t.kind !== "asr") ??
                  tracks.find(t => t.languageCode === "en") ??
                  tracks[0];

                // Phase 2: Fetch timedtext from service worker (bypasses YT service worker)
                const segments = await fetchTimedText(preferred.baseUrl);
                if (!segments) {
                  console.log("[TS-DBG]", videoId, "timedtext returned no segments");
                  continue;
                }

                const lc = preferred.languageCode.toLowerCase().split("-")[0];
                result = {
                  language_code: lc,
                  language_label: preferred.label || (lc === "hi" ? "Hindi" : "English"),
                  is_generated: preferred.kind === "asr",
                  segments,
                };
                console.log("[TS-DBG]", videoId, `ok segs=${segments.length} lang=${lc}`);
                break;
              }
              console.log("[TS]", videoId, result ? `${result.segments.length} segments` : "null");
              data = result;
            } finally {
              chrome.tabs.remove(tabId);
            }
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
