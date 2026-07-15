---
target: src/app/page.tsx
total_score: 30
p0_count: 0
p1_count: 0
timestamp: 2026-06-01T20-22-04Z
slug: src-app-page-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | "Beta" badge unexplained; CTA click gives no pre-navigation feedback |
| 2 | Match System / Real World | 4 | YouTube vocabulary clear throughout |
| 3 | User Control and Freedom | 3 | Limited interactions; toggle reversible |
| 4 | Consistency and Standards | 4 | Eyebrows gone; hover states consistent; matches DESIGN.md |
| 5 | Error Prevention | 3 | Minimal error surface |
| 6 | Recognition Rather Than Recall | 4 | All options visible |
| 7 | Flexibility and Efficiency | 2 | Single install funnel |
| 8 | Aesthetic and Minimalist Design | 3 | Eyebrow scaffolding removed; motion adds personality without noise |
| 9 | Error Recovery | 3 | Static page |
| 10 | Help and Documentation | 2 | "How it works" covers basics |

**Total: 30/40 (+2 from 28) — Good**

## Anti-Patterns Verdict

No longer immediately AI-tell. Numbered-eyebrow scaffolding gone. Feature grid reads as product spec table. Motion is purposeful (hero stagger, preview entrance, scroll reveals) not the uniform fade-on-scroll reflex. Remaining tell: Plus Jakarta Sans on brand register reflex-reject list — identity-preservation wins for now.

## Overall Impression

Page went from "looks assembled" to "looks made." Both P1s resolved. Hero entrance earns the preview reveal. Feature grid without numbers is cleaner. Two remaining issues: "Now in beta · Free on basic" badge creates conversion anxiety, and feature cells are clean but anonymous.

## What's Working

1. Hero motion — stagger sequence (badge→h1→subhead→CTAs at 100ms intervals, preview at 300ms) feels deliberate.
2. Consistent hover states — all 4 CTAs have motion-driven hover; ghost button correctly shifts border and text.
3. Feature grid without eyebrows — border-grid alone provides structure; cells read as product spec.

## Priority Issues

**[P2] "Now in beta · Free on basic" — conversion friction unresolved**
- What: Badge implies paid tier exists. No pricing explanation.
- Why: Visitor hits "beta" + "basic" before CTA and has two unanswered objections.
- Fix: Replace with "Free to install · No account needed" or drop entirely — hero CTA already says "Free".
- Command: /impeccable clarify

**[P3] Feature cells anonymous without visual anchor**
- What: 6 equal-weight cells; "Private by default" (conversion-critical) indistinguishable from "Time-range filtering".
- Fix: Reorder to surface full transcript search, private by default, any public channel first.
- Command: /impeccable layout

**[P3] Footer external link no indication**
- What: "Feedback" links to tally.so externally with no visual cue.
- Fix: Add Lucide ExternalLink (10px) next to link text.
- Command: /impeccable polish

## Persona Red Flags

Jordan: "Free on basic" objection unchanged. motion.a elements may lack visible focus rings — verify Tab navigation.
Casey: Mobile nav fix applied. Extension preview collapses to near full-width on 375px viewport — functional.
YouTube Researcher: "Private by default" still at position 6 — reorder needed, not redesign.

## Minor Observations

- textWrap: balance added to h1/h2. Previous gap closed.
- HowItWorks 01/02/03 numbers correctly retained.
- text-wrap: pretty not added to body paragraphs.
