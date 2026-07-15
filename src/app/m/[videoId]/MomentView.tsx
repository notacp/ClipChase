"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import posthog from "posthog-js";
import {
  ACCENT,
  ACCENT_HOVER,
  MONO,
  buildInstallUrl,
  makeTheme,
  splitOnKeyword,
} from "../../lib";
import { handleCtaClick } from "../../shared";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export function MomentView({
  videoId,
  t,
  quote,
  keyword,
  videoTitle,
  channel,
  timestampLabel,
  embed = false,
}: {
  videoId: string;
  t: number;
  quote: string;
  keyword: string;
  videoTitle: string | null;
  channel: string | null;
  timestampLabel: string;
  // Chromeless player-only mode for the extension's inline preview. YouTube
  // rejects embeds from chrome-extension:// origins (error 153), so the side
  // panel iframes THIS page instead — the nested player then gets a valid
  // https referrer.
  embed?: boolean;
}) {
  const reduced = useReducedMotion();
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const T = makeTheme(dark);

  useEffect(() => {
    posthog.capture("moment_page_visited", {
      video_id: videoId,
      t,
      keyword: keyword || null,
      surface: embed ? "extension_preview" : "web",
    });
  }, [videoId, t, keyword, embed]);

  const quoteParts = useMemo(() => splitOnKeyword(quote, keyword), [quote, keyword]);

  // After every hook: early returns must not change hook order between renders.
  if (embed) {
    return (
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${videoId}?start=${t}&autoplay=1&cc_load_policy=1`}
        title={videoTitle ?? "YouTube video"}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        style={{ position: "fixed", inset: 0, width: "100%", height: "100%", border: 0, background: "#000" }}
      />
    );
  }

  const rise = (delay: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 12 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.5, delay, ease: EASE_OUT },
        };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: T.bg,
        color: T.text,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Wordmark row */}
      <header
        style={{
          maxWidth: 760,
          width: "100%",
          margin: "0 auto",
          padding: "20px 24px 0",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <a
          href="/"
          style={{
            fontSize: 15,
            fontWeight: 800,
            letterSpacing: "-0.03em",
            color: T.text,
            textDecoration: "none",
          }}
        >
          Clip<span style={{ color: ACCENT }}>Chase</span>
        </a>
        <span style={{ fontFamily: MONO, fontSize: 11, color: T.sub, fontWeight: 500 }}>
          shared moment
        </span>
      </header>

      <main
        style={{
          maxWidth: 760,
          width: "100%",
          margin: "0 auto",
          padding: "clamp(36px, 7vh, 72px) 24px 48px",
          flex: 1,
        }}
      >
        {/* The quote is the hero: the product's output IS the page. */}
        <motion.blockquote
          {...rise(0)}
          style={{
            margin: 0,
            fontSize: "clamp(24px, 4.5vw, 42px)",
            fontWeight: 800,
            letterSpacing: "-0.035em",
            lineHeight: 1.15,
            textWrap: "balance",
            overflowWrap: "anywhere",
          }}
        >
          {quote ? (
            <>
              {"“"}
              {quoteParts.map((part, i) =>
                part.hit ? (
                  <mark
                    key={i}
                    style={{
                      background: "#FF450028",
                      border: "1px solid #FF450055",
                      borderRadius: 4,
                      padding: "0 6px",
                      color: "inherit",
                    }}
                  >
                    {part.text}
                  </mark>
                ) : (
                  <span key={i}>{part.text}</span>
                ),
              )}
              {"”"}
            </>
          ) : (
            "Jump to the exact moment"
          )}
        </motion.blockquote>

        <motion.p
          {...rise(0.08)}
          style={{
            margin: "18px 0 0",
            fontFamily: MONO,
            fontSize: 12,
            fontWeight: 600,
            color: T.sub,
          }}
        >
          <span style={{ color: ACCENT }}>{timestampLabel}</span>
          {channel ? ` · ${channel}` : ""}
          {videoTitle ? ` · ${videoTitle}` : ""}
        </motion.p>

        <motion.div
          {...rise(0.16)}
          style={{
            marginTop: 28,
            borderRadius: 10,
            overflow: "hidden",
            border: `1px solid ${T.border}`,
            background: "#000",
            aspectRatio: "16 / 9",
          }}
        >
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}?start=${t}`}
            title={videoTitle ?? "YouTube video"}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            style={{ width: "100%", height: "100%", border: 0, display: "block" }}
          />
        </motion.div>

        {/* Install CTA: the reason this page exists on clipchase.xyz and not
            youtube.com. One CTA, one sentence, nothing else competing. */}
        <motion.div
          {...rise(0.24)}
          style={{
            marginTop: 36,
            padding: "20px 22px",
            borderRadius: 10,
            border: `1px solid ${T.border}`,
            background: T.surface,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 220, flex: 1 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em" }}>
              Found with ClipChase
            </p>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: T.sub, lineHeight: 1.5 }}>
              Search everything this creator has ever said and jump to the exact second.
            </p>
          </div>
          <motion.a
            href={buildInstallUrl("share_link", "moment_page")}
            onClick={() => handleCtaClick("moment_page")}
            whileHover={reduced ? undefined : { backgroundColor: ACCENT_HOVER }}
            whileTap={reduced ? undefined : { scale: 0.97 }}
            transition={{ duration: 0.15 }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "11px 20px",
              borderRadius: 6,
              background: ACCENT,
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            Add to Chrome · Free
            <ArrowRight size={12} />
          </motion.a>
        </motion.div>
      </main>

      <footer
        style={{
          maxWidth: 760,
          width: "100%",
          margin: "0 auto",
          padding: "0 24px 24px",
        }}
      >
        <span style={{ fontFamily: MONO, fontSize: 10, color: T.sub }}>
          clipchase.xyz · Ctrl+F for YouTube
        </span>
      </footer>
    </div>
  );
}
