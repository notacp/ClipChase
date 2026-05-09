"use client";

import { useState } from "react";
import { Sun, Moon, ArrowLeft, ArrowRight } from "lucide-react";
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

type Theme = {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  sub: string;
  muted: string;
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
      }
    : {
        bg: "#fafaf9",
        surface: "#f4f3f1",
        surface2: "#eeede9",
        border: "#e2e0db",
        text: "#141412",
        sub: "#6b6860",
        muted: "#aaa9a3",
      };
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
      <Link
        href="/"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          textDecoration: "none",
          color: "inherit",
        }}
      >
        <Logo size={24} />
        <span
          style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em" }}
        >
          ClipChase
        </span>
      </Link>
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <Link
          href="/"
          style={{
            fontSize: 13,
            color: T.sub,
            fontWeight: 500,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <ArrowLeft size={13} />
          Back to home
        </Link>
        <ThemeToggle dark={dark} onToggle={onToggle} T={T} />
        <a
          href={buildInstallUrl("privacy_header")}
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
          ClipChase
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
        <Link
          href="/#how-it-works"
          style={{ fontSize: 12, color: T.muted, textDecoration: "none" }}
        >
          How it works
        </Link>
        <a
          href={buildInstallUrl("privacy_footer")}
          style={{ fontSize: 12, color: T.muted, textDecoration: "none" }}
        >
          Install
        </a>
      </div>
    </footer>
  );
}

type Section = {
  n: string;
  title: string;
  body: React.ReactNode;
};

const SECTIONS: Section[] = [
  {
    n: "01",
    title: "Information we collect",
    body: (
      <>
        ClipChase operates primarily as a client-side tool. To search YouTube
        transcripts, the extension accesses the current YouTube channel and
        its associated transcript data directly from your browser. We do not
        collect, store, or sell your personal data.
      </>
    ),
  },
  {
    n: "02",
    title: "Permissions needed",
    body: (
      <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8 }}>
        <li>
          <strong>sidePanel:</strong> displays the search interface alongside
          the video without interrupting playback.
        </li>
        <li>
          <strong>scripting & tabs:</strong> interacts with the current
          YouTube tab — for example, jumping to a timestamp when a result is
          clicked.
        </li>
        <li>
          <strong>declarativeNetRequest:</strong> securely manages network
          requests required for reliable transcript fetching.
        </li>
        <li>
          <strong>Host permissions:</strong> fetches transcripts of the
          channel you are searching and communicates with our backend APIs.
        </li>
      </ul>
    ),
  },
  {
    n: "03",
    title: "How your data is handled",
    body: (
      <>
        When you perform a search, the extension may communicate with our
        backend servers to process and deliver phonetic matches. Data
        transmitted is strictly limited to transcript segments and your
        search query. We do not tie this data to your identity, IP address,
        or user account.
      </>
    ),
  },
  {
    n: "04",
    title: "Third-party services & analytics",
    body: (
      <>
        ClipChase interacts with YouTube&apos;s services to function. Your
        use of YouTube is governed by YouTube&apos;s Terms of Service and
        Privacy Policy. ClipChase is not affiliated with, endorsed, or
        sponsored by YouTube.
        <br />
        <br />
        We use PostHog to collect anonymous, aggregated usage analytics to
        help improve the extension. This data does not contain personally
        identifiable information.
      </>
    ),
  },
  {
    n: "05",
    title: "Changes to this policy",
    body: (
      <>
        We may update this Privacy Policy from time to time to reflect
        changes in our practices or for other operational, legal, or
        regulatory reasons. We will notify you of any material changes by
        updating the &ldquo;last updated&rdquo; date below.
      </>
    ),
  },
  {
    n: "06",
    title: "Contact",
    body: (
      <>
        Questions or suggestions about this policy? Reach out at{" "}
        <a
          href="mailto:pradyumnkhanchandani27@gmail.com"
          style={{ color: ACCENT, textDecoration: "none" }}
        >
          pradyumnkhanchandani27@gmail.com
        </a>
        .
      </>
    ),
  },
];

export default function PrivacyPolicy() {
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

      <section
        style={{
          maxWidth: 1120,
          margin: "0 auto",
          padding: "96px 48px 48px",
        }}
      >
        <div
          style={{
            fontFamily: MONO,
            fontSize: 11,
            color: ACCENT,
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginBottom: 16,
          }}
        >
          Legal · Privacy
        </div>
        <h1
          style={{
            margin: "0 0 16px",
            fontSize: "clamp(36px, 4.5vw, 56px)",
            fontWeight: 800,
            letterSpacing: "-0.045em",
            lineHeight: 1.0,
          }}
        >
          Privacy Policy
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: 16,
            color: T.sub,
            maxWidth: 560,
            lineHeight: 1.6,
          }}
        >
          Everything ClipChase collects, what it does with that data, and the
          permissions it requests from your browser.
        </p>
        <div
          style={{
            marginTop: 32,
            fontFamily: MONO,
            fontSize: 12,
            color: T.muted,
          }}
        >
          Last updated · 2026-04-26
        </div>
      </section>

      <section
        style={{
          maxWidth: 1120,
          margin: "0 auto",
          padding: "0 48px 96px",
        }}
      >
        <div
          className="privacy-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            borderTop: `1px solid ${T.border}`,
          }}
        >
          {SECTIONS.map((s, i) => (
            <article
              key={s.n}
              style={{
                padding: 28,
                borderBottom: `1px solid ${T.border}`,
                borderRight:
                  i % 2 === 0 ? `1px solid ${T.border}` : "none",
              }}
            >
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  color: ACCENT,
                  fontWeight: 600,
                  marginBottom: 12,
                  letterSpacing: "0.05em",
                }}
              >
                {s.n}
              </div>
              <h2
                style={{
                  margin: "0 0 12px",
                  fontSize: 17,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                }}
              >
                {s.title}
              </h2>
              <div
                style={{
                  fontSize: 14,
                  color: T.sub,
                  lineHeight: 1.7,
                }}
              >
                {s.body}
              </div>
            </article>
          ))}
        </div>
      </section>

      <Footer T={T} />

      <style jsx>{`
        @media (max-width: 720px) {
          :global(.privacy-grid) {
            grid-template-columns: 1fr !important;
          }
          :global(.privacy-grid > article) {
            border-right: none !important;
          }
        }
      `}</style>
    </div>
  );
}
