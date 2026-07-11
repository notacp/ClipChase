// Shared constants across the side panel and the background service worker.
// Adding a new transcript language is a one-line change here; everywhere else
// imports this list.

export const PREFERRED_TRANSCRIPT_LANGS = ["en", "hi", "fr", "es", "pt"] as const;

// Base for shareable moment links (clipchase.xyz/m/<videoId>?t=…&x=…&k=…).
// Points at the marketing site, not YouTube: the share page embeds the video
// at the timestamp AND carries the install CTA, so every share is a funnel entry.
// www, not apex: the apex 308-redirects to www, and unfurl bots shouldn't
// need the extra hop on every shared link.
export const SHARE_BASE = "https://www.clipchase.xyz";
