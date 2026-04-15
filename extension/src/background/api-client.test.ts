import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { listVideos, matchTranscript } from "./api-client";

const MOCK_BASE = "http://localhost:8000";

// Vitest replaces import.meta.env at test time; the fallback in api-client.ts
// uses ?? "http://localhost:8000" which is what we expect here.

describe("api-client", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("listVideos", () => {
    it("POSTs to /api/videos with correct body", async () => {
      const mockResponse = {
        channel_id: "UC123",
        videos: [{ id: "v1", title: "Video 1", publishedAt: "2024-01-01T00:00:00Z", thumbnail: "" }],
      };

      // @ts-expect-error — partial mock
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        json: async () => mockResponse,
      }));

      const result = await listVideos({
        channel_url: "@fakechannel",
        max_videos: 10,
        published_after: null,
        exclude_shorts: false,
      });

      expect(result).toEqual(mockResponse);

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${MOCK_BASE}/api/videos`);
      expect(options.method).toBe("POST");
      expect(options.headers).toMatchObject({ "content-type": "application/json" });

      const body = JSON.parse(options.body as string);
      expect(body).toEqual({
        channel_url: "@fakechannel",
        max_videos: 10,
        published_after: null,
        exclude_shorts: false,
      });
    });

    it("throws on non-OK response", async () => {
      // @ts-expect-error — partial mock
      globalThis.fetch = vi.fn(async () => ({
        ok: false,
        status: 400,
        text: async () => "Invalid channel",
      }));

      await expect(
        listVideos({ channel_url: "bad", max_videos: 5, published_after: null, exclude_shorts: false })
      ).rejects.toThrow("/api/videos 400");
    });
  });

  describe("matchTranscript", () => {
    it("POSTs to /api/match with correct body", async () => {
      const mockResponse = { match_result: null };

      // @ts-expect-error — partial mock
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        json: async () => mockResponse,
      }));

      const params = {
        keyword: "posthog",
        video: { id: "abc", title: "Test", publishedAt: "2024-01-01T00:00:00Z", thumbnail: "" },
        transcript: {
          language_code: "en",
          language_label: "English",
          is_generated: false,
          segments: [{ start: 0, duration: 2, text: "nothing here" }],
        },
      };

      const result = await matchTranscript(params);

      expect(result).toEqual(mockResponse);

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${MOCK_BASE}/api/match`);
      expect(options.method).toBe("POST");

      const body = JSON.parse(options.body as string);
      expect(body.keyword).toBe("posthog");
      expect(body.video.id).toBe("abc");
      expect(body.transcript.segments).toHaveLength(1);
    });

    it("returns match_result when backend finds matches", async () => {
      const matchResult = {
        video_id: "abc",
        title: "Test",
        published_at: "2024-01-01T00:00:00Z",
        thumbnail: "",
        transcript_language_code: "en",
        transcript_language_label: "English",
        search_terms_used: ["posthog"],
        matches: [{ start: 5.0, text: "posthog analytics", context_before: "", context_after: "" }],
      };

      // @ts-expect-error — partial mock
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        json: async () => ({ match_result: matchResult }),
      }));

      const result = await matchTranscript({
        keyword: "posthog",
        video: { id: "abc", title: "Test", publishedAt: "2024-01-01T00:00:00Z", thumbnail: "" },
        transcript: {
          language_code: "en",
          language_label: "English",
          is_generated: false,
          segments: [{ start: 5.0, duration: 2.0, text: "posthog analytics" }],
        },
      });

      expect(result.match_result).not.toBeNull();
      expect(result.match_result!.video_id).toBe("abc");
      expect(result.match_result!.matches[0].start).toBe(5.0);
    });
  });
});
