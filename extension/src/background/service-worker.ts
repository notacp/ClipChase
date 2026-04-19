// extension/src/background/service-worker.ts
import { listVideos, matchTranscript } from "./api-client";
import type { MessageResponse, Transcript } from "../shared/types";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

async function rawInnerTubeFetch(videoId: string) {
  const v = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
  const x = {
    client: {
      clientName: "ANDROID",
      clientVersion: "20.10.38"
    }
  };
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  // Chrome forbids setting User-Agent directly in fetch, but MV3 might allow it or just drop it.
  try {
    headers["User-Agent"] = "com.google.android.youtube/20.10.38 (Linux; U; Android 14)";
  } catch (e) {
    // Ignore
  }

  const s = await fetch(v, {
    method: "POST",
    headers,
    body: JSON.stringify({
      context: x,
      videoId: videoId
    })
  });
  
  if (!s.ok) {
    return { _debug: `InnerTube POST failed ${s.status}`, segments: null };
  }

  const e = await s.json();
  const tracks = e?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks || !tracks.length) {
    return { _debug: `No caption tracks in InnerTube JSON. keys=${Object.keys(e).join(",")}`, segments: null };
  }

  const langCode = tracks.find((t: any) => t.languageCode === "en")?.baseUrl ? "en" : tracks[0].languageCode;
  const baseUrl = tracks.find((t: any) => t.languageCode === langCode)?.baseUrl;

  if (!baseUrl) {
    return { _debug: `No baseUrl`, segments: null };
  }

  // Fetch from the Android baseUrl
  const n = await fetch(baseUrl);
  if (!n.ok) {
    return { _debug: `baseUrl GET failed ${n.status}`, segments: null };
  }

  const text = await n.text();
  if (!text || text.length < 2) {
    return { _debug: `baseUrl GET empty text. url=${baseUrl}`, segments: null };
  }

  // Parse custom <p t="..."> XML
  const segments: any[] = [];
  const regex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const textStr = match[3].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").trim();
    if (textStr) {
      segments.push({
        text: textStr,
        start: parseInt(match[1], 10) / 1000,
        duration: parseInt(match[2], 10) / 1000
      });
    }
  }

  return { _debug: `Success`, segments, langCode };
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
            
            const { _debug, segments, langCode } = await rawInnerTubeFetch(videoId);
            console.log("[TS-DBG]", videoId, _debug);

            let result: Transcript | null = null;
            if (segments && segments.length > 0) {
              result = {
                language_code: langCode ?? "en",
                language_label: langCode === "hi" ? "Hindi" : "English",
                is_generated: true,
                segments
              };
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
