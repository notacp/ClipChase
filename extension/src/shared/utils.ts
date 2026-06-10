import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { FailureReason } from "./types";
import { TimeRange } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// Returns the FailureReason with the highest count, or null when no failures.
// Tie-break: insertion order (Object.entries iterates in insertion order).
export function dominantReason(
  counts: Partial<Record<FailureReason, number>>,
): FailureReason | null {
  let top: FailureReason | null = null;
  let topCount = 0;
  for (const [reason, count] of Object.entries(counts) as [FailureReason, number][]) {
    if (count > topCount) {
      top = reason;
      topCount = count;
    }
  }
  return top;
}

// Users paste keywords with wrapping quotes ("startup"), trailing punctuation
// ("hello.") or stray whitespace. The matcher's word-boundary regex treats
// those characters literally, so they guarantee zero results. Strip edge
// punctuation/quotes and collapse whitespace; never touch interior characters
// (apostrophes and hyphens inside words must survive: "don't", "re-render").
const EDGE_PUNCTUATION_RE = /^[\s.,!?;:…¡¿"'“”‘’«»()[\]{}]+|[\s.,!?;:…¡¿"'“”‘’«»()[\]{}]+$/g;

export function cleanKeyword(raw: string): string {
  const cleaned = raw.replace(EDGE_PUNCTUATION_RE, "").replace(/\s+/g, " ");
  // All-punctuation input cleans to "" — fall back to the trimmed original so
  // validation sees what the user sees instead of a confusing "enter a keyword".
  return cleaned || raw.trim();
}

export function getPublishedAfterDate(range: TimeRange): string | null {
  if (range === "all") return null;
  const now = new Date();
  switch (range) {
    case "7d":
      now.setDate(now.getDate() - 7);
      break;
    case "30d":
      now.setDate(now.getDate() - 30);
      break;
    case "6m":
      now.setMonth(now.getMonth() - 6);
      break;
    case "1y":
      now.setFullYear(now.getFullYear() - 1);
      break;
  }
  return now.toISOString();
}
