import posthog from 'posthog-js'

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST;

const STABLE_ID_KEY = "timestitch_stable_id";

/**
 * Stable per-Chrome-profile ID stored in chrome.storage.local so it
 * survives browser cache/localStorage clears.
 */
export async function getOrCreateStableId(): Promise<string> {
  const stored = await chrome.storage.local.get(STABLE_ID_KEY);
  if (stored[STABLE_ID_KEY]) {
    return stored[STABLE_ID_KEY] as string;
  }
  const newId = `ts_${crypto.randomUUID()}`;
  await chrome.storage.local.set({ [STABLE_ID_KEY]: newId });
  return newId;
}

export const initPostHog = () => {
  if (POSTHOG_KEY && POSTHOG_HOST) {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      persistence: 'localStorage',
      autocapture: false,
      capture_pageview: false,
      disable_external_dependency_loading: true,
      session_recording: {
        maskAllInputs: false,
      },
      disable_session_recording: false,
    })
  }
}

export default posthog
