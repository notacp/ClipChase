"use client";

import { motion } from "framer-motion";
import { Sun, Moon } from "lucide-react";
import posthog from "posthog-js";
import { ACCENT, type Theme } from "./lib";

// Records the CTA click and stashes attribution for the /installed page to
// merge with the extension's stable ID after install.
export function handleCtaClick(location: string) {
  // Tagged links (clipchase.xyz/?utm_source=<group>) tell us which audience an
  // install came from; carry the tag through to /installed.
  const utmSource = new URLSearchParams(window.location.search).get("utm_source");
  try {
    localStorage.setItem(
      "ts_pre_install_source",
      JSON.stringify({
        location,
        clicked_at: Date.now(),
        referrer: document.referrer || null,
        landing_distinct_id: posthog.get_distinct_id(),
        utm_source: utmSource,
      })
    );
  } catch {
    // localStorage failures are non-fatal
  }
  posthog.capture("cta_clicked", {
    location,
    referrer: document.referrer || null,
    utm_source: utmSource,
  });
}

export function Logo({ size = 24 }: { size?: number }) {
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

export function ThemeToggle({
  dark,
  onToggle,
  T,
}: {
  dark: boolean;
  onToggle: () => void;
  T: Theme;
}) {
  return (
    <motion.button
      onClick={onToggle}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      whileHover={{ background: T.surface2 }}
      whileTap={{ scale: 0.9 }}
      transition={{ duration: 0.12 }}
      style={{
        width: 36,
        height: 36,
        borderRadius: 7,
        border: `1px solid ${T.border}`,
        background: T.surface,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: T.sub,
        flexShrink: 0,
        transition: "background 0.2s, border-color 0.2s",
      }}
    >
      {dark ? <Sun size={14} /> : <Moon size={14} />}
    </motion.button>
  );
}
