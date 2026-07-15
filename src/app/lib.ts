// Shared pure helpers and constants. No "use client" directive so server
// components and the edge OG route can import from here.

export const ACCENT = "#FF4500";
export const ACCENT_HOVER = "#E03A00";
export const MONO = "var(--font-mono), 'JetBrains Mono', monospace";

export const CHROME_STORE_BASE =
  process.env.NEXT_PUBLIC_CHROME_STORE_URL ??
  "https://chromewebstore.google.com/detail/ojgacfpcibnmggkenjndnogpfglmhefn";

export function buildInstallUrl(medium: string, source = "landing"): string {
  const params = new URLSearchParams({
    utm_source: source,
    utm_medium: medium,
    utm_campaign: "organic",
  });
  return `${CHROME_STORE_BASE}?${params.toString()}`;
}

export type Theme = {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  sub: string;
  muted: string;
  popupBg: string;
  popupBorder: string;
  popupSurface: string;
  popupText: string;
  popupSub: string;
  inputBg: string;
  inputBorder: string;
  thumbBg: string;
};

export function makeTheme(dark: boolean): Theme {
  return dark
    ? {
        bg: "#0e0e0e",
        surface: "#161616",
        surface2: "#1e1e1e",
        border: "#272727",
        text: "#ebebeb",
        sub: "#888",
        muted: "#444",
        popupBg: "#141414",
        popupBorder: "#2a2a2a",
        popupSurface: "#1c1c1c",
        popupText: "#e8e8e8",
        popupSub: "#888",
        inputBg: "#1c1c1c",
        inputBorder: "#2a2a2a",
        thumbBg: "#1c1c1c",
      }
    : {
        bg: "#fafaf9",
        surface: "#f4f3f1",
        surface2: "#eeede9",
        border: "#e2e0db",
        text: "#141412",
        sub: "#5a5754",
        muted: "#aaa9a3",
        popupBg: "#ffffff",
        popupBorder: "#e2e0db",
        popupSurface: "#f7f6f4",
        popupText: "#141412",
        popupSub: "#6b6860",
        inputBg: "#f4f3f1",
        inputBorder: "#e2e0db",
        thumbBg: "#e8e6e2",
      };
}

export function formatTimestamp(t: number): string {
  const mins = Math.floor(t / 60);
  const secs = t % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

// Splits text on every case-insensitive occurrence of keyword. Split with a
// capture group keeps the matches: odd indices are hits. Render wrappers
// (<strong>, <mark>) live at each call site.
export function splitOnKeyword(
  text: string,
  keyword: string,
): { text: string; hit: boolean }[] {
  const key = keyword.trim();
  if (!key) return [{ text, hit: false }];
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text
    .split(new RegExp(`(${escaped})`, "gi"))
    .map((part, i) => ({ text: part, hit: i % 2 === 1 }))
    .filter((p) => p.text.length > 0);
}
