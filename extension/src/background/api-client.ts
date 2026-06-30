import type {
  VideoListParams,
  VideoListResponse,
  MatchParams,
  MatchResponse,
  IndexTranscriptParams,
  IndexTranscriptResponse,
} from "../shared/types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`${path} ${r.status}: ${text}`.slice(0, 500));
  }
  return r.json() as Promise<T>;
}

export const listVideos = (params: VideoListParams): Promise<VideoListResponse> =>
  postJson<VideoListResponse>("/api/videos", params);

export const matchTranscript = (params: MatchParams): Promise<MatchResponse> =>
  postJson<MatchResponse>("/api/match", params);

export const indexTranscript = (
  params: IndexTranscriptParams,
): Promise<IndexTranscriptResponse> =>
  postJson<IndexTranscriptResponse>("/api/index/transcript", params);

/**
 * SSE variant of indexTranscript. The server sends `: ping` heartbeats after
 * each Turso write phase, keeping the SW's 30s deadman alive during long
 * writes. Returns the same IndexTranscriptResponse shape as the JSON variant.
 */
export async function indexTranscriptSSE(
  params: IndexTranscriptParams,
): Promise<IndexTranscriptResponse> {
  const res = await fetch(`${API_BASE}/api/index/transcript`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`/api/index/transcript ${res.status}: ${text}`.slice(0, 500));
  }
  if (!res.body) throw new Error("/api/index/transcript: no response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) throw new Error("/api/index/transcript: stream ended without done event");
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      let event = "message";
      let data = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data = line.slice(5).trimStart();
      }

      if (event === "done") {
        reader.cancel();
        return JSON.parse(data) as IndexTranscriptResponse;
      }
      if (event === "error") {
        reader.cancel();
        const detail = JSON.parse(data).detail ?? "Unknown error";
        throw new Error(detail);
      }
      // "message" events are heartbeats (: ping) — ignore and keep reading
    }
  }
}
