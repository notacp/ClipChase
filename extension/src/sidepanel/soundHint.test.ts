import { describe, expect, it } from "vitest";
import { soundHintFor } from "./soundHint";

describe("soundHintFor", () => {
  it("suggests spoken words for sound searches seen in prod", () => {
    expect(soundHintFor("burp")).toContain("excuse me");
    expect(soundHintFor("Burping")).toContain("excuse me");
    expect(soundHintFor("farted")).toContain("excuse me");
    expect(soundHintFor("gassy")).not.toBeNull();
    expect(soundHintFor("हिचकी")).not.toBeNull();
    expect(soundHintFor("peido")).not.toBeNull(); // pt
  });

  it("leaves ordinary searches alone", () => {
    for (const kw of ["wedgie", "pedofilo", "electron", "crack commandments", "partner", "burpee workout"]) {
      expect(soundHintFor(kw)).toBeNull();
    }
  });

  it("never suggests the word already searched", () => {
    expect(soundHintFor("hiccups")).not.toContain("hiccups");
  });
});
