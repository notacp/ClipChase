import posthog from 'posthog-js'

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST;

export { getOrCreateStableId } from "./stable-id";

export const initPostHog = () => {
  if (POSTHOG_KEY && POSTHOG_HOST) {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      persistence: 'localStorage',
      autocapture: false,
      capture_pageview: false,
      // Extension CSP forbids remote script-src, so PostHog can't lazy-load
      // recorder.js / dead-clicks-autocapture.js anyway. Disable both
      // explicitly to keep the dev console clean and avoid wasted requests.
      disable_external_dependency_loading: true,
      disable_session_recording: true,
      capture_exceptions: true,
    })

    // Super-properties — stamped on every event so funnels can split by surface
    // and bug reports can be cohorted by build.
    const version = chrome?.runtime?.getManifest?.().version ?? 'unknown'
    posthog.register({
      app: 'extension',
      extension_version: version,
    })
  }
}

export default posthog
