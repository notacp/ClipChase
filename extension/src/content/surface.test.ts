import { describe, it, expect } from "vitest";
import { surfaceForPath } from "./surface";

describe("surfaceForPath", () => {
  it("matches every channel URL shape YouTube still serves", () => {
    expect(surfaceForPath("/@veritasium")).toBe("channel_page");
    expect(surfaceForPath("/@veritasium/videos")).toBe("channel_page");
    expect(surfaceForPath("/channel/UCHnyfMqiRRG1u-2MsSQLbXA")).toBe("channel_page");
    expect(surfaceForPath("/channel/UCHnyfMqiRRG1u-2MsSQLbXA/shorts")).toBe("channel_page");
    expect(surfaceForPath("/c/Veritasium")).toBe("channel_page");
    expect(surfaceForPath("/user/1veritasium")).toBe("channel_page");
    expect(surfaceForPath("/@dots.and.dashes")).toBe("channel_page");
  });

  it("matches the watch page and nothing that merely starts with it", () => {
    expect(surfaceForPath("/watch")).toBe("watch_page");
    // /watch_videos is a real YouTube path (anonymous playlists) and is not a
    // watch page — a prefix match here would inject on the wrong surface.
    expect(surfaceForPath("/watch_videos")).toBeNull();
  });

  it("stays off every surface we do not own", () => {
    for (const path of [
      "/",
      "/feed/subscriptions",
      "/results",
      "/playlist",
      "/shorts/abc123",
      "/premium",
      "/account",
      "/gaming",
      "/channels",
      "/cart",
      "/user",
      "/channel",
    ]) {
      expect(surfaceForPath(path), path).toBeNull();
    }
  });

  it("does not treat a bare prefix as a channel", () => {
    // "/channel" and "/user" with no id are YouTube's own pages, not channels.
    expect(surfaceForPath("/channel/")).toBeNull();
    expect(surfaceForPath("/user/")).toBeNull();
    expect(surfaceForPath("/@")).toBeNull();
  });
});
