"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { SearchResult, TimeRange, ChannelSuggestion } from "@/types";
import { getPublishedAfterDate } from "@/lib/utils";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { SearchForm } from "@/components/SearchForm";
import { TimeRangeSelector } from "@/components/TimeRangeSelector";
import { SearchResults } from "@/components/SearchResults";
import { VideoPlayer } from "@/components/VideoPlayer";
import { BackgroundEffect } from "@/components/BackgroundEffect";
import { LoadingStream } from "@/components/LoadingStream";

export default function Home() {
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
  const [selectedVideo, setSelectedVideo] = useState<{ id: string; start: number } | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [lastSearch, setLastSearch] = useState<{ channel: string; keyword: string } | null>(null);
  const [formError, setFormError] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (channelDisplay.length < 2) {
      setSuggestions([]);
      setIsSuggestionsLoading(false);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSuggestionsLoading(true);
      try {
        const res = await fetch(`/api/suggest-channels?q=${encodeURIComponent(channelDisplay)}`);
        if (res.ok) setSuggestions(await res.json());
      } catch {
        // suggestions are best-effort, ignore errors
      } finally {
        setIsSuggestionsLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [channelDisplay]);

  const handleSelectSuggestion = (suggestion: ChannelSuggestion) => {
    setChannelDisplay(suggestion.title);
    setChannelUrl(suggestion.id);
    setSuggestions([]);
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
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError("");
    setErrorStatus(null);
    setResults([]);
    setSelectedVideo(null);
    setHasSearched(false);
    setSuggestions([]);

    try {
      const publishedAfter = getPublishedAfterDate(timeRange);
      let url = `/api/search?channel_url=${encodeURIComponent(channelUrl)}&keyword=${encodeURIComponent(keyword)}&max_videos=20`;
      if (publishedAfter) url += `&published_after=${encodeURIComponent(publishedAfter)}`;
      if (excludeShorts) url += `&exclude_shorts=true`;

      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
        setErrorStatus(response.status);
        const errorData = await response.json().catch(() => ({ detail: null }));
        throw new Error(errorData.detail || "Search failed");
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEventType = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;

        for (const line of lines) {
          if (line === "") {
            // Empty line = event delimiter, reset event type
            currentEventType = "";
          } else if (line.startsWith("event: ")) {
            currentEventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const payload = line.slice(6);
            if (currentEventType === "" && payload !== "{}") {
              // Default event type, treat as result
              if (abortControllerRef.current !== controller) {
                reader.cancel();
                return;
              }
              try {
                const result: SearchResult = JSON.parse(payload);
                setResults(prev => [...prev, result]);
              } catch (parseErr) {
                console.error("[stream] Failed to parse result:", parseErr);
                setError("Invalid response format from server");
                setErrorStatus(500);
                setIsLoading(false);
                reader.cancel();
                return;
              }
            } else if (currentEventType === "done") {
              setIsLoading(false);
            } else if (currentEventType === "error") {
              try {
                const { detail, status } = JSON.parse(payload);
                setError(detail);
                setErrorStatus(status);
              } catch (parseErr) {
                console.error("[stream] Failed to parse error:", parseErr);
                setError("Invalid error response from server");
                setErrorStatus(500);
              }
              setIsLoading(false);
            }
          }
        }
      }

      // Final flush: decode any remaining buffered data and process remaining lines
      buffer += decoder.decode();
      if (buffer.trim()) {
        const lines = buffer.split("\n");
        for (const line of lines) {
          if (line === "") {
            currentEventType = "";
          } else if (line.startsWith("event: ")) {
            currentEventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const payload = line.slice(6);
            if (currentEventType === "" && payload !== "{}") {
              if (abortControllerRef.current !== controller) return;
              try {
                const result: SearchResult = JSON.parse(payload);
                setResults(prev => [...prev, result]);
              } catch (parseErr) {
                console.error("[stream] Failed to parse final result:", parseErr);
                // Don't abort on final parse errors, just log
              }
            } else if (currentEventType === "done") {
              setIsLoading(false);
            } else if (currentEventType === "error") {
              try {
                const { detail, status } = JSON.parse(payload);
                setError(detail);
                setErrorStatus(status);
              } catch (parseErr) {
                console.error("[stream] Failed to parse final error:", parseErr);
              }
              setIsLoading(false);
            }
          }
        }
      }

      setLastSearch({ channel: channelUrl, keyword });
    } catch (err: any) {
      if (abortControllerRef.current !== controller) return;

      if (err.name === "AbortError" || err.message?.includes("aborted") || err.message?.includes("fetch failed")) {
        setErrorStatus(408);
        setError("The server took too long to respond.");
      } else if (err.message === "Failed to fetch") {
        setErrorStatus(0);
        setError("Unable to connect to the server.");
      } else {
        setError(err.message);
      }
    } finally {
      if (abortControllerRef.current === controller) {
        setIsLoading(false);
        setHasSearched(true);
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

  const getErrorTitle = () => {
    if (errorStatus === 0) return "Connection error";
    if (errorStatus === 408) return "Request timed out";
    if (errorStatus === 403 || errorStatus === 502) return "Something went wrong on our end";
    if (errorStatus === 400) return "Channel not found";
    return "Search failed";
  };

  const getErrorMessage = () => {
    if (errorStatus === 0) return "Unable to reach the server. Check your internet connection and try again.";
    if (errorStatus === 408) return "The search took too long. This can happen with large channels — please try again.";
    if (errorStatus === 403 || errorStatus === 502) return "YouTube is temporarily blocking our server. This usually resolves itself — try again in a few minutes.";
    if (errorStatus === 400) return "We couldn't find that YouTube channel. Double-check the URL or @handle and try again.";
    return error || "Something went wrong. Please try again.";
  };

  return (
    <main className="min-h-screen bg-yt-black text-white selection:bg-yt-red/30 pb-20">
      <BackgroundEffect />
      <Header />

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-20">
        <Hero isCompact={isLoading || results.length > 0 || hasSearched}>
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
          <TimeRangeSelector timeRange={timeRange} setTimeRange={setTimeRange} />

          {isLoading && (
            <LoadingStream keyword={keyword} channel={channelDisplay} />
          )}

          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 p-4 rounded-xl border border-yt-red/20 bg-yt-red/10 text-yt-red"
            >
              <h3 className="font-bold flex items-center gap-2 mb-2">
                <span className="text-xl">⚠️</span>
                {getErrorTitle()}
              </h3>
              <p className="font-medium text-sm leading-relaxed text-yt-red/80">
                {getErrorMessage()}
              </p>
              <button
                type="button"
                onClick={runSearch}
                className="mt-3 text-sm font-semibold text-yt-red hover:text-white border border-yt-red/40 hover:border-yt-red hover:bg-yt-red px-4 py-1.5 rounded-lg transition-all"
              >
                Try again
              </button>
            </motion.div>
          )}
        </Hero>

        {/* Empty state */}
        {hasSearched && !isLoading && !error && results.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-16 text-center"
          >
            <div className="text-5xl mb-4">🔍</div>
            <h3 className="text-xl font-semibold text-white mb-2">No mentions found</h3>
            <p className="text-yt-light-gray text-sm max-w-md mx-auto">
              {lastSearch
                ? <>Couldn&apos;t find <span className="text-white font-medium">&ldquo;{lastSearch.keyword}&rdquo;</span> in any recent videos from this channel. Try a different keyword or expand the time range.</>
                : "No results found. Try a different keyword or expand the time range."}
            </p>
            <ul className="mt-4 text-yt-light-gray text-sm space-y-1">
              <li>• Make sure the keyword spelling is correct</li>
              <li>• Try a broader time range (e.g. &ldquo;All time&rdquo;)</li>
              <li>• The channel may not have transcripts enabled</li>
            </ul>
          </motion.div>
        )}

        {/* Skeleton loading */}
        {isLoading && results.length === 0 && (
          <div className="mt-20 grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="h-6 w-20 bg-white/10 rounded animate-pulse" />
                <div className="h-4 w-40 bg-white/10 rounded animate-pulse" />
              </div>
              {[0, 1, 2].map((i) => (
                <div key={i} className="glass p-6 rounded-2xl space-y-4">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="w-full sm:w-32 h-20 bg-white/10 rounded-lg animate-pulse" />
                    <div className="flex-1 space-y-2">
                      <div className="h-5 bg-white/10 rounded animate-pulse" />
                      <div className="h-5 w-3/4 bg-white/10 rounded animate-pulse" />
                      <div className="h-4 w-24 bg-white/10 rounded animate-pulse mt-1" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-12 bg-white/10 rounded-lg animate-pulse" />
                    <div className="h-12 w-5/6 bg-white/10 rounded-lg animate-pulse opacity-75" />
                  </div>
                </div>
              ))}
            </div>
            <div className="lg:sticky lg:top-24 h-fit">
              <div className="glass rounded-3xl aspect-video bg-white/5 animate-pulse" />
            </div>
          </div>
        )}

        {/* Results Section */}
        {results.length > 0 && (
          <div className="mt-20 grid grid-cols-1 lg:grid-cols-2 gap-12">
            <SearchResults
              results={results}
              onSelectVideo={(id, start) => setSelectedVideo({ id, start })}
            />
            <VideoPlayer selectedVideo={selectedVideo} />
          </div>
        )}
      </div>
    </main>
  );
}
