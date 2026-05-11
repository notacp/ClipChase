import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import { initPostHog, getOrCreateStableId } from "../shared/posthog";
import posthog from "../shared/posthog";

initPostHog();

// Manual exception bridge — `capture_exceptions: true` in init relies on
// posthog-js loading `exception-autocapture.js` from the CDN, which is blocked
// in this extension by `disable_external_dependency_loading: true` (CSP also
// forbids remote script-src). `posthog.captureException` is bundled and works
// without external deps, so we wire the global handlers ourselves.
window.addEventListener("error", (event) => {
  const err = event.error ?? new Error(event.message || "Unknown error");
  posthog.captureException(err, {
    source: "window.onerror",
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
});
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  const err = reason instanceof Error ? reason : new Error(String(reason));
  posthog.captureException(err, { source: "unhandledrejection" });
});

// Identify with stable ID before firing events. Async (chrome.storage), so
// React renders in parallel — events fired during the gap are queued by
// PostHog and re-attributed once identify resolves.
getOrCreateStableId().then((stableId) => {
  posthog.identify(stableId);
  posthog.capture("extension_opened");
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
