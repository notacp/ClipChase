const STABLE_ID_KEY = "clipchase_stable_id";

/**
 * Stable per-Chrome-profile ID stored in chrome.storage.local so it survives
 * browser cache/localStorage clears. Lives in its own module (no posthog-js
 * import) so the service worker and the side panel share one implementation.
 *
 * Race-safe within a context. On a fresh install the service worker's first
 * boot runs several callers at once — onInstalled (extension_installed + the
 * /installed tab), the top-level sw_started ping, and setUninstallURL. With a
 * plain read-then-write each one found storage empty and minted its own UUID;
 * one write won and the rest were orphans. PostHog showed it plainly: every
 * install-only person had a sw_started "twin" in the same second, plus ~200
 * ghost persons made of a single sw_started. Memoising the in-flight promise
 * makes concurrent callers share one read and at most one write.
 *
 * ponytail: per-context memo only. The side panel runs in a separate context,
 * but it opens after install, by which point the ID is already stored.
 */
let inFlight: Promise<string> | null = null;

export function getOrCreateStableId(): Promise<string> {
  if (!inFlight) {
    inFlight = (async () => {
      const stored = await chrome.storage.local.get(STABLE_ID_KEY);
      if (stored[STABLE_ID_KEY]) return stored[STABLE_ID_KEY] as string;
      const newId = `cc_${crypto.randomUUID()}`;
      await chrome.storage.local.set({ [STABLE_ID_KEY]: newId });
      return newId;
    })();
    // A failed storage call must not poison every later caller for the life
    // of the context; drop the memo so the next call retries.
    inFlight.catch(() => {
      inFlight = null;
    });
  }
  return inFlight;
}
