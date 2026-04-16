import { listVideos, matchTranscript } from "./api-client";
import type { MessageResponse, Transcript } from "../shared/types";

// Open the side panel when the toolbar icon is clicked — no popup intermediary.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

/**
 * Self-contained transcript fetcher designed to run inside a youtube.com tab
 * via chrome.scripting.executeScript.
 *
 * IMPORTANT: This function must have NO references to anything outside its own
 * body. chrome.scripting.executeScript serializes the function via .toString()
 * and re-evaluates it in the target tab's JS context — closures over module
 * scope are lost. All helpers and constants are defined inline.
 */
async function fetchTranscriptInPageContext(
  videoId: string,
  preferredLangs: string[]
): Promise<{
  language_code: string;
  language_label: string;
  is_generated: boolean;
  segments: { text: string; start: number; duration: number }[];
} | null> {
  const HEADERS = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  };

  const normLang = (code: string) => (code ?? "").toLowerCase().split("-")[0];

  const parseLangs = (raw: string[]) => {
    const out = raw.map(normLang).filter(Boolean);
    for (const fb of ["en", "hi"]) {
      if (!out.includes(fb)) out.push(fb);
    }
    return out;
  };

  const langs = parseLangs(preferredLangs);

  // Fetch the watch page — runs with Origin: https://www.youtube.com (injected
  // into a real youtube.com tab) so YouTube doesn't reject the request.
  const watchRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: HEADERS,
    credentials: "include",
  });
  if (!watchRes.ok) return null;

  const html = await watchRes.text();

  // Extract ytInitialPlayerResponse via brace-walking.
  const marker = "ytInitialPlayerResponse = ";
  const idx = html.indexOf(marker);
  if (idx === -1) return null;

  let depth = 0,
    i = idx + marker.length;
  for (; i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}") {
      if (--depth === 0) break;
    }
  }

  const playerData = JSON.parse(html.slice(idx + marker.length, i + 1));
  const tracks: {
    languageCode: string;
    baseUrl: string;
    kind?: string;
    name?: { simpleText?: string };
  }[] =
    playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];

  if (!tracks.length) return null;

  // Pick best track matching preferred languages (manual > auto-generated).
  let track = null;
  for (const lang of langs) {
    track =
      tracks.find((t) => normLang(t.languageCode) === lang && t.kind !== "asr") ??
      tracks.find((t) => normLang(t.languageCode) === lang) ??
      null;
    if (track) break;
  }
  if (!track) return null;

  // Fetch caption XML. Use credentials: "omit" — the baseUrl is already signed,
  // and adding cookies would also add Origin: chrome-extension://... which
  // YouTube rejects. The signed URL carries its own auth.
  const captionRes = await fetch(track.baseUrl, {
    headers: {
      ...HEADERS,
      Referer: `https://www.youtube.com/watch?v=${videoId}`,
    },
    credentials: "omit",
  });
  if (!captionRes.ok) return null;

  const xml = await captionRes.text();
  if (!xml.trim()) return null;

  const segments: { text: string; start: number; duration: number }[] = [];
  const matches = Array.from(
    xml.matchAll(/<text start="([^"]+)" dur="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g)
  );
  for (const m of matches) {
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

  const lc = normLang(track.languageCode);
  return {
    language_code: lc,
    language_label:
      track.name?.simpleText ??
      (lc === "hi" ? "Hindi" : lc === "en" ? "English" : track.languageCode),
    is_generated: track.kind === "asr",
    segments,
  };
}

/**
 * Returns the tab ID of an existing youtube.com tab, or creates a background
 * tab and waits for it to finish loading.
 */
async function getYouTubeTabId(): Promise<{ tabId: number; created: boolean }> {
  const tabs = await chrome.tabs.query({ url: "*://*.youtube.com/*" });
  if (tabs.length > 0 && tabs[0].id != null) {
    return { tabId: tabs[0].id, created: false };
  }

  const tab = await chrome.tabs.create({
    url: "https://www.youtube.com",
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

  return { tabId, created: true };
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
            const preferredLangs = msg.preferredLangs as string[];

            // Inject into a youtube.com tab so the fetch runs with
            // Origin: https://www.youtube.com — not chrome-extension://.
            // YouTube rejects the chrome-extension origin with an empty body.
            const { tabId, created } = await getYouTubeTabId();
            try {
              const results = await chrome.scripting.executeScript({
                target: { tabId },
                func: fetchTranscriptInPageContext,
                args: [videoId, preferredLangs],
              });
              data = (results[0]?.result as Transcript | null) ?? null;
            } finally {
              if (created) chrome.tabs.remove(tabId);
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
