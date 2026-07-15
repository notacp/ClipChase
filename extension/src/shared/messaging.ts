import type { ExtMessage, MessageResponse, VideoListResponse, MatchResponse, FetchTranscriptResult, IndexTranscriptResponse } from "./types";
import posthog from "./posthog";

// Deadman timeout per message type. An MV3 service worker killed mid-handler
// (idle eviction, crash, OOM) may never invoke the response callback AND never
// set chrome.runtime.lastError — leaving the promise pending forever, which
// hangs the search spinner. The in-SW per-video budget can't save this: that
// timer dies with the worker. So the side panel needs its own ceiling.
//
// Per-type tuning: fetch-transcript and match-transcript are both network-bound
// (fetch-transcript fetches from YouTube; match-transcript POSTs the transcript
// to /api/match on the backend). Both need a 30s ceiling to survive large
// transcripts, Vercel cold starts, and concurrent worker load.
// index-transcript is also network-bound (Turso write, up to ~40 batch POSTs
// for a long video) — 30s matches the rest so a Turso latency blip doesn't
// silently drop the write before it finishes.
// Dead workers are already caught by sw_message_failed (chrome.runtime.lastError),
// not by timeouts.
const SEND_TIMEOUT_MS_BY_TYPE: Record<string, number> = {
  "list-videos": 15_000,
  "fetch-transcript": 30_000,
  "match-transcript": 30_000,
  // 120s, not 30s: long videos stream ~40 Turso batch POSTs through one SSE
  // call. A 30s deadman resolved early, the caller's keepalive dropped, and
  // the SW was evicted mid-write ("message channel closed"). Dead workers are
  // caught by sw_message_failed (lastError) immediately, not by this timer.
  "index-transcript": 120_000,
};
const DEFAULT_SEND_TIMEOUT_MS = 30_000;

// `signal` lets a superseded search stop *waiting* on an in-flight SW round
// trip immediately. chrome.runtime.sendMessage can't be cancelled, so the SW
// fetch still finishes — but that work is already bounded by the in-SW
// per-video budget, and the new search's UI is freed at once instead of
// blocking up to the deadman.
type SendOpts = { signal?: AbortSignal };

// MV3 evicts the service worker after 30s idle. A long-lived port keeps the
// connection open and each port message resets the idle timer, so the worker
// survives stretches where the side panel isn't actively calling sendMessage
// (e.g. during the SSE indexed phase running server-side). Caller invokes
// startKeepalive() at the start of a search and the returned stop() at the end.
export function startKeepalive(): () => void {
  let port: chrome.runtime.Port | null = null;
  let interval: ReturnType<typeof setInterval> | undefined;
  let stopped = false;

  const connect = () => {
    if (stopped) return;
    try {
      port = chrome.runtime.connect({ name: "keepalive" });
    } catch {
      port = null;
      return;
    }
    port.onDisconnect.addListener(() => {
      port = null;
      // SW died despite keepalive — reconnect, which also revives the worker.
      if (!stopped) connect();
    });
  };

  connect();
  interval = setInterval(() => {
    if (!port) {
      connect();
      return;
    }
    try {
      port.postMessage({ type: "ping" });
    } catch {
      port = null;
      connect();
    }
  }, 20_000);

  return () => {
    stopped = true;
    if (interval !== undefined) clearInterval(interval);
    try {
      port?.disconnect();
    } catch {
      // already gone
    }
    port = null;
  };
}

/** Typed wrapper around chrome.runtime.sendMessage. */
export function send(msg: { type: "list-videos"; params: import("./types").VideoListParams }, opts?: SendOpts): Promise<MessageResponse<VideoListResponse>>;
export function send(msg: { type: "fetch-transcript"; videoId: string; preferredLangs: string[] }, opts?: SendOpts): Promise<MessageResponse<FetchTranscriptResult>>;
export function send(msg: { type: "match-transcript"; params: import("./types").MatchParams }, opts?: SendOpts): Promise<MessageResponse<MatchResponse>>;
export function send(msg: { type: "index-transcript"; params: import("./types").IndexTranscriptParams }, opts?: SendOpts): Promise<MessageResponse<IndexTranscriptResponse>>;
export function send(msg: ExtMessage, opts?: SendOpts): Promise<MessageResponse<unknown>> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (r: MessageResponse<unknown>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (opts?.signal) opts.signal.removeEventListener("abort", onAbort);
      resolve(r);
    };

    const onAbort = () => finish({ ok: false, error: "aborted" });
    if (opts?.signal) {
      if (opts.signal.aborted) {
        resolve({ ok: false, error: "aborted" });
        return;
      }
      opts.signal.addEventListener("abort", onAbort, { once: true });
    }

    const timeoutMs = SEND_TIMEOUT_MS_BY_TYPE[msg.type] ?? DEFAULT_SEND_TIMEOUT_MS;
    const timer = setTimeout(() => {
      // Worker never answered and never errored — treat as dead. Soft-fail so
      // the caller's loop continues instead of hanging.
      posthog.capture("sw_message_timeout", {
        message_type: msg.type,
        timeout_ms: timeoutMs,
      });
      finish({ ok: false, error: "sw_timeout" });
    }, timeoutMs);

    chrome.runtime.sendMessage(msg, (response: MessageResponse<unknown>) => {
      if (chrome.runtime.lastError) {
        const errMsg = chrome.runtime.lastError.message ?? "Runtime error";
        // lastError here means the SW didn't respond — crashed, unloaded, or
        // never started. Critical Arc/Chrome-compat signal; surface it before
        // returning the soft error to the caller.
        posthog.capture("sw_message_failed", {
          message_type: msg.type,
          error_message: errMsg,
        });
        finish({ ok: false, error: errMsg });
      } else {
        finish(response);
      }
    });
  });
}
