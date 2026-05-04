"use client";

import { useState } from "react";
import { Sun, Moon, ArrowRight } from "lucide-react";
import posthog from "posthog-js";
import Link from "next/link";

const ACCENT = "#FF4500";
const MONO = "var(--font-mono), 'JetBrains Mono', monospace";

const CHROME_STORE_BASE =
  process.env.NEXT_PUBLIC_CHROME_STORE_URL ??
  "https://chromewebstore.google.com/detail/ojgacfpcibnmggkenjndnogpfglmhefn";

function buildInstallUrl(location: string): string {
  const params = new URLSearchParams({
    utm_source: "landing",
    utm_medium: location,
    utm_campaign: "organic",
  });
  return `${CHROME_STORE_BASE}?${params.toString()}`;
}

function handleCtaClick(location: string) {
  try {
    localStorage.setItem(
      "ts_pre_install_source",
      JSON.stringify({
        location,
        clicked_at: Date.now(),
        referrer: document.referrer || null,
        landing_distinct_id: posthog.get_distinct_id(),
      })
    );
  } catch {
    // localStorage failures are non-fatal
  }
  posthog.capture("cta_clicked", {
    location,
    referrer: document.referrer || null,
  });
}

type Theme = {
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

function makeTheme(dark: boolean): Theme {
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
        sub: "#6b6860",
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

export default function Landing() {
  const [dark, setDark] = useState(false);
  const T = makeTheme(dark);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: T.bg,
        color: T.text,
        transition: "background 0.25s, color 0.25s",
      }}
    >
      <Nav T={T} dark={dark} onToggle={() => setDark((d) => !d)} />
      <Hero T={T} dark={dark} />
      <Features T={T} />
      <HowItWorks T={T} />
      <Cta T={T} />
      <Footer T={T} />
    </div>
  );
}

// ── Theme toggle ──────────────────────────────────────────────────────────────

function ThemeToggle({
  dark,
  onToggle,
  T,
}: {
  dark: boolean;
  onToggle: () => void;
  T: Theme;
}) {
  return (
    <button
      onClick={onToggle}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        width: 32,
        height: 32,
        borderRadius: 6,
        border: `1px solid ${T.border}`,
        background: T.surface,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: T.sub,
        flexShrink: 0,
        transition: "all 0.2s",
      }}
    >
      {dark ? <Sun size={14} /> : <Moon size={14} />}
    </button>
  );
}

// ── Nav ──────────────────────────────────────────────────────────────────────

function Nav({
  T,
  dark,
  onToggle,
}: {
  T: Theme;
  dark: boolean;
  onToggle: () => void;
}) {
  return (
    <nav
      style={{
        height: 56,
        padding: "0 48px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: `1px solid ${T.border}`,
        position: "sticky",
        top: 0,
        background: T.bg,
        zIndex: 10,
        transition: "background 0.25s, border-color 0.25s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Logo size={24} />
        <span
          style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em" }}
        >
          Clipchase
        </span>
      </div>
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <a
          href="#features"
          style={{
            fontSize: 13,
            color: T.sub,
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          Features
        </a>
        <a
          href="#how-it-works"
          style={{
            fontSize: 13,
            color: T.sub,
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          How it works
        </a>
        <ThemeToggle dark={dark} onToggle={onToggle} T={T} />
        <a
          href={buildInstallUrl("header")}
          onClick={() => handleCtaClick("header")}
          style={{
            padding: "6px 16px",
            borderRadius: 5,
            background: ACCENT,
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          Add to Chrome
          <ArrowRight size={13} />
        </a>
      </div>
    </nav>
  );
}

function Logo({ size = 24 }: { size?: number }) {
  const inner = Math.round(size * 0.54);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.21),
        background: ACCENT,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg width={inner} height={inner} viewBox="0 0 12 12" fill="none">
        <circle cx="5" cy="5" r="3.2" stroke="white" strokeWidth="1.4" />
        <path
          d="M7.2 7.2L10.2 10.2"
          stroke="white"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function Hero({ T, dark }: { T: Theme; dark: boolean }) {
  return (
    <section
      style={{
        maxWidth: 1120,
        margin: "0 auto",
        padding: "112px 48px 96px",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 340px",
        gap: 80,
        alignItems: "center",
      }}
      className="hero-grid"
    >
      <div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            padding: "4px 12px",
            borderRadius: 4,
            border: `1px solid ${T.border}`,
            background: T.surface,
            marginBottom: 32,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#22c55e",
              display: "inline-block",
            }}
          />
          <span style={{ fontSize: 12, color: T.sub, fontWeight: 500 }}>
            Now in beta · Free on basic
          </span>
        </div>

        <h1
          style={{
            margin: "0 0 24px",
            fontSize: "clamp(42px, 5vw, 68px)",
            fontWeight: 800,
            letterSpacing: "-0.045em",
            lineHeight: 1.0,
          }}
        >
          Find every time
          <br />
          a phrase was said
          <br />
          <span style={{ color: ACCENT }}>on YouTube</span>
        </h1>

        <p
          style={{
            margin: "0 0 40px",
            fontSize: 18,
            color: T.sub,
            lineHeight: 1.75,
            maxWidth: 460,
            fontWeight: 400,
          }}
        >
          Search any YouTube channel by phrase. Get every video that mentions
          it with exact timestamps you can click to jump straight there.
        </p>

        <div
          style={{
            display: "flex",
            gap: 10,
            marginBottom: 48,
            flexWrap: "wrap",
          }}
        >
          <a
            href={buildInstallUrl("hero")}
            onClick={() => handleCtaClick("hero")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "13px 26px",
              borderRadius: 6,
              background: ACCENT,
              color: "#fff",
              fontSize: 15,
              fontWeight: 700,
              whiteSpace: "nowrap",
              letterSpacing: "-0.01em",
              textDecoration: "none",
            }}
          >
            Add to Chrome — Free
          </a>
          <a
            href="#how-it-works"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "13px 20px",
              borderRadius: 6,
              border: `1px solid ${T.border}`,
              color: T.sub,
              fontSize: 15,
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            See how it works
            <ArrowRight size={12} />
          </a>
        </div>

      </div>

      <ExtensionPreview T={T} dark={dark} />
    </section>
  );
}

// ── Extension preview ────────────────────────────────────────────────────────

function ExtensionPreview({ T, dark }: { T: Theme; dark: boolean }) {
  const shadow = dark
    ? "0 20px 60px rgba(0,0,0,0.7)"
    : "0 20px 60px rgba(0,0,0,0.12)";

  const results = [
    { t: "How Cursor is Changing the Way We Code", n: 14 },
    { t: "YC W24 Demo Day — AI Tools Roundup", n: 9 },
    { t: "The Future of Software Development", n: 6 },
    { t: "Startup Tools We Actually Use in 2024", n: 3 },
  ];
  const filters = ["1d", "7d", "1mo", "6mo", "All"];
  const activeFilter = 2;

  return (
    <div
      style={{
        border: `1px solid ${T.popupBorder}`,
        borderRadius: 10,
        overflow: "hidden",
        background: T.popupBg,
        boxShadow: shadow,
        width: 340,
        flexShrink: 0,
        justifySelf: "end",
      }}
    >
      <div
        style={{
          padding: "9px 12px",
          borderBottom: `1px solid ${T.popupBorder}`,
          display: "flex",
          alignItems: "center",
          gap: 7,
        }}
      >
        <Logo size={20} />
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: T.popupText,
            letterSpacing: "-0.02em",
          }}
        >
          Clipchase
        </span>
      </div>

      <div
        style={{
          padding: "8px 12px",
          borderBottom: `1px solid ${T.popupBorder}`,
          display: "flex",
          flexDirection: "column",
          gap: 5,
        }}
      >
        <div
          style={{
            padding: "6px 9px",
            borderRadius: 4,
            border: `1px solid ${T.inputBorder}`,
            background: T.inputBg,
            fontSize: 11,
            color: T.popupSub,
          }}
        >
          Y Combinator
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          <div
            style={{
              flex: 1,
              padding: "6px 9px",
              borderRadius: 4,
              border: `1px solid ${ACCENT}`,
              background: `${ACCENT}18`,
              fontSize: 11,
              color: T.popupText,
            }}
          >
            &ldquo;Cursor&rdquo;
          </div>
          <div
            style={{
              padding: "6px 12px",
              borderRadius: 4,
              background: ACCENT,
              fontSize: 11,
              color: "#fff",
              fontWeight: 600,
            }}
          >
            Search
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {filters.map((f, i) => (
            <div
              key={f}
              style={{
                padding: "2px 7px",
                borderRadius: 4,
                border: `1px solid ${
                  i === activeFilter ? ACCENT : T.inputBorder
                }`,
                background:
                  i === activeFilter ? `${ACCENT}18` : "transparent",
                fontSize: 10,
                color: i === activeFilter ? ACCENT : T.popupSub,
              }}
            >
              {f}
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          padding: "5px 12px 4px",
          borderBottom: `1px solid ${T.popupBorder}`,
        }}
      >
        <span style={{ fontSize: 10, color: T.popupSub }}>
          <span style={{ color: ACCENT, fontWeight: 600 }}>32 mentions</span>
          {" — 4 videos — 1 month"}
        </span>
      </div>

      {results.map((r, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            gap: 9,
            padding: "9px 12px",
            borderBottom:
              i < results.length - 1
                ? `1px solid ${T.popupBorder}`
                : "none",
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: 48,
              height: 32,
              borderRadius: 3,
              background: T.thumbBg,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 14 14"
              fill={dark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)"}
            >
              <path d="M3 2.5v9l8-4.5-8-4.5z" />
            </svg>
          </div>
          <span
            style={{
              flex: 1,
              fontSize: 10,
              color: T.popupSub,
              lineHeight: 1.4,
            }}
          >
            {r.t}
          </span>
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: ACCENT,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {r.n}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Features ──────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    n: "01",
    title: "Full transcript search",
    desc: "Every video on the channel is indexed. Not just titles — full transcripts.",
  },
  {
    n: "02",
    title: "Clickable timestamps",
    desc: "Each result links directly to that second in the video. No manual seeking.",
  },
  {
    n: "03",
    title: "Time-range filtering",
    desc: "Filter results by 1 day, 7 days, 1 month, 6 months, or all time.",
  },
  {
    n: "04",
    title: "Mention frequency ranking",
    desc: "Results sort by how many times the phrase appears in each video.",
  },
  {
    n: "05",
    title: "Any public channel",
    desc: "Paste a channel URL or name. No API key or account required.",
  },
  {
    n: "06",
    title: "Private by default",
    desc: "Everything runs in your browser. Your searches never leave your device.",
  },
];

function Features({ T }: { T: Theme }) {
  return (
    <section
      id="features"
      style={{ maxWidth: 1120, margin: "0 auto", padding: "0 48px 96px" }}
    >
      <div
        style={{
          borderTop: `1px solid ${T.border}`,
          paddingTop: 48,
          marginBottom: 40,
        }}
      >
        <h2
          style={{
            fontSize: "clamp(22px, 2.5vw, 34px)",
            fontWeight: 700,
            letterSpacing: "-0.03em",
            marginBottom: 8,
          }}
        >
          Built for precision
        </h2>
        <p style={{ fontSize: 15, color: T.sub }}>
          Search YouTube the way researchers and power users actually need.
        </p>
      </div>
      <div
        className="feature-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
        }}
      >
        {FEATURES.map((f, i) => (
          <div
            key={i}
            style={{
              padding: 24,
              borderTop: `1px solid ${T.border}`,
              borderRight:
                i % 3 < 2 ? `1px solid ${T.border}` : "none",
            }}
          >
            <div
              style={{
                fontFamily: MONO,
                fontSize: 10,
                color: ACCENT,
                fontWeight: 600,
                marginBottom: 10,
                letterSpacing: "0.05em",
              }}
            >
              {f.n}
            </div>
            <h3
              style={{
                margin: "0 0 6px",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {f.title}
            </h3>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: T.sub,
                lineHeight: 1.65,
              }}
            >
              {f.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── How it works ──────────────────────────────────────────────────────────────

const STEPS = [
  {
    n: "01",
    title: "Install",
    desc: "One click from the Chrome Web Store. No sign-up required.",
  },
  {
    n: "02",
    title: "Enter channel + phrase",
    desc: "Name or URL of any public YouTube channel, and the phrase you want to find.",
  },
  {
    n: "03",
    title: "Jump to the moment",
    desc: "Click any timestamp to open the video right at that second.",
  },
];

function HowItWorks({ T }: { T: Theme }) {
  return (
    <section
      id="how-it-works"
      style={{ maxWidth: 1120, margin: "0 auto", padding: "0 48px 96px" }}
    >
      <div
        style={{
          borderTop: `1px solid ${T.border}`,
          paddingTop: 48,
          marginBottom: 40,
        }}
      >
        <h2
          style={{
            fontSize: "clamp(22px, 2.5vw, 34px)",
            fontWeight: 700,
            letterSpacing: "-0.03em",
            marginBottom: 8,
          }}
        >
          Three steps
        </h2>
        <p style={{ fontSize: 15, color: T.sub }}>
          From install to results in under a minute.
        </p>
      </div>
      <div
        className="steps-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
        }}
      >
        {STEPS.map((s, i) => (
          <div
            key={i}
            style={{
              padding: 28,
              borderTop: `1px solid ${T.border}`,
              borderRight:
                i < STEPS.length - 1 ? `1px solid ${T.border}` : "none",
            }}
          >
            <div
              style={{
                fontFamily: MONO,
                fontSize: 28,
                fontWeight: 700,
                color: ACCENT,
                marginBottom: 16,
                letterSpacing: "-0.03em",
                lineHeight: 1,
              }}
            >
              {s.n}
            </div>
            <h3
              style={{
                margin: "0 0 10px",
                fontSize: 17,
                fontWeight: 700,
                letterSpacing: "-0.02em",
              }}
            >
              {s.title}
            </h3>
            <p
              style={{
                margin: 0,
                fontSize: 14,
                color: T.sub,
                lineHeight: 1.7,
              }}
            >
              {s.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Closing CTA ──────────────────────────────────────────────────────────────

function Cta({ T }: { T: Theme }) {
  return (
    <section
      style={{ maxWidth: 1120, margin: "0 auto", padding: "0 48px 80px" }}
    >
      <div
        style={{
          padding: "48px 56px",
          borderRadius: 10,
          border: `1px solid ${T.border}`,
          background: T.surface,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 32,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2
            style={{
              margin: "0 0 8px",
              fontSize: "clamp(18px, 2vw, 28px)",
              fontWeight: 700,
              letterSpacing: "-0.03em",
            }}
          >
            Ready to start searching?
          </h2>
          <p style={{ margin: 0, fontSize: 14, color: T.sub }}>
            Free forever on basic. Installs in 30 seconds.
          </p>
        </div>
        <a
          href={buildInstallUrl("footer_banner")}
          onClick={() => handleCtaClick("footer_banner")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 24px",
            borderRadius: 6,
            background: ACCENT,
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            whiteSpace: "nowrap",
            flexShrink: 0,
            textDecoration: "none",
          }}
        >
          Add to Chrome — Free
        </a>
      </div>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────

function Footer({ T }: { T: Theme }) {
  return (
    <footer
      style={{
        maxWidth: 1120,
        margin: "0 auto",
        padding: "20px 48px",
        borderTop: `1px solid ${T.border}`,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <Logo size={18} />
        <span
          style={{ fontSize: 13, fontWeight: 700, letterSpacing: "-0.02em" }}
        >
          Clipchase
        </span>
      </div>
      <span style={{ fontSize: 12, color: T.muted }}>
        © 2026 ·{" "}
        <Link
          href="/privacy"
          style={{ color: "inherit", textDecoration: "none" }}
        >
          Privacy
        </Link>
      </span>
      <div style={{ display: "flex", gap: 20 }}>
        <a
          href="#how-it-works"
          style={{ fontSize: 12, color: T.muted, textDecoration: "none" }}
        >
          How it works
        </a>
        <a
          href="https://tally.so/r/7RJQZA?source=landing_footer"
          target="_blank"
          rel="noopener noreferrer"
          onClick={() =>
            posthog.capture("feedback_link_clicked", { trigger: "footer" })
          }
          style={{ fontSize: 12, color: T.muted, textDecoration: "none" }}
        >
          Feedback
        </a>
        <a
          href={buildInstallUrl("footer_links")}
          onClick={() => handleCtaClick("footer_links")}
          style={{ fontSize: 12, color: T.muted, textDecoration: "none" }}
        >
          Install
        </a>
      </div>
    </footer>
  );
}
