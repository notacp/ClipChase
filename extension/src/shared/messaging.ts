import type { ExtMessage, MessageResponse, VideoListResponse, MatchResponse, Transcript } from "./types";

/** Typed wrapper around chrome.runtime.sendMessage. */
export function send(msg: { type: "list-videos"; params: import("./types").VideoListParams }): Promise<MessageResponse<VideoListResponse>>;
export function send(msg: { type: "fetch-transcript"; videoId: string; preferredLangs: string[] }): Promise<MessageResponse<Transcript | null>>;
export function send(msg: { type: "match-transcript"; params: import("./types").MatchParams }): Promise<MessageResponse<MatchResponse>>;
export function send(msg: ExtMessage): Promise<MessageResponse<unknown>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (response: MessageResponse<unknown>) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message ?? "Runtime error" });
      } else {
        resolve(response);
      }
    });
  });
}
