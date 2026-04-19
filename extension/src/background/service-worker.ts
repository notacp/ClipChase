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

/**
 * Fetches transcript via caption track URLs in ytInitialPlayerResponse.
 * Runs in MAIN world. SELF-CONTAINED.
 *
 * ytInitialPlayerResponse always contains captionTracks with direct URLs
 * to subtitle files. We just fetch those — no InnerTube context needed.
 */
async function fetchTranscriptFromYouTubePage(_videoId: string): Promise<{
  languageCode: string;
  languageLabel: string;
  isGenerated: boolean;
  segments: { text: string; start: number; duration: number }[];
  _debug: string;
} | { _debug: string }> {
  try {
    const w = window as unknown as Record<string, unknown>;

    // ── 1. Get caption tracks from ytInitialPlayerResponse ─────────────────
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

    const tracks = ytpr?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!tracks || tracks.length === 0) {
      const hasYtpr = !!ytpr;
      const hasCaptions = !!ytpr?.captions;
      return { _debug: `no-caption-tracks hasYtpr=${hasYtpr} hasCaptions=${hasCaptions}` };
    }

    // Prefer English, then first available manual track, then first auto-generated
    const preferred =
      tracks.find(t => t.languageCode === "en" && t.kind !== "asr") ??
      tracks.find(t => t.kind !== "asr") ??
      tracks.find(t => t.languageCode === "en") ??
      tracks[0];

    if (!preferred?.baseUrl) {
      return { _debug: `no-baseUrl tracks=${tracks.length}` };
    }

    // ── 2. Fetch subtitle data as JSON ────────────────────────────────────
    // Append fmt=json3 to get structured JSON instead of XML
    const separator = preferred.baseUrl.includes("?") ? "&" : "?";
    const url = preferred.baseUrl + separator + "fmt=json3";
    const res = await fetch(url, { credentials: "include" });

    if (!res.ok) {
      return { _debug: `timedtext-status=${res.status} url=${url.slice(0, 80)}` };
    }

    const rawText = await res.text();
    if (!rawText || rawText.length < 2) {
      return { _debug: `timedtext-empty len=${rawText.length} url=${url.slice(0, 80)}` };
    }

    let data: {
      events?: {
        tStartMs?: number;
        dDurationMs?: number;
        segs?: { utf8?: string }[];
      }[];
    };
    try {
      data = JSON.parse(rawText);
    } catch {
      return { _debug: `timedtext-not-json len=${rawText.length} preview=${rawText.slice(0, 100)}` };
    }

    if (!data.events) {
      return { _debug: `no-events-in-json3 keys=${Object.keys(data).join(",")}` };
    }

    // ── 3. Parse events into segments ─────────────────────────────────────
    const segments: { text: string; start: number; duration: number }[] = [];
    for (const event of data.events) {
      if (!event.segs || event.tStartMs === undefined) continue;
      const text = event.segs
        .map(s => s.utf8 ?? "")
        .join("")
        .replace(/\n/g, " ")
        .trim();
      if (!text || text === "\n") continue;
      const start = (event.tStartMs ?? 0) / 1000;
      const duration = (event.dDurationMs ?? 0) / 1000;
      segments.push({ text, start, duration });
    }

    if (segments.length === 0) {
      return { _debug: `parsed-0-segments events=${data.events.length}` };
    }

    const lc = (preferred.languageCode ?? "en").toLowerCase().split("-")[0];
    return {
      languageCode: lc,
      languageLabel: preferred.name?.simpleText ?? (lc === "hi" ? "Hindi" : "English"),
      isGenerated: preferred.kind === "asr",
      segments,
      _debug: `ok segs=${segments.length} lang=${lc}`,
    };
  } catch (e) {
    return { _debug: `threw: ${String(e)}` };
  }
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
                const res = await chrome.scripting.executeScript({
                  target: { tabId },
                  func: fetchTranscriptFromYouTubePage,
                  args: [videoId],
                  world: "MAIN" as chrome.scripting.ExecutionWorld,
                });
                const t = res[0]?.result ?? null;
                if (t) {
                  console.log("[TS-DBG]", videoId, t._debug);
                  if ("segments" in t) {
                    result = {
                      language_code: t.languageCode,
                      language_label: t.languageLabel,
                      is_generated: t.isGenerated,
                      segments: t.segments,
                    };
                    break;
                  }
                }
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
