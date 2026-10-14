# trueclone 0.4: the exact same website, at every screen size

Written 2026-10-14 after the 0.3.0 cold runs. Evidence: `docs/analysis-0.3-runs.md`. This plan replaces the open parts
of `plan-v0.3.md`.

## The goal, in the user's words

> I had that website, I ran a command using trueclone, and now I have the exact same website on my localhost. Mobile,
> tablet, desktop, any screen size: it works flawlessly, looks exactly the same and functions exactly the same.

v1 (0.2.0, varsity) is the bar: the user was "blown away". 0.3.0 scored better and looked worse. 0.4 must keep
everything 0.3 fixed and get back v1's result, at every width.

## Principles (they decide every trade-off)

1. **Accuracy and exactness first, speed second, scores third.** A score is an instrument, not the goal. When the
   numbers and the eye disagree, the eye is right and the instrument gets fixed.
2. **Any screen size.** Nothing the tool produces may be correct only at the widths it captured. A value a script
   computed from the viewport is a function, never a constant.
3. **Structure comes from the seed; behaviour is code.** The seed gives the site's markup, stylesheets, media and
   anything static. Everything a script does (layout it computes, scenes it builds, motion, hover, state) is
   re-implemented from the site's own algorithm, read from its scripts. Recorded values are evidence for the agent,
   never the clone itself. This is what v1 did.
4. **Global.** Every change holds for every kind of site. A fix that names a site, a selector or a number is a bug.
5. **Verify where a visitor looks.** Widths the seed never saw, hovers, canvases, the first seconds of the load, by
   pixels and by eye.
6. **REA only where it adds value.** It stays available as a passthrough for the rare deep case (a bundled physics
   rule, a shader, a binary). It is not part of the standard flow.
7. **One benchmark run at a time**, so timings and load scores mean something.

## What went wrong in 0.3 (summary of the analysis)

| # | What | Effect on the clone |
|---|---|---|
| W1 | The seed replays values scripts computed at 390/768/1440: per-width inline styles as media rules, pin distances, scroll curves, recorded class changes | right at three widths, wrong everywhere else (hero grid stops at 1440 px, page and stories height frozen) |
| W2 | Agents built on top of the replays instead of porting the algorithm; v3 even recorded the hero every 50 px | the same overfit, deeper |
| W3 | Every check measures only 390/768/1440: the widths the seed was built from | overfit invisible; 98+ scores on a broken site |
| W4 | Canvases are masked out; hovers and interactions pass when anything changes | missing portfolio cord, wrong team hover: zero points lost |
| W5 | Accepted differences, a relative states target, unstable/noise rules and "stop at 8 passes" | agents accepted layout 89.6 and stopped at pass 4–5 of 8 |
| W6 | Recorder: hover changes recorded as scroll changes; left/top/width/height and visibility not recorded; pins that never pin | wrong card open; agents spent time patching the tool |
| W7 | Mask asymmetry on elements a script rebuilds | seeded clones capped near 90, which made "accept it" look legitimate |
| W8 | `understand` (REA) shown as the code source; script bodies not in the capture | the REA run read no site script and recorded instead |
| W9 | Seeds of 13–20 min with no progress; patches need a full re-seed; scorer serves uncompressed; Next generator layer order, head patches, imports, types; REPORT.md overwritten by `next --verify` | 70 min of re-seeds on stripe; a broken Next app; wrong load verdicts |
| W10 | Three benchmark runs at once | crashes and noisy timings |

## What we keep from 0.3

Capture, mirror and seed structure (stylesheets, missing media fetched, SRI dropped, shadow roots, boot contract),
`clone/patches/`, per-check reports, `rules`, `explain`, `--only`, `drift`, `owned`, the load check, the notes contract,
the regression discipline.

## Phase A. The checks see what a visitor sees

| # | Item | How | Done when |
|---|---|---|---|
| A1 | **Held-out sizes** | capture also screenshots 1280×720 and 1920×1080 (screens, masks, sections) that nothing in the seed ever reads; layout, states and load score them; REPORT.md shows them as their own rows and the verdict needs them | varsity 0.3 clones fail at 1920 in the report, v1 passes |
| A2 | **`trueclone review`** | reference and clone side by side at a held-out size: load at 0.3/1.5/4.5 s, every section, a hover on the first interactive element of each section; the agent writes a verdict per frame in notes.md (`## Review`); the report lists every frame not marked "same" as open | the 0.3 team-hover and stories faults are visible in the review frames |
| A3 | **Canvases count** | per state step, each canvas region compared unmasked (coverage and colour histogram); a canvas row in the report | an empty portfolio cord costs points |
| A4 | **Hovers compare the outcome** | candidates include every element with a pointer cursor or a mouse listener; the region after hover is compared between the two sides, not just "did something change" | a wrong card opening fails |
| A5 | **Interactions compare the outcome** | a scenario passes only if the change happens on both sides and the end state matches (≥ 95) | |
| A6 | **No exits without a floor** | states target absolute (≥ 95); an accepted difference cannot lift a check below 95 and needs an evidence file; the verdict reports raw failures first | an 89.6 layout can never read "meets its target" |
| A7 | **Mask holds on rebuilt elements** | the mask marks media created or restyled after it was applied (observer while shooting), on both sides | seeded and script-built clones are masked alike |

## Phase B. The seed hands over structure, not answers

| # | Item | How | Done when |
|---|---|---|---|
| B1 | **Viewport functions, not constants** | capture reads inline styles at extra sizes inside each of the site's own breakpoint ranges (taken from its stylesheets); a value that fits `a·vw + b·vh + c` at every size of a range becomes that `calc()` under the site's media query; a value that doesn't fit is not seeded: its element is listed as script-owned | the hero cells follow the width; stories height is not frozen |
| B2 | **Recordings are evidence** | one-shot reveals and scroll-caused class changes still replay (state, not geometry); scroll curves, recorded geometry and anything inside a script-owned region go to `reference/motion/` for the agent, not into the clone | no recorded px drives layout at any width |
| B3 | **Pins that pin, at any height** | the spacer holds the pinned element plus a tail block whose height is the pin distance (a `calc()` when it depends on the viewport); verified by eye in the regression | hero and manifesto stick on every width |
| B4 | **Recorder fixes** | pointer events off while recording scroll (no hover contamination); left/top/width/height and visibility recorded; records selected by the site's breakpoints, not trueclone's buckets | the team card stays closed until hovered |
| B5 | **Script bodies in the capture** | every script that ran saved under `reference/scripts/` (beautified), ranked by execution coverage, with each control's listener location pointing into those files; `reference/scripts/INDEX.md` | an agent can port any scene without leaving the capture |
| B6 | **REA out of the standard flow** | `understand` stays a command, not a step; the skill mentions REA once, for deep cases | |
| B7 | **Skill rewrite, half the length** | the core rules first: structure from the seed, behaviour is code ported from `reference/scripts/`, every width, review signed off; details after | |

## Phase C. No dead time

| # | Item |
|---|---|
| C1 | Patches re-apply in seconds on the cached seed output (`seed --patches`), and the seed prints its progress |
| C2 | Template text shaping profiled and cached (stripe: 13–20 min seeds) |
| C3 | The scorer serves the clone compressed (gzip/brotli), like a real host |
| C4 | `next --verify` writes `REPORT.next.md` and `compare-next/`; never the HTML clone's report |
| C5 | Next generator: the site's `@layer` order first; `head-*` patches carried; relative `@import` rewritten; non-React attributes typed; favicon links kept; vendored libraries noted |
| C6 | `drift` takes two samples; `serve()` normalises paths; `tiles`/`interact` help corrected; `curves --draft` falls back to recorded scrubs |

## Phase D. Prove it (one run at a time)

1. Regression on the four probes (rea.tools, resend, nickho, varsity-p1) after each phase.
2. Cold varsity run, exact mode, the v1 prompt, alone on the machine. Judged in this order: the user's eye at their
   own screen width, `review` at 1920 and 1280, then the scores. Bar: v1's result at every width.
3. Stripe again (template), then apple.com/airpods-pro (template), each judged the same way.
4. Then the site-kind matrix (Phase 6 of `plan-v0.3.md`), with a held-out-size row per kind in the README.

## Status

| Phase | State | Proof so far |
|---|---|---|
| A | coded, validated | Scored the three 0.3 varsity clones against one fresh capture at 5 sizes: v1 passes layout and states at every size and its canvases pass; v2/v3 fail at 1280 (layout 82, states 74) and 1920 (states 88), their canvases fail, and v3's hovers read 27.5. The review frames at 1920 show v3's stories and footer offset; v1's match. v1's own hover gap on the story cards (86.3) is a real one the old check missed. |
| B | coded, validated on varsity end to end | Capture saves 34 scripts ranked by what ran and locates 169 listeners; inline styles are read at 25 sizes in the ranges of the stylesheets' breakpoints and the scripts' own (`matchMedia`: 860 found that no stylesheet has). The end-to-end run found and fixed four instrument faults: a 7px breakpoint band never sampled, seed sizes read after the full-page shot (other sizes before it), equivalent transforms spelled differently, `5.7e-14px` parsed as -14px. Fitting now also knows the min/max of two lines (cover, contain, a centred or tiled cover image, a clamp) and merges breakpoint ranges one function fits. Script-owned went 185 → 40, every one random, state- or content-driven; 0 of 500 random sets fit. Seed-only layout 96.9-99.96 at all 5 sizes; both pins stick at 390, 1000, 1280 and 1920, the hero's length following the height (`calc(100vh + 4700px)`). |
| C | coded, C2 measured | C1 `seed --patches`; C2 text shaping measures each font's vocabulary in one layout (was one forced layout per word): resend 8.7 s → 0.6 s, identical line breaks; C3 compressed serving; C4 `REPORT.next.md`; C5 layer order, head links, imports, attribute types; C6 drift, `serve()`, help, `curves --draft` from recorded scroll curves (`path:` selectors). |
| Regression | probes re-scored with the new checks | rea-tools: every check 100 (load 99.9 at the held-out sizes). resend: layout, states, detail, load ≥ 98 as before; hovers 100 → 78.8, real (a header dropdown and the tooltips are missing, both reference passes agree). nickho: layout, states, motion, detail identical to the last report (the instrument is stable); hovers 100 → 94.4; the helmet scenario fails the end state (82: the hand-built helmet is not the same render); load now scored at every width by the clone's worse run, because the clone loads differently from run to run (±88) and that was being excused as noise. Instrument faults found and fixed on the way: hover targets counted twice, hover waits fixed instead of settled (a rescore 92 s), a changed check could keep its old number (the step's code is now in the reuse key), the summary table split by empty rows, an interaction's first frame taken (and cached) halfway through the reference's intro fade (resend's nav scenario read 94 on the HTML clone and 100 on the Next app; both 100 once the screen is still first). `next --verify` on resend: the Next app equals the HTML clone on layout, states, detail, hovers and interactions, load within a point; the HTML clone's REPORT.md untouched. |
| D | ready | Cold varsity run first (exact, the v1 prompt, alone on the machine), then stripe and airpods, then the site-kind matrix. |

## Release gate for 0.4.0

- The cold varsity clone is visually indistinguishable from the reference at 390, 768, 1280, 1440 and 1920 wide, on
  load, on scroll, on hover, in every canvas.
- Every check passes at every scored size, held-out sizes included, with no accepted difference below 95.
- No hand edits to generated files; no tool defect left open from the 0.3 runs.
- Time: at most v1's 2 h for varsity, with the wait on the tool under 20 %.
