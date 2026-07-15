---
target: src/app/page.tsx
total_score: 28
p0_count: 0
p1_count: 2
timestamp: 2026-06-01T20-12-58Z
slug: src-app-page-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | CTA clicks give no pre-navigation feedback; "beta" badge unexplained |
| 2 | Match System / Real World | 4 | YouTube vocabulary used naturally throughout; clear language |
| 3 | User Control and Freedom | 3 | Minimal interactions; toggle works; no trapped states |
| 4 | Consistency and Standards | 3 | Strong internal consistency; numbered eyebrows break own DESIGN.md rules |
| 5 | Error Prevention | 3 | Landing page has minimal error surface; CTA goes directly to Chrome Store |
| 6 | Recognition Rather Than Recall | 4 | All options visible; clear labels; nothing hidden |
| 7 | Flexibility and Efficiency | 2 | Single install funnel; no keyboard shortcuts; no alternative paths |
| 8 | Aesthetic and Minimalist Design | 2 | Numbered eyebrows add noise; 6-cell equal-weight grid buries priority |
| 9 | Error Recovery | 3 | Static page; minimal error states needed |
| 10 | Help and Documentation | 2 | "How it works" exists but extension preview has no contextual hints |

**Total: 28/40 — Good**

## Anti-Patterns Verdict

**LLM assessment**: Partially AI-tell. Two saves: extension popup mockup (product-specific, shows rather than tells) and copy (direct, no buzzwords). Two flags: numbered mono labels 01-06 above every feature cell (zero information value, pure scaffolding); Plus Jakarta Sans on the brand register reflex-reject list.

**Deterministic scan**: detect.mjs returned 0 findings. Inline JSX styles bypass CSS-regex detection. Issues confirmed by direct source read.

## Overall Impression

The bones are good: specific product, honest copy, one standout element (extension mockup). The hero works. The page collapses under Features — numbered scaffolding, equal-weight cells, zero motion. Gap between "playful, direct, snappy" (PRODUCT.md) and actual page experience is real.

## What's Working

1. Extension preview mockup — rendered, theme-aware, shows the product working without explanation. Accent on match counts demonstrates One Voice Rule.
2. Hero copy — "Find every time a phrase was said on YouTube" is specific and honest. No buzzwords.
3. Accent discipline — #FF4500 appears on CTAs, match counts, logo, active chips. Nowhere else.

## Priority Issues

**[P1] Numbered eyebrows on all 6 feature cells**
- What: FEATURES array renders "01"-"06" mono labels above each cell. Six cells, identical structure: number → heading → body.
- Why: Numbers carry zero information. Not ordered, don't reference each other. Numbered-section-marker ban verbatim.
- Fix: Remove n field from FEATURES entirely. The 3x2 border-grid creates organization without numbers.
- Command: /impeccable bolder

**[P1] Framer Motion installed, zero usage**
- What: framer-motion ^12.29.2 in package.json. Only transition in page: "background 0.25s, color 0.25s" on theme toggle. No entrance animations, scroll reveals, or stagger anywhere.
- Why: PRODUCT.md says "playful, direct, snappy." Static page is inert. Extension preview especially natural for subtle entrance.
- Fix: Add entrance motion to hero copy (stagger h1 lines), extension preview (slide-up + shadow materializing), feature cells (stagger reveal on scroll). Framer Motion useInView + motion.div. Reduced motion fallback required.
- Command: /impeccable animate

**[P2] CTA buttons have no hover state**
- What: Primary CTA and ghost CTA have no hover transition.
- Why: No visual feedback before click. Material friction on conversion CTA.
- Fix: Primary darkens to #E03A00 at 150ms ease. Ghost border shifts to T.sub, text to T.text. Already in DESIGN.md spec, not implemented.
- Command: /impeccable polish

**[P2] Sub-text contrast at the floor**
- What: T.sub (#6b6860) on #fafaf9 bg = ~4.6:1. Passes AA by 0.1:1. 13px body text especially marginal.
- Why: Non-calibrated displays read lower than computed. Will fail in real conditions.
- Fix: Bump T.sub light to #5a5754. Keeps warm-gray character, adds ~0.8:1 headroom.
- Command: /impeccable audit

**[P3] Nav overflows on mobile**
- What: Nav padding: "0 48px", no responsive adaptation. 5 items at 375px width will overflow.
- Fix: At <=768px, hide "Features" and "How it works" links, reduce padding to 20px.
- Command: /impeccable adapt

## Persona Red Flags

**Jordan (Confused First-Timer)**: "Free on basic" creates paid-tier anxiety; no pricing explanation. Feature grid gives all 6 items equal weight; can't identify the 2 that matter most. Ghost CTA has no visible focus state on keyboard navigation.

**Casey (Distracted Mobile User)**: Nav padding risks CTA overflow on narrow screens. Extension preview collapses below copy at 860px - adds scroll depth before CTA is visible. Touch targets untested.

**YouTube Researcher (project-specific)**: "Private by default" feature buried at position 06 with equal weight to minor features. For privacy-conscious researchers this is top-3 selling point. Wrong position.

## Minor Observations

- "Now in beta · Free on basic" — ambiguous relationship between beta and pricing. Consider two separate elements.
- Hero heading missing text-wrap: balance.
- Extension preview thumbnail placeholders look like wireframe artifacts.
- Footer Feedback link (tally.so) has no external-link indication.

## Questions to Consider

- "What if 'Private by default' were in the hero instead of sixth in the feature list?"
- "What would this page feel like if the extension preview animated in on load?"
- "Is 'Now in beta' helping or creating doubt at the install CTA?"
