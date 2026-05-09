import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "ClipChase — Ctrl+F for YouTube";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ACCENT = "#FF4500";
const BG = "#0e0e0e";
const TEXT = "#ebebeb";
const SUB = "#888";

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: BG,
          color: TEXT,
          padding: "80px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 16,
              background: ACCENT,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="40" height="40" viewBox="0 0 12 12" fill="none">
              <circle cx="5" cy="5" r="3.2" stroke="white" strokeWidth="1.4" />
              <path
                d="M7.2 7.2L10.2 10.2"
                stroke="white"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <span
            style={{ fontSize: 44, fontWeight: 800, letterSpacing: "-0.03em" }}
          >
            ClipChase
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 108,
              fontWeight: 800,
              letterSpacing: "-0.045em",
              lineHeight: 1.0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span>Ctrl+F for</span>
            <span style={{ color: ACCENT }}>YouTube.</span>
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: 32,
              color: SUB,
              fontWeight: 400,
              maxWidth: 900,
              lineHeight: 1.4,
            }}
          >
            Search any YouTube channel by phrase. Get every video that mentions
            it with exact, clickable timestamps.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 22,
            color: SUB,
          }}
        >
          <span>clipchase.xyz</span>
          <span style={{ color: ACCENT, fontWeight: 600 }}>
            Free Chrome extension
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
