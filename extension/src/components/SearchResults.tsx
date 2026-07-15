import { motion, AnimatePresence } from "framer-motion";
import { Check, Clock, Link2, Play, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SearchResult, SortBy } from "../shared/types";
import { buildMomentLink, formatTime } from "../shared/utils";
import posthog from "../shared/posthog";

// One inline preview open at a time: multiple autoplaying iframes in a side
// panel would fight over audio and memory.
type PreviewKey = { videoId: string; matchIdx: number };

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
  const [preview, setPreview] = useState<PreviewKey | null>(null);

  const togglePreview = (videoId: string, matchIdx: number, start: number, keyword: string | undefined, position: number) => {
    const isOpen = preview?.videoId === videoId && preview?.matchIdx === matchIdx;
    if (isOpen) {
      setPreview(null);
      return;
    }
    posthog.capture("preview_opened", {
      video_id: videoId,
      t: Math.floor(start),
      keyword: keyword ?? null,
      result_position: position,
    });
    setPreview({ videoId, matchIdx });
  };

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
                onClick={() => {
                  setExpandedId(isExp ? null : video.video_id);
                  // Collapsing a card must also stop its playing preview —
                  // otherwise reopening the card resumes audio unexpectedly.
                  if (isExp && preview?.videoId === video.video_id) setPreview(null);
                }}
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
                  {video.matches.map((match, mIdx) => {
                    const quote = `${match.context_before} ${match.text} ${match.context_after}`;
                    // Multi-term searches (variants, transliterations) can
                    // match on any term — send the one actually present in
                    // this quote so the share page's highlight finds it.
                    const keyword =
                      video.search_terms_used?.find((term) =>
                        quote.toLowerCase().includes(term.toLowerCase()),
                      ) ?? video.search_terms_used?.[0];
                    const isPreviewing =
                      preview?.videoId === video.video_id && preview?.matchIdx === mIdx;
                    return (
                      <div key={mIdx}>
                        <SnippetRow
                          timestamp={formatTime(match.start)}
                          contextBefore={match.context_before}
                          phrase={match.text}
                          contextAfter={match.context_after}
                          isLast={mIdx === video.matches.length - 1 && !isPreviewing}
                          onClick={() => onSelectVideo(video.video_id, match.start)}
                          isPreviewing={isPreviewing}
                          onTogglePreview={() =>
                            togglePreview(video.video_id, mIdx, match.start, keyword, idx)
                          }
                          shareLink={buildMomentLink({
                            videoId: video.video_id,
                            start: match.start,
                            quote,
                            keyword,
                          })}
                          onShared={() =>
                            posthog.capture("moment_link_copied", {
                              video_id: video.video_id,
                              t: Math.floor(match.start),
                              keyword: keyword ?? null,
                            })
                          }
                        />
                        {isPreviewing && (
                          <div
                            className={`px-3.5 pb-2.5 ${
                              mIdx !== video.matches.length - 1 ? "border-b border-[#1e1e1e]" : ""
                            }`}
                          >
                            <div className="rounded overflow-hidden border border-yt-dark-gray bg-black aspect-video">
                              {/* Via the moment page (?embed=1), not YouTube
                                  directly: YouTube rejects embeds from
                                  chrome-extension:// origins (error 153); the
                                  player nested in our https page works. */}
                              <iframe
                                src={`${buildMomentLink({
                                  videoId: video.video_id,
                                  start: match.start,
                                  quote: "",
                                })}&embed=1`}
                                title={`Preview at ${formatTime(match.start)}`}
                                allow="autoplay; encrypted-media; picture-in-picture"
                                allowFullScreen
                                className="w-full h-full border-0 block"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
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
  shareLink,
  onShared,
  isPreviewing,
  onTogglePreview,
}: {
  timestamp: string;
  contextBefore: string;
  phrase: string;
  contextAfter: string;
  isLast: boolean;
  onClick: () => void;
  shareLink: string;
  onShared: () => void;
  isPreviewing: boolean;
  onTogglePreview: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const handleShare = async () => {
    let ok = true;
    try {
      await navigator.clipboard.writeText(shareLink);
    } catch {
      // Clipboard API can be denied without a fresh user gesture; the
      // textarea/execCommand path usually works in extension pages.
      const ta = document.createElement("textarea");
      ta.value = shareLink;
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand("copy");
      ta.remove();
    }
    // Only claim success when a copy actually landed — a green "Copied" over
    // an unchanged clipboard also inflates moment_link_copied.
    if (!ok) return;
    onShared();
    setCopied(true);
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), 1500);
  };

  return (
    // Row is a div, not a button: the share control lives inside the row and
    // nested buttons are invalid HTML (Chrome silently drops the inner one).
    // Padding lives on the buttons, not the div, so the whole padded band
    // stays clickable like the original single-button row.
    <div
      className={`group w-full flex items-stretch hover:bg-white/[0.03] transition-colors ${
        !isLast ? "border-b border-[#1e1e1e]" : ""
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex gap-2.5 items-start flex-1 min-w-0 text-left pl-3.5 py-2 pr-1"
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
      {/* Always visible (dimmed at rest): opacity-0-until-hover left an
          invisible but tappable control on touch devices, and made the
          feature undiscoverable there. */}
      <button
        type="button"
        onClick={onTogglePreview}
        aria-label={isPreviewing ? "Close preview" : "Preview this moment here"}
        title={isPreviewing ? "Close preview" : "Preview this moment here"}
        className={`shrink-0 flex items-start pt-2.5 pl-1 transition-all ${
          isPreviewing
            ? "text-yt-red"
            : "text-yt-tert/60 hover:text-yt-light-gray group-hover:text-yt-tert focus-visible:text-yt-light-gray"
        }`}
      >
        {isPreviewing ? (
          <X className="w-[13px] h-[13px]" strokeWidth={2.5} />
        ) : (
          <Play className="w-[13px] h-[13px]" strokeWidth={2} />
        )}
      </button>
      <button
        type="button"
        onClick={handleShare}
        aria-label={copied ? "Link copied" : "Copy link to this moment"}
        title={copied ? "Copied" : "Copy link to this moment"}
        className={`shrink-0 flex items-start gap-1 pt-2.5 pr-3.5 pl-1 transition-all ${
          copied
            ? "text-green-500"
            : "text-yt-tert/60 hover:text-yt-light-gray group-hover:text-yt-tert focus-visible:text-yt-light-gray"
        }`}
      >
        {copied ? (
          <>
            <Check className="w-[13px] h-[13px]" strokeWidth={2.5} />
            <span className="text-[10px] font-semibold">Copied</span>
          </>
        ) : (
          <Link2 className="w-[13px] h-[13px]" strokeWidth={2} />
        )}
      </button>
    </div>
  );
}
