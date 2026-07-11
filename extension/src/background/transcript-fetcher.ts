// extension/src/background/transcript-fetcher.ts
import type { FailureReason } from "../shared/types";

// Maps the `_debug` string from the last attempted transcript-fetch strategy
// to a stable FailureReason enum value. The last element in `debugStrings`
// represents the final fallback's outcome — that's what the user saw.
// Order matters: status= must check before xml-failed status=429 to avoid
// misclassifying an InnerTube /player 429 as an XML 429.
export function classifyFailure(debugStrings: string[]): FailureReason {
  const last = debugStrings[debugStrings.length - 1] ?? "";
  // SW debug strings are prefixed `sw-<client>-`. Strip for matching.
  const m = last.match(/^sw-[a-z0-9_]+-(.+)$/);
  const body = m ? m[1] : last.replace(/^sw-/, "");
  // Watch-page timedtext URLs are WEB-client-signed and need a proof-of-origin
  // token (`pot`) we don't have — YouTube answers 200 with an empty body. The
  // captions exist; only this fetch route is gated. Keep it out of
  // xml_status_err so the UI can say "blocked by YouTube" instead of implying
  // the video has no transcript.
  if (last.startsWith("sw-watch-xml-failed") && body.includes("err=empty")) {
    return "pot_blocked";
  }
  if (body.startsWith("status=")) return "sw_blocked";
  // "no-captions": the player response was playable/parsed but exposed no
  // caption tracks — the video genuinely has none (Shorts and live streams,
  // mostly). Distinct from "no-tracks", where we can't rule out bot-gating.
  if (body.startsWith("no-captions")) return "no_captions";
  if (body.startsWith("parse-failed")) return "sw_no_tracks";
  if (body.startsWith("no-tracks")) return "sw_no_tracks";
  if (body.startsWith("no-baseUrl")) return "sw_no_baseurl";
  if (body.startsWith("xml-failed") && body.includes("429")) return "xml_429";
  if (body.startsWith("xml-failed")) return "xml_status_err";
  if (body.startsWith("parse-empty")) return "parse_empty";
  if (body.startsWith("threw")) return "sw_threw";
  if (body === "budget") return "budget_exceeded";
  return "unknown";
}

// Extracts the session's `visitorData` token from watch-page HTML. Anonymous
// InnerTube calls without visitorData get bot-gated under burst load (all
// clients return no-tracks); replaying the ANDROID client WITH the watch
// page's visitorData ungates it, and ANDROID baseUrls don't require the
// proof-of-origin token that blocks the watch page's own caption URLs.
export function extractVisitorData(html: string): string | null {
  return html.match(/"visitorData":"([^"]+)"/)?.[1] ?? null;
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
