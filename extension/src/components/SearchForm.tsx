import { motion, AnimatePresence } from "framer-motion";
import { Search, Folder } from "lucide-react";
import { FormEvent, useRef, useEffect, useState } from "react";
import { ChannelSuggestion } from "../shared/types";

interface SearchFormProps {
  channelDisplay: string;
  onChannelChange: (value: string) => void;
  onDismissSuggestions: () => void;
  suggestions: ChannelSuggestion[];
  isSuggestionsLoading?: boolean;
  onSelectSuggestion: (suggestion: ChannelSuggestion) => void;
  keyword: string;
  setKeyword: (keyword: string) => void;
  handleSearch: (e: FormEvent) => void;
  isLoading: boolean;
  excludeShorts: boolean;
  setExcludeShorts: (v: boolean) => void;
  formError?: string;
}

export function SearchForm({
  channelDisplay,
  onChannelChange,
  onDismissSuggestions,
  suggestions,
  isSuggestionsLoading = false,
  onSelectSuggestion,
  keyword,
  setKeyword,
  handleSearch,
  isLoading,
  excludeShorts,
  setExcludeShorts,
  formError,
}: SearchFormProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [chFocused, setChFocused] = useState(false);
  const [kwFocused, setKwFocused] = useState(false);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onDismissSuggestions();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onDismissSuggestions]);

  const showDropdown = suggestions.length > 0 || isSuggestionsLoading;

  const inputCls = (focused: boolean) =>
    `w-full pl-9 pr-3 py-2 rounded text-[12px] text-yt-text placeholder:text-yt-tert outline-none transition-all border ${
      focused
        ? "border-yt-red bg-yt-red/[0.09]"
        : "border-yt-dark-gray bg-yt-gray hover:border-yt-hover/60"
    }`;

  const canSubmit = channelDisplay.trim().length > 0 && keyword.trim().length > 0;

  return (
    <motion.form
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      onSubmit={handleSearch}
      className="w-full flex flex-col gap-2"
    >
      {/* Channel input */}
      <div className="relative" ref={containerRef}>
        <Folder
          className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-yt-tert pointer-events-none"
          strokeWidth={2}
        />
        <input
          type="text"
          placeholder="Channel name or URL"
          value={channelDisplay}
          onChange={(e) => onChannelChange(e.target.value)}
          onFocus={() => setChFocused(true)}
          onBlur={() => setChFocused(false)}
          autoComplete="off"
          className={inputCls(chFocused)}
        />

        <AnimatePresence>
          {showDropdown && (
            <motion.ul
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="absolute z-50 top-full mt-1 w-full bg-yt-gray rounded border border-yt-dark-gray overflow-hidden shadow-xl"
            >
              {isSuggestionsLoading && suggestions.length === 0 ? (
                <li className="px-3 py-2.5 flex items-center gap-2.5">
                  <div className="w-3 h-3 border-2 border-yt-dark-gray border-t-yt-red rounded-full animate-spin shrink-0" />
                  <span className="text-[12px] text-yt-light-gray">Finding channels…</span>
                </li>
              ) : (
                suggestions.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onSelectSuggestion(s);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-yt-dark-gray transition-colors text-left"
                    >
                      {s.thumbnail ? (
                        <img
                          src={s.thumbnail}
                          alt={s.title}
                          className="w-6 h-6 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-yt-dark-gray shrink-0" />
                      )}
                      <span className="text-[12px] text-yt-text truncate">{s.title}</span>
                    </button>
                  </li>
                ))
              )}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>

      {/* Keyword + Search button */}
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-yt-tert pointer-events-none"
            strokeWidth={2}
          />
          <input
            type="text"
            placeholder="Phrase to search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onFocus={() => setKwFocused(true)}
            onBlur={() => setKwFocused(false)}
            className={inputCls(kwFocused)}
          />
        </div>
        <button
          type="submit"
          disabled={isLoading}
          className="bg-yt-red text-white px-3.5 py-2 rounded text-[12px] font-semibold transition-opacity disabled:cursor-not-allowed flex items-center justify-center min-w-[64px]"
          style={{ opacity: isLoading ? 1 : canSubmit ? 1 : 0.38 }}
        >
          {isLoading ? (
            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            "Search"
          )}
        </button>
      </div>

      {/* Exclude Shorts toggle */}
      <label className="flex items-center gap-1.5 px-0.5 cursor-pointer select-none text-[11px] text-yt-light-gray w-fit">
        <input
          type="checkbox"
          checked={excludeShorts}
          onChange={(e) => setExcludeShorts(e.target.checked)}
          className="accent-yt-red w-3.5 h-3.5"
        />
        Exclude Shorts
      </label>

      <AnimatePresence>
        {formError && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="text-[11px] text-yt-red flex items-center gap-1.5 px-0.5"
          >
            <span>⚠</span>
            {formError}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.form>
  );
}
