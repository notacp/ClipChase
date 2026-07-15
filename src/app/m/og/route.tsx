import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { formatTimestamp } from "../../lib";

export const runtime = "edge";

// OG card for shared moments: the quote IS the card. In Discord/WhatsApp/X the
// unfurl does the product's job before anyone clicks. Lives at /m/og (static
// segment, so it never collides with /m/[videoId] — "og" also fails the video
// id length check).

// Plus Jakarta Sans 800 ships as a committed TTF next to this route (Satori
// can't parse woff2, and scraping Google's CSS at request time both added
// latency to every unfurl and broke whenever their serialization changed).
// Module-scope promise: one load per isolate, awaited per request.
const fontPromise: Promise<ArrayBuffer | null> = fetch(
  new URL("./PlusJakartaSans-ExtraBold.ttf", import.meta.url),
)
  .then((r) => r.arrayBuffer())
  .catch(() => null);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const quote = (searchParams.get("x") ?? "").slice(0, 220).trim();
  const channel = (searchParams.get("c") ?? "").slice(0, 60).trim();
  const t = Math.max(0, Math.floor(Number(searchParams.get("t") ?? "0")) || 0);

  const font = await fontPromise;
  const display = quote ? `“${quote}”` : "Jump to the exact moment";
  // Long quotes get a smaller size so the card never clips.
  const fontSize = display.length > 140 ? 44 : display.length > 80 ? 54 : 64;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#fafaf9",
          padding: "64px 72px",
          fontFamily: font ? "Jakarta" : "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize,
            fontWeight: 800,
            color: "#141412",
            letterSpacing: "-0.03em",
            lineHeight: 1.15,
          }}
        >
          {display}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", fontSize: 28, color: "#5a5754" }}>
            <span style={{ color: "#FF4500", fontWeight: 800 }}>{formatTimestamp(t)}</span>
            {channel ? <span style={{ marginLeft: 14 }}>· {channel}</span> : null}
          </div>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 800, color: "#141412" }}>
            Clip<span style={{ color: "#FF4500" }}>Chase</span>
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            left: 0,
            bottom: 0,
            width: "100%",
            height: 10,
            background: "#FF4500",
            display: "flex",
          }}
        />
      </div>
    ),
    {
      width: 1200,
      height: 630,
      ...(font
        ? { fonts: [{ name: "Jakarta", data: font, weight: 800 as const, style: "normal" as const }] }
        : {}),
    },
  );
}
