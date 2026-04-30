// extension/src/background/service-worker.ts
import { listVideos, matchTranscript } from "./api-client";
import type { MessageResponse, Transcript } from "../shared/types";

type Segment = { text: string; start: number; duration: number };
type ExtractResult = {
  _debug: string;
  segments?: Segment[];
  langCode?: string;
  isGenerated?: boolean;
};

const FETCH_TIMEOUT_MS = 10_000;

// ─── Header-spoof rules ──────────────────────────────────────────────────────
// Rewrite Origin/Referer on extension-initiated requests to YouTube endpoints
// so they look like they come from a real youtube.com page. Scoped to
// TAB_ID_NONE — user's own browsing untouched.
//
// HEADER_SPOOF_RULE_IDS at top of file: registerHeaderSpoofRules() runs during
// SW boot, before const bindings further down would be initialized (TDZ).

const HEADER_SPOOF_RULE_IDS = [1001, 1002];

async function registerHeaderSpoofRules(): Promise<void> {
  const headers = [
    { header: "origin", operation: chrome.declarativeNetRequest.HeaderOperation.SET, value: "https://www.youtube.com" },
    { header: "referer", operation: chrome.declarativeNetRequest.HeaderOperation.SET, value: "https://www.youtube.com/" },
  ];
  const rule = (id: number, urlFilter: string): chrome.declarativeNetRequest.Rule => ({
    id,
    priority: 1,
    action: {
      type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
      requestHeaders: headers,
    },
    condition: {
      urlFilter,
      resourceTypes: [chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST],
      tabIds: [chrome.tabs.TAB_ID_NONE],
    },
  });
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: HEADER_SPOOF_RULE_IDS,
      addRules: [
        rule(1001, "||youtube.com/youtubei/v1/player"),
        rule(1002, "||youtube.com/api/timedtext"),
      ],
    });
    console.log("[TS] header-spoof rules registered");
  } catch (e) {
    console.warn("[TS] header-spoof rules failed:", e);
  }
}

const LANDING_BASE = "https://timestitch.com";

chrome.runtime.onInstalled.addListener(async (details) => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  registerHeaderSpoofRules();

  // Post-install attribution: only on fresh install, not update/reload.
  // Stable-ID logic is duplicated from extension/src/shared/posthog.ts because
  // the SW can't import Vite/React-side modules cleanly.
  if (details.reason === "install") {
    try {
      const stored = await chrome.storage.local.get("timestitch_stable_id");
      let stableId = stored.timestitch_stable_id as string | undefined;
      if (!stableId) {
        stableId = `ts_${crypto.randomUUID()}`;
        await chrome.storage.local.set({ timestitch_stable_id: stableId });
      }
      chrome.tabs.create({
        url: `${LANDING_BASE}/installed?stable_id=${encodeURIComponent(stableId)}`,
      });
    } catch (e) {
      console.warn("[TS] post-install tab failed:", e);
    }
  }
});
chrome.runtime.onStartup.addListener(registerHeaderSpoofRules);
// Re-register on every SW wake — session rules don't survive SW termination.
registerHeaderSpoofRules();

// ─── Shared transcript helpers (SW context) ─────────────────────────────────
// fetchTranscriptInPage below cannot reuse these — executeScript only carries
// the function body to MAIN world, not module-scope closures. Helpers are
// duplicated inside it on purpose.

function pickBestTrack(tracks: any[], langs: string[]): any | null {
  for (const lang of langs) {
    const norm = lang.toLowerCase().split("-")[0];
    const manual = tracks.find((t) => t.languageCode?.toLowerCase().split("-")[0] === norm && t.kind !== "asr");
    if (manual) return manual;
    const generated = tracks.find((t) => t.languageCode?.toLowerCase().split("-")[0] === norm);
    if (generated) return generated;
  }
  return tracks[0] ?? null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

// Parses both timedtext formats. Attribute order is NOT guaranteed in either —
// extract attrs from the opening tag's attribute string independently.
function parseXml(xml: string): Segment[] {
  const segs: Segment[] = [];
  // Format 1: <text start="1.23" dur="0.56">…</text>  (standard timedtext)
  const re1 = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
  for (const m of xml.matchAll(re1)) {
    const sM = m[1].match(/\bstart="([^"]+)"/);
    const dM = m[1].match(/\bdur="([^"]+)"/);
    if (!sM || !dM) continue;
    const text = decodeEntities(m[2].replace(/<[^>]+>/g, "")).trim();
    if (text) segs.push({ text, start: parseFloat(sM[1]), duration: parseFloat(dM[1]) });
  }
  if (segs.length) return segs;
  // Format 2: <p t="1230" d="560">…</p>  (Android API, ms)
  const re2 = /<p\b([^>]*)>([\s\S]*?)<\/p>/g;
  for (const m of xml.matchAll(re2)) {
    const tM = m[1].match(/\bt="(\d+)"/);
    const dM = m[1].match(/\bd="(\d+)"/);
    if (!tM || !dM) continue;
    const text = decodeEntities(m[2].replace(/<[^>]+>/g, "")).trim();
    if (text) segs.push({ text, start: parseInt(tM[1], 10) / 1000, duration: parseInt(dM[1], 10) / 1000 });
  }
  return segs;
}

async function fetchTimedTextXml(baseUrl: string): Promise<{ xml: string | null; err: string }> {
  const delays = [0, 1500, 3000];
  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt]) await new Promise<void>((r) => setTimeout(r, delays[attempt]));
    try {
      const res = await fetch(baseUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (res.status === 429) continue;
      if (!res.ok) return { xml: null, err: `status=${res.status}` };
      const text = await res.text();
      if (text.length <= 10) return { xml: null, err: `empty len=${text.length}` };
      return { xml: text, err: "" };
    } catch (e) {
      return { xml: null, err: `threw=${String(e)}` };
    }
  }
  return { xml: null, err: "status=429 after retries" };
}

// Android InnerTube returns track baseUrls without exp=xpe bot-guard — primary path.
async function fetchTranscriptFromSW(videoId: string, preferredLangs: string[]): Promise<ExtractResult> {
  try {
    const res = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context: { client: { clientName: "ANDROID", clientVersion: "20.10.38" } },
        videoId,
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return { _debug: `sw-status=${res.status}` };
    const data = await res.json();
    const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!tracks?.length) return { _debug: `sw-no-tracks keys=${Object.keys(data ?? {}).join(",")}` };
    const track = pickBestTrack(tracks, preferredLangs);
    if (!track?.baseUrl) return { _debug: `sw-no-baseUrl tracks=${tracks.length}` };
    const { xml, err } = await fetchTimedTextXml(track.baseUrl);
    if (!xml) return { _debug: `sw-xml-failed err=${err}` };
    const segments = parseXml(xml);
    if (!segments.length) return { _debug: `sw-parse-empty xml_len=${xml.length}` };
    return {
      _debug: "sw-ok",
      segments,
      langCode: track.languageCode,
      isGenerated: track.kind === "asr",
    };
  } catch (e) {
    return { _debug: `sw-threw=${String(e)}` };
  }
}

// ─── Tab fallback (runs in MAIN world via executeScript) ────────────────────
// Self-contained — helpers re-declared inside because executeScript only
// carries this function body across the world boundary.
async function fetchTranscriptInPage(
  videoId: string,
  preferredLangs: string[],
): Promise<ExtractResult> {
  const FETCH_TIMEOUT_MS_INNER = 10_000;
  function pickBestTrack(tracks: any[], langs: string[]): any | null {
    for (const lang of langs) {
      const norm = lang.toLowerCase().split("-")[0];
      const manual = tracks.find((t) => t.languageCode?.toLowerCase().split("-")[0] === norm && t.kind !== "asr");
      if (manual) return manual;
      const generated = tracks.find((t) => t.languageCode?.toLowerCase().split("-")[0] === norm);
      if (generated) return generated;
    }
    return tracks[0] ?? null;
  }
  function decodeEntities(s: string): string {
    return s
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
  }
  function parseXml(xml: string): Segment[] {
    const segs: Segment[] = [];
    const re1 = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
    for (const m of xml.matchAll(re1)) {
      const sM = m[1].match(/\bstart="([^"]+)"/);
      const dM = m[1].match(/\bdur="([^"]+)"/);
      if (!sM || !dM) continue;
      const text = decodeEntities(m[2].replace(/<[^>]+>/g, "")).trim();
      if (text) segs.push({ text, start: parseFloat(sM[1]), duration: parseFloat(dM[1]) });
    }
    if (segs.length) return segs;
    const re2 = /<p\b([^>]*)>([\s\S]*?)<\/p>/g;
    for (const m of xml.matchAll(re2)) {
      const tM = m[1].match(/\bt="(\d+)"/);
      const dM = m[1].match(/\bd="(\d+)"/);
      if (!tM || !dM) continue;
      const text = decodeEntities(m[2].replace(/<[^>]+>/g, "")).trim();
      if (text) segs.push({ text, start: parseInt(tM[1], 10) / 1000, duration: parseInt(dM[1], 10) / 1000 });
    }
    return segs;
  }
  async function fetchXml(baseUrl: string): Promise<{ xml: string | null; err: string }> {
    const delays = [0, 1500, 3000];
    for (let attempt = 0; attempt < delays.length; attempt++) {
      if (delays[attempt]) await new Promise<void>((r) => setTimeout(r, delays[attempt]));
      try {
        const res = await fetch(baseUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS_INNER) });
        if (res.status === 429) continue;
        if (!res.ok) return { xml: null, err: `status=${res.status}` };
        const text = await res.text();
        if (text.length <= 10) return { xml: null, err: `empty len=${text.length}` };
        return { xml: text, err: "" };
      } catch (e) {
        return { xml: null, err: `threw=${String(e)}` };
      }
    }
    return { xml: null, err: "status=429 after retries" };
  }

  // Strategy 1: Android API
  try {
    const res = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context: { client: { clientName: "ANDROID", clientVersion: "20.10.38" } },
        videoId,
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS_INNER),
    });
    if (res.ok) {
      const data = await res.json();
      const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (tracks?.length) {
        const track = pickBestTrack(tracks, preferredLangs);
        if (track?.baseUrl) {
          const { xml, err } = await fetchXml(track.baseUrl);
          if (xml) {
            const segments = parseXml(xml);
            if (segments.length) {
              return {
                _debug: "tab-android-ok",
                segments,
                langCode: track.languageCode,
                isGenerated: track.kind === "asr",
              };
            }
            return { _debug: `tab-android-parse-empty xml_len=${xml.length}` };
          }
          return { _debug: `tab-android-xml-failed err=${err}` };
        }
        return { _debug: `tab-android-no-baseUrl tracks=${tracks.length}` };
      }
      return { _debug: `tab-android-no-tracks keys=${Object.keys(data ?? {}).join(",")}` };
    }
  } catch {
    // fall through to strategy 2
  }

  // Strategy 2: ytInitialPlayerResponse already injected on watch page.
  const yt = (window as any).ytInitialPlayerResponse;
  const ytiprTracks = yt?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (ytiprTracks?.length) {
    const track = pickBestTrack(ytiprTracks, preferredLangs);
    if (track?.baseUrl) {
      const { xml, err } = await fetchXml(track.baseUrl);
      if (xml) {
        const segments = parseXml(xml);
        if (segments.length) {
          return {
            _debug: "tab-ytipr-ok",
            segments,
            langCode: track.languageCode,
            isGenerated: track.kind === "asr",
          };
        }
        return { _debug: `tab-ytipr-parse-empty xml_len=${xml.length}` };
      }
      return { _debug: `tab-ytipr-xml-failed err=${err}` };
    }
  }

  return { _debug: "tab-no-tracks" };
}

// ─── Tab discovery ──────────────────────────────────────────────────────────
async function getYouTubeTabId(): Promise<number | null> {
  // currentWindow: true is undefined in service worker context — use lastFocusedWindow.
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (active?.id && active.url?.includes("youtube.com")) return active.id;
  const [any] = await chrome.tabs.query({ url: "*://*.youtube.com/*" });
  return any?.id ?? null;
}

// ─── Message routing ────────────────────────────────────────────────────────
function languageLabel(code: string): string {
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "language" });
    return dn.of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

function buildTranscript(extracted: ExtractResult): Transcript | null {
  if (!extracted.segments?.length) return null;
  const langCode = extracted.langCode ?? "en";
  return {
    language_code: langCode,
    language_label: languageLabel(langCode),
    is_generated: extracted.isGenerated ?? true,
    segments: extracted.segments,
  };
}

async function handleFetchTranscript(videoId: string, preferredLangs: string[]): Promise<Transcript | null> {
  let extracted = await fetchTranscriptFromSW(videoId, preferredLangs);
  console.log("[TS]", videoId, extracted._debug);
  if (extracted.segments?.length) return buildTranscript(extracted);

  // Fallback: piggy-back on a YouTube tab if SW path returned nothing.
  const tabId = await getYouTubeTabId();
  if (!tabId) {
    console.warn("[TS] no YouTube tab for fallback,", videoId);
    return null;
  }
  const res = await chrome.scripting.executeScript({
    target: { tabId },
    func: fetchTranscriptInPage,
    args: [videoId, preferredLangs],
    world: "MAIN" as chrome.scripting.ExecutionWorld,
  });
  extracted = res[0]?.result ?? extracted;
  console.log("[TS]", videoId, extracted._debug);
  return buildTranscript(extracted);
}

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
            data = await handleFetchTranscript(
              msg.videoId as string,
              (msg.preferredLangs as string[] | undefined) ?? ["en", "hi"],
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
        console.error("[TS] error:", message);
        sendResponse({ ok: false, error: message } satisfies MessageResponse<never>);
      }
    })();
    return true;
  },
);
