import { describe, it, expect, vi, beforeEach } from "vitest";

// First test harness for the service worker. Locks fix f825fe6 (the cold-wake
// `await registerHeaderSpoofRules()` race + the ANDROID->IOS->WEB InnerTube
// fallthrough) and fix f1ad98f (no_captions short-circuit). None of this was
// covered before — reverting any of it left the suite green.
//
// Importing service-worker.ts runs MV3 top-level side effects (listeners,
// header-spoof registration, sw_started capture), so we mock the chrome API,
// posthog-sw, and api-client, set globals, then dynamic-import the module.

vi.mock("./posthog-sw", () => ({
  captureSW: vi.fn(() => Promise.resolve()),
  captureExceptionSW: vi.fn(),
}));
vi.mock("./api-client", () => ({
  listVideos: vi.fn(),
  matchTranscript: vi.fn(),
  indexTranscript: vi.fn(),
}));

const VALID_XML = '<transcript><text start="0" dur="1">hello world</text></transcript>';

// Player-response shapes the fake YouTube returns per InnerTube client.
const playerWithTracks = () => ({
  captions: {
    playerCaptionsTracklistRenderer: {
      captionTracks: [
        { languageCode: "en", baseUrl: "https://www.youtube.com/api/timedtext?v=x", kind: "asr" },
      ],
    },
  },
});
// No captions key + non-OK playability => ambiguous "no-tracks" => keep trying clients.
const playerNoTracksAmbiguous = () => ({ playabilityStatus: { status: "LOGIN_REQUIRED" } });
// No captions key + playable (OK + streamingData) => definitive "no-captions" => stop.
const playerNoCaptionsDefinitive = () => ({
  playabilityStatus: { status: "OK" },
  streamingData: {},
});

let eventLog: string[];
let playerByClient: Record<string, () => object>;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  eventLog = [];
  playerByClient = {
    ANDROID: playerWithTracks,
    IOS: playerWithTracks,
    WEB_EMBEDDED_PLAYER: playerWithTracks,
  };

  const updateSessionRules = vi.fn(async () => {
    eventLog.push("rules");
  });

  const listener = () => ({ addListener: vi.fn() });
  globalThis.chrome = {
    declarativeNetRequest: {
      updateSessionRules,
      HeaderOperation: { SET: "set" },
      RuleActionType: { MODIFY_HEADERS: "modify_headers" },
      ResourceType: { XMLHTTPREQUEST: "xmlhttprequest" },
    },
    tabs: { TAB_ID_NONE: -1, create: vi.fn(() => Promise.resolve()) },
    sidePanel: {
      setPanelBehavior: vi.fn(() => Promise.resolve()),
      open: vi.fn(() => Promise.resolve()),
    },
    storage: { local: { get: vi.fn(() => Promise.resolve({})), set: vi.fn(() => Promise.resolve()) } },
    runtime: {
      onInstalled: listener(),
      onStartup: listener(),
      onConnect: listener(),
      onMessage: listener(),
      getManifest: () => ({ version: "test" }),
    },
    action: { onClicked: listener() },
  } as unknown as typeof chrome;

  globalThis.self = {
    addEventListener: vi.fn(),
    navigator: { userAgent: "test" },
  } as unknown as typeof self & typeof globalThis;

  globalThis.fetch = vi.fn(async (url: string, opts?: { body?: string }) => {
    if (url.includes("youtubei/v1/player")) {
      const client = JSON.parse(opts!.body!).context.client.clientName;
      eventLog.push(`player:${client}`);
      const body = playerByClient[client]();
      return { ok: true, status: 200, json: async () => body } as unknown as Response;
    }
    if (url.includes("timedtext")) {
      eventLog.push("timedtext");
      return { ok: true, status: 200, text: async () => VALID_XML } as unknown as Response;
    }
    if (url.includes("/watch?v=")) {
      eventLog.push("watch");
      return { ok: true, status: 200, text: async () => "<html></html>" } as unknown as Response;
    }
    return { ok: false, status: 404, text: async () => "" } as unknown as Response;
  }) as unknown as typeof fetch;
});

describe("service-worker transcript pipeline", () => {
  it("awaits header-spoof rule registration BEFORE any InnerTube fetch (cold-wake race)", async () => {
    const sw = await import("./service-worker");
    // Drop the events from module-load (top-level registerHeaderSpoofRules).
    eventLog.length = 0;

    const result = await sw.handleFetchTranscript("vid1", ["en"]);

    expect(result.transcript).not.toBeNull();
    // Rules must be (re-)registered before the first player call — the bug was
    // the first fetch racing ahead of registration after an SW cold wake.
    expect(eventLog.indexOf("rules")).toBeGreaterThanOrEqual(0);
    expect(eventLog.indexOf("rules")).toBeLessThan(eventLog.indexOf("player:ANDROID"));
  });

  it("falls through ANDROID -> IOS when the first client yields no usable tracks", async () => {
    playerByClient.ANDROID = playerNoTracksAmbiguous;
    playerByClient.IOS = playerWithTracks;
    const sw = await import("./service-worker");
    eventLog.length = 0;

    const { result } = await sw.fetchTranscriptFromSW("vid2", ["en"], new AbortController().signal);

    expect(result.segments?.length).toBeGreaterThan(0);
    expect(result.langCode).toBe("en");
    expect(eventLog).toContain("player:ANDROID");
    expect(eventLog).toContain("player:IOS");
    expect(eventLog.indexOf("player:ANDROID")).toBeLessThan(eventLog.indexOf("player:IOS"));
    // Succeeded on IOS — must not waste the third client.
    expect(eventLog).not.toContain("player:WEB_EMBEDDED_PLAYER");
  });

  it("recovers a pot-blocked video by replaying ANDROID with the watch page's visitorData", async () => {
    // All anonymous clients bot-gated; watch page proves captions exist but its
    // WEB-signed timedtext URL is pot-gated (200, empty body). The visitorData
    // replay must ungate ANDROID and return the transcript.
    playerByClient.ANDROID = playerNoTracksAmbiguous;
    playerByClient.IOS = playerNoTracksAmbiguous;
    playerByClient.WEB_EMBEDDED_PLAYER = playerNoTracksAmbiguous;

    const watchHtml =
      `<script>"visitorData":"CgtWRFRFU1Q%3D";var ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"languageCode":"en","baseUrl":"https://www.youtube.com/api/timedtext?src=watch","kind":"asr"}]}}};</script>`;

    const playerBodies: { clientName: string; visitorData?: string }[] = [];
    globalThis.fetch = vi.fn(async (url: string, opts?: { body?: string }) => {
      if (url.includes("youtubei/v1/player")) {
        const client = JSON.parse(opts!.body!).context.client;
        playerBodies.push({ clientName: client.clientName, visitorData: client.visitorData });
        eventLog.push(`player:${client.clientName}${client.visitorData ? "+vd" : ""}`);
        const body = client.visitorData ? playerWithTracks() : playerByClient[client.clientName]();
        return { ok: true, status: 200, json: async () => body } as unknown as Response;
      }
      if (url.includes("timedtext")) {
        eventLog.push("timedtext");
        // pot-gated watch URL answers 200 with an empty body; the ungated
        // ANDROID baseUrl (from the +vd replay) returns real XML.
        const text = url.includes("src=watch") ? "" : VALID_XML;
        return { ok: true, status: 200, text: async () => text } as unknown as Response;
      }
      if (url.includes("/watch?v=")) {
        eventLog.push("watch");
        return { ok: true, status: 200, text: async () => watchHtml } as unknown as Response;
      }
      return { ok: false, status: 404, text: async () => "" } as unknown as Response;
    }) as unknown as typeof fetch;

    const sw = await import("./service-worker");
    eventLog.length = 0;

    const result = await sw.handleFetchTranscript("vid4", ["en"]);

    expect(result.transcript).not.toBeNull();
    expect(result.failure_reason).toBeNull();
    // The replay must carry the visitorData scraped from the watch page.
    const retryCall = playerBodies.find((b) => b.visitorData);
    expect(retryCall?.clientName).toBe("ANDROID");
    expect(retryCall?.visitorData).toBe("CgtWRFRFU1Q%3D");
    expect(eventLog).toContain("player:ANDROID+vd");
    // Recovery must be observable in PostHog, not silent.
    const { captureSW } = await import("./posthog-sw");
    expect(captureSW).toHaveBeenCalledWith(
      "transcript_fetch_recovered",
      expect.objectContaining({ video_id: "vid4" }),
    );
  });

  it("classifies pot_blocked when even the visitorData replay stays gated", async () => {
    playerByClient.ANDROID = playerNoTracksAmbiguous;
    playerByClient.IOS = playerNoTracksAmbiguous;
    playerByClient.WEB_EMBEDDED_PLAYER = playerNoTracksAmbiguous;

    const watchHtml =
      `<script>"visitorData":"CgtWRFRFU1Q%3D";var ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"languageCode":"en","baseUrl":"https://www.youtube.com/api/timedtext?src=watch","kind":"asr"}]}}};</script>`;

    globalThis.fetch = vi.fn(async (url: string, opts?: { body?: string }) => {
      if (url.includes("youtubei/v1/player")) {
        const client = JSON.parse(opts!.body!).context.client;
        // Every player call — including the +vd replay — stays gated.
        return { ok: true, status: 200, json: async () => playerNoTracksAmbiguous() } as unknown as Response;
      }
      if (url.includes("timedtext")) {
        return { ok: true, status: 200, text: async () => "" } as unknown as Response;
      }
      if (url.includes("/watch?v=")) {
        return { ok: true, status: 200, text: async () => watchHtml } as unknown as Response;
      }
      return { ok: false, status: 404, text: async () => "" } as unknown as Response;
    }) as unknown as typeof fetch;

    const sw = await import("./service-worker");
    const result = await sw.handleFetchTranscript("vid5", ["en"]);

    expect(result.transcript).toBeNull();
    expect(result.failure_reason).toBe("pot_blocked");
  });

  it("does NOT replay with visitorData when the watch page proves the video has no captions", async () => {
    playerByClient.ANDROID = playerNoTracksAmbiguous;
    playerByClient.IOS = playerNoTracksAmbiguous;
    playerByClient.WEB_EMBEDDED_PLAYER = playerNoTracksAmbiguous;

    // Watch page parses fine, has visitorData, but exposes no caption tracks —
    // authoritative no_captions. A retry would waste budget on every
    // captionless Short.
    const watchHtml =
      `<script>"visitorData":"CgtWRFRFU1Q%3D";var ytInitialPlayerResponse = {"videoDetails":{"videoId":"vid6"}};</script>`;

    const playerCalls: (string | undefined)[] = [];
    globalThis.fetch = vi.fn(async (url: string, opts?: { body?: string }) => {
      if (url.includes("youtubei/v1/player")) {
        const client = JSON.parse(opts!.body!).context.client;
        playerCalls.push(client.visitorData);
        return { ok: true, status: 200, json: async () => playerNoTracksAmbiguous() } as unknown as Response;
      }
      if (url.includes("/watch?v=")) {
        return { ok: true, status: 200, text: async () => watchHtml } as unknown as Response;
      }
      return { ok: false, status: 404, text: async () => "" } as unknown as Response;
    }) as unknown as typeof fetch;

    const sw = await import("./service-worker");
    const result = await sw.handleFetchTranscript("vid6", ["en"]);

    expect(result.transcript).toBeNull();
    expect(result.failure_reason).toBe("no_captions");
    // 3 anonymous client calls only — no visitorData replay.
    expect(playerCalls).toHaveLength(3);
    expect(playerCalls.every((vd) => vd === undefined)).toBe(true);
  });

  it("short-circuits remaining clients on a definitive no-captions verdict", async () => {
    playerByClient.ANDROID = playerNoCaptionsDefinitive;
    const sw = await import("./service-worker");
    eventLog.length = 0;

    const { result } = await sw.fetchTranscriptFromSW("vid3", ["en"], new AbortController().signal);

    expect(result.segments).toBeUndefined();
    expect(eventLog).toContain("player:ANDROID");
    // A captionless video: one client agreeing is enough — don't probe IOS/WEB.
    expect(eventLog).not.toContain("player:IOS");
    expect(eventLog).not.toContain("player:WEB_EMBEDDED_PLAYER");
  });
});
