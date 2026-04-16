// extension/src/background/transcript-fetcher.ts
import type { TranscriptSegment } from "../shared/types";

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
