"use client";

// Opened by Chrome when someone removes the extension
// (chrome.runtime.setUninstallURL in the service worker). It is the only
// moment Chrome gives an extension to hear from the people who leave, and
// they are the majority: 74 of 129 installs since July went silent within
// two weeks, while the in-panel feedback card only reaches the ~20% who get
// far enough to open two videos.
//
// The URL carries the extension's stable_id, the same one /installed uses,
// so posthog.identify() files this answer under the person who just left,
// next to everything they searched. One tappable question, one optional
// line, no email, no tracking redirect.

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { ACCENT, ACCENT_HOVER, CHROME_STORE_BASE, MONO, makeTheme } from "../lib";

const REASONS = [
  { id: "no_results", label: "It didn't find what I searched for" },
  { id: "too_slow", label: "Searches took too long" },
  { id: "confusing", label: "I couldn't work out how to use it" },
  { id: "in_the_way", label: "It got in the way on YouTube" },
  { id: "one_off", label: "I only needed it once" },
  { id: "other", label: "Something else" },
] as const;

type ReasonId = (typeof REASONS)[number]["id"];

const MAX_TEXT = 500;

function useSystemDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(mq.matches);
    const on = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return dark;
}

function UninstalledInner() {
  const params = useSearchParams();
  const stableId = params.get("stable_id");
  const version = params.get("v");
  const dark = useSystemDark();
  const T = useMemo(() => makeTheme(dark), [dark]);

  const [reason, setReason] = useState<ReasonId | null>(null);
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    // Uninstalls are otherwise invisible in PostHog, so the view is itself
    // the metric: this is the first place the product learns someone left.
    if (stableId) posthog.identify(stableId);
    // Normal queued capture on purpose. send_instantly here fires at mount,
    // before PostHog has finished initialising, and was dropped in testing;
    // the default queue waits for init and the page is on screen long enough.
    posthog.capture("uninstall_page_viewed", {
      extension_version: version,
      has_stable_id: Boolean(stableId),
    });
  }, [stableId, version]);

  const send = () => {
    if (!reason) return;
    const clean = text.trim().slice(0, MAX_TEXT);
    // send_instantly: people close this tab seconds after answering, and the
    // default batch window lost an answer in testing. Verified to survive the
    // tab closing 100ms after Send.
    posthog.capture(
      "uninstall_reason",
      { reason, text: clean || null, length: clean.length, extension_version: version },
      { send_instantly: true },
    );
    setSent(true);
  };

  const focusRing = `2px solid ${ACCENT}`;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: T.bg,
        color: T.text,
        display: "flex",
        justifyContent: "center",
        padding: "clamp(48px, 12vh, 120px) 20px 64px",
        transition: "background 0.2s, color 0.2s",
      }}
    >
      <style>{`
        .cc-reason:focus-visible, .cc-send:focus-visible, .cc-link:focus-visible,
        .cc-text:focus-visible { outline: ${focusRing}; outline-offset: 2px; }
        .cc-reason:hover { border-color: ${ACCENT} !important; }
        .cc-send:not(:disabled):hover { background: ${ACCENT_HOVER} !important; }
        .cc-link:hover { color: ${T.text} !important; }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
      `}</style>

      <div style={{ width: "100%", maxWidth: 480 }}>
        <p
          style={{
            fontFamily: MONO,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.05em",
            color: T.sub,
            margin: "0 0 14px",
          }}
        >
          CLIPCHASE REMOVED
        </p>

        {!sent ? (
          <>
            <h1
              style={{
                fontSize: "clamp(26px, 5vw, 34px)",
                fontWeight: 700,
                lineHeight: 1.15,
                letterSpacing: "-0.03em",
                margin: "0 0 10px",
                textWrap: "balance",
              }}
            >
              What made you remove it?
            </h1>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: T.sub, margin: "0 0 28px" }}>
              One tap. It&rsquo;s the only way I find out what went wrong.
            </p>

            <div role="radiogroup" aria-label="Reason for removing ClipChase" style={{ display: "grid", gap: 8 }}>
              {REASONS.map((r) => {
                const active = reason === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className="cc-reason"
                    onClick={() => setReason(r.id)}
                    style={{
                      textAlign: "left",
                      padding: "13px 16px",
                      borderRadius: 6,
                      border: `1px solid ${active ? ACCENT : T.border}`,
                      background: active ? `${ACCENT}18` : T.surface,
                      color: T.text,
                      fontFamily: "inherit",
                      fontSize: 15,
                      fontWeight: active ? 600 : 500,
                      cursor: "pointer",
                      transition: "border-color 0.15s, background 0.15s",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        flexShrink: 0,
                        border: `1.5px solid ${active ? ACCENT : T.sub}`,
                        boxShadow: active ? `inset 0 0 0 3px ${T.surface}` : "none",
                        background: active ? ACCENT : "transparent",
                        transition: "all 0.15s",
                      }}
                    />
                    {r.label}
                  </button>
                );
              })}
            </div>

            {reason && (
              <div style={{ marginTop: 20, display: "grid", gap: 8 }}>
                <label htmlFor="cc-uninstall-text" style={{ fontSize: 14, fontWeight: 600 }}>
                  {reason === "no_results"
                    ? "What were you searching for? (optional)"
                    : reason === "other"
                      ? "What happened? (optional)"
                      : "Anything I should know? (optional)"}
                </label>
                <textarea
                  id="cc-uninstall-text"
                  className="cc-text"
                  value={text}
                  maxLength={MAX_TEXT}
                  rows={3}
                  onChange={(e) => setText(e.target.value)}
                  style={{
                    width: "100%",
                    resize: "vertical",
                    padding: "11px 14px",
                    borderRadius: 6,
                    border: `1px solid ${T.inputBorder}`,
                    background: T.inputBg,
                    color: T.text,
                    fontFamily: "inherit",
                    fontSize: 15,
                    lineHeight: 1.5,
                  }}
                />
              </div>
            )}

            <button
              type="button"
              className="cc-send"
              onClick={send}
              disabled={!reason}
              style={{
                marginTop: 20,
                padding: "13px 26px",
                borderRadius: 6,
                border: `1px solid ${reason ? ACCENT : T.border}`,
                background: reason ? ACCENT : "transparent",
                color: reason ? "#ffffff" : T.sub,
                fontFamily: "inherit",
                fontSize: 15,
                fontWeight: 600,
                cursor: reason ? "pointer" : "not-allowed",
                transition: "background 0.15s",
              }}
            >
              Send
            </button>
          </>
        ) : (
          <>
            <h1
              style={{
                fontSize: "clamp(26px, 5vw, 34px)",
                fontWeight: 700,
                lineHeight: 1.15,
                letterSpacing: "-0.03em",
                margin: "0 0 10px",
              }}
              role="status"
            >
              Thank you. I read every one of these.
            </h1>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: T.sub, margin: "0 0 24px" }}>
              If it was something I can fix, it&rsquo;s probably already on the list.
            </p>
            <a
              className="cc-link"
              href={CHROME_STORE_BASE}
              style={{ fontSize: 14, color: T.sub, textDecoration: "underline", textUnderlineOffset: 3 }}
            >
              Changed your mind? Reinstall ClipChase
            </a>
          </>
        )}
      </div>
    </main>
  );
}

export default function UninstalledPage() {
  return (
    <Suspense fallback={null}>
      <UninstalledInner />
    </Suspense>
  );
}
