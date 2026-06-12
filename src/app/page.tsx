/* Hallmark · genre: editorial · macrostructure: Workbench · theme: DESIGN.md locked
 * enrichment: interactive functional demo (ExtensionPreview — Tier-A equivalent)
 * nav: N9 edge-aligned minimal · footer: Ft2 inline single line
 * N9 knobs: CTA=filled, wordmark=sans, padding=default
 * Ft2 knobs: order=wordmark/links/credit, separator=middot, density=spaced
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Sun, Moon, ArrowRight } from "lucide-react";
import posthog from "posthog-js";
import Link from "next/link";

const ACCENT = "#FF4500";
const ACCENT_HOVER = "#E03A00";
const MONO = "var(--font-mono), 'JetBrains Mono', monospace";
const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

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
        sub: "#5a5754",
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
  // Single scroll threshold drives both bars: past it, the sticky bottom bar
  // owns the CTA and the nav CTA fades out so two install buttons are never
  // visible at once.
  const [pastHero, setPastHero] = useState(false);
  const T = makeTheme(dark);

  useEffect(() => {
    const handler = () => setPastHero(window.scrollY > 420);
    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: T.bg,
        color: T.text,
        transition: "background 0.25s, color 0.25s",
      }}
    >
      <Nav T={T} dark={dark} onToggle={() => setDark((d) => !d)} hideCta={pastHero} />
      <HeroSection T={T} dark={dark} />
      <UseCases T={T} />
      <SpecSheet T={T} />
      <SiteFooter T={T} />
      <StickyCta T={T} dark={dark} visible={pastHero} />
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

// ── Logo ──────────────────────────────────────────────────────────────────────

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

// ── Nav — N9 Edge-aligned minimal ─────────────────────────────────────────────

function Nav({
  T,
  dark,
  onToggle,
  hideCta,
}: {
  T: Theme;
  dark: boolean;
  onToggle: () => void;
  hideCta: boolean;
}) {
  return (
    <nav
      className="nav-n9"
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
        <Logo size={22} />
        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.02em" }}>
          ClipChase
        </span>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <ThemeToggle dark={dark} onToggle={onToggle} T={T} />
        <motion.a
          href={buildInstallUrl("header")}
          onClick={() => handleCtaClick("header")}
          variants={{ hover: { backgroundColor: ACCENT_HOVER } }}
          whileHover="hover"
          whileTap={{ scale: 0.97 }}
          animate={{ opacity: hideCta ? 0 : 1 }}
          transition={{ duration: 0.2 }}
          style={{
            pointerEvents: hideCta ? "none" : "auto",
            padding: "9px 16px",
            borderRadius: 5,
            background: ACCENT,
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            whiteSpace: "nowrap",
          }}
        >
          Add to Chrome
          <motion.span
            variants={{ hover: { x: 3 } }}
            transition={{ duration: 0.15 }}
            style={{ display: "inline-flex", alignItems: "center" }}
          >
            <ArrowRight size={12} />
          </motion.span>
        </motion.a>
      </div>
    </nav>
  );
}

// ── Hero section — split: text left, interactive demo right ──────────────────

function HeroSection({ T, dark }: { T: Theme; dark: boolean }) {
  const reduced = useReducedMotion();

  return (
    <section
      className="hero-section"
      style={{
        maxWidth: 1120,
        margin: "0 auto",
        padding: "72px 48px 80px",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "0 64px",
        alignItems: "flex-start",
        borderBottom: `1px solid ${T.border}`,
      }}
    >
      {/* Left: copy + CTA — offset to align badge with top of demo preview */}
      <motion.div
        initial={reduced ? undefined : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
        style={{ paddingTop: 28 }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            padding: "3px 10px",
            borderRadius: 4,
            border: `1px solid ${T.border}`,
            background: T.surface,
            marginBottom: 24,
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
          <span style={{ fontSize: 12, color: T.sub, fontWeight: 500, fontFamily: MONO }}>
            Free · No account needed
          </span>
        </div>

        <h1
          style={{
            margin: "0 0 16px",
            fontSize: "clamp(28px, 3.5vw, 44px)",
            fontWeight: 800,
            letterSpacing: "-0.04em",
            lineHeight: 1.05,
            overflowWrap: "anywhere",
            minWidth: 0,
          }}
        >
          Ctrl+F for YouTube
        </h1>

        <p
          style={{
            margin: "0 0 36px",
            fontSize: 17,
            color: T.sub,
            lineHeight: 1.65,
            maxWidth: 420,
          }}
        >
          Find every time a creator mentioned a topic, across their entire
          channel, and jump to that exact moment.
        </p>

        <motion.a
          href={buildInstallUrl("hero")}
          onClick={() => handleCtaClick("hero")}
          variants={{ hover: { backgroundColor: ACCENT_HOVER } }}
          whileHover="hover"
          whileTap={{ scale: 0.97 }}
          transition={{ duration: 0.15 }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "13px 24px",
            borderRadius: 6,
            background: ACCENT,
            color: "#fff",
            fontSize: 14,
            fontWeight: 700,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          Add to Chrome · Free
          <motion.span
            variants={{ hover: { x: 3 } }}
            transition={{ duration: 0.15 }}
            style={{ display: "inline-flex", alignItems: "center" }}
          >
            <ArrowRight size={12} />
          </motion.span>
        </motion.a>
      </motion.div>

      {/* Right: interactive demo */}
      <motion.div
        initial={reduced ? undefined : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1, ease: EASE_OUT }}
        style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 12,
            fontFamily: MONO,
            color: T.sub,
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
          }}
        >
          Enter a channel · search a phrase · click any timestamp
        </p>
        <ExtensionPreview T={T} dark={dark} />
        <p
          style={{
            margin: 0,
            fontSize: 12,
            fontFamily: MONO,
            color: T.sub,
            letterSpacing: "0.04em",
          }}
        >
          Try: &ldquo;ai&rdquo; &middot; &ldquo;funding&rdquo; &middot;
          &ldquo;pivot&rdquo; &middot; &ldquo;launch&rdquo;
        </p>
      </motion.div>
    </section>
  );
}

// ── Extension preview — unchanged interactive demo ────────────────────────────

type DemoSnippet = { ts: string; text: string };
type DemoResult = { t: string; n: number; snippets: DemoSnippet[] };
type DemoData = { mentions: number; videos: number; results: DemoResult[] };

const FILTERS = ["1d", "7d", "1mo", "6mo", "All"];
const FILTER_LABELS = ["1 day", "7 days", "1 month", "6 months", "all time"];

const DEMO_DATA: Record<string, DemoData> = {
  cursor: {
    mentions: 32,
    videos: 4,
    results: [
      {
        t: "How Cursor is Changing the Way We Code",
        n: 14,
        snippets: [
          { ts: "1:23", text: "I've been using Cursor for three months and it genuinely transformed how I write code every day." },
          { ts: "8:47", text: "The way Cursor handles context is different from Copilot. It reads your whole codebase, not just the open file." },
          { ts: "14:02", text: "If you haven't tried Cursor yet, you're missing the biggest shift in developer tooling we've seen in years." },
        ],
      },
      {
        t: "YC W24 Demo Day: AI Tools Roundup",
        n: 9,
        snippets: [
          { ts: "3:15", text: "Five of the twelve companies on stage today mentioned Cursor as part of their engineering stack." },
          { ts: "19:40", text: "The Cursor team was in this batch and the growth numbers they showed were genuinely hard to believe." },
        ],
      },
      {
        t: "The Future of Software Development",
        n: 6,
        snippets: [
          { ts: "6:11", text: "Tools like Cursor are just the beginning of what AI-assisted coding looks like at scale." },
          { ts: "31:52", text: "I asked the Cursor founders what the five-year trajectory looks like for this kind of tooling." },
        ],
      },
      {
        t: "Startup Tools We Actually Use in 2024",
        n: 3,
        snippets: [
          { ts: "2:08", text: "We switched our entire team to Cursor six weeks ago and our PR velocity went up measurably." },
        ],
      },
    ],
  },
  ai: {
    mentions: 147,
    videos: 12,
    results: [
      {
        t: "YC W24 Demo Day: AI Tools Roundup",
        n: 28,
        snippets: [
          { ts: "0:38", text: "Basically every company here is building with AI in some capacity. This is genuinely the AI batch." },
          { ts: "6:15", text: "Roughly 70% of the W24 batch has AI as a core part of their product, not just a feature." },
          { ts: "22:41", text: "What makes a good AI company right now is data advantage, not just which model you're sitting on top of." },
        ],
      },
      {
        t: "How Cursor is Changing the Way We Code",
        n: 21,
        snippets: [
          { ts: "2:04", text: "Cursor is the best example of AI tooling that actually respects how developers think and work." },
          { ts: "11:33", text: "The real question isn't whether AI will change coding but how fast the transition happens at the org level." },
          { ts: "18:50", text: "AI pair programming isn't about replacing you. It's about eliminating the parts of coding no one enjoys." },
        ],
      },
      {
        t: "The Future of Software Development",
        n: 19,
        snippets: [
          { ts: "4:28", text: "The companies that figure out how to embed AI into their dev workflow now will have a compounding advantage." },
          { ts: "27:16", text: "AI is not a feature you bolt on. It changes how you architect the product from the very beginning." },
        ],
      },
      {
        t: "Building an AI Startup in 2024",
        n: 18,
        snippets: [
          { ts: "1:12", text: "The hardest part of building an AI startup right now is convincing customers you're not just wrapping GPT-4." },
          { ts: "8:33", text: "Your AI moat has to be the data flywheel, not the model choice. Anyone can swap in a new model tomorrow." },
          { ts: "15:47", text: "The AI companies that win in five years are the ones collecting proprietary signal right now." },
        ],
      },
    ],
  },
  funding: {
    mentions: 24,
    videos: 7,
    results: [
      {
        t: "How to Raise Your First Round",
        n: 8,
        snippets: [
          { ts: "3:41", text: "Most first-time founders wait too long to start fundraising. Talk to investors before you need the money." },
          { ts: "14:22", text: "The funding conversation is really a conviction conversation. Investors are betting on your ability to figure things out." },
        ],
      },
      {
        t: "YC's Advice on Seed Funding in 2024",
        n: 6,
        snippets: [
          { ts: "2:09", text: "Seed funding in 2024 is tighter than 2021 but there's still money for companies with real traction." },
          { ts: "11:05", text: "The bar for a seed round has moved. Most investors want to see some signal before writing a check." },
        ],
      },
      {
        t: "Demo Day Prep: What Investors Look For",
        n: 5,
        snippets: [
          { ts: "5:30", text: "What investors are actually looking for is evidence that you understand your customer better than anyone else." },
        ],
      },
      {
        t: "Startup School: Fundraising 101",
        n: 5,
        snippets: [
          { ts: "0:55", text: "Fundraising is a sales process and the product you're selling is the future version of your company." },
          { ts: "9:18", text: "Don't optimize for valuation on your seed round. Optimize for the right partner at the right fund." },
        ],
      },
    ],
  },
  pivot: {
    mentions: 11,
    videos: 4,
    results: [
      {
        t: "Finding PMF Before You Run Out",
        n: 4,
        snippets: [
          { ts: "7:02", text: "The decision to pivot is almost never obvious. You're usually in a fog exactly when you need clarity most." },
          { ts: "18:44", text: "A good pivot isn't abandoning your idea, it's finding the real insight your original idea was pointing at." },
        ],
      },
      {
        t: "YC's Most Important Advice",
        n: 3,
        snippets: [
          { ts: "4:33", text: "PG's advice on when to pivot is still the clearest framework: talk to users, don't pivot on vibes alone." },
        ],
      },
      {
        t: "Startup School: Customer Discovery",
        n: 2,
        snippets: [
          { ts: "11:20", text: "Customer discovery is how you know whether you need to pivot or just execute better on the current path." },
        ],
      },
      {
        t: "Building What People Actually Want",
        n: 2,
        snippets: [
          { ts: "3:17", text: "Most pivots happen because founders were building what they thought people wanted, not what they actually use." },
        ],
      },
    ],
  },
  launch: {
    mentions: 38,
    videos: 6,
    results: [
      {
        t: "How to Launch Your Startup",
        n: 11,
        snippets: [
          { ts: "2:55", text: "The biggest mistake founders make is waiting too long to launch. Your first launch doesn't have to be perfect." },
          { ts: "9:14", text: "Launch early and often. Each launch is a chance to learn something you couldn't learn in the building phase." },
          { ts: "21:38", text: "The goal of your first launch is to find out if your hypothesis is even in the right ballpark." },
        ],
      },
      {
        t: "YC Demo Day Tips",
        n: 9,
        snippets: [
          { ts: "1:08", text: "Demo Day is a launch. You're launching your company to a room full of investors who will talk to each other." },
          { ts: "7:52", text: "The best Demo Day pitches launch the company, not just the product. They make you believe in the founders." },
        ],
      },
      {
        t: "Startup School: Growth Strategies",
        n: 8,
        snippets: [
          { ts: "5:22", text: "After you launch, the question isn't how to grow faster. It's understanding why you're growing at all." },
        ],
      },
      {
        t: "Going From Idea to Launch",
        n: 6,
        snippets: [
          { ts: "0:44", text: "The shortest path from idea to launch is almost always doing things that don't scale first." },
          { ts: "13:09", text: "Every day you spend not launching is a day you're not learning what your actual customers think." },
        ],
      },
    ],
  },
};

const DEMO_FALLBACK: DemoData = {
  mentions: 7,
  videos: 3,
  results: [
    {
      t: "Startup School: What Makes a Great Startup",
      n: 3,
      snippets: [
        { ts: "4:12", text: "The best startups have one thing in common: the founders are obsessed with the problem, not the solution." },
      ],
    },
    {
      t: "YC's Best Advice for Founders",
      n: 2,
      snippets: [
        { ts: "8:30", text: "The advice that actually matters is always specific. Generalities won't help you through the hard moments." },
      ],
    },
    {
      t: "How to Find Your First Users",
      n: 2,
      snippets: [
        { ts: "2:47", text: "Your first ten users tell you everything. Talk to them every week until you stop being surprised." },
      ],
    },
  ],
};

function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);
  // Odd indices are captured match groups from the split — no regex.test()
  // needed (avoids the stateful /g lastIndex bug that makes every other
  // match render unhighlighted).
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} style={{ color: ACCENT, fontWeight: 700 }}>
            {part}
          </strong>
        ) : (
          part
        ),
      )}
    </>
  );
}

function ExtensionPreview({ T, dark }: { T: Theme; dark: boolean }) {
  const shadow = dark
    ? "0 20px 60px rgba(0,0,0,0.7)"
    : "0 20px 60px rgba(0,0,0,0.12)";

  const reduced = useReducedMotion();
  const [query, setQuery] = useState("Cursor");
  const [activeFilter, setActiveFilter] = useState(2);
  const [focused, setFocused] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchKey, setSearchKey] = useState("initial");
  const [currentData, setCurrentData] = useState<DemoData>(DEMO_DATA.cursor);
  const [activeQuery, setActiveQuery] = useState("Cursor");
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showPing, setShowPing] = useState(false);
  const [displayCount, setDisplayCount] = useState(currentData.mentions);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current !== null) clearTimeout(searchTimerRef.current);
    };
  }, []);

  // Ping beacon: first fire at 1.8s, then every 7s
  useEffect(() => {
    const fire = () => { setShowPing(true); setTimeout(() => setShowPing(false), 600); };
    const initial = setTimeout(fire, 1800);
    const interval = setInterval(fire, 7000);
    return () => { clearTimeout(initial); clearInterval(interval); };
  }, []);

  // Count-up animation whenever mention count changes
  useEffect(() => {
    if (reduced) { setDisplayCount(currentData.mentions); return; }
    let frame: number;
    const start = performance.now();
    const duration = 520;
    const target = currentData.mentions;
    setDisplayCount(0);
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayCount(Math.round(eased * target));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [currentData.mentions, reduced]);

  function handleSearch() {
    const normalized = query.trim().toLowerCase();
    if (!normalized || isSearching) return;
    if (searchTimerRef.current !== null) clearTimeout(searchTimerRef.current);
    setIsSearching(true);
    setExpandedIndex(null);
    searchTimerRef.current = setTimeout(
      () => {
        setCurrentData(DEMO_DATA[normalized] ?? DEMO_FALLBACK);
        setActiveQuery(query.trim());
        setSearchKey(normalized + "_" + Date.now());
        setExpandedIndex(0);
        setIsSearching(false);
        searchTimerRef.current = null;
      },
      reduced ? 100 : 700,
    );
  }

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
      }}
    >
      {/* Header */}
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
          ClipChase
        </span>
      </div>

      {/* Search controls */}
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
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Search phrase..."
            aria-label="Search phrase"
            style={{
              flex: 1,
              padding: "6px 9px",
              borderRadius: 4,
              border: `1px solid ${focused ? ACCENT : T.inputBorder}`,
              background: focused ? `${ACCENT}18` : T.inputBg,
              fontSize: 11,
              color: T.popupText,
              outline: "none",
              fontFamily: "inherit",
              transition: "border-color 0.15s, background 0.15s",
            }}
          />
          <motion.button
            onClick={handleSearch}
            whileHover={{ background: ACCENT_HOVER }}
            whileTap={reduced ? {} : { scale: 0.95 }}
            transition={{ duration: 0.12 }}
            style={{
              padding: "6px 12px",
              borderRadius: 4,
              background: ACCENT,
              fontSize: 11,
              color: "#fff",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
              position: "relative",
              flexShrink: 0,
              overflow: "hidden",
            }}
          >
            <AnimatePresence>
              {showPing && (
                <motion.span
                  initial={{ x: "-100%" }}
                  animate={{ x: "220%" }}
                  exit={{}}
                  transition={{ duration: 0.7, ease: "easeInOut" }}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "55%",
                    height: "100%",
                    background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.38), transparent)",
                    pointerEvents: "none",
                  }}
                />
              )}
            </AnimatePresence>
            Search
          </motion.button>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {FILTERS.map((f, i) => (
            <button
              key={f}
              onClick={() => setActiveFilter(i)}
              aria-pressed={i === activeFilter}
              aria-label={`Filter by ${FILTER_LABELS[i]}`}
              style={{
                padding: "2px 7px",
                borderRadius: 4,
                border: `1px solid ${i === activeFilter ? ACCENT : T.inputBorder}`,
                background: i === activeFilter ? `${ACCENT}18` : "transparent",
                fontSize: 10,
                color: i === activeFilter ? ACCENT : T.popupSub,
                fontFamily: MONO,
                cursor: "pointer",
                transition: "border-color 0.15s, background 0.15s, color 0.15s",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Meta line */}
      <div
        style={{
          padding: "5px 12px 4px",
          borderBottom: `1px solid ${T.popupBorder}`,
          minHeight: 24,
          display: "flex",
          alignItems: "center",
        }}
      >
        <AnimatePresence mode="wait">
          <motion.span
            key={`${searchKey}_${activeFilter}`}
            initial={reduced ? undefined : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduced ? undefined : { opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ fontSize: 10, color: T.popupSub, fontVariantNumeric: "tabular-nums" }}
          >
            <span style={{ color: ACCENT, fontWeight: 600, fontFamily: MONO }}>
              {displayCount} mentions
            </span>
            {` · ${currentData.videos} videos · ${FILTER_LABELS[activeFilter]}`}
          </motion.span>
        </AnimatePresence>
      </div>

      {/* Results */}
      <AnimatePresence mode="wait">
        {isSearching ? (
          <motion.div
            key="loading"
            initial={reduced ? undefined : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduced ? undefined : { opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {Array.from({ length: 4 }).map((_, i) => (
              <motion.div
                key={i}
                animate={reduced ? {} : { opacity: [0.3, 0.7, 0.3] }}
                transition={{
                  duration: 1.1,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: i * 0.1,
                }}
                style={{
                  display: "flex",
                  gap: 9,
                  padding: "9px 12px",
                  borderBottom: i < 3 ? `1px solid ${T.popupBorder}` : "none",
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
                  }}
                />
                <div
                  style={{
                    flex: 1,
                    height: 8,
                    borderRadius: 2,
                    background: T.thumbBg,
                  }}
                />
                <div
                  style={{
                    width: 18,
                    height: 12,
                    borderRadius: 2,
                    background: T.thumbBg,
                  }}
                />
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <motion.div
            key={searchKey}
            initial={reduced ? undefined : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
          >
            {currentData.results.map((r, i) => (
              <motion.div
                key={r.t}
                initial={reduced ? undefined : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: reduced ? 0 : 0.3,
                  delay: reduced ? 0 : i * 0.07,
                  ease: EASE_OUT,
                }}
                style={{
                  borderBottom:
                    i < currentData.results.length - 1
                      ? `1px solid ${T.popupBorder}`
                      : "none",
                }}
              >
                <motion.div
                  onClick={() =>
                    setExpandedIndex(expandedIndex === i ? null : i)
                  }
                  whileHover={{
                    backgroundColor: dark
                      ? "rgba(255,255,255,0.07)"
                      : "rgba(0,0,0,0.06)",
                  }}
                  transition={{ duration: 0.12 }}
                  style={{
                    display: "flex",
                    gap: 9,
                    padding: "9px 12px",
                    alignItems: "center",
                    cursor: "pointer",
                    userSelect: "none",
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
                      fill={
                        dark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)"
                      }
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
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: ACCENT,
                        fontFamily: MONO,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {r.n}
                    </span>
                    <motion.span
                      animate={{ rotate: expandedIndex === i ? 180 : 0 }}
                      transition={{ duration: 0.2, ease: EASE_OUT }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        color: T.popupSub,
                      }}
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path
                          d="M2 3.5L5 6.5L8 3.5"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </motion.span>
                  </div>
                </motion.div>

                <AnimatePresence>
                  {expandedIndex === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: EASE_OUT }}
                      style={{ overflow: "hidden" }}
                    >
                      <div
                        style={{
                          borderTop: `1px solid ${T.popupBorder}`,
                          padding: "4px 0 6px",
                        }}
                      >
                        {r.snippets.map((s, si) => (
                          <div
                            key={si}
                            style={{
                              display: "flex",
                              gap: 8,
                              padding: "5px 12px",
                              alignItems: "flex-start",
                            }}
                          >
                            <span
                              style={{
                                fontFamily: MONO,
                                fontSize: 9,
                                color: ACCENT,
                                fontWeight: 600,
                                flexShrink: 0,
                                paddingTop: 1,
                                minWidth: 30,
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {s.ts}
                            </span>
                            <span
                              style={{
                                fontSize: 10,
                                color: T.popupSub,
                                lineHeight: 1.5,
                              }}
                            >
                              {highlightText(s.text, activeQuery)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Use cases — recognition scenes, 2×2 divider grid ─────────────────────────

const USE_CASES: [string, string][] = [
  [
    "He mentioned a book in some episode...",
    "Your favorite creator recommended a book, a movie, a tool. Months ago. Some episode. Search the title and jump straight to the moment.",
  ],
  [
    "What has she actually said about Bitcoin?",
    "Every take, across every video, in one list. Sorted by how often it comes up, filterable by date. See the latest position, not just the loudest one.",
  ],
  [
    "The fix is somewhere in his hour-long video.",
    "Search the error message or the function name. Land on the exact second they cover it. No scrubbing.",
  ],
  [
    "I need the exact quote, with a timestamp.",
    "For writers, students, and anyone citing a video. Find the line, click the timestamp, and you're watching the moment it was said.",
  ],
];

function UseCases({ T }: { T: Theme }) {
  const reduced = useReducedMotion();
  return (
    <section
      className="spec-sheet-section"
      style={{
        maxWidth: 1120,
        margin: "0 auto",
        padding: "72px 48px 16px",
      }}
    >
      <p
        style={{
          margin: "0 0 36px",
          fontSize: 12,
          fontFamily: MONO,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: T.sub,
        }}
      >
        What people chase
      </p>

      <div
        className="use-case-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "48px 64px",
        }}
      >
        {USE_CASES.map(([quote, desc], i) => (
          <motion.div
            key={quote}
            initial={reduced ? false : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.4, delay: (i % 2) * 0.08 }}
          >
            <p
              style={{
                margin: "0 0 8px",
                fontSize: 16,
                fontWeight: 600,
                fontStyle: "italic",
                letterSpacing: "-0.01em",
                lineHeight: 1.4,
                color: T.text,
              }}
            >
              <span style={{ color: ACCENT, fontStyle: "normal" }}>&ldquo;</span>
              {quote}
              <span style={{ color: ACCENT, fontStyle: "normal" }}>&rdquo;</span>
            </p>
            <p
              style={{
                margin: 0,
                fontSize: 14,
                color: T.sub,
                lineHeight: 1.65,
                maxWidth: 440,
              }}
            >
              {desc}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

// ── Spec sheet — F3 tabular ───────────────────────────────────────────────────

const SPEC_ROWS: [string, string, boolean?][] = [
  ["Full transcript search", "Every word of every video indexed. Not just titles.", true],
  ["Clickable timestamps", "Each result links directly to that second in the video. No manual seeking.", true],
  ["Any public channel", "Any channel you can think of. No account, no API key, no friction."],
  ["Private by default", "Runs entirely in your browser. Searches never leave your device."],
  ["Ranked by frequency", "The videos where it comes up most appear first. Not just the most recent."],
  ["Time-range filter", "Narrow results to 1 day, 7 days, 1 month, 6 months, or all time."],
];

function SpecSheet({ T }: { T: Theme }) {
  return (
    <section
      className="spec-sheet-section"
      style={{
        maxWidth: 1120,
        margin: "0 auto",
        padding: "64px 48px 88px",
      }}
    >
      <p
        style={{
          margin: "0 0 20px",
          fontSize: 12,
          fontFamily: MONO,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: T.sub,
        }}
      >
        Capabilities
      </p>

      <div style={{ borderTop: `1px solid ${T.border}` }}>
        {SPEC_ROWS.map(([feature, desc, hero]) => (
          <motion.div
            key={feature}
            className="spec-row"
            whileHover={{ backgroundColor: T.surface }}
            transition={{ duration: 0.14 }}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 220px) minmax(0, 1fr)",
              gap: "12px 32px",
              padding: "16px 0",
              borderBottom: `1px solid ${T.border}`,
              alignItems: "baseline",
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: hero ? 700 : 600,
                color: T.text,
                letterSpacing: "-0.01em",
                lineHeight: 1.5,
              }}
            >
              {feature}
            </span>
            <span
              style={{
                fontSize: 14,
                color: T.sub,
                lineHeight: 1.65,
              }}
            >
              {desc}
            </span>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

// ── Footer — Ft2 inline single line ──────────────────────────────────────────

function SiteFooter({ T }: { T: Theme }) {
  return (
    <footer
      className="site-footer"
      style={{
        maxWidth: 1120,
        margin: "0 auto",
        padding: "20px 48px 24px",
        borderTop: `1px solid ${T.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Logo size={16} />
        <span
          style={{ fontSize: 12, fontWeight: 700, letterSpacing: "-0.02em" }}
        >
          ClipChase
        </span>
        <span style={{ fontSize: 12, color: T.muted }}>· © 2026</span>
      </div>
      <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
        <Link
          href="/privacy"
          style={{ fontSize: 12, color: T.muted, textDecoration: "none", textUnderlineOffset: 2 }}
          onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
        >
          Privacy
        </Link>
        <a
          href="https://tally.so/r/7RJQZA?source=landing_footer"
          target="_blank"
          rel="noopener noreferrer"
          onClick={() =>
            posthog.capture("feedback_link_clicked", { trigger: "footer" })
          }
          style={{ fontSize: 12, color: T.muted, textDecoration: "none", textUnderlineOffset: 2 }}
          onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
        >
          Feedback ↗
        </a>
        <a
          href={buildInstallUrl("footer_links")}
          onClick={() => handleCtaClick("footer_links")}
          style={{ fontSize: 12, color: T.muted, textDecoration: "none", textUnderlineOffset: 2 }}
          onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
        >
          Install
        </a>
      </div>
    </footer>
  );
}

// ── Sticky CTA — C4 sticky bottom bar (frosted glass) ────────────────────────

function StickyCta({ T, dark, visible }: { T: Theme; dark: boolean; visible: boolean }) {
  const reduced = useReducedMotion();

  const glassBg = dark ? "rgba(14,14,14,0.82)" : "rgba(250,250,249,0.82)";

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={reduced ? undefined : { y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduced ? undefined : { y: 80, opacity: 0 }}
          transition={{ duration: 0.28, ease: EASE_OUT }}
          className="sticky-cta-bar"
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 20,
            background: glassBg,
            backdropFilter: "blur(16px) saturate(180%)",
            WebkitBackdropFilter: "blur(16px) saturate(180%)",
            borderTop: `1px solid ${T.border}`,
            padding: "10px 48px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          {/* Left: wordmark + tagline */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Logo size={18} />
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "-0.02em" }}>
              ClipChase
            </span>
            <span
              style={{
                width: 1,
                height: 14,
                background: T.border,
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            <span
              className="sticky-cta-label"
              style={{ fontSize: 12, color: T.sub }}
            >
              Free · No account required
            </span>
          </div>

          {/* Right: CTA */}
          <motion.a
            href={buildInstallUrl("sticky_bar")}
            onClick={() => handleCtaClick("sticky_bar")}
            variants={{ hover: { backgroundColor: ACCENT_HOVER } }}
            whileHover="hover"
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.15 }}
            style={{
              padding: "10px 20px",
              borderRadius: 5,
              background: ACCENT,
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            Add to Chrome
            <motion.span
              variants={{ hover: { x: 3 } }}
              transition={{ duration: 0.15 }}
              style={{ display: "inline-flex", alignItems: "center" }}
            >
              <ArrowRight size={12} />
            </motion.span>
          </motion.a>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
