---
name: ClipChase
description: Ctrl+F for YouTube — transcript search with clickable timestamps
colors:
  accent: "#FF4500"
  accent-hover: "#E03A00"
  accent-tint: "#FF450018"
  ink: "#141412"
  ink-secondary: "#6b6860"
  ink-muted: "#aaa9a3"
  bg: "#fafaf9"
  surface: "#f4f3f1"
  surface2: "#eeede9"
  border: "#e2e0db"
  ink-dark: "#ebebeb"
  ink-secondary-dark: "#888888"
  ink-muted-dark: "#444444"
  bg-dark: "#0e0e0e"
  surface-dark: "#161616"
  surface2-dark: "#1e1e1e"
  border-dark: "#272727"
  success: "#22c55e"
typography:
  display:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "clamp(42px, 5vw, 68px)"
    fontWeight: 800
    lineHeight: 1.0
    letterSpacing: "-0.045em"
  headline:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "clamp(22px, 2.5vw, 34px)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.7
  label-mono:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.05em"
rounded:
  xs: "4px"
  sm: "6px"
  md: "10px"
spacing:
  xs: "8px"
  sm: "16px"
  md: "24px"
  lg: "48px"
  xl: "96px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "13px 26px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "13px 26px"
  button-nav:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
    rounded: "{rounded.xs}"
    padding: "6px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.sm}"
    padding: "13px 20px"
  chip-filter-inactive:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.xs}"
    padding: "2px 7px"
  chip-filter-active:
    backgroundColor: "{colors.accent-tint}"
    textColor: "{colors.accent}"
    rounded: "{rounded.xs}"
    padding: "2px 7px"
  input-search:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xs}"
    padding: "6px 9px"
  input-search-active:
    backgroundColor: "{colors.accent-tint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xs}"
    padding: "6px 9px"
---

# Design System: ClipChase

## 1. Overview

**Creative North Star: "The Precision Clip"**

ClipChase is a search tool — and this design system acts like one. No surface exists to add texture or warmth; every token earns its place by doing a specific job. The palette is a near-monochrome canvas with a single orange accent that means one thing: there is something here. The monospaced type says the same thing: this value is exact. The grid lines say it without type at all.

The system rejects the entire AI landing-page vocabulary: no cream/sand backgrounds as "warmth," no gradient text, no identical card grids, no hero metric blocks, no numbered eyebrows on every section as scaffolding. These patterns make pages indistinguishable from each other. ClipChase's page should feel like it was made by someone who actually lives in YouTube — not by a brand team describing a product they've never used.

The dual dark/light theme is earned: the extension popup lives on YouTube's dark UI, so dark mode is the tool's natural habitat. The landing page defaults light because conversion happens in varied environments, but the dark theme is not an afterthought.

**Key Characteristics:**
- YouTube Ember (`#FF4500`) as the single accent — used on CTAs, match counts, timestamps, active states. Its rarity is its weight.
- JetBrains Mono for precision signals only: timestamps, counts, sequential numbers. Never body text.
- 1px border dividers as structural grid — no card backgrounds for feature lists.
- Near-zero motion at rest; purposeful motion on state change and reveal.
- "Comfortable and precise": enough breathing room to read confidently, tight enough to feel like a tool.

## 2. Colors: The Ember on Neutral Canvas

The palette is a near-monochrome neutral system punctuated by one saturated accent. The accent's job is to mark the found thing — the match, the CTA, the timestamp — not to decorate.

### Primary
- **YouTube Ember** (`#FF4500`): The accent. All CTAs, active filter chips, match count numbers, timestamp links, the logo mark. Used on ≤15% of any given screen. When it appears, the user's eye goes there first.

### Neutral — Dark Canvas
- **Screen Black** (`#0e0e0e`): Primary background in dark mode. Near-black, not pure black — avoids OLED harshness.
- **Deep Surface** (`#161616`): First surface layer. Nav background (dark), popup background.
- **Lifted Surface** (`#1e1e1e`): Second surface layer. Inputs, hover targets.
- **Hairline Dark** (`#272727`): All borders and dividers in dark mode. 1px only.
- **Off-White Type** (`#ebebeb`): Primary readable text on dark.
- **Mid Slate** (`#888888`): Supporting text, labels, nav links.
- **Dim Muted** (`#444444`): Placeholder text, disabled states.

### Neutral — Light Canvas
- **Almost White** (`#fafaf9`): Primary light background. Sits at the edge of the warm-neutral band — do not introduce additional warm tinting anywhere in the palette.
- **Warm Surface** (`#f4f3f1`): First surface layer (light). CTA box backgrounds.
- **Warm Lifted** (`#eeede9`): Second surface layer (light).
- **Hairline Light** (`#e2e0db`): All borders and dividers in light mode.
- **Near-Black Ink** (`#141412`): Primary readable text on light.
- **Stone Text** (`#6b6860`): Supporting text, nav links, body descriptions.
- **Pale Muted** (`#aaa9a3`): Placeholder, footer text, disabled states.

### Secondary
- **Active Green** (`#22c55e`): The "live" or "available" signal (beta badge dot). Not used for anything else.

### Named Rules
**The One Voice Rule.** YouTube Ember (`#FF4500`) is used on ≤15% of any screen surface. CTAs, active indicators, counts, the logo — that's the full list. It is not used for hover states on neutral elements, decorative borders, section headers, or background fills on non-interactive surfaces.

**The Tint Cap Rule.** The light background (`#fafaf9`) already carries subtle warmth. Do not add more warm-tinted neutrals to the palette. New neutral tokens should be chroma-neutral or tinted toward the accent's own hue (red-orange family), not toward generic warmth.

## 3. Typography

**Display Font:** Plus Jakarta Sans (Google Fonts, weights 400–800)
**Body Font:** Plus Jakarta Sans (same family, weights 400–700)
**Accent/Mono Font:** JetBrains Mono (Google Fonts, weights 400–700)

**Character:** Plus Jakarta Sans is a contemporary humanist sans-serif with strong weight contrast — the jump from 400 to 800 is dramatic enough to build hierarchy on a single family without a display face. JetBrains Mono appears exclusively as a precision signal: where the value is exact and the source is a machine. The contrast between the two families is functional, not decorative.

### Hierarchy
- **Display** (800, `clamp(42px, 5vw, 68px)`, line-height 1.0, letter-spacing -0.045em): Hero headings only. One per page. Tight tracking reinforces the sharp, decisive character.
- **Headline** (700, `clamp(22px, 2.5vw, 34px)`, line-height 1.15, letter-spacing -0.03em): Section headings. The clamp handles responsive behavior; do not use fixed px for headings at this scale.
- **Title** (700, 17px / 600, 14px, line-height 1.3, letter-spacing -0.02em): Component headings within feature cells, step titles, popup video titles.
- **Body** (400, 13–18px, line-height 1.65–1.75, color: secondary/stone): Supporting copy. Max line length 65–75ch. Never set in a muted color that fails 4.5:1 contrast against its background.
- **Mono Label** (JetBrains Mono, 600, 10–11px, letter-spacing +0.05em): Section numbers in genuine sequences, timestamps, match counts, filter time ranges. The monospace signals "exact value."

### Named Rules
**The Mono as Signal Rule.** JetBrains Mono appears only where the value is machine-generated and exact: timestamps (1:23:45), match counts (32), sequential step numbers in actual ordered flows. It never appears in headings, body paragraphs, navigation, CTAs, or any copy a human wrote. When you see mono, you know you're looking at a coordinate, not prose.

**The Weight Contrast Rule.** Hierarchy is built on weight contrast (400 → 700 → 800), not on separate type families. Do not introduce a third family for "display" purposes; Plus Jakarta Sans at 800 is the display face.

## 4. Elevation

This system is flat by default. Surfaces rest without shadow — depth is conveyed through the tonal ramp (bg → surface → surface2) and through 1px borders, not through shadow blur. The flat default matches the tool's character: no ambient decoration, no permanent depth.

Shadows appear in two contexts only: product demo surfaces (the extension popup mockup, which has a drop shadow to frame it as a preview floating above the page) and state responses (a subtle lift on hover for interactive containers).

### Shadow Vocabulary
- **Product Demo Shadow** (`0 20px 60px rgba(0,0,0,0.12)` light / `0 20px 60px rgba(0,0,0,0.70)` dark): Applied to the extension preview mockup only. This is a narrative shadow — it frames the product demonstration, not an interactive element.
- **Hover Lift** (`0 4px 16px rgba(0,0,0,0.10)`): State response for interactive card containers on hover. Appears only as a transition, not at rest.

### Named Rules
**The Flat-by-Default Rule.** Resting surfaces carry no shadow. The extension popup preview is the one named exception — its shadow is a deliberate framing device for a product demonstration, not a template for other containers.

## 5. Components

### Buttons
**Shape:** Gently rounded (6px / `rounded.sm`). Enough radius to feel approachable, tight enough to feel decisive.
- **Primary:** YouTube Ember (`#FF4500`) background, white text, weight 600–700. Two sizes: hero (padding 13px 26px, 15px text) and nav (padding 6px 16px, 13px text). Both use the same border-radius.
- **Ghost:** Transparent background, 1px `border` token border, `ink-secondary`/`stone` text. Same radius and relative size as primary. No fill on hover — border deepens or text darkens.
- **Hover / Focus:** Primary darkens to `#E03A00`. Ghost border shifts to `ink-secondary`. Focus ring: 2px offset outline in accent at reduced opacity. Transitions at 150ms ease-out.

### Chips / Filter Pills
**Filter chips** mark time range selection on the popup. Two states:
- **Inactive:** Transparent background, 1px `border` token, `ink-secondary` text, 10px monospace text, 2px 7px padding, 4px radius.
- **Active:** Accent-tinted background (`#FF450018`), accent border, accent text — same geometry. The accent connection makes active filters immediately readable.

### Feature Grid Cells
Not cards. The feature list uses a 1px border grid: `border-top` on all cells, `border-right` on non-last-in-row. No background distinction between cell and page. Internal padding 24px. This structure communicates "organized information," not "cards with shadows."

### Inputs / Search Fields
- **Style:** 1px `border` token stroke, `surface` token background, 4px radius, 11px text.
- **Active / Focused:** Border shifts to accent, background shifts to accent tint (`#FF450018`). This state treatment matches the filter chip pattern — active always shows accent.
- **In popup context:** The keyword search input uses the tinted-active treatment by default when a search is in progress.

### Navigation
- **Structure:** 56px height, sticky, `border-bottom` 1px in `border` token, background matches page bg with 0.25s transition.
- **Links:** 13px, weight 500, `ink-secondary`/stone color, no underline, no hover color shift by default — if adding hover, lighten/darken toward primary ink, not accent.
- **CTA:** Nav-size primary button (padding 6px 16px). Same accent as all other CTAs.

### Extension Popup (Signature Component)
The extension popup mockup on the landing page is the product's primary visual testimony. Its structure:
- 340px width, 10px radius, `popupBorder` token stroke, `popupBg` token background, product demo shadow.
- Three internal zones: header bar (logo + wordmark), search area (channel input, keyword input, filter chips), results list.
- Results list items: thumbnail placeholder + title + match count. Match count uses accent color and mono font (weight 700, 14px) — this is the most important number on the component.

## 6. Do's and Don'ts

### Do:
- **Do** use YouTube Ember (`#FF4500`) exclusively on CTAs, active states, match counts, and the logo mark. Rarity is the rule.
- **Do** use JetBrains Mono for timestamps, match counts, and sequential step numbers in genuine ordered flows — nowhere else.
- **Do** use 1px border dividers (top + right in a grid, or top-only in a list) as structural separators instead of card backgrounds.
- **Do** verify contrast: body text in `stone` (`#6b6860`) on `almost white` (`#fafaf9`) is ~4.7:1 — acceptable but the floor. Never go lighter than stone for body copy on light bg.
- **Do** animate with ease-out curves (ease-out-quart or expo) at 150–250ms. State transitions (hover, focus, active) at 150ms. Reveal animations at 200–350ms.
- **Do** include `@media (prefers-reduced-motion: reduce)` alternatives for every animation — crossfade or instant transition as fallback.
- **Do** use Framer Motion for any orchestrated entrance or scroll-driven animation — it's installed and ready.
- **Do** use `text-wrap: balance` on display and headline headings.

### Don't:
- **Don't** use gradient text (`background-clip: text` with a gradient background). Prohibited.
- **Don't** use numbered labels (01 / 02 / 03) as section eyebrows on non-sequential sections. Numbers earn their place only when the sequence carries real information the reader needs (a step-by-step flow with a defined order). Numbering features is scaffolding by reflex.
- **Don't** repeat identical card grids: same-sized cards with icon + heading + text description, repeated without variation. Use the border-grid structure or asymmetric layout instead.
- **Don't** introduce more warm tinting into the neutral palette. The near-white bg (`#fafaf9`) already sits at the edge of the cream/sand band. New neutral tokens should be chroma-neutral.
- **Don't** use hero metric blocks: big number, small label, supporting stats, gradient accent — SaaS cliché, explicitly anti-referenced.
- **Don't** use glassmorphism decoratively. Blurred glass surfaces as ambient decoration are prohibited. If a blur is used, it must have a specific functional purpose.
- **Don't** use side-stripe borders (`border-left` > 1px as a colored accent on cards, list items, or callouts). Use a full border, a background tint, or nothing.
- **Don't** use generic SaaS copy — streamline, empower, supercharge, leverage, seamless, world-class, next-generation. Name what the product literally does.
- **Don't** add ambient shadows to resting surfaces. Shadow is a state response, not decoration.
- **Don't** set subheading text in mono without a precision rationale. Mono signals exact machine-generated values — misusing it on decorative labels dilutes that signal.
