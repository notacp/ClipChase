"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import Link from "next/link";

function InstalledInner() {
  const searchParams = useSearchParams();
  const [reported, setReported] = useState(false);

  useEffect(() => {
    if (reported) return;
    const stableId = searchParams.get("stable_id");
    if (!stableId) {
      setReported(true);
      return;
    }

    let preInstall: {
      location?: string;
      clicked_at?: number;
      referrer?: string | null;
      landing_distinct_id?: string;
    } = {};
    try {
      const raw = localStorage.getItem("ts_pre_install_source");
      if (raw) preInstall = JSON.parse(raw);
    } catch {
      // ignore
    }

    // Merge the extension's stable ID with this landing-page session so the
    // user's pre- and post-install events live under one person.
    posthog.alias(stableId);

    const timeToInstallMs = preInstall.clicked_at
      ? Date.now() - preInstall.clicked_at
      : null;
    // Guard against clock skew / cleared localStorage / cross-browser installs
    // producing nonsense durations.
    const safeTimeToInstall =
      timeToInstallMs !== null && timeToInstallMs >= 0 ? timeToInstallMs : null;

    posthog.capture("install_attributed", {
      stable_id: stableId,
      cta_location: preInstall.location ?? null,
      cta_clicked_at: preInstall.clicked_at ?? null,
      original_referrer: preInstall.referrer ?? null,
      time_to_install_ms: safeTimeToInstall,
    });

    // $set_once: lock first-touch attribution. Revisits to /installed must not
    // overwrite the original install_source.
    posthog.setPersonProperties(
      {},
      {
        install_source: preInstall.location ?? "direct",
        original_referrer: preInstall.referrer ?? null,
        first_seen_at: new Date().toISOString(),
      },
    );

    try {
      localStorage.removeItem("ts_pre_install_source");
    } catch {
      // ignore
    }

    setReported(true);
  }, [searchParams, reported]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0F0F0F",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 24px",
      }}
    >
      <div style={{ maxWidth: 448, textAlign: "center" }}>
        <h1 style={{ margin: "0 0 16px", fontSize: 30, lineHeight: 1.2, fontWeight: 700 }}>
          ClipChase is installed 🎉
        </h1>
        <ol
          style={{
            margin: "0 0 24px",
            padding: 0,
            listStyle: "none",
            color: "#909090",
            textAlign: "left",
            display: "grid",
            gap: 12,
          }}
        >
          <li>
            <strong style={{ color: "#fff" }}>1. Pin it</strong> — click the
            puzzle piece 🧩 in your toolbar, then the pin 📌 next to{" "}
            <strong style={{ color: "#fff" }}>ClipChase</strong>.
          </li>
          <li>
            <strong style={{ color: "#fff" }}>2. Open it</strong> — click the
            ClipChase icon. The side panel works on any tab.
          </li>
          <li>
            <strong style={{ color: "#fff" }}>3. Search</strong> — pick a
            YouTube channel, type a phrase they said, and jump to the exact
            second.
          </li>
        </ol>
        <Link
          href="/"
          className="installed-home-link"
          style={{
            display: "inline-block",
            color: "#E03030",
            textDecoration: "none",
            transition: "color 0.15s",
          }}
        >
          ← Back to home
        </Link>
      </div>
    </main>
  );
}

export default function InstalledPage() {
  return (
    <Suspense fallback={null}>
      <InstalledInner />
    </Suspense>
  );
}
