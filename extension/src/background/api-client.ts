import type {
  VideoListParams,
  VideoListResponse,
  MatchParams,
  MatchResponse,
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
