import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search } from "lucide-react";
import { SearchResult, TimeRange, ChannelSuggestion, VideoInfo, SortBy, FailureReason } from "../shared/types";
import { getPublishedAfterDate, dominantReason, cleanKeyword, describeFailureCounts } from "../shared/utils";
import { send, startKeepalive } from "../shared/messaging";
import { SearchForm } from "../components/SearchForm";
import { TimeRangeSelector } from "../components/TimeRangeSelector";
import { SearchResults } from "../components/SearchResults";
import { LoadingStream } from "../components/LoadingStream";
import { WelcomeModal } from "../components/WelcomeModal";
import posthog from "../shared/posthog";
import { PREFERRED_TRANSCRIPT_LANGS } from "../shared/constants";
import { detectKeywordScript } from "../lib/keyword-script";
import { consumeSSE } from "../lib/sse";

const UNINDEXED_FETCH_CONCURRENCY = 6;
// Enumeration window for UN-indexed videos. This is the ceiling on how deep a
// first-ever search of a channel can reach — the index only ever grows from
// what this window surfaces, so a low value permanently caps catalog coverage.
// At 20 the product searched ~16 videos on average while promising the whole
// channel (PostHog: 46% of successful searches returned nothing).
// ponytail: 60 is the latency ceiling, not the coverage ceiling. All-range
// searches already run p50 29s / p95 80s / max 192s at 47-60 videos scanned
// (PostHog, Jul-Aug), so the honest budget is ~3x the old window, not 7x.
// Going deeper needs a progressive "search deeper" control rather than a
// bigger default — raise this only once a zero-result search can extend
// itself instead of making every search pay the worst case up front.
const MAX_VIDEOS = 60;

type ChannelResolutionSource =
  | "suggestion"
  | "typed_url"
  | "typed_handle"
  | "typed_name"
  | "empty";

function classifyChannelInput(
  value: string,
  pickedFromSuggestion: boolean,
): ChannelResolutionSource {
  const trimmed = value.trim();
  if (!trimmed) return "empty";
  if (pickedFromSuggestion) return "suggestion";
  if (/^https?:\/\//i.test(trimmed)) return "typed_url";
  if (trimmed.startsWith("@")) return "typed_handle";
  return "typed_name";
}

const BUILDER_NOTE =
  "I kept rewatching videos just to find a single moment I remembered. No way to search, no timestamps — just scrubbing forever. So I built this. If it saves you even five minutes, it was worth it. Thank you for trying it out.";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

// A search against an unreachable host fails in ~50ms (DNS/TLS refusal, not a
// timeout), which reopens the isLoading guard almost instantly. One blocked
// client generated 37 error events in 49 seconds that way — holding Enter
// through the form's disabled guard, plus an unguarded "Try again". Floor the
// gap between a failure and the next attempt so a dead endpoint can't be
// hammered at machine speed.
const RETRY_COOLDOWN_MS = 1500;

// One suggestion-failure event per outage window, not one per typed prefix.
const SUGGESTION_FAILURE_LOG_INTERVAL_MS = 60_000;

// Generous enough for a pasted quote (the real long-input use case), short
// enough to reject a pasted article — one user searched a 2,600-character
// essay, which can never match a caption line and scans the whole channel to
// prove it.
const MAX_KEYWORD_LENGTH = 300;

export function App() {
  const [channelUrl, setChannelUrl] = useState("");
  const [channelDisplay, setChannelDisplay] = useState("");
  const [suggestions, setSuggestions] = useState<ChannelSuggestion[]>([]);
  const [suggestionsFailed, setSuggestionsFailed] = useState(false);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  // "all" matches the product promise ("search everything a creator has said").
  // The old "30d" default quietly searched one month of a channel, which is
  // aimed away from the actual use case — remembering something said a while
  // ago. It also date-clipped the indexed catalog, so the deep-scan path only
  // engages when no published_after is sent.
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [sortBy, setSortBy] = useState<SortBy>("hits");
  const [excludeShorts, setExcludeShorts] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [lastSearch, setLastSearch] = useState<{
    channel: string;
    keyword: string;
    failureReason?: string | null;
    // transcriptFailures / videosScanned for the search. Distinguishes "the
    // dominant failure reason" (could be 1 of 20 videos) from "most videos
    // failed" — copy that says "most videos…" must check this, not just
    // failureReason.
    failureRatio?: number;
    // Per-reason counts + scan size, so the UI can state exactly what was and
    // wasn't searched instead of hiding skipped videos behind the results list.
    failureCounts?: Partial<Record<FailureReason, number>>;
    videosScanned?: number;
    transcriptFailures?: number;
  } | null>(null);
  const [formError, setFormError] = useState("");
  // Set for RETRY_COOLDOWN_MS after a failed search — see the constant.
  const [retryBlocked, setRetryBlocked] = useState(false);
  const retryUnblockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem("hasSeenWelcome"));
  // Replaced the store-review prompt. It fired after the 3rd search and
  // converted 0 of 38 across three weeks. The people it reached are exactly
  // the ones worth a conversation, and PostHog only holds anonymous IDs, so
  // the product itself is the only place to ask. Fires after the 2nd video
  // opened — someone who got value twice — and carries the distinct_id so a
  // reply maps back to the behaviour that prompted it.
  const [showInterviewPrompt, setShowInterviewPrompt] = useState(false);
  // Generation counter — each runSearch call claims a unique generation.
  // After every await, we compare against the latest generation; if a newer
  // search has started, we bail out.  This prevents stale results from an
  // older search leaking into state after a newer search began.
  const searchGenRef = useRef(0);
  // Aborts any in-flight SSE connection when a new search supersedes it.
  // Without this, the prior fetch keeps streaming bytes (server CPU + bandwidth)
  // even though superseded() gates state writes.
  const searchAbortRef = useRef<AbortController | null>(null);
  // Suppresses the suggestion re-fetch when channelDisplay is set
  // programmatically (suggestion pick, tab prefill, oEmbed resolve) rather
  // than typed. Holds the VALUE we set, not a boolean: the programmatic
  // setters use `(cur) => cur || next`, so when `cur` is already non-empty the
  // state never changes and the effect never runs. A boolean flag stayed
  // stuck true and silently swallowed the user's NEXT real fetch; matching on
  // value self-clears because a no-op set leaves channelDisplay !== the value.
  const programmaticChannelDisplayRef = useRef<string | null>(null);
  // Tracks whether the current channel value originated from a suggestion pick.
  // Flipped back to false the moment the user edits the field.
  const channelFromSuggestionRef = useRef(false);
  // Time-based dedupe so one outage window logs ~one event. Keying this on the
  // query STRING fanned out per typed prefix instead: a single offline minute
  // produced 17 events from one user, because every prefix is a new key.
  const suggestionFailureLoggedAtRef = useRef(0);
  const suggestionEmptyLoggedRef = useRef<string | null>(null);
  // True while submitSearch is resolving a pasted video URL via oEmbed —
  // dedupes double-submits in the window before runSearch sets isLoading.
  const resolvingChannelRef = useRef(false);

  // Channel suggestions — call backend directly (no Next.js proxy in extension).
  useEffect(() => {
    if (programmaticChannelDisplayRef.current === channelDisplay) {
      programmaticChannelDisplayRef.current = null;
      return;
    }
    if (channelDisplay.length < 2) {
      setSuggestions([]);
      setSuggestionsFailed(false);
      setIsSuggestionsLoading(false);
      return;
    }
    // Without an abort, a slow response for an earlier prefix can land after a
    // newer one and overwrite fresher suggestions. The 8s cap keeps a stalled
    // host from pinning the dropdown in its loading state.
    const controller = new AbortController();
    const logFailure = (props: Record<string, unknown>) => {
      const now = Date.now();
      if (now - suggestionFailureLoggedAtRef.current < SUGGESTION_FAILURE_LOG_INTERVAL_MS) return;
      suggestionFailureLoggedAtRef.current = now;
      // navigator.onLine separates "this client lost the network" from "our
      // API is unreachable" — the difference that cost an investigation.
      posthog.capture("suggestion_fetch_failed", { ...props, online: navigator.onLine });
    };
    const timer = setTimeout(async () => {
      setIsSuggestionsLoading(true);
      setSuggestionsFailed(false);
      const query = channelDisplay;
      try {
        const res = await fetch(
          `${API_BASE}/api/suggest-channels?q=${encodeURIComponent(query)}`,
          { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) }
        );
        if (!res.ok) {
          setSuggestionsFailed(true);
          logFailure({
            query_length: query.length,
            status: res.status,
            reason: "non_ok_status",
          });
          return;
        }
        const items = (await res.json()) as ChannelSuggestion[];
        setSuggestions(items);
        if (items.length === 0 && suggestionEmptyLoggedRef.current !== query) {
          suggestionEmptyLoggedRef.current = query;
          posthog.capture("suggestion_zero_results", {
            query_length: query.length,
          });
        }
      } catch (err: unknown) {
        // A superseded keystroke aborts this request by design — counting that
        // as a failure would turn a real signal into noise.
        if (err instanceof DOMException && err.name === "AbortError") return;
        setSuggestionsFailed(true);
        logFailure({
          query_length: query.length,
          reason: "network_error",
          error_message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setIsSuggestionsLoading(false);
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [channelDisplay]);

  // Screen-view events — fire on transition into the "shown" state so each
  // impression is counted exactly once. Pair with the existing click/dismiss
  // events to compute conversion rates per surface.
  useEffect(() => {
    if (showWelcome) posthog.capture("welcome_shown");
  }, [showWelcome]);
  useEffect(() => {
    if (showInterviewPrompt) posthog.capture("interview_prompt_shown");
  }, [showInterviewPrompt]);

  // Prefill the channel from the tab the panel was opened on — recalling and
  // typing a channel name cold is the biggest first-search hurdle (PostHog:
  // ~8 of 53 popup-openers never searched). Functional setters keep anything
  // the user typed while the tab query / oEmbed round-trip was in flight.
  useEffect(() => {
    const apply = (url: string, display: string, kind: string) => {
      programmaticChannelDisplayRef.current = display;
      setChannelUrl((cur) => cur || url);
      setChannelDisplay((cur) => cur || display);
      posthog.capture("channel_prefilled_from_tab", { kind });
    };
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs[0]?.url ?? "";
      const channelPath = url.match(
        /youtube\.com\/(@[\w.-]+|channel\/UC[\w-]{22}|(?:c|user)\/[\w.-]+)/,
      )?.[1];
      if (channelPath) {
        apply(
          `https://www.youtube.com/${channelPath}`,
          channelPath.replace(/^(?:channel|c|user)\//, ""),
          "channel_page",
        );
        return;
      }
      const videoId = url.match(
        /(?:youtube\.com\/(?:watch\?(?:[^#\s]*&)?v=|shorts\/|live\/)|youtu\.be\/)([\w-]{5,20})/,
      )?.[1];
      if (!videoId) return;
      fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(
          `https://www.youtube.com/watch?v=${videoId}`,
        )}&format=json`,
        { signal: AbortSignal.timeout(3000) },
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { author_url?: string; author_name?: string } | null) => {
          if (d?.author_url) apply(d.author_url, d.author_name ?? d.author_url, "video_page");
        })
        .catch(() => {});
    });
  }, []);

  const handleDismissWelcome = (useCase?: string) => {
    localStorage.setItem("hasSeenWelcome", "1");
    posthog.capture("welcome_dismissed", { use_case: useCase ?? null });
    if (useCase) posthog.setPersonProperties({ use_case: useCase });
    setShowWelcome(false);
  };

  const handleSelectSuggestion = (suggestion: ChannelSuggestion) => {
    programmaticChannelDisplayRef.current = suggestion.title;
    channelFromSuggestionRef.current = true;
    setChannelDisplay(suggestion.title);
    setChannelUrl(suggestion.id);
    setSuggestions([]);
    posthog.capture("channel_selected_from_suggestion", {
      channel_id: suggestion.id,
      channel_title: suggestion.title,
      typed_query: channelDisplay,
    });
  };

  const handleDismissSuggestions = () => {
    setSuggestions([]);
    setSuggestionsFailed(false);
  };

  const handleChannelInputChange = (value: string) => {
    // User editing the field invalidates any prior suggestion pick.
    channelFromSuggestionRef.current = false;
    setChannelDisplay(value);
    setChannelUrl(value);
    if (formError) setFormError("");
  };

  const handleKeywordChange = (value: string) => {
    setKeyword(value);
    if (formError) setFormError("");
  };

  // `keyword` parameter deliberately shadows the input state: everything in a
  // search (API params, matching, telemetry) must use the cleaned form, never
  // whatever the input field currently holds.
  // channelUrl arrives as a parameter (shadowing the state binding) so
  // handleSearch can pass a just-resolved value without waiting a render.
  const runSearch = async (keyword: string, channelUrl: string) => {
    // Cancel any in-flight SSE before claiming a new generation.
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    const myGen = ++searchGenRef.current;
    const superseded = () => myGen !== searchGenRef.current;

    setIsLoading(true);
    setError("");
    setResults([]);
    setHasSearched(false);
    setSuggestions([]);

    // Pin the SW alive for the full search. The SSE indexed phase runs without
    // any SW messages flowing, so the worker would otherwise hit the 30s idle
    // eviction. Stopped in `finally` regardless of success/abort/error.
    const stopKeepalive = startKeepalive();

    const searchStartedAt = Date.now();
    let searchFailed = false;

    const channelResolutionSource = classifyChannelInput(
      channelDisplay,
      channelFromSuggestionRef.current,
    );

    posthog.capture("search_started", {
      channel: channelUrl,
      keyword,
      keyword_script: detectKeywordScript(keyword),
      time_range: timeRange,
      exclude_shorts: excludeShorts,
      channel_resolution_source: channelResolutionSource,
    });

    let videosScanned = 0;
    let indexedHits = 0;
    let transcriptFailures = 0;
    let matchCount = 0;
    const failureReasonCounts: Partial<Record<FailureReason, number>> = {};

    try {
      const publishedAfter = getPublishedAfterDate(timeRange);

      // Step 1 — Stream indexed-only matches from /api/search via SSE.
      // Indexed FTS pre-filter skips videos that can't possibly match. Cached
      // transcripts mean no live YouTube fetch on the server. Un-indexed videos
      // are returned in the 'unindexed_videos' event; we fetch those locally.
      const params = new URLSearchParams({
        channel_url: channelUrl,
        keyword,
        max_videos: String(MAX_VIDEOS),
        exclude_shorts: String(excludeShorts),
        skip_live: "true",
      });
      if (publishedAfter) params.set("published_after", publishedAfter);
      const sseUrl = `${API_BASE}/api/search?${params.toString()}`;

      let unindexedVideos: VideoInfo[] = [];
      let resolvedChannelId: string | null = null;
      let sseError: string | null = null;

      await consumeSSE(sseUrl, {
        signal: controller.signal,
        onMessage: (data) => {
          if (superseded() || !data) return;
          try {
            const result = JSON.parse(data) as SearchResult;
            indexedHits++;
            matchCount++;
            setResults((prev) => [...prev, result]);
          } catch {
            // ignore malformed
          }
        },
        onEvent: (event, data) => {
          if (superseded()) return;
          if (event === "unindexed_videos") {
            try {
              const parsed = JSON.parse(data) as { videos: VideoInfo[] };
              unindexedVideos = parsed.videos ?? [];
            } catch {
              unindexedVideos = [];
            }
          } else if (event === "meta") {
            try {
              const parsed = JSON.parse(data) as { total: number; channel_id?: string };
              videosScanned = parsed.total ?? 0;
              resolvedChannelId = parsed.channel_id ?? null;
            } catch {
              // ignore
            }
          } else if (event === "error") {
            try {
              const parsed = JSON.parse(data) as { detail?: string };
              sseError = parsed.detail ?? "Search failed";
            } catch {
              sseError = "Search failed";
            }
          }
        },
      });

      if (superseded()) return;
      if (sseError) throw new Error(sseError);

      // Step 2 — Parallel SW transcript fetch + match for un-indexed videos.
      if (unindexedVideos.length > 0) {
        const queue = [...unindexedVideos];

        const worker = async () => {
          while (queue.length > 0) {
            if (superseded()) return;
            const video = queue.shift();
            if (!video) break;

            const txRes = await send(
              {
                type: "fetch-transcript",
                videoId: video.id,
                preferredLangs: [...PREFERRED_TRANSCRIPT_LANGS],
              },
              { signal: controller.signal },
            );
            if (superseded()) return;
            if (!txRes.ok || !txRes.data.transcript) {
              transcriptFailures++;
              const reason: FailureReason = !txRes.ok
                ? "unknown"
                : (txRes.data.failure_reason ?? "unknown");
              failureReasonCounts[reason] = (failureReasonCounts[reason] ?? 0) + 1;
              console.warn(
                `[ClipChase] transcript skipped for ${video.id}:`,
                txRes.ok ? `null (${reason})` : txRes.error,
              );
              continue;
            }
            const transcript = txRes.data.transcript;

            // channel_id/source_url make the server index this transcript
            // after responding — the old client-driven index-transcript
            // round-trip (second upload of the same transcript, SSE stream
            // babysat through SW keepalive) is gone.
            const matchRes = await send(
              {
                type: "match-transcript",
                params: {
                  keyword,
                  video,
                  transcript,
                  ...(resolvedChannelId
                    ? { channel_id: resolvedChannelId, source_url: channelUrl }
                    : {}),
                },
              },
              { signal: controller.signal },
            );
            if (superseded()) return;

            if (matchRes.ok && matchRes.data.match_result) {
              matchCount++;
              setResults((prev) => [...prev, matchRes.data.match_result!]);
            }
          }
        };

        const workerCount = Math.min(UNINDEXED_FETCH_CONCURRENCY, unindexedVideos.length);
        await Promise.all(Array.from({ length: workerCount }, worker));
      }

      if (superseded()) return;
      if (!videosScanned) videosScanned = unindexedVideos.length + indexedHits;
    } catch (err: unknown) {
      if (superseded()) return; // swallow errors from a superseded search
      // Abort fired by a newer search — caller already updated state, ignore.
      if (err instanceof DOMException && err.name === "AbortError") return;
      searchFailed = true;
      const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setError(message);
      setRetryBlocked(true);
      if (retryUnblockTimerRef.current) clearTimeout(retryUnblockTimerRef.current);
      retryUnblockTimerRef.current = setTimeout(() => setRetryBlocked(false), RETRY_COOLDOWN_MS);
      posthog.capture("search_error", {
        channel: channelUrl,
        keyword,
        keyword_script: detectKeywordScript(keyword),
        error_message: message,
        duration_ms: Date.now() - searchStartedAt,
      });
      posthog.capture("error_shown", {
        surface: "search",
        error_message: message,
      });
    } finally {
      stopKeepalive();
      if (superseded()) {
        posthog.capture("search_cancelled", {
          channel: channelUrl,
          keyword,
          keyword_script: detectKeywordScript(keyword),
          duration_ms: Date.now() - searchStartedAt,
        });
      } else {
        setIsLoading(false);
        setHasSearched(true);
        // Transcript coverage tells us whether zero-result searches are caused
        // by transcript-pipeline gaps (low coverage) vs genuinely-rare keywords
        // (high coverage, still zero hits). Indexed videos are assumed to
        // already have transcripts, so failures only come from unindexed
        // local-fetch attempts.
        const videosWithTranscript = Math.max(0, videosScanned - transcriptFailures);
        const transcriptCoveragePct =
          videosScanned > 0
            ? Math.round((videosWithTranscript / videosScanned) * 1000) / 10
            : null;
        const hadAnyTranscript = videosWithTranscript > 0;
        const transcriptFailureReasonTop = dominantReason(failureReasonCounts);
        if (!searchFailed) {
          setLastSearch({
            channel: channelUrl,
            keyword,
            failureReason: transcriptFailureReasonTop,
            failureRatio: videosScanned > 0 ? transcriptFailures / videosScanned : 0,
            failureCounts: failureReasonCounts,
            videosScanned,
            transcriptFailures,
          });
        }
        posthog.capture("search_completed", {
          channel: channelUrl,
          keyword,
          keyword_script: detectKeywordScript(keyword),
          time_range: timeRange,
          result_count: matchCount,
          indexed_hits: indexedHits,
          videos_scanned: videosScanned,
          videos_with_transcript: videosWithTranscript,
          transcript_failures: transcriptFailures,
          transcript_coverage_pct: transcriptCoveragePct,
          had_any_transcript: hadAnyTranscript,
          transcript_failure_reason_top: transcriptFailureReasonTop,
          success: !searchFailed,
          duration_ms: Date.now() - searchStartedAt,
        });
        if (matchCount === 0 && !searchFailed) {
          posthog.capture("zero_results", {
            channel: channelUrl,
            keyword,
            keyword_script: detectKeywordScript(keyword),
            time_range: timeRange,
            videos_scanned: videosScanned,
            videos_with_transcript: videosWithTranscript,
            transcript_failures: transcriptFailures,
            transcript_coverage_pct: transcriptCoveragePct,
            had_any_transcript: hadAnyTranscript,
            transcript_failure_reason_top: transcriptFailureReasonTop,
          });
          posthog.capture("zero_results_shown", {
            keyword_script: detectKeywordScript(keyword),
            had_any_transcript: hadAnyTranscript,
            transcript_failure_reason_top: transcriptFailureReasonTop,
          });
        } else if (matchCount > 0) {
          posthog.capture("results_shown", {
            result_count: matchCount,
            indexed_hits: indexedHits,
            had_any_transcript: hadAnyTranscript,
          });
        }
      }
    }
  };

  // Shared by form submit and the error card's retry button, so retry goes
  // through the same video-URL resolution instead of replaying a raw video
  // URL the API already rejected once.
  const submitSearch = async () => {
    // Dedupe rapid double-submits during the oEmbed round-trip below. NOT a
    // blanket isLoading guard: resubmitting mid-search is the supersede/cancel
    // path and must keep working.
    if (resolvingChannelRef.current) return;
    // Covers both entry points (form submit via held Enter, and the retry
    // button) — they both route through here.
    if (retryBlocked) return;
    const cleanedKeyword = keyword.trim() ? cleanKeyword(keyword) : "";
    if (!channelUrl && !cleanedKeyword) {
      setFormError("Enter a channel and a keyword to search");
      posthog.capture("search_validation_error", { missing_field: "both" });
      return;
    }
    if (!channelUrl) {
      setFormError("Enter a YouTube channel URL or @handle");
      posthog.capture("search_validation_error", { missing_field: "channel" });
      return;
    }
    if (!cleanedKeyword) {
      setFormError("Enter a keyword to search for");
      posthog.capture("search_validation_error", { missing_field: "keyword" });
      return;
    }
    if (cleanedKeyword.length > MAX_KEYWORD_LENGTH) {
      setFormError(
        `That's ${cleanedKeyword.length} characters — search a phrase you remember, not a whole passage.`,
      );
      posthog.capture("search_validation_error", {
        missing_field: "keyword_too_long",
        keyword_length: cleanedKeyword.length,
      });
      return;
    }
    setFormError("");
    // Reflect the cleaned form in the input so the user sees exactly what was
    // searched (e.g. pasted "startup" loses its quotes visibly).
    if (cleanedKeyword !== keyword) setKeyword(cleanedKeyword);

    // Users paste VIDEO urls into the channel field (observed in prod: 4
    // straight "SSE 400"s from one user). Resolve the video to its channel
    // via oEmbed instead of letting the API reject it.
    let searchChannel = channelUrl;
    const videoId = channelUrl.match(
      /(?:youtube\.com\/(?:watch\?(?:[^#\s]*&)?v=|shorts\/|live\/)|youtu\.be\/)([\w-]{5,20})/,
    )?.[1];
    if (videoId) {
      resolvingChannelRef.current = true;
      try {
        const r = await fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(
            `https://www.youtube.com/watch?v=${videoId}`,
          )}&format=json`,
          // 3s cap: this await runs before any spinner exists. A stalled
          // youtube.com must not leave the form looking dead.
          { signal: AbortSignal.timeout(3000) },
        );
        if (r.ok) {
          const d = (await r.json()) as { author_url?: string; author_name?: string };
          if (d.author_url) {
            searchChannel = d.author_url;
            setChannelUrl(d.author_url);
            if (d.author_name) {
              // Programmatic fill, not typing: without this the suggestions
              // effect debounces a /suggest-channels call and pops the
              // dropdown open over the running search.
              programmaticChannelDisplayRef.current = d.author_name;
              setChannelDisplay(d.author_name);
            }
            posthog.capture("channel_resolved_from_video", { video_id: videoId });
          }
        }
      } catch {
        // oEmbed unreachable — search with the raw input; the API error path
        // still surfaces, same as before this fix.
      } finally {
        resolvingChannelRef.current = false;
      }
    }
    await runSearch(cleanedKeyword, searchChannel);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void submitSearch();
  };

  return (
    <main className="min-h-screen bg-yt-black text-yt-text selection:bg-yt-red/30 px-4 pt-5 pb-20">
      <AnimatePresence>
        {showWelcome && (
          <WelcomeModal
            key="welcome"
            note={BUILDER_NOTE}
            channelName={channelDisplay || undefined}
            onDismiss={handleDismissWelcome}
          />
        )}
      </AnimatePresence>
      <div className="mb-4 flex items-center gap-2 pb-3 border-b border-yt-dark-gray">
        <div className="w-[22px] h-[22px] rounded-[5px] bg-yt-red flex items-center justify-center shrink-0">
          <Search className="w-3 h-3 text-white" strokeWidth={2.2} />
        </div>
        <span className="text-[13px] font-bold text-yt-text tracking-tight">ClipChase</span>
      </div>

      <SearchForm
        channelDisplay={channelDisplay}
        onChannelChange={handleChannelInputChange}
        onDismissSuggestions={handleDismissSuggestions}
        suggestions={suggestions}
        suggestionsFailed={suggestionsFailed}
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
          className="mt-5 p-4 rounded border border-yt-red/30 bg-yt-red/[0.08] text-yt-red"
        >
          <h3 className="font-semibold flex items-center gap-2 mb-1 text-xs">
            <span>⚠</span>
            Search failed
          </h3>
          <p className="text-[11px] leading-relaxed text-yt-red/80">{error}</p>
          <button
            type="button"
            onClick={() => void submitSearch()}
            disabled={isLoading || retryBlocked}
            className="mt-3 text-[11px] font-semibold text-yt-red hover:text-white border border-yt-red/40 hover:border-yt-red hover:bg-yt-red px-3 py-2 rounded transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-yt-red disabled:hover:border-yt-red/40"
          >
            Try again
          </button>
        </motion.div>
      )}

      {hasSearched && !isLoading && !error && results.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-10 flex flex-col items-center gap-2.5 text-center"
        >
          <Search className="w-7 h-7 text-yt-tert" strokeWidth={1.4} />
          <p className="text-[12px] text-yt-light-gray leading-relaxed max-w-xs">
            {lastSearch ? (
              lastSearch.videosScanned === 0 ? (
                // Zero videos even entered the scan (observed in prod: French
                // user, channel whose uploads predate the 30-day default).
                // Saying "no mentions" here blames the keyword; the time
                // range is the actual problem. Unless the range is already
                // All — then "expand the range" is dead advice.
                timeRange !== "all" ? (
                  <>
                    No videos found in this time range for this channel.<br />
                    <span className="text-yt-tert">Try expanding the range · the All filter covers the whole catalog.</span>
                  </>
                ) : (
                  <>
                    No searchable videos found on this channel.<br />
                    <span className="text-yt-tert">Videos without captions, and Shorts when excluded, can&rsquo;t be searched.</span>
                  </>
                )
              ) : lastSearch.failureReason === "pot_blocked" &&
                (lastSearch.failureCounts?.pot_blocked ?? 0) / (lastSearch.videosScanned || 1) > 0.3 ? (
                <>
                  No mentions of <span className="text-yt-text font-medium">&ldquo;{lastSearch.keyword}&rdquo;</span> in the videos we could search.<br />
                  <span className="text-yt-tert">
                    YouTube blocked transcript access for {lastSearch.failureCounts?.pot_blocked ?? 0} of {lastSearch.videosScanned} videos. These have transcripts, we just couldn&rsquo;t read them. Retrying in a minute usually helps.
                  </span>
                </>
              ) : lastSearch.failureReason === "no_captions" && (lastSearch.failureRatio ?? 0) > 0.5 ? (
                <>
                  No mentions of <span className="text-yt-text font-medium">&ldquo;{lastSearch.keyword}&rdquo;</span> in the {lastSearch.videosScanned} videos we searched.<br />
                  <span className="text-yt-tert">Most of them have no captions — common for Shorts and live streams.</span>
                </>
              ) : (
                // Never say "in recent videos" — it's false on an All-range
                // search and it hides the scan size, which is the single most
                // useful fact when a search comes back empty.
                <>
                  No mentions of <span className="text-yt-text font-medium">&ldquo;{lastSearch.keyword}&rdquo;</span> in the {lastSearch.videosScanned} videos we searched.<br />
                  <span className="text-yt-tert">
                    {timeRange === "all"
                      ? "That's this channel's newest uploads plus everything already indexed — deep back-catalogue may not be covered yet. Try a different keyword or a shorter phrase."
                      : "Try a different keyword, or switch the range to All to cover the whole catalogue."}
                  </span>
                </>
              )
            ) : (
              <>No results found.<br />Try a different keyword or time range.</>
            )}
          </p>
          <a
            href="https://tally.so/r/7RJQZA?source=ext_zero_results"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => posthog.capture("feedback_link_clicked", { trigger: "zero_results" })}
            className="mt-2 text-[11px] text-yt-tert hover:text-yt-light-gray transition-colors underline underline-offset-2"
          >
            What were you looking for? →
          </a>
        </motion.div>
      )}

      {showInterviewPrompt && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-5 p-4 rounded border border-yt-dark-gray bg-yt-gray flex items-start gap-3"
        >
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-yt-text mb-0.5">Found what you were after?</p>
            <p className="text-[11px] text-yt-light-gray leading-snug">
              I&rsquo;m Pradyumn, I built this. 15 minutes on what you use it for would shape what I build next.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={`https://tally.so/r/7RJQZA?source=ext_interview&pid=${encodeURIComponent(posthog.get_distinct_id() ?? "")}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                posthog.capture("interview_prompt_clicked");
                localStorage.setItem("interviewPromptDismissed", "1");
                setShowInterviewPrompt(false);
              }}
              className="text-[11px] font-semibold text-yt-red hover:text-white transition-colors whitespace-nowrap"
            >
              Sure, let&rsquo;s talk
            </a>
            <button
              type="button"
              onClick={() => {
                posthog.capture("interview_prompt_dismissed");
                localStorage.setItem("interviewPromptDismissed", "1");
                setShowInterviewPrompt(false);
              }}
              className="text-yt-light-gray/40 hover:text-yt-light-gray text-xs transition-colors"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </motion.div>
      )}

      {results.length > 0 && (
        <div className="mt-5">
          {/* !error: a search that throws mid-stream leaves partial results
              plus a lastSearch from the PREVIOUS search — the note would
              describe the wrong search. */}
          {/* Shown for every search, not just ones with failures: the scan
              size is how the user tells "this channel doesn't say that" apart
              from "you only looked at part of the channel". */}
          {!isLoading && !error && (lastSearch?.videosScanned ?? 0) > 0 && (
            <p className="mb-3 text-[10px] text-yt-tert leading-relaxed">
              Searched {(lastSearch!.videosScanned ?? 0) - (lastSearch!.transcriptFailures ?? 0)} of {lastSearch!.videosScanned} videos
              {(lastSearch!.transcriptFailures ?? 0) > 0 && (
                <>
                  {" · "}
                  {describeFailureCounts(lastSearch!.failureCounts ?? {}).join(" · ")}
                </>
              )}
            </p>
          )}
          <SearchResults
            results={results}
            sortBy={sortBy}
            onSortChange={(next) => {
              posthog.capture("sort_changed", { from: sortBy, to: next });
              setSortBy(next);
            }}
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
                  const opened = parseInt(localStorage.getItem("videosOpened") || "0") + 1;
                  localStorage.setItem("videosOpened", String(opened));
                  if (opened === 2 && !localStorage.getItem("interviewPromptDismissed")) {
                    setShowInterviewPrompt(true);
                  }
                  chrome.tabs.update(tab.id, {
                    url: `https://www.youtube.com/watch?v=${id}&t=${Math.floor(start)}s`,
                  });
                }
              });
            }}
          />
        </div>
      )}

      <div className="mt-10 pt-3 border-t border-yt-dark-gray flex justify-between items-center">
        <span className="font-mono text-[9px] text-yt-tert">v1.0</span>
        <div className="flex items-center gap-3">
          <a
            href="https://tally.so/r/7RJQZA?source=ext_footer"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => posthog.capture("feedback_link_clicked", { trigger: "ext_footer" })}
            className="text-[9px] text-yt-tert hover:text-yt-light-gray transition-colors"
          >
            Feedback
          </a>
          <a
            href="https://clipchase.xyz"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[9px] text-yt-tert hover:text-yt-light-gray transition-colors"
          >
            clipchase.xyz
          </a>
        </div>
      </div>
    </main>
  );
}
