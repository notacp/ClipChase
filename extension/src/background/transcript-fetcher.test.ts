import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchTranscript } from "./transcript-fetcher";

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeWatchPageHtml(captionTracks: unknown[]): string {
  const playerData = {
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks,
      },
    },
  };
  // Embed as JS variable — same format YouTube uses.
  return `<html><head></head><body>var ytInitialPlayerResponse = ${JSON.stringify(playerData)};var other = {};</body></html>`;
}

const CAPTION_XML = `<?xml version="1.0" encoding="utf-8" ?>
<transcript>
  <text start="0.5" dur="2.0">Hello world</text>
  <text start="3.0" dur="1.5">This is a &amp;test&amp;</text>
  <text start="5.0" dur="2.5">with &#39;quotes&#39; here</text>
</transcript>`;

function makeFetchMock(captionTracks: unknown[] = [], setCookies: string[] = []) {
  const html = makeWatchPageHtml(captionTracks);

  return vi.fn(async (url: string) => {
    if (typeof url === "string" && url.includes("youtube.com/watch")) {
      return {
        ok: true,
        status: 200,
        headers: {
          getSetCookie: () => setCookies,
          get: (_name: string) => null,
        },
        text: async () => html,
      };
    }
    // Second call is the caption XML fetch.
    return {
      ok: true,
      status: 200,
      text: async () => CAPTION_XML,
    };
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("fetchTranscript", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("parses segments from caption XML", async () => {
    const tracks = [
      {
        baseUrl: "https://www.youtube.com/api/timedtext?v=abc&lang=en",
        languageCode: "en-US",
        kind: "",
        name: { simpleText: "English" },
      },
    ];

    // @ts-expect-error — partial mock
    globalThis.fetch = makeFetchMock(tracks);

    const result = await fetchTranscript("abc", ["en"]);

    expect(result).not.toBeNull();
    expect(result!.language_code).toBe("en");
    expect(result!.language_label).toBe("English");
    expect(result!.is_generated).toBe(false);
    expect(result!.segments).toHaveLength(3);
    expect(result!.segments[0]).toEqual({ text: "Hello world", start: 0.5, duration: 2.0 });
    // HTML entity decoding
    expect(result!.segments[1].text).toBe("This is a &test&");
    expect(result!.segments[2].text).toBe("with 'quotes' here");
  });

  it("prefers manual track over ASR track for same language", async () => {
    const tracks = [
      {
        baseUrl: "https://www.youtube.com/api/timedtext?v=abc&lang=en&kind=asr",
        languageCode: "en",
        kind: "asr",
        name: { simpleText: "English (auto-generated)" },
      },
      {
        baseUrl: "https://www.youtube.com/api/timedtext?v=abc&lang=en",
        languageCode: "en",
        kind: "",
        name: { simpleText: "English" },
      },
    ];

    // @ts-expect-error — partial mock
    globalThis.fetch = makeFetchMock(tracks);

    const result = await fetchTranscript("abc", ["en"]);
    expect(result).not.toBeNull();
    expect(result!.is_generated).toBe(false);
    // The manual track's baseUrl should be used (second fetch).
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const captionFetchUrl = fetchMock.mock.calls[1][0] as string;
    expect(captionFetchUrl).not.toContain("kind=asr");
  });

  it("returns null when no caption tracks present", async () => {
    // @ts-expect-error — partial mock
    globalThis.fetch = makeFetchMock([]);

    const result = await fetchTranscript("abc", ["en"]);
    expect(result).toBeNull();
  });

  it("returns null when preferred language not available", async () => {
    const tracks = [
      {
        baseUrl: "https://www.youtube.com/api/timedtext?v=abc&lang=ja",
        languageCode: "ja",
        kind: "",
        name: { simpleText: "Japanese" },
      },
    ];

    // @ts-expect-error — partial mock
    globalThis.fetch = makeFetchMock(tracks);

    // Ask for only "en" — "ja" should not match, but fallback to "hi" also won't match.
    // parsePreferredLangs adds "hi" and "en" as fallbacks, so requesting ["fr"] leaves
    // only ["fr", "en", "hi"] — none of which match "ja".
    const result = await fetchTranscript("abc", ["fr"]);
    expect(result).toBeNull();
  });

  it("throws when watch page fetch fails", async () => {
    // @ts-expect-error — partial mock
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 403 }));

    await expect(fetchTranscript("abc", ["en"])).rejects.toThrow("Watch page fetch failed: 403");
  });

  it("forwards Set-Cookie values from watch page to caption fetch", async () => {
    const tracks = [
      {
        baseUrl: "https://www.youtube.com/api/timedtext?v=abc&lang=en",
        languageCode: "en",
        kind: "",
        name: { simpleText: "English" },
      },
    ];
    // Cookies WITH commas inside the value — the kind that break naive splitting.
    const setCookies = [
      "VISITOR_INFO1_LIVE=abc123; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/",
      "YSC=xyz789; Path=/; HttpOnly",
    ];

    // @ts-expect-error — partial mock
    globalThis.fetch = makeFetchMock(tracks, setCookies);

    await fetchTranscript("abc", ["en"]);

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    // Inspect the second fetch call — the caption XML fetch.
    const [, captionOpts] = fetchMock.mock.calls[1] as [string, RequestInit];
    const headers = (captionOpts.headers ?? {}) as Record<string, string>;

    expect(headers.Cookie).toBe("VISITOR_INFO1_LIVE=abc123; YSC=xyz789");
    expect(captionOpts.credentials).toBe("include");
  });

  it("sends credentials: include on the watch-page fetch", async () => {
    const tracks = [
      {
        baseUrl: "https://www.youtube.com/api/timedtext?v=abc&lang=en",
        languageCode: "en",
        kind: "",
      },
    ];

    // @ts-expect-error — partial mock
    globalThis.fetch = makeFetchMock(tracks);

    await fetchTranscript("abc", ["en"]);

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const [, watchOpts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(watchOpts.credentials).toBe("include");
  });

  it("ASR track correctly sets is_generated = true", async () => {
    const tracks = [
      {
        baseUrl: "https://www.youtube.com/api/timedtext?v=abc&lang=en&kind=asr",
        languageCode: "en",
        kind: "asr",
        name: { simpleText: "English (auto-generated)" },
      },
    ];

    // @ts-expect-error — partial mock
    globalThis.fetch = makeFetchMock(tracks);

    const result = await fetchTranscript("abc", ["en"]);
    expect(result).not.toBeNull();
    expect(result!.is_generated).toBe(true);
  });
});
