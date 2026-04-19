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

// ─── Runs in MAIN world on YouTube page ───────────────────────────────────────
// We must execute this from the YouTube tab to inherit its Origin: https://www.youtube.com
// If we send this POST from the service worker, it sends Origin: chrome-extension://
// which YouTube aggressively blocks with a 403 Google bot-captcha.
async function fetchAndroidTranscriptInPage(videoId: string): Promise<{
  _debug: string;
  segments?: { text: string; start: number; duration: number }[];
  langCode?: string;
}> {
  try {
    const v = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
    const x = {
      client: {
        clientName: "ANDROID",
        clientVersion: "20.10.38"
      }
    };

    // 1. Fetch innerTube with ANDROID client 
    // This gives us a baseUrl WITHOUT the exp=xpe bot-guard!
    const s = await fetch(v, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context: x, videoId })
    });
    
    if (!s.ok) return { _debug: `POST failed ${s.status}` };

    const e = await s.json();
    const tracks = e?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    
    if (!tracks || !tracks.length) {
      return { _debug: `No tracks JSON keys=${Object.keys(e).join(",")}` };
    }

    const preferred = tracks.find((t: any) => t.languageCode === "en") || tracks[0];
    const baseUrl = preferred.baseUrl;
    const langCode = preferred.languageCode;

    if (!baseUrl) return { _debug: `No baseUrl` };

    // 2. Fetch the actual XML subtitle data
    const n = await fetch(baseUrl);
    if (!n.ok) return { _debug: `GET failed ${n.status}` };

    const text = await n.text();
    if (!text || text.length < 2) return { _debug: `GET empty text. url=${baseUrl}` };

    // 3. Parse <p t="ms" d="ms"> format returned by Android API
    const segments: { text: string; start: number; duration: number }[] = [];
    const regex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      const textStr = match[3]
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .trim();
        
      if (textStr) {
        segments.push({
          text: textStr,
          start: parseInt(match[1], 10) / 1000,
          duration: parseInt(match[2], 10) / 1000
        });
      }
    }

    return { _debug: "ok", segments, langCode };
  } catch (err) {
    return { _debug: `Threw: ${String(err)}` };
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
            let result: Transcript | null = null;
            
            try {
              // Wait briefly for the page to be ready just in case
              await new Promise<void>(r => setTimeout(r, 500));
              
              const res = await chrome.scripting.executeScript({
                target: { tabId },
                func: fetchAndroidTranscriptInPage,
                args: [videoId],
                world: "MAIN" as chrome.scripting.ExecutionWorld,
              });
              
              const extracted = res[0]?.result;
              console.log("[TS-DBG]", videoId, extracted?._debug);

              if (extracted?.segments && extracted.segments.length > 0) {
                const langCode = extracted.langCode ?? "en";
                result = {
                  language_code: langCode,
                  language_label: langCode === "hi" ? "Hindi" : "English",
                  is_generated: true,
                  segments: extracted.segments
                };
              }
            } finally {
              chrome.tabs.remove(tabId);
            }

            console.log("[TS]", videoId, result ? `${result.segments.length} segments` : "null");
            data = result;
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
