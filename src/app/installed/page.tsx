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
    <main className="min-h-screen bg-yt-black text-white flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-bold mb-4">You&rsquo;re all set 🎉</h1>
        <p className="text-yt-light-gray mb-6">
          Ctrl F for YouTube is installed. Click the extension icon on any
          YouTube page to start searching.
        </p>
        <Link
          href="/"
          className="inline-block text-yt-red hover:text-white transition-colors"
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
