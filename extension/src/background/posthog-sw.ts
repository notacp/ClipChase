// Minimal PostHog capture for the service worker.
//
// posthog-js can't run in an SW (no window/localStorage). The SDK is only used
// in the side panel; here we POST events to /capture/ ourselves. Stable_id is
// shared with the panel via chrome.storage.local so events from both surfaces
// resolve to the same person in PostHog.

// The shared, race-safe implementation. This file used to carry its own copy
// of the read-then-write, which on first boot raced the one in service-worker
// and split fresh installs across two PostHog persons.
import { getOrCreateStableId as getStableId } from "../shared/stable-id";

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST as string | undefined;

function extVersion(): string {
  return chrome?.runtime?.getManifest?.().version ?? "unknown";
}

// posthog-js sets $os in the panel; SW events had none, so installs couldn't
// be split by OS (CWS says ChromeOS is ~32% of installs but PostHog barely sees
// it). Values match posthog-js's so one breakdown covers both surfaces.
export function swOs(): string | null {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const p = nav.userAgentData?.platform || "";
  if (p === "macOS") return "Mac OS X";
  if (p) return p; // "Windows", "Chrome OS", "Linux", "Android"
  const ua = nav.userAgent || "";
  if (/CrOS/.test(ua)) return "Chrome OS";
  if (/Windows/.test(ua)) return "Windows";
  if (/Mac OS X/.test(ua)) return "Mac OS X";
  if (/Linux/.test(ua)) return "Linux";
  return null;
}

export async function captureSW(
  event: string,
  properties: Record<string, unknown> = {},
): Promise<void> {
  if (!POSTHOG_KEY || !POSTHOG_HOST) return;
  try {
    const distinctId = await getStableId();
    // PostHog's public capture endpoint. `/i/v0/e/` is the *internal* batched
    // ingest path used by posthog-js; the single-event REST shape is /capture/.
    await fetch(`${POSTHOG_HOST}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: POSTHOG_KEY,
        event,
        distinct_id: distinctId,
        properties: {
          app: "extension",
          surface: "background",
          // PostHog's exception-ingest validator (Cymbal) requires `platform`.
          // posthog-js injects this automatically in the sidepanel; the SW
          // builds payloads by hand, so we must set it here or every $exception
          // ingests with $cymbal_errors and skips Error Tracking grouping.
          platform: "web",
          extension_version: extVersion(),
          $os: swOs(),
          ...properties,
        },
        timestamp: new Date().toISOString(),
      }),
    });
  } catch {
    // Swallow — telemetry must never break the extension.
  }
}

export function captureExceptionSW(
  err: unknown,
  extra: Record<string, unknown> = {},
): void {
  const error = err instanceof Error ? err : new Error(String(err));
  void captureSW("$exception", {
    $exception_list: [
      {
        type: error.name || "Error",
        value: error.message,
        stacktrace: error.stack
          ? { type: "raw", frames: [{ raw: error.stack }] }
          : undefined,
      },
    ],
    $exception_level: "error",
    $exception_handled: true,
    ...extra,
  });
}
