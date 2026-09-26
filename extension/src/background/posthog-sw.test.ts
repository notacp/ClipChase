import { afterEach, describe, expect, it, vi } from "vitest";
import { swOs } from "./posthog-sw";

const nav = (platform: string | undefined, userAgent = "") =>
  vi.stubGlobal("navigator", {
    userAgent,
    userAgentData: platform === undefined ? undefined : { platform },
  });

afterEach(() => vi.unstubAllGlobals());

describe("swOs", () => {
  it("uses userAgentData and matches posthog-js naming", () => {
    nav("macOS");
    expect(swOs()).toBe("Mac OS X");
    nav("Chrome OS");
    expect(swOs()).toBe("Chrome OS");
    nav("Windows");
    expect(swOs()).toBe("Windows");
  });

  it("falls back to the user agent string", () => {
    nav(undefined, "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) Chrome/151");
    expect(swOs()).toBe("Chrome OS");
    nav("", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/151");
    expect(swOs()).toBe("Windows");
    nav(undefined, "");
    expect(swOs()).toBeNull();
  });
});
