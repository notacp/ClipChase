import { useState, useEffect, useRef, ReactNode } from "react";
import { motion } from "framer-motion";

interface LoadingStreamProps {
  keyword: string;
  channel: string;
}

interface StreamLine {
  text: string;
  hit: boolean;
  key: number;
}

const TRANSCRIPT_STREAM = [
  { text: "…so the way we think about this is fundamentally different…", hit: false },
  { text: "…tools that mention the phrase keep popping up across the channel…", hit: true },
  { text: "…what used to take ages can now be done in minutes…", hit: false },
  { text: "…I was actually using it this morning to refactor an entire flow…", hit: true },
  { text: "…and the context window just keeps getting bigger which means…", hit: false },
  { text: "…honestly the depth of coverage on the topic surprised me…", hit: true },
  { text: "…you have to think about it less like a single mention and more like…", hit: false },
  { text: "…a recurring thread across multiple uploads on the same idea…", hit: false },
  { text: "…which is exactly what shows up when we scan transcripts…", hit: true },
  { text: "…the way I explain it is imagine searching every video at once…", hit: false },
  { text: "…and getting back not just titles but the exact moment the phrase lands…", hit: true },
];

function highlight(text: string, phrase: string, accent = "#FF4500"): ReactNode {
  if (!phrase) return text;
  const idx = text.toLowerCase().indexOf(phrase.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark
        style={{
          background: `${accent}28`,
          color: "#fff",
          fontWeight: 700,
          padding: "1px 4px",
          borderRadius: 3,
          border: `1px solid ${accent}55`,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "0.88em",
        }}
      >
        {text.slice(idx, idx + phrase.length)}
      </mark>
      {text.slice(idx + phrase.length)}
    </>
  );
}

export function LoadingStream({ keyword, channel }: LoadingStreamProps) {
  const [lines, setLines] = useState<StreamLine[]>([]);
  const [hitCount, setHitCount] = useState(0);
  const [videoCount, setVideoCount] = useState(0);
  const idxRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const query = keyword || "phrase";
  const channelLabel = (() => {
    try {
      const url = new URL(channel);
      const parts = url.pathname.split("/").filter(Boolean);
      return parts[parts.length - 1] || channel;
    } catch {
      return channel || "channel";
    }
  })();

  useEffect(() => {
    idxRef.current = 0;
    setLines([]);
    setHitCount(0);
    setVideoCount(0);
    const iv = setInterval(() => {
      if (idxRef.current >= TRANSCRIPT_STREAM.length) {
        idxRef.current = 0;
        setLines([]);
      }
      const line = TRANSCRIPT_STREAM[idxRef.current];
      const customised = line.hit
        ? line.text.replace(/the phrase|it|the topic|the idea/, query)
        : line.text;
      setLines((prev) => [
        ...prev.slice(-7),
        { text: customised, hit: line.hit, key: Date.now() + idxRef.current },
      ]);
      if (line.hit) {
        setHitCount((p) => p + 1);
        if (Math.random() > 0.55) setVideoCount((p) => p + 1);
      }
      idxRef.current++;
    }, 400);
    return () => clearInterval(iv);
  }, [query]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mt-4 w-full rounded border border-yt-dark-gray bg-yt-gray overflow-hidden"
    >
      {/* Status bar */}
      <div className="flex items-center gap-2 px-3.5 py-2 border-b border-yt-dark-gray">
        <div className="w-[7px] h-[7px] rounded-full bg-yt-red shrink-0 animate-pulseGlow" />
        <span className="text-[11px] text-yt-light-gray">
          Scanning <span className="text-yt-text">&ldquo;{query}&rdquo;</span> in {channelLabel}
        </span>
        {hitCount > 0 && (
          <span className="ml-auto font-mono text-[10px] text-yt-red font-semibold whitespace-nowrap">
            {hitCount} hits{videoCount > 0 ? ` · ${videoCount} videos` : ""}
          </span>
        )}
      </div>

      {/* Transcript stream */}
      <div
        ref={containerRef}
        className="px-3.5 py-2.5 flex flex-col justify-end gap-[1px]"
        style={{
          height: 180,
          overflow: "hidden",
          maskImage: "linear-gradient(to bottom, transparent 0%, black 30%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 30%)",
        }}
      >
        {lines.map((line, i) => (
          <div
            key={line.key}
            className="text-[11px] py-[2px] pl-2 leading-[1.6] animate-fadeSlideUp transition-opacity duration-200"
            style={{
              color: line.hit ? "#dddddd" : "#555555",
              borderLeft: `2px solid ${line.hit ? "#FF4500" : "transparent"}`,
              opacity: Math.max(0.15, (i + 1) / lines.length),
            }}
          >
            {line.hit ? highlight(line.text, query) : line.text}
          </div>
        ))}
      </div>
    </motion.div>
  );
}
