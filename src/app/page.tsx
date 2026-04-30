"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Clock, Globe, Layers, Lock, Puzzle, Youtube, Zap } from "lucide-react";
import { BackgroundEffect } from "@/components/BackgroundEffect";
import posthog from "posthog-js";
import Link from "next/link";

const spring = { type: "spring" as const, stiffness: 100, damping: 20 };

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
  // Persist CTA source for post-install attribution; read by /installed
  // after the extension opens its post-install tab.
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

export default function Landing() {
  return (
    <main className="min-h-screen bg-yt-black text-white selection:bg-yt-red/30 pb-20">
      <BackgroundEffect />

      <LandingHeader />

      <div className="relative z-10 max-w-7xl mx-auto px-6">
        <Hero />
        <DemoMockup />
        <HowItWorks />
        <Features />
        <ClosingCta />
      </div>

      <Footer />
    </main>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────

function LandingHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-20 transition-all duration-200 ${
        scrolled
          ? "bg-yt-black/80 backdrop-blur-md border-b border-white/10"
          : "border-b border-white/5"
      }`}
    >
      <nav className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-2 group cursor-pointer">
          <Youtube className="w-7 h-7 text-yt-red group-hover:scale-110 transition-transform" />
          <span className="text-lg font-bold tracking-tight">Ctrl F for YouTube</span>
        </div>
        <div className="flex items-center gap-5">
          <a
            href="#how"
            className="text-sm text-yt-light-gray hover:text-white transition-colors hidden sm:inline"
          >
            How it works
          </a>
          <a
            href={buildInstallUrl("header")}
            onClick={() => handleCtaClick("header")}
            className="bg-yt-red hover:bg-yt-red/90 active:translate-y-px text-white text-sm font-semibold px-4 py-2 rounded-xl transition-all flex items-center gap-1.5"
          >
            Add to Chrome
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </nav>
    </header>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="flex flex-col items-center pt-20 md:pt-28 pb-16 text-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring}
        className="inline-flex items-center gap-2 glass rounded-full px-4 py-1.5 text-xs font-mono text-yt-light-gray mb-6 hover:border-white/20 transition-colors"
      >
        <span className="relative flex w-2 h-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yt-red/50" />
          <span className="relative inline-flex w-2 h-2 rounded-full bg-yt-red" />
        </span>
        Free · Chrome Extension
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.05 }}
        className="font-bold text-center tracking-tight text-5xl md:text-7xl mb-6 max-w-4xl"
      >
        Ctrl+F for <span className="text-yt-red">YouTube</span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.12 }}
        className="text-yt-light-gray text-lg md:text-xl leading-relaxed max-w-2xl px-4 mb-10"
      >
        Search every video on a YouTube channel for a keyword. Jump straight to the second it&rsquo;s spoken.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.18 }}
        className="flex flex-col sm:flex-row items-center gap-3"
      >
        <a
          href={buildInstallUrl("hero")}
          onClick={() => handleCtaClick("hero")}
          className="bg-yt-red hover:bg-yt-red/90 active:translate-y-px text-white font-semibold px-7 py-3.5 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-yt-red/20"
        >
          <Puzzle className="w-5 h-5" />
          Add to Chrome — Free
        </a>
        <a
          href="#how"
          className="text-yt-light-gray hover:text-white text-sm font-medium px-4 py-2 transition-colors"
        >
          See how it works ↓
        </a>
      </motion.div>
    </section>
  );
}

// ── Demo mockup ───────────────────────────────────────────────────────────────
//
// Real use case: @hubermanlab + "dopamine" — search across 400+ videos,
// jump to the exact second it's spoken. Two videos, three matches.
// Auto-cycles on load; stops when user clicks.

/** Parse "h:mm:ss" or "m:ss" duration string into total seconds. */
function parseDuration(d: string): number {
  const parts = d.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return parts[0] * 60 + parts[1];
}

const DEMO_VIDEOS = [
  {
    title: "Controlling Your Dopamine For Motivation, Focus & Satisfaction",
    date: "Sep 2021",
    duration: "1:37:02",
    youtubeId: "QmOF0crdyRU",
    thumbnail: "https://i.ytimg.com/vi/QmOF0crdyRU/maxresdefault.jpg",
    matches: [
      { time: "9:58",  seconds: 598,  before: "...so let's talk about ", highlight: "dopamine", after: " — most people have heard of it..." },
      { time: "18:14", seconds: 1094, before: "...", highlight: "dopamine", after: " can be released locally at synapses or broadly..." },
    ],
  },
  {
    title: "The Science of Making & Breaking Habits",
    date: "Jan 2022",
    duration: "1:00:16",
    youtubeId: "Wcs2PFz5q6g",
    thumbnail: "https://i.ytimg.com/vi/Wcs2PFz5q6g/maxresdefault.jpg",
    matches: [
      { time: "48:00", seconds: 2880, before: "...the science of ", highlight: "dopamine", after: " rewards and how to apply it to habits..." },
    ],
  },
] as const;

// Flat list of all moments for cycling
const ALL_MOMENTS = DEMO_VIDEOS.flatMap((v, vi) =>
  v.matches.map((m) => ({ ...m, video: v, videoIdx: vi }))
);

function DemoMockup() {
  const [activeIdx, setActiveIdx] = useState(0);
  const [userActed, setUserActed] = useState(false);

  useEffect(() => {
    if (userActed) return;
    const t = setInterval(
      () => setActiveIdx((p) => (p + 1) % ALL_MOMENTS.length),
      2800
    );
    return () => clearInterval(t);
  }, [userActed]);

  const select = (i: number) => {
    setUserActed(true);
    setActiveIdx(i);
    const { video, seconds } = ALL_MOMENTS[i];
    posthog.capture("demo_timestamp_clicked", { video_id: video.youtubeId, timestamp: ALL_MOMENTS[i].time, seconds });
    window.open(
      `https://www.youtube.com/watch?v=${video.youtubeId}&t=${seconds}s`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  const current = ALL_MOMENTS[activeIdx];
  const currentPct =
    (current.seconds / parseDuration(current.video.duration)) * 100;

  // Flat index offset for each video's first match
  const videoOffset = (vi: number) =>
    DEMO_VIDEOS.slice(0, vi).reduce((s, v) => s + v.matches.length, 0);

  return (
    <motion.section
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={spring}
      className="pb-24"
    >
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 max-w-5xl mx-auto">
        {/* ── Side panel ── */}
        <div className="glass rounded-2xl p-4 flex flex-col gap-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono tracking-widest text-yt-light-gray uppercase">
              Side Panel
            </span>
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <span key={i} className="w-1.5 h-1.5 rounded-full bg-white/10" />
              ))}
            </div>
          </div>

          {/* Inputs */}
          <div className="flex flex-col gap-1.5">
            <div className="glass rounded-xl px-3 py-2 text-sm text-white/90">
              @hubermanlab
            </div>
            <div className="glass rounded-xl px-3 py-2 text-sm text-white/90 flex items-center justify-between">
              <span>dopamine</span>
              <span className="text-xs text-yt-light-gray font-mono">kw</span>
            </div>
          </div>

          {/* Results — grouped by video */}
          <div className="flex flex-col gap-2">
            {DEMO_VIDEOS.map((video, vi) => (
              <div key={vi} className="glass rounded-xl overflow-hidden">
                {/* Video header */}
                <div className="px-3 pt-2.5 pb-2 border-b border-white/5">
                  <p className="text-[11px] font-semibold text-white leading-tight line-clamp-1">
                    {video.title}
                  </p>
                  <p className="text-[10px] text-yt-light-gray font-mono mt-0.5">
                    {video.date} · {video.duration}
                  </p>
                </div>

                {/* Match rows */}
                <div className="p-1.5 flex flex-col gap-1">
                  {video.matches.map((match, mi) => {
                    const flatIdx = videoOffset(vi) + mi;
                    const isActive = flatIdx === activeIdx;
                    return (
                      <button
                        key={mi}
                        type="button"
                        onClick={() => select(flatIdx)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all text-left cursor-pointer ${
                          isActive ? "bg-yt-red/10" : "hover:bg-white/5"
                        }`}
                      >
                        <div
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 shrink-0 transition-colors ${
                            isActive
                              ? "bg-yt-red text-white"
                              : "bg-yt-gray text-white/60"
                          }`}
                        >
                          <Clock className="w-2.5 h-2.5" />
                          {match.time}
                        </div>
                        <p
                          className={`text-[10px] leading-snug truncate transition-colors ${
                            isActive ? "text-white/80" : "text-yt-light-gray"
                          }`}
                        >
                          {match.before}
                          <span className="text-white bg-yt-red/20 px-0.5 rounded">
                            {match.highlight}
                          </span>
                          {match.after}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Player ── */}
        <div className="glass rounded-2xl overflow-hidden aspect-video relative">
          <AnimatePresence mode="wait">
            <motion.img
              key={`thumb-${activeIdx}`}
              src={current.video.thumbnail}
              alt=""
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="absolute inset-0 w-full h-full object-cover"
            />
          </AnimatePresence>
          <div className="absolute inset-0 bg-black/45" />
          <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/80 to-transparent" />

          <AnimatePresence mode="wait">
            <motion.div
              key={`cc-${activeIdx}`}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -3 }}
              transition={{ duration: 0.18 }}
              className="absolute z-20 left-0 right-0 flex justify-center"
              style={{ bottom: "3rem" }}
            >
              <div className="bg-black/85 backdrop-blur-sm rounded px-3 py-1.5 text-[11px] font-mono text-white/80 max-w-[80%] text-center leading-relaxed">
                {current.before}
                <span className="text-white font-semibold bg-yt-red/50 px-1 rounded">
                  {current.highlight}
                </span>
                {current.after}
              </div>
            </motion.div>
          </AnimatePresence>

          <div className="absolute bottom-0 left-0 right-0 z-20 px-3 py-2.5 flex items-center gap-2.5">
            <motion.div
              key={`playbtn-${activeIdx}`}
              initial={{ scale: 1.25 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 24 }}
              className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center shrink-0"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="white">
                <path d="M8 5v14l11-7z" />
              </svg>
            </motion.div>
            <div className="flex-1 h-[3px] rounded-full bg-white/15 overflow-hidden">
              <motion.div
                className="h-full bg-yt-red rounded-full"
                animate={{ width: `${currentPct}%` }}
                transition={spring}
              />
            </div>
            <motion.span
              key={`ts-${activeIdx}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="text-[9px] font-mono text-white/40 tabular-nums shrink-0"
            >
              {current.time} / {current.video.duration}
            </motion.span>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

// ── How it works ──────────────────────────────────────────────────────────────

function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Install the extension",
      body: "One click from the Chrome Web Store. No account, no setup.",
    },
    {
      n: "02",
      title: "Open the side panel",
      body: "Click the toolbar icon. The panel opens alongside whatever you're doing.",
    },
    {
      n: "03",
      title: "Search a channel",
      body: "Paste a channel URL or @handle, type a keyword, hit search. Results stream in as each video is scanned.",
    },
    {
      n: "04",
      title: "Jump to the moment",
      body: "Click any timestamp. The video opens in YouTube at the exact second the word is spoken — no scrubbing.",
    },
  ];

  return (
    <section id="how" className="pb-28">
      <SectionHeading
        eyebrow="How it works"
        title="Four steps, no configuration"
      />

      <ol className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-10 mt-12">
        {steps.map((step, i) => (
          <motion.li
            key={step.n}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ ...spring, delay: i * 0.08 }}
            className="flex flex-col"
          >
            <div className="w-9 h-9 rounded-xl bg-yt-red/10 border border-yt-red/20 flex items-center justify-center mb-4">
              <span className="text-xs font-mono font-bold text-yt-red">{step.n}</span>
            </div>
            <h3 className="text-lg font-bold tracking-tight mb-2">{step.title}</h3>
            <p className="text-yt-light-gray text-sm leading-relaxed">{step.body}</p>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}

// ── Features ──────────────────────────────────────────────────────────────────
//
// 2×2 asymmetric grid.  DESIGN.md forbids 3-column equal grids; 2×2 keeps the
// density high without that generic SaaS look, and lets the first feature
// (the differentiator) take more vertical real estate if we later add depth.

function Features() {
  return (
    <section className="pb-28">
      <SectionHeading eyebrow="Features" title="Built for the way you actually search" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-12">
        <Feature
          wide
          icon={<Layers className="w-5 h-5" />}
          title="Searches the whole channel — not just the video you're on"
          body="Most tools stop at the video in front of you. TimeStitch scans every video on a channel and returns every moment the word was spoken, across all of them."
          example={
            <div className="font-mono text-xs pt-3 border-t border-white/5 flex flex-wrap gap-x-8 gap-y-1.5">
              <div className="flex gap-2">
                <span className="text-yt-light-gray/60 select-none">channel</span>
                <span className="text-white">@hubermanlab</span>
              </div>
              <div className="flex gap-2">
                <span className="text-yt-light-gray/60 select-none">keyword</span>
                <span className="text-white">dopamine</span>
              </div>
              <div className="flex gap-2">
                <span className="text-yt-light-gray/60 select-none">videos scanned</span>
                <span className="text-white">412</span>
              </div>
              <div className="flex gap-2">
                <span className="text-yt-light-gray/60 select-none">timestamps found</span>
                <span className="text-white bg-yt-red/20 px-1 rounded">11</span>
              </div>
            </div>
          }
        />

        <Feature
          icon={<Zap className="w-5 h-5" />}
          title="Phonetic matching"
          body="Transcripts say what they hear. Ctrl F for YouTube matches the way words sound, not just how they're spelled."
          example={
            <Example
              query="PostHog"
              transcript="...and the post hog dashboard..."
              highlight="post hog"
            />
          }
        />

        <Feature
          icon={<Globe className="w-5 h-5" />}
          title="Works across English and Hindi"
          body="Search with Latin letters, match Devanagari captions — and the reverse. Auto-generated transcripts are noisy; Ctrl F for YouTube is built for it."
          example={
            <Example
              query="Finology"
              transcript="...तो फिनोलॉजी का मतलब..."
              highlight="फिनोलॉजी"
            />
          }
        />

        <Feature
          icon={<Clock className="w-5 h-5" />}
          title="Jump to the exact second"
          body="Every match is a timestamped link. One click opens the video in YouTube at the exact frame the word is spoken — no scrubbing required."
        />

        <Feature
          icon={<Lock className="w-5 h-5" />}
          title="Runs in your browser"
          body="Transcripts are fetched by your browser, through your session. Not routed through a server. Captions you can see logged in, Ctrl F for YouTube can see too."
        />
      </div>
    </section>
  );
}

function Feature({
  icon,
  title,
  body,
  example,
  wide,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  example?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={spring}
      className={`glass rounded-2xl p-6 flex flex-col gap-3 group hover:border-white/20 transition-all${wide ? " md:col-span-2" : ""}`}
    >
      <div className="w-9 h-9 rounded-lg bg-yt-red/10 border border-yt-red/20 text-yt-red flex items-center justify-center group-hover:bg-yt-red/20 group-hover:border-yt-red/40 transition-all">
        {icon}
      </div>
      <h3 className="text-lg font-bold tracking-tight">{title}</h3>
      <p className="text-yt-light-gray text-sm leading-relaxed">{body}</p>
      {example && <div className="mt-2">{example}</div>}
    </motion.div>
  );
}

function Example({
  query,
  transcript,
  highlight,
}: {
  query: string;
  transcript: string;
  highlight: string;
}) {
  const parts = transcript.split(highlight);
  return (
    <div className="font-mono text-xs space-y-1.5 pt-3 border-t border-white/5">
      <div className="flex gap-2">
        <span className="text-yt-light-gray/60 select-none">query</span>
        <span className="text-white">{query}</span>
      </div>
      <div className="flex gap-2">
        <span className="text-yt-light-gray/60 select-none">match</span>
        <span className="text-yt-light-gray">
          {parts[0]}
          <span className="text-white bg-yt-red/20 px-1 rounded">{highlight}</span>
          {parts[1]}
        </span>
      </div>
    </div>
  );
}

// ── Closing CTA ───────────────────────────────────────────────────────────────

function ClosingCta() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={spring}
      className="pb-16"
    >
      <div className="glass rounded-3xl px-8 py-16 md:py-20 text-center">
        <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4 max-w-2xl mx-auto">
          Stop scrubbing through videos.
        </h2>
        <p className="text-yt-light-gray text-base md:text-lg max-w-xl mx-auto mb-8">
          Install the extension and search YouTube the way you search anything else.
        </p>
        <a
          href={buildInstallUrl("footer_banner")}
          onClick={() => handleCtaClick("footer_banner")}
          className="inline-flex items-center gap-2 bg-yt-red hover:bg-yt-red/90 active:translate-y-px text-white font-semibold px-7 py-3.5 rounded-xl transition-all shadow-lg shadow-yt-red/20"
        >
          <Puzzle className="w-5 h-5" />
          Add to Chrome — Free
        </a>
      </div>
    </motion.section>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="relative z-10 border-t border-white/5 mt-8">
      <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-yt-light-gray">
        <div className="flex items-center gap-2">
          <Youtube className="w-4 h-4 text-yt-red" />
          <span className="font-medium text-white">Ctrl F for YouTube</span>
          <span className="font-mono text-xs text-yt-light-gray/60 ml-1">transcript search</span>
        </div>
        <div className="flex items-center gap-5">
          <a href="#how" className="hover:text-white transition-colors">How it works</a>
          <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
          <a
            href="https://tally.so/r/7RJQZA?source=landing_footer"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => posthog.capture("feedback_link_clicked", { trigger: "footer" })}
            className="hover:text-white transition-colors"
          >
            Feedback
          </a>
          <a
            href={buildInstallUrl("footer_links")}
            onClick={() => handleCtaClick("footer_links")}
            className="hover:text-white transition-colors"
          >
            Install
          </a>
        </div>
      </div>
    </footer>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <span className="text-xs font-mono text-yt-red tracking-widest uppercase">
        {eyebrow}
      </span>
      <h2 className="text-3xl md:text-4xl font-bold tracking-tight max-w-2xl">
        {title}
      </h2>
    </div>
  );
}
