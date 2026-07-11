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

// Human-readable failure summary for the search UI, e.g. ["3 without captions",
// "2 blocked by YouTube"]. Buckets are user-facing groups, not the raw enum:
// telling a user "xml_status_err" helps nobody, but "blocked by YouTube" tells
// them the transcript exists and the tool — not their keyword — is the problem.
const FAILURE_GROUP_LABELS: [FailureReason[], (n: number) => string][] = [
  [["no_captions"], (n) => `${n} without captions`],
  [["pot_blocked"], (n) => `${n} blocked by YouTube`],
  [["xml_429", "sw_blocked"], (n) => `${n} rate-limited`],
  [["budget_exceeded"], (n) => `${n} timed out`],
];

export function describeFailureCounts(
  counts: Partial<Record<FailureReason, number>>,
): string[] {
  const parts: string[] = [];
  const grouped = new Set<FailureReason>();
  for (const [reasons, label] of FAILURE_GROUP_LABELS) {
    const n = reasons.reduce((sum, r) => sum + (counts[r] ?? 0), 0);
    reasons.forEach((r) => grouped.add(r));
    if (n > 0) parts.push(label(n));
  }
  const other = (Object.entries(counts) as [FailureReason, number][])
    .filter(([reason]) => !grouped.has(reason))
    .reduce((sum, [, n]) => sum + n, 0);
  if (other > 0) parts.push(`${other} failed`);
  return parts;
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
