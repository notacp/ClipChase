import { motion, AnimatePresence } from "framer-motion";
import { Clock, Play } from "lucide-react";
import { SearchResult } from "../shared/types";
import { formatTime } from "../shared/utils";

interface SearchResultsProps {
  results: SearchResult[];
  onSelectVideo: (id: string, start: number) => void;
}

export function SearchResults({ results, onSelectVideo }: SearchResultsProps) {
  const totalMatches = results.reduce((sum, v) => sum + v.matches.length, 0);
  const sorted = [...results].sort((a, b) => b.published_at.localeCompare(a.published_at));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Results</h2>
        <span className="text-[10px] font-mono text-yt-light-gray bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
          {totalMatches} mention{totalMatches !== 1 ? "s" : ""} · {results.length} video{results.length !== 1 ? "s" : ""}
        </span>
      </div>
      <AnimatePresence>
        {sorted.map((video, idx) => (
          <motion.div
            key={video.video_id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="glass p-4 rounded-2xl group hover:border-white/20 transition-colors"
          >
            <div className="flex gap-3">
              <img
                src={video.thumbnail}
                className="w-24 h-14 object-cover rounded-lg shrink-0"
                alt={video.title}
              />
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm leading-tight group-hover:text-yt-red transition-colors line-clamp-2">
                  {video.title}
                </h3>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <p className="text-yt-light-gray text-[10px]">
                    {new Date(video.published_at).toLocaleDateString()}
                  </p>
                  <span className="rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-yt-light-gray">
                    {video.transcript_language_label}
                  </span>
                  <span className="ml-auto rounded-full bg-yt-red/10 border border-yt-red/20 px-2 py-0.5 text-[9px] font-mono text-yt-red">
                    {video.matches.length}×
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-3 space-y-1.5">
              {video.matches.map((match, mIdx) => (
                <button
                  key={mIdx}
                  onClick={() => onSelectVideo(video.video_id, match.start)}
                  className="w-full text-left p-3 rounded-lg hover:bg-white/5 flex items-start gap-2.5 transition-colors group/match"
                >
                  <div className="mt-0.5 bg-yt-gray border border-white/20 p-1.5 rounded-lg flex items-center gap-1 group-hover/match:bg-yt-red group-hover/match:border-yt-red transition-all text-xs font-mono shrink-0">
                    <Play className="w-3 h-3 group-hover/match:hidden" />
                    <Clock className="w-3 h-3 hidden group-hover/match:block" />
                    {formatTime(match.start)}
                  </div>
                  <p className="text-xs text-yt-light-gray group-hover/match:text-white transition-colors break-words">
                    ...{match.context_before}{" "}
                    <span className="text-white font-medium bg-yt-red/20 px-1 rounded">{match.text}</span>{" "}
                    {match.context_after}...
                  </p>
                </button>
              ))}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
