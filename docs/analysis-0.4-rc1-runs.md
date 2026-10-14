# 0.4.0-rc.1 test runs: what happened, what broke, what is next

Three end-user runs on 14 Oct 2026, each a fresh Claude Code agent in its own folder (`C:\dev\tc-tests\*`), installed with
`npx @trueclone/cli@0.4.0-rc.1 init`. Sources: each run's session log, `sites/<name>/` (reports, notes, clone, next), and
the rea-lab source. All times UTC.

The user's verdict by eye: **varsity excellent** ("very happy"); **stripe and airpods good as placeholder clones**, but
swipers don't swipe and several hover and click effects are missing.

## The three runs at a glance

| | varsity (exact) | stripe (template) | airpods-pro (template) |
|---|---|---|---|
| Active work | 130 min | 50 min | 101 min |
| Idle, waiting for "continue" | 138 min (stopped 10:47) | 163 min (stopped 10:23, after 20 min) | 126 min (stopped 10:59) |
| Interventions | 1 ("continue") | 1 + ended asking again | 1 + ended asking again |
| Time waiting on trueclone | ~65 min | ~26 min (6.4 wasted on the wrong app) | ~50 min (score 13×, textshape 6×) |
| `clone/script.js` | 1195 lines + 414-line three.js cords | ~190 lines | 726 lines |
| Patches | 12 (9 vendored libraries, hand-over, boot css) | none | 3 (fonts copy, hand-over, placeholder fit) |
| Hand edits to generated files | none | `design-tokens.json` (null line height) | `next/` (4 build fixes, wiped by regeneration) |
| Layout (5 sizes) | 99.99–100 | 95.95–99.74 | 92.65–99.34 |
| Scroll states | 98.5–99.8 | 93.2–98.0 | 89.7–98.9 |
| Canvases | 96.1–99.8 | 64–69 (own 2D scenes for three.js) | – |
| Hovers | 100 | 74–78 | 33 (stale, mostly instrument) |
| Review | 139 frames, 130 same, 9 tool-caused | 0/13 verdicts | 0/43 verdicts |
| Next.js app | equals the HTML clone within a point | equal on layout/states | builds only after hand fixes |

The three runs ran at the same time on one machine (the plan said one at a time). Effects: a slower first score on
varsity (11.9 vs 7 min), a reveals wheel timeout on stripe, and the stripe Next check scoring varsity's app on port
3100. That last one is a tool defect regardless (below).

## What went right (0.4 worked)

- **Varsity is the proof the 0.4 direction is right.** Held-out sizes pass, both pins stick, the cords canvases score
  96–99.8, the Next app equals the HTML clone, no generated file was hand-edited. `script.js` was written in 8 minutes
  because `reference/scripts/INDEX.md` sent three subagents straight to file:line (hero, cord physics, pillars); every
  Behaviours line in notes.md cites the site's own code.
- **The review caught three real bugs every score missed** (hero hover dim rule, pillar margin collapse, a tablet
  headline centred twice). Looking works.
- **The seed is fast**: stripe's template seed took 8 s (0.3: 13–20 min).
- **Layout at held-out sizes** is near target on all three.
- No REA anywhere; nobody needed it.

## What went wrong, and why

### A. Agents stop and ask instead of finishing (all three runs, the costliest fault)

Every agent handed back the turn mid-job with "Should I continue?" while below target, twice on stripe and airpods
(again at the end). That is 6.4 hours of idle wall time across the runs, and two clones delivered unfinished. Rule 5
("no pass limit") says keep going but never says *don't check in*; a 9-minute full score of an empty seed (stripe) and
a 139-frame review with no batch view (varsity) made the loop look expensive right before each stop; airpods was at
286k–463k tokens of context.

### B. Tool defects that produced wrong results or broken builds

| # | Defect | Where | Effect |
|---|---|---|---|
| B1 | A stylesheet URL without `.css` (`/wss/fonts?families=…`) is saved as `css/980c1819-fonts`; `serve()` sends it as octet-stream and Chrome drops it | capture.mjs:113/376, seed.mjs:242, lib.mjs:270 | airpods: no SF Pro anywhere: wrong wraps, every textshape and score before 13:32 wasted. The biggest single loss |
| B2 | Next generator: `<html>` keeps `xmlns`/`xml:lang` (SWC fails); `aria-valuemin/max/now` typed as strings (TS fails); site CSS with an invalid declaration fails Lightning CSS (Apple's own `calc(var(--x * -1))`); the fonts import has no `.css` | next.mjs:83-110, 108, ~407 | airpods Next app only builds after hand fixes that regeneration wipes |
| B3 | Next generator drops whitespace between inline-block `div`s (`div` in BLOCK) | next.mjs:112-128 | varsity hero "WEINVEST" until the agent compensated in clone code |
| B4 | `next --verify` port: probes 127.0.0.1 only, the child's stderr is ignored, readiness accepts any 200 | next.mjs:31, 630-638 | stripe scored varsity's app for 6.4 min |
| B5 | `next --verify` renames `compare/` aside | next.mjs:648 | EPERM on Windows (varsity); REPORT.next.md says review "not done" and accepted differences "not applied" (report reads the renamed folder) |
| B6 | Recorded class replay sets the whole `class` attribute | seed.mjs:94-103, 552 | overwrote classes the agent's script drives (airpods); both exact and template runs needed a hand-made hand-over patch |
| B7 | Seed keeps script-written centring transforms | seed | varsity tablet headline centred twice (~130 px); only the review saw it |
| B8 | motion.mjs only looks at `window.gsap`, global Lenis, `window.THREE`, `el.swiper` | motion.mjs:42,107,114,166 | varsity's own GSAP engine read as "1 ScrollTrigger", motion curves unscored; stripe's three.js and custom carousels reported as "none" |
| B9 | review.mjs scrolls by wheel deltas computed once, waits 1.6 s, never checks it arrived; load frames at fixed wall-clock times; frames.json has no y | review.mjs:60-80 | 9 varsity frames "differ" for tool reasons; no way to mark them so; the verdict stays below target for ever |
| B10 | textshape skips blocks outside the first horizontal screen, scans vertically only | textshape.mjs:92, 322 | airpods gallery text never shaped, mobile ~120 px tall |
| B11 | detail pairs elements by page point | detail.mjs:86-105 | in template mode a one-line wrap shift makes every probe hit a neighbour: detail 16–72 is mostly mispairing, not style errors |
| B12 | Interactions only exist if the agent writes `interactions.json` | interact.mjs | stripe: no scenarios, so "swipers don't swipe" passed unseen. **This is the user's complaint** |
| B13 | Listeners attributed to error-tracking wrappers (`__sentry_wrapped__`) | scripts-evidence.mjs | stripe carousel handlers point at Sentry, not the carousel code |
| B14 | widgets.mjs skips every dialog/listbox/combobox (`portals`, "not covered yet") | widgets.mjs:11,58 | stripe product-card dialogs not recorded |
| B15 | Report mixes fresh and stale rows with no freshness mark; Findings under another heading are dropped; "Scoring time 0 min" garbled | report.mjs | stripe's report pairs 13:19 layout with 10:13 detail of an empty seed; airpods' report has no Findings |
| B16 | capture follows a geo redirect silently (stripe.com → /in), no locale set | capture.mjs | stripe cloned the India variant |
| B17 | design writes a null line height | design.mjs | stripe lint failure, hand edit |
| B18 | No `trueclone serve`; `tiles` and `rules` resolve `sites/` from the cwd only | bin, tiles.mjs:20, rules.mjs | the agent's preview depended on a temp file; doubled paths |

### C. Process gaps (the skill)

- The inner loop was `score --only layout,states` at all 5 sizes (1.5–2.7 min each, 13× on airpods); `--viewport` was
  never used. The skill shows it but does not say "loop on one size".
- notes.md Stack / Behaviours / Own-code map empty on stripe and airpods; Findings written under other headings.
- The template agents never read `script-owned.json` or used the INDEX.md listener pointers; varsity's did. The
  evidence helps only when the agent is told to start there, scene by scene.
- No library vendoring: varsity used `npm pack` to fetch gsap/lenis/three into patches by hand.

## Readiness

| Area | Score | Why |
|---|---|---|
| Exact clone of a GSAP/Webflow/three.js site | 85 | varsity: indistinguishable, all checks, Next equal |
| Template clone of a big product site | 55 | structure right; behaviour (carousels, menus, hovers) left half-done; Next build fragile |
| Unattended flow (no babysitting) | 40 | every run stopped and asked; one "continue" is the minimum today |
| Honest reports | 60 | real gaps shown, but stale rows, false "not done", tool-caused differs that can't be closed |
| Install and setup | 85 | one command, worked on all three |
| Speed | 65 | ~2 h active for a hard site; scoring is the wait |

**Overall: 62 / 100.** Ready for a guided beta with friends and teammates who know it is early: tell them to say
"continue" when the agent stops, to prefer exact mode on sites they own, and to expect carousels and menus to need a
second pass in template mode. Not ready for a public launch.

## Plan for 0.4.0-rc.2 (accuracy first, in this order)

1. **Correctness of the pipeline (B1–B7):** every stylesheet saved as `.css` and served as CSS; the Next generator
   strips namespaced attributes, types numeric ARIA, survives invalid site CSS (Lightning CSS error recovery or
   `<link>`ed site sheets), keeps inline whitespace; `next --verify` on a truly free port, identity-checked, writing
   straight to `compare-next/` (no rename); class replay by tokens with an official hand-over (`data-tc-own`);
   script-written centring transforms dropped from the seed.
2. **Behaviour you can see is behaviour that is scored (B12, B8, B13, B14):** interactions drafted automatically from
   the capture (horizontal scrollers and their buttons, tabs, accordions, menus, dialogs, drag) and scored by default;
   motion detection that finds non-global GSAP/Lenis/three and any carousel; listeners unwrapped past error-tracking
   wrappers; dialogs and listboxes recorded.
3. **The agent finishes (A, C):** the skill forbids a check-in while any check is below target unless a blocker or the
   context forces it (then a resumable plan in notes.md first); the inner loop on one size (`--viewport`); notes.md
   sections enforced by the report; vendoring done by a command.
4. **Review that closes (B9):** scroll verified (`scrollY` within 2 px, lazy media loaded first, y recorded), load
   frames aligned on the intro's own start, built-in contact sheets, a "tool" verdict with evidence that counts as
   closed.
5. **Template-mode instruments (B10, B11):** textshape inside horizontal scrollers; detail paired by structure.
6. **Reports (B15–B18):** freshness per row, Findings from any heading, redirect warning and locale, `trueclone serve`.

Then the same three runs, **one at a time**, judged in the same order: the user's eye, review, scores.
