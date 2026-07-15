const STABLE_ID_KEY = "clipchase_stable_id";

/**
 * Stable per-Chrome-profile ID stored in chrome.storage.local so it survives
 * browser cache/localStorage clears. Lives in its own module (no posthog-js
 * import) so the service worker can share it instead of duplicating the logic.
 */
export async function getOrCreateStableId(): Promise<string> {
  const stored = await chrome.storage.local.get(STABLE_ID_KEY);
  if (stored[STABLE_ID_KEY]) {
    return stored[STABLE_ID_KEY] as string;
  }
  const newId = `cc_${crypto.randomUUID()}`;
  await chrome.storage.local.set({ [STABLE_ID_KEY]: newId });
  return newId;
}
