import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import { initPostHog, getOrCreateStableId } from "../shared/posthog";
import posthog from "../shared/posthog";

initPostHog();

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
