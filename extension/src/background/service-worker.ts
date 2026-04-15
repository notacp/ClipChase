import { fetchTranscript } from "./transcript-fetcher";
import { listVideos, matchTranscript } from "./api-client";
import type { MessageResponse } from "../shared/types";

// Open the side panel when the toolbar icon is clicked — no popup intermediary.
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
          case "fetch-transcript":
            data = await fetchTranscript(
              msg.videoId as string,
              msg.preferredLangs as string[]
            );
            break;
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
        sendResponse({ ok: false, error: message } satisfies MessageResponse<never>);
      }
    })();

    // Keep the channel open for the async sendResponse.
    return true;
  }
);
