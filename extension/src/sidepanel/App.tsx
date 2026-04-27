import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Youtube } from "lucide-react";
import { SearchResult, TimeRange, ChannelSuggestion } from "../shared/types";
import { getPublishedAfterDate } from "../shared/utils";
import { send } from "../shared/messaging";
import { SearchForm } from "../components/SearchForm";
import { TimeRangeSelector } from "../components/TimeRangeSelector";
import { SearchResults } from "../components/SearchResults";
import { LoadingStream } from "../components/LoadingStream";
import { WelcomeModal } from "../components/WelcomeModal";
import posthog from "../shared/posthog";

const BUILDER_NOTE =
  "I kept rewatching videos just to find a single moment I remembered. No way to search, no timestamps — just scrubbing forever. So I built this. If it saves you even five minutes, it was worth it. Thank you for trying it out.";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export function App() {
  const [channelUrl, setChannelUrl] = useState("");
  const [channelDisplay, setChannelDisplay] = useState("");
  const [suggestions, setSuggestions] = useState<ChannelSuggestion[]>([]);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");
  const [excludeShorts, setExcludeShorts] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [lastSearch, setLastSearch] = useState<{ channel: string; keyword: string } | null>(null);
  const [formError, setFormError] = useState("");
  const [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem("hasSeenWelcome"));
  // Generation counter — each runSearch call claims a unique generation.
  // After every await, we compare against the latest generation; if a newer
  // search has started, we bail out.  This prevents stale results from an
  // older search leaking into state after a newer search began.
  const searchGenRef = useRef(0);
  // Prevents the suggestion effect from re-fetching when channelDisplay is set
  // programmatically (i.e. by selecting a suggestion, not by the user typing).
  const skipSuggestionFetchRef = useRef(false);

  // Channel suggestions — call backend directly (no Next.js proxy in extension).
  useEffect(() => {
    if (skipSuggestionFetchRef.current) {
      skipSuggestionFetchRef.current = false;
      return;
    }
    if (channelDisplay.length < 2) {
      setSuggestions([]);
      setIsSuggestionsLoading(false);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSuggestionsLoading(true);
      try {
        const res = await fetch(
          `${API_BASE}/api/suggest-channels?q=${encodeURIComponent(channelDisplay)}`
        );
        if (res.ok) setSuggestions(await res.json());
      } catch {
        // suggestions are best-effort
      } finally {
        setIsSuggestionsLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [channelDisplay]);

  const handleDismissWelcome = () => {
    localStorage.setItem("hasSeenWelcome", "1");
    posthog.capture("welcome_dismissed");
    setShowWelcome(false);
  };

  const handleSelectSuggestion = (suggestion: ChannelSuggestion) => {
    skipSuggestionFetchRef.current = true;
    setChannelDisplay(suggestion.title);
    setChannelUrl(suggestion.id);
    setSuggestions([]);
    posthog.capture("channel_selected_from_suggestion", {
      channel_id: suggestion.id,
      channel_title: suggestion.title,
      typed_query: channelDisplay,
    });
  };

  const handleDismissSuggestions = () => setSuggestions([]);

  const handleChannelInputChange = (value: string) => {
    setChannelDisplay(value);
    setChannelUrl(value);
    if (formError) setFormError("");
  };

  const handleKeywordChange = (value: string) => {
    setKeyword(value);
    if (formError) setFormError("");
  };

  const runSearch = async () => {
    const myGen = ++searchGenRef.current;
    const superseded = () => myGen !== searchGenRef.current;

    setIsLoading(true);
    setError("");
    setResults([]);
    setHasSearched(false);
    setSuggestions([]);

    const searchStartedAt = Date.now();
    let searchFailed = false;

    posthog.capture("search_started", {
      channel: channelUrl,
      keyword,
      time_range: timeRange,
      exclude_shorts: excludeShorts,
    });

    let videosScanned = 0;
    let transcriptFailures = 0;

    try {
      const publishedAfter = getPublishedAfterDate(timeRange);

      // Step 1 — Get video list from backend.
      const videosRes = await send({
        type: "list-videos",
        params: {
          channel_url: channelUrl,
          max_videos: 20,
          published_after: publishedAfter,
          exclude_shorts: excludeShorts,
        },
      });
      if (superseded()) return;

      if (!videosRes.ok) {
        setError(videosRes.error);
        return;
      }

      const { videos } = videosRes.data;

      // Step 2 — For each video: fetch transcript via service worker, match via backend.
      videosScanned = videos.length;
      for (const video of videos) {
        if (superseded()) return;

        const txRes = await send({
          type: "fetch-transcript",
          videoId: video.id,
          preferredLangs: ["en", "hi"],
        });
        if (superseded()) return;
        if (!txRes.ok || !txRes.data) {
          transcriptFailures++;
          console.warn(
            `[TimeStitch] transcript skipped for ${video.id}:`,
            txRes.ok ? "null data" : txRes.error
          );
          continue;
        }

        const matchRes = await send({
          type: "match-transcript",
          params: { keyword, video, transcript: txRes.data },
        });
        if (superseded()) return;

        if (matchRes.ok && matchRes.data.match_result) {
          setResults((prev) => [...prev, matchRes.data.match_result!]);
        }
      }

      setLastSearch({ channel: channelUrl, keyword });
    } catch (err: unknown) {
      if (superseded()) return; // swallow errors from a superseded search
      searchFailed = true;
      const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setError(message);
      posthog.capture("search_error", {
        channel: channelUrl,
        keyword,
        error_message: message,
        duration_ms: Date.now() - searchStartedAt,
      });
    } finally {
      if (superseded()) {
        posthog.capture("search_cancelled", {
          channel: channelUrl,
          keyword,
          duration_ms: Date.now() - searchStartedAt,
        });
      } else {
        setIsLoading(false);
        setHasSearched(true);
        posthog.capture("search_completed", {
          channel: channelUrl,
          keyword,
          time_range: timeRange,
          result_count: results.length,
          videos_scanned: videosScanned,
          transcript_failures: transcriptFailures,
          success: !searchFailed,
          duration_ms: Date.now() - searchStartedAt,
        });
        if (results.length === 0 && !searchFailed) {
          posthog.capture("zero_results", {
            channel: channelUrl,
            keyword,
            time_range: timeRange,
            videos_scanned: videosScanned,
            transcript_failures: transcriptFailures,
          });
        }
      }
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channelUrl && !keyword) {
      setFormError("Enter a channel and a keyword to search");
      return;
    }
    if (!channelUrl) {
      setFormError("Enter a YouTube channel URL or @handle");
      return;
    }
    if (!keyword) {
      setFormError("Enter a keyword to search for");
      return;
    }
    setFormError("");
    await runSearch();
  };

  return (
    <main className="min-h-screen bg-yt-black text-white selection:bg-yt-red/30 px-4 pt-8 pb-20">
      <AnimatePresence>
        {showWelcome && <WelcomeModal key="welcome" note={BUILDER_NOTE} onDismiss={handleDismissWelcome} />}
      </AnimatePresence>
      <div className="mb-7 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-yt-red/10 border border-yt-red/20 flex items-center justify-center shrink-0">
          <Youtube className="w-4 h-4 text-yt-red" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-white leading-none">Ctrl F for YouTube</h1>
          <p className="text-yt-light-gray text-[10px] mt-0.5 leading-none">Search YouTube transcripts</p>
        </div>
      </div>

      <SearchForm
        channelDisplay={channelDisplay}
        onChannelChange={handleChannelInputChange}
        onDismissSuggestions={handleDismissSuggestions}
        suggestions={suggestions}
        isSuggestionsLoading={isSuggestionsLoading}
        onSelectSuggestion={handleSelectSuggestion}
        keyword={keyword}
        setKeyword={handleKeywordChange}
        handleSearch={handleSearch}
        isLoading={isLoading}
        excludeShorts={excludeShorts}
        setExcludeShorts={setExcludeShorts}
        formError={formError}
      />

      <TimeRangeSelector
        timeRange={timeRange}
        setTimeRange={(range) => {
          posthog.capture("time_range_changed", { from: timeRange, to: range });
          setTimeRange(range);
        }}
      />

      {isLoading && <LoadingStream keyword={keyword} channel={channelDisplay} />}

      {error && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-5 p-4 rounded-xl border border-yt-red/20 bg-yt-red/10 text-yt-red"
        >
          <h3 className="font-bold flex items-center gap-2 mb-1 text-sm">
            <span>⚠️</span>
            Search failed
          </h3>
          <p className="text-xs leading-relaxed text-yt-red/80">{error}</p>
          <button
            type="button"
            onClick={runSearch}
            className="mt-3 text-xs font-semibold text-yt-red hover:text-white border border-yt-red/40 hover:border-yt-red hover:bg-yt-red px-3 py-2.5 rounded-lg transition-all"
          >
            Try again
          </button>
        </motion.div>
      )}

      {hasSearched && !isLoading && !error && results.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-12 text-center"
        >
          <div className="text-4xl mb-3">🔍</div>
          <h3 className="text-base font-semibold text-white mb-2">No mentions found</h3>
          <p className="text-yt-light-gray text-xs max-w-xs mx-auto">
            {lastSearch ? (
              <>
                Couldn&apos;t find &ldquo;{lastSearch.keyword}&rdquo; in recent videos from this channel.
                Try a different keyword or expand the time range.
              </>
            ) : (
              "No results found. Try a different keyword or expand the time range."
            )}
          </p>
        </motion.div>
      )}

      {results.length > 0 && (
        <div className="mt-5">
          <SearchResults
            results={results}
            onSelectVideo={(id, start) => {
              const position = results.findIndex((r) => r.video_id === id);
              chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const tab = tabs[0];
                if (tab?.id) {
                  posthog.capture("video_opened", {
                    video_id: id,
                    timestamp: start,
                    result_position: position,
                    keyword,
                    channel: channelUrl,
                  });
                  chrome.tabs.update(tab.id, {
                    url: `https://www.youtube.com/watch?v=${id}&t=${Math.floor(start)}s`,
                  });
                }
              });
            }}
          />
        </div>
      )}
    </main>
  );
}
