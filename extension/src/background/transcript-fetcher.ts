// extension/src/background/transcript-fetcher.ts
import type { FailureReason, TranscriptSegment } from "../shared/types";

export interface CaptionTrack {
  languageCode: string;
  baseUrl: string;
  kind?: string;
  name?: { simpleText?: string };
}

export function normalizeLanguageCode(code: string): string {
  return (code ?? "").toLowerCase().split("-")[0];
}

export function pickTrack(
  tracks: CaptionTrack[],
  preferredLangs: string[]
): CaptionTrack | null {
  for (const lang of preferredLangs) {
    const manual = tracks.find(
      (t) => normalizeLanguageCode(t.languageCode) === lang && t.kind !== "asr"
    );
    if (manual) return manual;

    const generated = tracks.find(
      (t) => normalizeLanguageCode(t.languageCode) === lang
    );
    if (generated) return generated;
  }
  return null;
}

// Maps the `_debug` string from the last attempted transcript-fetch strategy
// to a stable FailureReason enum value. The last element in `debugStrings`
// represents the final fallback's outcome — that's what the user saw.
// Order matters: status= must check before xml-failed status=429 to avoid
// misclassifying an InnerTube /player 429 as an XML 429.
export function classifyFailure(debugStrings: string[]): FailureReason {
  const last = debugStrings[debugStrings.length - 1] ?? "";
  if (last === "no-youtube-tab") return "no_tab";
  if (last.startsWith("tab-threw")) return "tab_threw";
  // The tab fallback's Android-client subroutine also hits InnerTube /player;
  // a "no-baseUrl" outcome there is the same YouTube-side issue as the SW
  // path's sw_no_baseurl (no caption track exposed for the video), not a
  // DOM/scripting failure of the tab itself. Route it to the same bucket so
  // breakdowns over failure_reason don't lump it into the generic tab_failed.
  if (last.startsWith("tab-android-no-baseUrl")) return "sw_no_baseurl";
  if (last.startsWith("tab-")) return "tab_failed";
  // SW debug strings are prefixed `sw-<client>-`. Strip for matching.
  const m = last.match(/^sw-[a-z0-9_]+-(.+)$/);
  const body = m ? m[1] : last.replace(/^sw-/, "");
  if (body.startsWith("status=")) return "sw_blocked";
  if (body.startsWith("no-tracks")) return "sw_no_tracks";
  if (body.startsWith("no-baseUrl")) return "sw_no_baseurl";
  if (body.startsWith("xml-failed") && body.includes("429")) return "xml_429";
  if (body.startsWith("xml-failed")) return "xml_status_err";
  if (body.startsWith("parse-empty")) return "parse_empty";
  if (body.startsWith("threw")) return "sw_threw";
  if (body === "budget") return "budget_exceeded";
  return "unknown";
}

// Extracts the `ytInitialPlayerResponse` object embedded in a watch-page's
// HTML. YouTube only includes `captions` in this object when the request
// carries a logged-in session, which is why we fetch the page with the user's
// cookies instead of an anonymous InnerTube call. Brace-matches from the first
// `{` after the marker, respecting string literals so braces/quotes inside
// caption titles don't end the object early.
export function extractPlayerResponse(html: string): any | null {
  const marker = "ytInitialPlayerResponse";
  const markerIdx = html.indexOf(marker);
  if (markerIdx === -1) return null;
  const start = html.indexOf("{", markerIdx);
  if (start === -1) return null;

  let depth = 0;
  let inStr = false;
  let quote = "";
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === quote) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = true;
      quote = c;
    } else if (c === "{") {
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export function parseSegments(xml: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const re = new RegExp('<text start="([^"]+)" dur="([^"]+)"[^>]*>([\\s\\S]*?)<\\/text>', "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const text = m[3]
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\n/g, " ")
      .trim();
    if (text) {
      segments.push({ text, start: parseFloat(m[1]), duration: parseFloat(m[2]) });
    }
  }
  return segments;
}
