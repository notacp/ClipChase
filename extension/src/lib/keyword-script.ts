/**
 * Classify a search keyword by script.
 * - "latin": only ASCII letters / digits / common punctuation
 * - "devanagari": only Devanagari (Hindi)
 * - "mixed": both Latin and Devanagari present (e.g., Hinglish)
 * - "other": anything else (Cyrillic, CJK, Arabic, etc.)
 */
export type KeywordScript = "latin" | "devanagari" | "mixed" | "other";

const DEVANAGARI_RE = /[ऀ-ॿ]/;
const LATIN_RE = /[A-Za-z]/;

export function detectKeywordScript(keyword: string): KeywordScript {
  const trimmed = keyword.trim();
  if (!trimmed) return "other";
  const hasDevanagari = DEVANAGARI_RE.test(trimmed);
  const hasLatin = LATIN_RE.test(trimmed);
  if (hasDevanagari && hasLatin) return "mixed";
  if (hasDevanagari) return "devanagari";
  if (hasLatin) return "latin";
  return "other";
}
