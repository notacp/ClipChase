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
