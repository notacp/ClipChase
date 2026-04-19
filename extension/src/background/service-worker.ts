// extension/src/background/service-worker.ts
import { listVideos, matchTranscript } from "./api-client";
import type { MessageResponse, Transcript } from "../shared/types";
import { YoutubeTranscript } from "youtube-transcript";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

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
            const lang = (msg.lang as string) ?? "en";

            let result: Transcript | null = null;
            try {
              // Attempt to fetch from Android endpoint to bypass PO Token (exp=xpe) requirements
              const ts = await YoutubeTranscript.fetchTranscript(videoId, { lang });
              if (ts && ts.length > 0) {
                const responseLang = ts[0]?.lang ?? lang;
                result = {
                  language_code: responseLang,
                  language_label: responseLang === "hi" ? "Hindi" : "English",
                  is_generated: true, // We don't get this from youtube-transcript reliably, assume generated fallback
                  segments: ts.map(seg => ({
                    text: seg.text,
                    start: seg.offset / 1000,
                    duration: seg.duration / 1000
                  }))
                };
              }
            } catch (err) {
              console.log("[TS-DBG] youtube-transcript error:", err);
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
