// extension/src/background/transcript-fetcher.test.ts
import { describe, it, expect } from "vitest";
import { classifyFailure, extractPlayerResponse, extractVisitorData } from "./transcript-fetcher";

// ── extractPlayerResponse ─────────────────────────────────────────────────────

describe("extractPlayerResponse", () => {
  it("extracts the player response from a watch-page assignment", () => {
    const html = `<script>var ytInitialPlayerResponse = {"videoDetails":{"videoId":"abc"},"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"languageCode":"en","baseUrl":"https://x/en"}]}}};var meta=1;</script>`;
    const pr = extractPlayerResponse(html);
    expect(pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.[0]?.baseUrl).toBe("https://x/en");
  });

  it("does not stop early on braces inside string values", () => {
    const html = `ytInitialPlayerResponse = {"a":"text with } brace {","b":2};`;
    const pr = extractPlayerResponse(html);
    expect(pr?.a).toBe("text with } brace {");
    expect(pr?.b).toBe(2);
  });

  it("handles escaped quotes inside strings", () => {
    const html = `ytInitialPlayerResponse = {"t":"she said \\"hi\\" }","n":3};`;
    const pr = extractPlayerResponse(html);
    expect(pr?.t).toBe('she said "hi" }');
    expect(pr?.n).toBe(3);
  });

  it("returns null when the marker is absent", () => {
    expect(extractPlayerResponse("<html>no player here</html>")).toBeNull();
  });

  it("returns null on malformed JSON", () => {
    expect(extractPlayerResponse("ytInitialPlayerResponse = {bad json")).toBeNull();
  });
});

// ── classifyFailure ───────────────────────────────────────────────────────────

describe("classifyFailure", () => {
  it("classifies sw_blocked for InnerTube non-ok status", () => {
    expect(classifyFailure(["sw-android-status=403"])).toBe("sw_blocked");
    expect(classifyFailure(["sw-ios-status=429"])).toBe("sw_blocked");
  });

  it("classifies sw_no_tracks", () => {
    expect(classifyFailure(["sw-android-no-tracks keys=playabilityStatus"])).toBe("sw_no_tracks");
  });

  it("classifies no_captions when the player was playable/parsed but exposed no tracks", () => {
    expect(classifyFailure(["sw-android-no-captions keys=playabilityStatus,streamingData"])).toBe("no_captions");
    expect(classifyFailure(["sw-android-no-captions keys=x", "sw-watch-no-captions"])).toBe("no_captions");
  });

  it("routes watch-page parse failure to the ambiguous sw_no_tracks bucket", () => {
    expect(classifyFailure(["sw-android-no-tracks keys=x", "sw-watch-parse-failed"])).toBe("sw_no_tracks");
  });

  it("classifies sw_no_baseurl", () => {
    expect(classifyFailure(["sw-ios-no-baseUrl tracks=2"])).toBe("sw_no_baseurl");
  });

  it("classifies xml_429 when xml-failed err contains 429", () => {
    expect(classifyFailure(["sw-android-xml-failed err=status=429 after retries"])).toBe("xml_429");
  });

  it("classifies xml_status_err for other xml-failed statuses", () => {
    expect(classifyFailure(["sw-web_embedded_player-xml-failed err=status=500"])).toBe("xml_status_err");
    expect(classifyFailure(["sw-android-xml-failed err=threw=TypeError"])).toBe("xml_status_err");
  });

  it("classifies parse_empty", () => {
    expect(classifyFailure(["sw-android-parse-empty xml_len=42"])).toBe("parse_empty");
  });

  it("classifies sw_threw", () => {
    expect(classifyFailure(["sw-ios-threw=AbortError"])).toBe("sw_threw");
  });

  it("classifies unknown for unrecognised debug strings", () => {
    expect(classifyFailure([])).toBe("unknown");
    expect(classifyFailure(["something-else"])).toBe("unknown");
  });

  it("uses only the last entry for classification", () => {
    expect(classifyFailure(["sw-android-status=403", "sw-ios-status=403", "sw-web_embedded_player-no-tracks keys=x"])).toBe("sw_no_tracks");
  });

  it("classifies pot_blocked when the watch-page baseUrl returns an empty body", () => {
    // Watch page found caption tracks but its WEB-client timedtext URL requires
    // a proof-of-origin token — YouTube answers 200 with an empty body.
    expect(
      classifyFailure(["sw-android-no-tracks keys=x", "sw-watch-xml-failed err=empty len=0"]),
    ).toBe("pot_blocked");
  });

  it("keeps InnerTube-client empty xml in xml_status_err (not pot_blocked)", () => {
    expect(classifyFailure(["sw-android-xml-failed err=empty len=0"])).toBe("xml_status_err");
  });
});

// ── extractVisitorData ────────────────────────────────────────────────────────

describe("extractVisitorData", () => {
  it("extracts visitorData from watch-page HTML", () => {
    const html = `<script>ytcfg.set({"INNERTUBE_CONTEXT":{"client":{"visitorData":"CgtXUTZsa0NqZmFsWSiF%3D%3D","hl":"en"}}});</script>`;
    expect(extractVisitorData(html)).toBe("CgtXUTZsa0NqZmFsWSiF%3D%3D");
  });

  it("returns null when absent", () => {
    expect(extractVisitorData("<html>nothing</html>")).toBeNull();
  });
});
