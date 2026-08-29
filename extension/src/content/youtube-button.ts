// In-page entry point. ClipChase's only door was the toolbar icon, which
// Chrome hides in the puzzle-piece menu by default — 21 of 81 installs never
// opened the panel once, and 18 of those never woke the service worker again
// (PostHog, Jul 1 – Aug 22). This puts the door on the page the user is
// already looking at.
//
// Deliberately dependency-free: no PostHog, no shared imports. This runs
// inside youtube.com, so every byte and every global is a compatibility risk.
// Analytics go through the service worker, which already owns captureSW.
//
// Trusted Types: YouTube enforces a TT policy, so innerHTML is unavailable
// here. Everything below builds DOM through createElement / textContent.

import { surfaceForPath, type Surface } from "./surface";

const BUTTON_ID = "clipchase-entry-button";

// ponytail: one self-healing poll instead of three mechanisms (initial load,
// SPA nav, YouTube re-rendering the header out from under us). A querySelector
// per second on a page already running YouTube is noise. The nav listener
// below is a latency optimisation on top, not a second source of truth.
const POLL_MS = 1000;

// YouTube renders the action rows asynchronously after navigation, so an
// anchor missing on the first few passes is normal. Only a sustained miss
// means our selectors have rotted.
const MISSES_BEFORE_REPORTING = 6;

const IS_MAC = /mac/i.test(
  (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ||
    navigator.platform ||
    "",
);

// The shortcut IS the pitch: YouTube's Ask paraphrases with Gemini, this finds
// the literal line. A Mac user reading "Ctrl" is the one thing that breaks the
// reference, so it's detected rather than assumed.
const SHORTCUT = IS_MAC ? "⌘F" : "Ctrl+F";
const LABEL = `${SHORTCUT} this channel`;
const TOOLTIP = "Every word spoken across this channel. Jump to the second they said it.";


// Ordered by preference; first match wins. YouTube ships several header
// variants at once (A/B tests, staged rollouts), so a list beats one selector.
const ANCHORS: Record<Surface, string[]> = {
  channel_page: [
    "yt-flexible-actions-view-model",
    "#page-header .yt-flexible-actions-view-model-wiz",
    "ytd-channel-header-renderer #buttons",
    "#channel-header #buttons",
    "#inner-header-container #buttons",
  ],
  watch_page: [
    "ytd-watch-metadata #top-level-buttons-computed",
    "ytd-watch-metadata #actions-inner #menu",
    "#above-the-fold #top-level-buttons-computed",
    "#menu-container #top-level-buttons-computed",
  ],
};

function findAnchor(surface: Surface): Element | null {
  for (const selector of ANCHORS[surface]) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
}

/** Fire-and-forget telemetry. Never called during a click — see onClick. */
function report(name: string, props: Record<string, unknown>): void {
  try {
    chrome.runtime.sendMessage({ type: "cc-content-event", name, props });
  } catch {
    // Extension context invalidated (update/reload with the tab still open).
    // Nothing useful to do; the poll below stops on the same condition.
  }
}

function buildButton(surface: Surface): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.id = BUTTON_ID;
  btn.type = "button";
  btn.title = TOOLTIP;
  btn.setAttribute("aria-label", `${LABEL}. ${TOOLTIP}`);

  // Inline styles rather than an injected stylesheet: no cascade to collide
  // with YouTube's, and nothing left behind if the node is torn out.
  btn.style.cssText = [
    "display:inline-flex",
    "align-items:center",
    "gap:6px",
    "height:36px",
    "padding:0 14px",
    "margin-left:8px",
    "border:0",
    "border-radius:18px",
    "background:#FF4500",
    "color:#fff",
    "font-family:'Roboto','Arial',sans-serif",
    "font-size:14px",
    "font-weight:600",
    "line-height:36px",
    "cursor:pointer",
    "white-space:nowrap",
    "vertical-align:middle",
  ].join(";");

  const key = document.createElement("span");
  key.textContent = SHORTCUT;
  key.style.cssText = [
    "font-family:ui-monospace,'JetBrains Mono',Menlo,Consolas,monospace",
    "font-weight:700",
    "font-size:12px",
    "background:rgba(255,255,255,.22)",
    "border-radius:3px",
    "padding:1px 5px",
  ].join(";");

  const rest = document.createElement("span");
  rest.textContent = "this channel";

  btn.appendChild(key);
  btn.appendChild(rest);

  btn.addEventListener("mouseenter", () => {
    btn.style.background = "#E63E00";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.background = "#FF4500";
  });

  btn.addEventListener("click", (event) => onClick(event, surface));
  return btn;
}

/**
 * The gesture-critical path. Chrome curries a user gesture across
 * runtime.sendMessage, but the synthesized gesture on the receiving end is
 * *restricted*: it cannot spawn a second message, and a reply sent back to
 * this page during the gesture cancels the real one (crbug.com/355266358 #28).
 *
 * Therefore: exactly ONE message, sent first, with no callback and nothing
 * awaited before it. Telemetry is the service worker's job — an analytics
 * call here would be a second message racing the one that matters.
 */
function onClick(event: MouseEvent, surface: Surface): void {
  event.preventDefault();
  event.stopPropagation();
  try {
    chrome.runtime.sendMessage({
      type: "open-side-panel",
      surface,
      url: location.href,
    });
  } catch {
    // Extension context invalidated — the page outlived the extension.
  }
}

let consecutiveMisses = 0;
let reportedMissFor: Surface | null = null;

function ensureButton(): void {
  const surface = surfaceForPath(location.pathname);
  if (!surface) return;

  const existing = document.getElementById(BUTTON_ID);
  if (existing && existing.isConnected) return;

  const anchor = findAnchor(surface);
  if (!anchor) {
    consecutiveMisses++;
    // Report once per surface. Silent breakage here is the failure mode that
    // would otherwise look identical to "nobody clicked it".
    if (consecutiveMisses >= MISSES_BEFORE_REPORTING && reportedMissFor !== surface) {
      reportedMissFor = surface;
      report("entry_button_anchor_missing", { surface, path: location.pathname });
    }
    return;
  }

  consecutiveMisses = 0;
  anchor.appendChild(buildButton(surface));
  report("entry_button_shown", { surface });
}

function onNavigate(): void {
  // A new page means new anchors; let the miss counter start clean so a slow
  // render on one page doesn't spend the reporting budget for the next.
  consecutiveMisses = 0;
  reportedMissFor = null;
  ensureButton();
}

document.addEventListener("yt-navigate-finish", onNavigate);
ensureButton();

const poll = setInterval(() => {
  // chrome.runtime.id goes undefined when the extension is reloaded or updated
  // while this tab stays open. Without this the interval throws forever.
  if (!chrome.runtime?.id) {
    clearInterval(poll);
    return;
  }
  ensureButton();
}, POLL_MS);

export {};
