# 0.5.0-rc.2 test runs: what worked, what did not, why, and Phase 7

Three end-user runs on 15 Oct 2026, one at a time, each a fresh Claude Code agent on **Sonnet 5.5**, installed with
`npx @trueclone/cli@0.5.0-rc.2 init`. Sources: each run's session log, `sites/<name>/`, the rea-lab source, and
headless re-tests of the clones by the audit agents. The user judged each clone by eye first.

## At a glance

| | T1 varsity.vc (exact) | T2 heybhaskar.com (exact, 8 routes) | T3 allbirds product page (template) |
|---|---|---|---|
| User's eye | ~70 | **90** | low 80s |
| Wall / active time | 70 / 60 min | 82 / 82 min | 74 / 40 min |
| Check-ins mid-run | **0** | **0** | **0** |
| How it ended | "decision for you" (cords) while status said work left | stopped on a proven Next defect; status dead-ended on `/playground` | asked to patch node_modules or use a US network (two proven defects) |
| Time in scoring | 34 min | 34 min | 16 min (+11 min first capture over 12 routes) |
| Layout (5 sizes) | 97.2-99.96 | 100 on every route | 99.95-99.98 |
| Scroll states | 87.5-92 (hero frames 17-25%) | 100 (`/playground` random) | 14-32 (geo popup in the reference) |
| Canvases | 74-79 (three.js not ported) | - | - |
| Hovers | 77 | 78.6 | 0 (popup) |
| Interactions | 2/6 (Next 4/6) | 20/23 | 0/15 |
| Review | not done (unreachable) | 49/49 closed | not done |
| Next.js app | builds, = HTML clone | builds; case pages broken, cursor bug | does not build |
| Opus 0.4 baseline (varsity) | layout 100, states 98.6-99.8, canvases 96-99.8, hovers 100, review 130/139 | | |

## What worked (keep)

- **The status loop removed the check-ins.** rc.1: every run stopped and waited 2-2.7 h. rc.2: zero user turns after
  the prompt in all three; 70-82 min wall each.
- **Routes (Phase 6) on a real site.** heybhaskar: 8 routes captured, layout and scroll states 100 on 7 of 8 routes at
  every size, navigation and Back scored, the case-study sheets work by link and by address, theme and clock work.
- **Instruments that told the truth.** The interaction check caught the dead accordions (10.28: "the change happened on
  the reference, not on the clone"); canvases were flagged and their accepted difference refused (below the floor);
  detail by structure read 100 where it is right; the notes gate made every agent cite file:line (32/23/42 cited).
- **Review closes.** heybhaskar: 49/49 frames closed (37 tool-verdicts with evidence, 12 same).
- **Agents found and documented tool defects with evidence** instead of hiding them (Findings in every notes.md).

## What went wrong, by cause

### A. status does not always make progress (all three runs)

| # | Defect | Effect |
|---|---|---|
| A1 | Scroll states and canvases are routed by the **layout** report's worst section (`status.mjs` `sectionAt`), not by the states report's worst frames | varsity: status said "explain y 13521 (stories)" 7 times; the real failures (hero frames at 17-25%, the cords) were never named |
| A2 | A step already done or accepted is repeated forever | varsity and heybhaskar loops dead-ended; the agent went off-loop |
| A3 | Canvases have no step of their own and no porting recipe | the three.js cords were never attempted |
| A4 | The review is reachable only after every check passes | varsity and allbirds: review never ran |
| A5 | A route (or region) that differs on the reference itself (random order) can never close: no acceptance path, no instability check per route | heybhaskar ended on `/playground` |
| A6 | The scroll-states mean hides catastrophic frames (91 average with 17% frames) | the worst visual problem in varsity read as "almost there" |

### B. Capture misses things

| # | Defect | Effect | Fix |
|---|---|---|---|
| B1 | `--hide` (meta.hide) is applied by capture, drift, spec only; states, interact, hovers, detail, load, review, reveals, widgets, motion, curves load the live page without it; region popups set by IP cannot be avoided by locale | allbirds: every behaviour check compared the clone with a geo popup; widgets recorded "1 distinct state" per accordion | apply the hide list and cookies in `newPage` for every reference page (init style at document start); `capture --cookie`; capture detects a large fixed overlay at load and says so |
| B2 | Assets are recorded only on the captured page at desktop; same-document routes discard theirs; `<source srcset>` for other sizes, `<template>` content, media named only in `data-*` attributes are never fetched; relative URLs not in the manifest are not counted as missing | heybhaskar: 57 images missing (case screenshots, mobile photo); tablet 589 px short | record responses at every size and every route; resolve every src/srcset/poster/media-like data-* and fetch what is missing |
| B3 | `rewriteCssUrls` rewrites a `url()` inside a `data:` URI (an SVG filter `url(%23n)`), breaking the outer `url("…")` | heybhaskar's background texture gone | tokenise: never rewrite inside a data: URI; `%23x` is a fragment |
| B4 | Navigation scenarios drafted to routes that were not captured; CSS marquees drafted as swipes | allbirds: 24 scenarios retired by hand; heybhaskar: 2 | draft only to captured routes; a swipe needs a drag/pointer listener, not an infinite CSS animation |
| B5 | `reveals` records no clip-path; a curve is attributed to the wrong section in briefs | varsity footer wipe and banner parallax invisible to the agent | record clip-path; attribute by the element's own position |
| B6 | Unroll sets `overflow: visible` on both axes | a horizontal ticker widened shots to 6649 px; a closed sheet looked hittable | overflow-y only |

### C. The seed hands over traps

| # | Defect | Effect | Fix |
|---|---|---|---|
| C1 | `tcOwn` exists only when the reveal player is written; `tc-boot` is then never released | heybhaskar: script.js threw on line 1; the first 10-min score was wasted | a tiny head runtime always: `tcOwn`, `tcBoot` |
| C2 | `tcOwn` clears every GSAP transform, including closed states (`scale(1,0)` on a collapsed menu) | allbirds: mobile menu covered the page until restored by hand | tell state transforms from motion ones at seed time; clear only motion |
| C3 | The widget player's region can contain an element the agent owns; it rewrites the region's innerHTML on click, wiping the agent's nodes and listeners; single-state groups are still emitted | allbirds accordions dead (verified in a browser) | never touch a region that contains an owned element; drop single-state groups; pointer-out close only for header menus |
| C4 | `tcOwn` on a reveal-marked element leaves it at its start state (opacity 0) | allbirds "Why we love this" invisible until a hover swap | settle a taken-over reveal to its end state |
| C5 | A scroll class change that the site animates with Flip is replayed as an instant class swap | varsity stories cards jump | flag such changes as transitions in the brief (the site's Flip at file:line), not silent state |
| C6 | Template mode rewrites `@import url()` to the placeholder image | allbirds Next build fails; Inter faces dropped | never rewrite `@import` |
| C7 | Template placeholders are translucent | hidden text shows through (allbirds "Inimicus ars…" heading behind a photo) | opaque placeholders |

### D. The Next.js app is not yet a faithful build of the clone

| # | Defect | Effect | Fix |
|---|---|---|---|
| D1 | Site CSS goes through the Next CSS pipeline (Lightning CSS merges `transform` + `scale`, rejects odd `@import`s) | heybhaskar: cursor jumps toward the top-left on every click (only in Next); allbirds build fails | serve the site's stylesheets unprocessed (`<link>` from `public/`), as the browser loads them |
| D2 | `<template>` elements dropped; `<base>` not carried; only `clone/assets` copied to `public/` | heybhaskar case-study bodies missing in Next, images 404 on nested routes | keep templates (raw HTML), carry `<base>`, copy every clone file |
| D3 | Hydration resets `<title>`/body state the clone's script set | deep links to case pages wrong in Next | leave title/body classes to the page script |
| D4 | Separate-page sites get one page | known gap | one route per page |
| D5 | REPORT.next.md not regenerated after verdicts | stale review counts | report regenerates both |

### E. Instruments

| # | Defect | Fix |
|---|---|---|
| E1 | `rules` crashes on `--viewport laptop/wide` (looks in seed sizes only) | `SCORED`, pixel widths, clear error |
| E2 | `serve --help` starts a server that never exits | help flag |
| E3 | Interaction Back step shoots right after `commit` (restoration not settled) | wait for load/still after Back |
| E4 | Hovers probe invisible/inert targets; a missing reaction costs little | skip opacity 0 / pointer-events none; MISSING counts as 0 |
| E5 | Motion lists "gsaps, engines" as libraries; three.js bundled without `__THREE__` not detected (vendor never offers it) | report real libraries; three.js from canvas engines / script names |

### F. The model's habits (Sonnet), which the tool must catch

- Ports by estimate instead of from the recorded curve or the site's code (varsity hero timings, `.backers` fade not
  ported, `inline-5/9/10.js` never opened).
- Does not test what it built (allbirds accordions and drag shipped broken) and over-claims in the recap.
- Recaptures several times instead of once with the right flags; jumps to `next` while status points elsewhere.
- Stops on "large work" (the cords) despite the rule.

## Readiness: 73 / 100 (was 71)

| Area | Score | Why |
|---|---|---|
| Unattended flow | 65 → **85** | zero check-ins on three different sites |
| Multi-route (single-page app), HTML | **88** | heybhaskar: 100 on 7 of 8 routes, navigation, sheets, the user's 90 |
| Exact animated site on Sonnet | **70** | user's eye; states/canvases/hovers well below the Opus run |
| Template product page | **72** | layout perfect; behaviour broken by tool traps (C2-C4) and the popup (B1) |
| Next.js app | **55** | 1 of 3 equal to the clone; one does not build, one broken on nested routes |
| Honest reports | 82 → **78** | true numbers, but a mean hiding 17% frames and loops that cannot close |
| Install / speed | 85 / 75 | 70-82 min per site |

The jump from 73 to the low 80s is mostly mechanical: D (Next fidelity), C (seed traps), B1-B3 (capture) and A
(status progress). None of them needs the model to be smarter.

## Phase 7: close every loop (plan-0.5.md)

1. **status always makes progress (A1-A6):** states routed by their worst frames; canvases get their own step with a
   porting recipe; a done or accepted step is never repeated; review reachable once layout passes; random regions and
   routes measured twice and set aside like probes; a gate on the worst frame (any frame below 80 fails), not only the
   mean.
2. **Capture is complete (B1-B6):** hide list and cookies on every reference page; assets at every size and route,
   every media reference resolved; data-URI-safe CSS rewriting; only real swipes and captured routes drafted;
   clip-path recorded; curves attributed by position; unroll on y only.
3. **The seed hands over no traps (C1-C7):** an always-present runtime; state vs motion transforms; owned regions never
   rewritten; taken-over reveals settled; Flip-like class changes named in the brief; `@import` untouched; opaque
   placeholders.
4. **Next.js equals the clone (D1-D5):** site CSS as raw links; templates, `<base>` and every file carried; title/body
   left to the script; one route per separate page; both reports regenerated.
5. **Instruments (E1-E5)** as listed.
6. **The model is checked, not trusted (F):** a coverage gate (each recorded curve and each script that ran is cited in
   Behaviours or owned); "test what you built": status runs the interaction scenarios of a section right after its
   behaviour is written; the skill gets recipes for canvases (vendor three.js, port the scene), carousels (vendor the
   library) and accordions.

**Proof:** the same three sites again on Sonnet (now the regression set), plus docs.astro.build (separate pages and an
app shell, Next per page). Bar: varsity ≥ 85 by eye on Sonnet, heybhaskar ≥ 95 including its Next app, allbirds ≥ 90
with every behaviour working, every Next app building and equal to its clone.
