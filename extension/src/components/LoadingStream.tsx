import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface LoadingStreamProps {
  keyword: string;
  channel: string;
}

interface StreamMessage {
  id: number;
  text: string;
  delay: number;
}

function buildMessages(keyword: string, channel: string): StreamMessage[] {
  const displayChannel = (() => {
    try {
      const url = new URL(channel);
      const parts = url.pathname.split("/").filter(Boolean);
      return parts[parts.length - 1] || channel;
    } catch {
      return channel || "channel";
    }
  })();

  return [
    { id: 0, text: `Resolving ${displayChannel}`, delay: 0 },
    { id: 1, text: "Fetching video library", delay: 3500 },
    { id: 2, text: "Reading transcripts", delay: 8500 },
    { id: 3, text: keyword ? `Scanning for "${keyword}"` : "Scanning transcripts", delay: 15000 },
    { id: 4, text: "Analyzing match contexts", delay: 25000 },
    { id: 5, text: "Ranking by relevance", delay: 36000 },
    { id: 6, text: "Compiling results", delay: 47000 },
  ];
}

export function LoadingStream({ keyword, channel }: LoadingStreamProps) {
  const messages = buildMessages(keyword, channel);
  const [visibleCount, setVisibleCount] = useState(1);

  useEffect(() => {
    const timers = messages.slice(1).map((msg, i) =>
      setTimeout(() => {
        setVisibleCount(i + 2);
      }, msg.delay)
    );
    return () => timers.forEach(clearTimeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = messages.slice(0, visibleCount);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="mt-4 w-full"
    >
      <div className="glass rounded-xl overflow-hidden">
        <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-white/5">
          <div className="w-2 h-2 rounded-full bg-white/10" />
          <div className="w-2 h-2 rounded-full bg-white/10" />
          <div className="w-2 h-2 rounded-full bg-white/10" />
          <span className="ml-2 text-white/20 text-xs font-mono tracking-wider">ctrl-f</span>
        </div>

        <div className="px-4 py-3 space-y-2">
          <AnimatePresence>
            {visible.map((msg, i) => {
              const isActive = i === visible.length - 1;
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: isActive ? 1 : 0.3, x: 0 }}
                  transition={{ duration: 0.25 }}
                  className="flex items-center gap-2 font-mono text-xs"
                >
                  {isActive ? (
                    <PulsingDot />
                  ) : (
                    <span className="w-3 h-3 flex items-center justify-center text-green-500/50 shrink-0 text-[10px]">
                      ✓
                    </span>
                  )}
                  <span className={isActive ? "text-white" : "text-white/30"}>
                    {msg.text}
                    {isActive && <BlinkingCursor />}
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

function PulsingDot() {
  return (
    <span className="relative flex w-3 h-3 items-center justify-center shrink-0">
      <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-yt-red/50" />
      <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-yt-red" />
    </span>
  );
}

function BlinkingCursor() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => setVisible((v) => !v), 530);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className={`ml-0.5 transition-opacity duration-100 ${visible ? "opacity-100" : "opacity-0"}`}>
      ▌
    </span>
  );
}
