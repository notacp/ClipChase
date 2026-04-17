// extension/src/background/service-worker.ts
import { listVideos, matchTranscript } from "./api-client";
import { pickTrack, parseSegments, normalizeLanguageCode, type CaptionTrack } from "./transcript-fetcher";
import type { MessageResponse, Transcript } from "../shared/types";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

/**
 * Creates a background tab navigating to a specific YouTube video URL,
 * waits for full load, then returns the tab ID.
 */
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
 * Reads caption tracks from the YouTube page's main world.
 * SELF-CONTAINED — no references to module scope.
 * Polls up to 10x with 200ms delay.
 */
async function readCaptionTracksFromPage(): Promise<CaptionTrack[] | null> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const yt = (window as unknown as Record<string, unknown>)["ytInitialPlayerResponse"] as
      | { captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } } }
      | undefined;
    const tracks = yt?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (tracks?.length) return tracks;
    await new Promise<void>((r) => setTimeout(r, 200));
  }
  return null;
}

/**
 * Fetches and parses a YouTube caption XML from a signed timedtext URL.
 * SELF-CONTAINED — no references to module scope.
 */
async function fetchCaptionXml(
  baseUrl: string,
  videoId: string
): Promise<{ text: string; start: number; duration: number }[] | null> {
  const res = await fetch(baseUrl, {
    headers: {
      Referer: `https://www.youtube.com/watch?v=${videoId}`,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
    credentials: "omit",
  });
  if (!res.ok) return null;
  const xml = await res.text();
  if (!xml.trim()) return null;

  const segments: { text: string; start: number; duration: number }[] = [];
  const re = new RegExp('<text start="([^"]+)" dur="([^"]+)"[^>]*>([\\s\\S]*?)<\\/text>', "g");
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
    if (text) segments.push({ text, start: parseFloat(m[1]), duration: parseFloat(m[2]) });
  }
  return segments.length > 0 ? segments : null;
}

chrome.runtime.onMessage.addListener(
  (msg: { type: string; [key: string]: unknown }, _sender, sendResponse) => {
    (async () => {
      try {
        let data: unknown;

        switch (msg.type) {
          case "list-videos":
            data = await listVideos(
              msg.params as Parameters<typeof listVideos>[0]
            );
            break;

          case "fetch-transcript": {
            const videoId = msg.videoId as string;
            const preferredLangs = (msg.preferredLangs as string[]) ?? ["en", "hi"];

            const tabId = await createVideoTab(videoId);
            try {
              // Step 1: Read caption tracks from YouTube's player data (main world).
              const tracksResults = await chrome.scripting.executeScript({
                target: { tabId },
                func: readCaptionTracksFromPage,
                world: "MAIN" as chrome.scripting.ExecutionWorld,
              });
              const tracks = (tracksResults[0]?.result ?? null) as CaptionTrack[] | null;
              if (!tracks?.length) {
                data = null;
                break;
              }

              // Step 2: Pick best track (module scope — can reference imports).
              const langs = preferredLangs.map(normalizeLanguageCode).filter(Boolean);
              for (const fb of ["en", "hi"]) {
                if (!langs.includes(fb)) langs.push(fb);
              }
              const track = pickTrack(tracks, langs);
              if (!track) {
                data = null;
                break;
              }

              // Step 3: Fetch and parse caption XML (isolated world — network OK).
              const xmlResults = await chrome.scripting.executeScript({
                target: { tabId },
                func: fetchCaptionXml,
                args: [track.baseUrl, videoId],
                world: "ISOLATED" as chrome.scripting.ExecutionWorld,
              });
              const segments = (xmlResults[0]?.result ?? null) as
                | { text: string; start: number; duration: number }[]
                | null;
              if (!segments?.length) {
                data = null;
                break;
              }

              const lc = normalizeLanguageCode(track.languageCode);
              data = {
                language_code: lc,
                language_label:
                  track.name?.simpleText ??
                  (lc === "hi" ? "Hindi" : lc === "en" ? "English" : track.languageCode),
                is_generated: track.kind === "asr",
                segments,
              } satisfies Transcript;
            } finally {
              chrome.tabs.remove(tabId);
            }
            break;
          }

          case "match-transcript":
            data = await matchTranscript(
              msg.params as Parameters<typeof matchTranscript>[0]
            );
            break;

          default:
            sendResponse({
              ok: false,
              error: `Unknown message type: ${msg.type}`,
            } satisfies MessageResponse<never>);
            return;
        }

        sendResponse({ ok: true, data } satisfies MessageResponse<unknown>);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        sendResponse({
          ok: false,
          error: message,
        } satisfies MessageResponse<never>);
      }
    })();

    return true;
  }
);
