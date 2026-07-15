"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { ACCENT, MONO, buildInstallUrl, makeTheme, type Theme } from "../lib";
import { Logo, ThemeToggle } from "../shared";

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
  title: string;
  body: React.ReactNode;
};

const SECTIONS: Section[] = [
  {
    title: "Information we collect",
    body: (
      <>
        ClipChase operates primarily as a client-side tool. To search YouTube
        transcripts, the extension accesses the current YouTube channel and its
        associated transcript data directly from your browser. We do not
        collect, store, or sell your personal data.
      </>
    ),
  },
  {
    title: "Permissions needed",
    body: (
      <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 10 }}>
        <li>
          <strong>sidePanel:</strong> displays the search interface alongside
          the video without interrupting playback.
        </li>
        <li>
          <strong>scripting &amp; tabs:</strong> interacts with the current
          YouTube tab, for example jumping to a timestamp when a result is
          clicked.
        </li>
        <li>
          <strong>declarativeNetRequest:</strong> securely manages network
          requests required for reliable transcript fetching.
        </li>
        <li>
          <strong>Host permissions:</strong> fetches transcripts of the channel
          you are searching and communicates with our backend APIs.
        </li>
      </ul>
    ),
  },
  {
    title: "How your data is handled",
    body: (
      <>
        When you perform a search, the extension may communicate with our
        backend servers to process and deliver phonetic matches. Data
        transmitted is strictly limited to transcript segments and your search
        query. We do not tie this data to your identity, IP address, or user
        account.
      </>
    ),
  },
  {
    title: "Third-party services and analytics",
    body: (
      <>
        ClipChase interacts with YouTube&apos;s services to function. Your use
        of YouTube is governed by YouTube&apos;s Terms of Service and Privacy
        Policy. ClipChase is not affiliated with, endorsed, or sponsored by
        YouTube.
        <br />
        <br />
        We use PostHog to collect anonymous, aggregated usage analytics to help
        improve the extension. This data does not contain personally
        identifiable information.
      </>
    ),
  },
  {
    title: "Changes to this policy",
    body: (
      <>
        We may update this Privacy Policy from time to time to reflect changes
        in our practices or for other operational, legal, or regulatory reasons.
        We will notify you of any material changes by updating the last updated
        date below.
      </>
    ),
  },
  {
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

      <main
        className="privacy-main"
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "80px 48px 96px",
        }}
      >
        <header style={{ marginBottom: 56 }}>
          <h1
            style={{
              margin: "0 0 16px",
              fontSize: "clamp(32px, 4vw, 48px)",
              fontWeight: 800,
              letterSpacing: "-0.04em",
              lineHeight: 1.05,
              textWrap: "balance",
            }}
          >
            Privacy Policy
          </h1>
          <p
            style={{
              margin: "0 0 20px",
              fontSize: 16,
              color: T.sub,
              lineHeight: 1.65,
              maxWidth: "60ch",
            }}
          >
            Everything ClipChase collects, what it does with that data, and the
            permissions it requests from your browser.
          </p>
          <span
            style={{
              fontFamily: MONO,
              fontSize: 12,
              color: T.muted,
            }}
          >
            Last updated · 2026-04-26
          </span>
        </header>

        <div
          style={{
            borderTop: `1px solid ${T.border}`,
          }}
        >
          {SECTIONS.map((s) => (
            <article
              key={s.title}
              style={{
                padding: "32px 0",
                borderBottom: `1px solid ${T.border}`,
                display: "grid",
                gridTemplateColumns: "200px 1fr",
                gap: "24px 48px",
                alignItems: "start",
              }}
              className="privacy-section"
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: 14,
                  fontWeight: 600,
                  letterSpacing: "-0.01em",
                  lineHeight: 1.4,
                  color: T.text,
                  paddingTop: 2,
                }}
              >
                {s.title}
              </h2>
              <div
                style={{
                  fontSize: 15,
                  color: T.sub,
                  lineHeight: 1.75,
                }}
              >
                {s.body}
              </div>
            </article>
          ))}
        </div>
      </main>

      <Footer T={T} />

      <style>{`
        @media (max-width: 600px) {
          .privacy-section {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
          .privacy-main {
            padding-left: 24px !important;
            padding-right: 24px !important;
          }
        }
      `}</style>
    </div>
  );
}
