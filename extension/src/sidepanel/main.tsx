import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import { initPostHog } from "../shared/posthog";
import posthog from "../shared/posthog";

initPostHog();
posthog.capture("extension_opened");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
