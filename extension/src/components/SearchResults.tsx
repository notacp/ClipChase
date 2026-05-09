import { motion, AnimatePresence } from "framer-motion";
import { Clock } from "lucide-react";
import { useState } from "react";
import { SearchResult, SortBy } from "../shared/types";
import { formatTime } from "../shared/utils";

interface SearchResultsProps {
  results: SearchResult[];
  sortBy: SortBy;
  onSortChange: (sort: SortBy) => void;
  onSelectVideo: (id: string, start: number) => void;
}

function sortResults(results: SearchResult[], sortBy: SortBy): SearchResult[] {
  const copy = [...results];
  if (sortBy === "recent") {
    copy.sort((a, b) => {
      const ta = Date.parse(a.published_at) || 0;
      const tb = Date.parse(b.published_at) || 0;
      // Newer first; tiebreak on hit count.
      if (tb !== ta) return tb - ta;
      return b.matches.length - a.matches.length;
    });
  } else {
    copy.sort((a, b) => {
      if (b.matches.length !== a.matches.length) {
        return b.matches.length - a.matches.length;
      }
      // Tiebreak on recency.
      return (Date.parse(b.published_at) || 0) - (Date.parse(a.published_at) || 0);
    });
  }
  return copy;
}

export function SearchResults({ results, sortBy, onSortChange, onSelectVideo }: SearchResultsProps) {
  const totalMatches = results.reduce((sum, v) => sum + v.matches.length, 0);
  const sorted = sortResults(results, sortBy);
  const [expandedId, setExpandedId] = useState<string | null>(sorted[0]?.video_id ?? null);

  return (
    <div className="rounded border border-yt-dark-gray bg-yt-gray/40 overflow-hidden">
      {/* Meta bar */}
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-yt-dark-gray">
        <span className="text-[11px] text-yt-light-gray">
          <span className="text-yt-red font-semibold">
            {totalMatches} mention{totalMatches !== 1 ? "s" : ""}
          </span>
          {" · "}
          {results.length} video{results.length !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-1">
          <SortToggleButton active={sortBy === "hits"} onClick={() => onSortChange("hits")}>
            Hits
          </SortToggleButton>
          <SortToggleButton active={sortBy === "recent"} onClick={() => onSortChange("recent")}>
            Recent
          </SortToggleButton>
        </div>
      </div>

      <AnimatePresence>
        {sorted.map((video, idx) => {
          const isExp = expandedId === video.video_id;
          return (
            <motion.div
              key={video.video_id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04 }}
              className={`border-b border-yt-dark-gray last:border-b-0 ${
                isExp ? "bg-yt-elevated" : "bg-transparent"
              }`}
            >
              {/* Card header */}
              <button
                type="button"
                onClick={() => setExpandedId(isExp ? null : video.video_id)}
                className={`w-full text-left flex gap-2.5 px-3.5 py-2.5 transition-colors ${
                  isExp ? "" : "hover:bg-yt-gray"
                }`}
              >
                <img
                  src={video.thumbnail}
                  className="w-[72px] h-[48px] object-cover rounded shrink-0"
                  alt={video.title}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-yt-text leading-snug line-clamp-2 m-0">
                    {video.title}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[11px] text-yt-light-gray">
                      {new Date(video.published_at).toLocaleDateString()}
                    </span>
                    <span className="px-[5px] py-[1px] rounded bg-yt-dark-gray border border-yt-hover/40 text-[10px] uppercase tracking-wide text-yt-light-gray font-semibold">
                      {video.transcript_language_label}
                    </span>
                  </div>
                </div>
                <div className="shrink-0 px-1.5 py-[2px] rounded-xl bg-yt-red/[0.13] border border-yt-red/[0.27] flex items-center self-start">
                  <span className="text-[11px] font-bold text-yt-red font-mono tabular-nums">
                    {video.matches.length}×
                  </span>
                </div>
              </button>

              {/* Expanded snippets */}
              {isExp && (
                <div className="border-t border-yt-dark-gray">
                  {video.matches.map((match, mIdx) => (
                    <SnippetRow
                      key={mIdx}
                      timestamp={formatTime(match.start)}
                      contextBefore={match.context_before}
                      phrase={match.text}
                      contextAfter={match.context_after}
                      isLast={mIdx === video.matches.length - 1}
                      onClick={() => onSelectVideo(video.video_id, match.start)}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function SortToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-[2px] rounded text-[10px] font-medium border transition-colors ${
        active
          ? "border-yt-red bg-yt-red/[0.12] text-yt-red"
          : "border-yt-dark-gray bg-transparent text-yt-tert hover:text-yt-light-gray hover:border-yt-hover/60"
      }`}
    >
      {children}
    </button>
  );
}


function SnippetRow({
  timestamp,
  contextBefore,
  phrase,
  contextAfter,
  isLast,
  onClick,
}: {
  timestamp: string;
  contextBefore: string;
  phrase: string;
  contextAfter: string;
  isLast: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex gap-2.5 items-start px-3.5 py-2 hover:bg-white/[0.03] transition-colors text-left ${
        !isLast ? "border-b border-[#1e1e1e]" : ""
      }`}
    >
      <div className="flex items-center gap-1 shrink-0 pt-0.5">
        <Clock className="w-[13px] h-[13px] text-yt-red" strokeWidth={2} />
        <span className="font-mono text-[11px] font-semibold text-yt-red whitespace-nowrap">
          {timestamp}
        </span>
      </div>
      <p className="m-0 text-[12px] text-yt-light-gray leading-[1.55]">
        ...{contextBefore}{" "}
        <mark
          className="text-white font-bold rounded"
          style={{
            background: "#FF450028",
            border: "1px solid #FF450055",
            padding: "1px 4px",
          }}
        >
          {phrase}
        </mark>{" "}
        {contextAfter}...
      </p>
    </button>
  );
}
