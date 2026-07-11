import { describe, it, expect } from "vitest";
import { dominantReason, cleanKeyword, describeFailureCounts, buildMomentLink } from "./utils";
import type { FailureReason } from "./types";

describe("cleanKeyword", () => {
  it("trims whitespace", () => {
    expect(cleanKeyword("  startup  ")).toBe("startup");
  });

  it("strips wrapping straight quotes", () => {
    expect(cleanKeyword('"startup"')).toBe("startup");
    expect(cleanKeyword("'startup'")).toBe("startup");
  });

  it("strips wrapping smart quotes", () => {
    expect(cleanKeyword("“machine learning”")).toBe("machine learning");
  });

  it("strips trailing punctuation", () => {
    expect(cleanKeyword("hello.")).toBe("hello");
    expect(cleanKeyword("really?!")).toBe("really");
  });

  it("collapses internal whitespace", () => {
    expect(cleanKeyword("machine   learning")).toBe("machine learning");
  });

  it("keeps interior apostrophes and hyphens", () => {
    expect(cleanKeyword("don't")).toBe("don't");
    expect(cleanKeyword("re-render")).toBe("re-render");
  });

  it("falls back to trimmed input when cleaning empties it", () => {
    expect(cleanKeyword(" ?! ")).toBe("?!");
  });

  it("leaves clean keywords untouched", () => {
    expect(cleanKeyword("startup")).toBe("startup");
    expect(cleanKeyword("स्टार्टअप")).toBe("स्टार्टअप");
  });
});

describe("dominantReason", () => {
  it("returns null for empty counts", () => {
    expect(dominantReason({})).toBeNull();
  });

  it("returns the only reason when one is present", () => {
    expect(dominantReason({ no_tab: 7 })).toBe("no_tab");
  });

  it("picks the reason with the highest count", () => {
    const counts: Partial<Record<FailureReason, number>> = {
      sw_no_tracks: 3,
      no_tab: 10,
      sw_blocked: 2,
    };
    expect(dominantReason(counts)).toBe("no_tab");
  });

  it("on tie, returns the first-inserted reason", () => {
    const counts: Partial<Record<FailureReason, number>> = {};
    counts.sw_no_tracks = 5;
    counts.no_tab = 5;
    expect(dominantReason(counts)).toBe("sw_no_tracks");
  });

  it("ignores zero-count entries", () => {
    expect(dominantReason({ sw_no_tracks: 0, no_tab: 1 })).toBe("no_tab");
  });

  it("treats no_tab with count 1 and parse_empty with count 1 deterministically by insertion", () => {
    const counts: Partial<Record<FailureReason, number>> = {};
    counts.parse_empty = 1;
    counts.no_tab = 1;
    expect(dominantReason(counts)).toBe("parse_empty");
  });
});

describe("describeFailureCounts", () => {
  it("returns empty for no failures", () => {
    expect(describeFailureCounts({})).toEqual([]);
  });

  it("labels the main user-facing groups", () => {
    expect(
      describeFailureCounts({ no_captions: 3, pot_blocked: 2, xml_429: 1, sw_blocked: 1 }),
    ).toEqual(["3 without captions", "3 blocked by YouTube", "1 rate-limited"]);
  });

  it("buckets unknown/technical reasons into a generic failed count", () => {
    expect(describeFailureCounts({ sw_threw: 1, unknown: 2 })).toEqual(["3 failed"]);
  });

  it("labels timeouts", () => {
    expect(describeFailureCounts({ budget_exceeded: 4 })).toEqual(["4 timed out"]);
  });
});

describe("buildMomentLink", () => {
  it("builds the share URL with floored timestamp, quote, and keyword", () => {
    const url = buildMomentLink({ videoId: "abc123XYZ_-", start: 83.7, quote: "he got the hiccups mid sentence", keyword: "hiccup" });
    expect(url).toBe("https://www.clipchase.xyz/m/abc123XYZ_-?t=83&x=he+got+the+hiccups+mid+sentence&k=hiccup");
  });

  it("caps the quote at 200 chars and collapses whitespace", () => {
    const url = buildMomentLink({ videoId: "v", start: 0, quote: "  a  ".repeat(100) });
    const x = new URL(url).searchParams.get("x")!;
    expect(x.length).toBeLessThanOrEqual(200);
    expect(x).not.toMatch(/\s{2}/);
  });

  it("omits empty quote and keyword params", () => {
    const url = buildMomentLink({ videoId: "v", start: 5, quote: "   " });
    expect(url).toBe("https://www.clipchase.xyz/m/v?t=5");
  });

  it("clamps negative timestamps to zero", () => {
    expect(new URL(buildMomentLink({ videoId: "v", start: -3, quote: "q" })).searchParams.get("t")).toBe("0");
  });

  it("caps keyword at 80 chars to match the share page's parseMoment", () => {
    const url = buildMomentLink({ videoId: "v", start: 0, quote: "q", keyword: "k".repeat(120) });
    expect(new URL(url).searchParams.get("k")).toHaveLength(80);
  });
});
