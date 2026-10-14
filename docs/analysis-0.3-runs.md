# Why 0.2.0 cloned varsity better than 0.3.0: analysis of the four cold runs

Written 2026-10-14. Sources: the four session transcripts (v1 0.2.0 varsity, v2 0.3.0 varsity without REA, v3 0.3.0
varsity with REA, v4 0.3.0 stripe template), every RUN.md / notes.md / REPORT.md / script.js / patch, and a fresh
side-by-side render of the reference and the three varsity clones at 1440 px (a scored width) and 1920 px (an unscored
one), at the same moments and scroll landmarks (`tools/compare-runs.mjs`, images in `sites/_runs/`).

Naming: **v2 is the run without REA, v3 the run with REA** (only v3 has `reference/code.md`).

## 1. Bottom line

0.3.0 made the tool better at producing scores and worse at producing websites. The seed now replays *recorded
values* (px geometry, curves, class changes, per-width inline styles) that are exact at the three widths we measure
and wrong everywhere else; the scorer only looks at those three widths, hides canvases and checks hovers for
"something changed"; and the report lets an agent "accept" what remains. The agents did what the system rewarded:
they built on the recordings, saw passing numbers, accepted the rest and stopped. v1 had a seed too broken to build
on, so its agent threw the replays away (0 of 28 recorded reveals survived) and ported every scene's algorithm from
the site's own scripts. Algorithms are right at every width; recordings are right at three.

Context was not the bottleneck. v2 and v3 had more context than v1 (code.md, recordings, a notes contract, explain,
owned). What they lacked was a reason to do the hard thing.

REA, as wired in 0.3.0, made the varsity result worse and added no rules on stripe. It fails the kill switch we set.

## 2. What the user saw, confirmed

At 1440 px all three clones match the reference exactly: page 18,168 px, stories 1,586 px, hero identical at load.
At 1920 px (`sites/_runs/1920-*.png`, montage: reference | v1 / v2 | v3):

| Symptom (user) | Reference | v1 | v2 (no REA) | v3 (REA) | Cause |
|---|---|---|---|---|---|
| First paint / hero wrong | full-bleed photo grid | same | grid stops at ~1440 px, black band, chips over black | same as v2 | seed's per-width rule (`data-tc-w`, ≥1100 px) fixes the hero cells at 1440 px geometry: 480×450 cells, `background-size: 1600.28px 900px`; v3 also replays 189 KB of hero px curves recorded at 1440 |
| Page height | 20,374 | 20,374 | 19,834 | 19,834 | pin distance and island height frozen at 1440 values |
| Stories section height | 2,115 | 2,115 | 1,586 | 1,586 | `--vst-h: 1586px` per-width rule; the site computes it from the width |
| Manifesto cords ("strips") | three.js striped double helix | three.js port of `scenes.js` config, near-identical | 2D canvas approximation from the config | 2D canvas eyeballed from frames | v1 read `scenes.js` and ported the config; v3 never fetched it |
| Portfolio hover cord | striped cord beside the hovered row | present | missing | missing (badge missing too) | never built; canvases are masked in scoring, so nothing reported it |
| Team card hover | hovered card opens its panel with the quote | same | a different card sits open (pink, empty) and the hovered panel is empty | a different card open with text, hovered one faded | the reveals recorder recorded a *hover* `is-open` as a scroll class change (pointer parked at bottom-left while scrolling) and the seed replays it; hovers check never covers team cards; the interaction scenario only checks that "something changed" |

The team-hover fault is visible at 1440 px too: it is not a width problem, it is a recording defect the scores can't
see.

## 3. Why v1 was better: root causes, ranked

**1. The seed replays answers instead of handing over structure (my Phase 1 design).**
Per-width inline styles became media rules (`data-tc-w`), pins got per-width px distances, scroll curves are keyed to
px positions, class changes are replayed, reveals start from recorded px offsets. Every one of these is a value a
script *computed* for one viewport. Copying it is exact at that viewport and wrong at all others. Because the seed
already scored 98/91/89 layout before any code, both agents built *on top* of it: v2 took the hero cells' starting
geometry from the seed's 1440 px rules and animated over them; v3 went further and recorded the whole hero every
50 px (189 KB of absolute px). v1's agent got a seed with a blocked stylesheet and broken pins, discarded the replays
and wrote a hero computed from `stage.clientWidth/clientHeight` (19 viewport reads, 5 resize hooks).

**2. The checks are blind exactly where a visitor looks.**
- Three widths only (390/768/1440), the same three the seed was built from: a train set with no test set.
- Canvases are flat grey in every masked comparison, so the missing portfolio cord and the weaker manifesto cords
  never cost a point.
- The hovers check did not include the team cards; interactions pass when anything changes.
- No agent in v2/v3 ever loaded any width other than the three. Neither did v1, but v1's code was width-independent.

**3. The report gave the agents a way out (my Phase 3–4 additions).**
- *Accepted differences*: v2 wrote four (layout 89.6 desktop accepted within minutes, never worked on again), v3
  seven, three of them "by analogy". The verdict line then read "every scored check meets its target".
- *States target is relative* ("within 5 points of layout"): a low layout score loosens the states target.
- *Unstable probes* and *noise* gave legitimate reasons to stop chasing; combined with the above they became a
  general licence to stop.
- The prompt itself ("work until the score passes or 8 passes") made the score the definition of done. v2 stopped
  at pass 4 of 8, v3 at pass 5 of 8.
- v1 held a 98 layout floor and met it, partly because its hero was rebuilt by script on *both* sides of the mask
  bug (point 5), so the bug cancelled out.

**4. Recorder defects the agents had to work around** (all general, all mine):
- pins converted to `position: sticky` inside a spacer whose *padding* holds the distance: a sticky element cannot
  move into its parent's padding, so no pin ever stuck. I validated it by score, not by eye. Both agents found and
  patched it.
- hover-caused class changes recorded as scroll-caused (the parked pointer hovers whatever scrolls under it);
- `left/top/width/height` changes not recorded; parallax lerp lag recorded as offset; a canvas's visibility switch
  not recorded; long scrubs sampled too coarsely.

**5. A mask asymmetry that makes seeded clones look worse than they are.** The reference's hero script rebuilds its
media after the mask is applied (the full-page shot resizes the viewport), so the reference keeps the photo unmasked
while the seeded clone's static markup is masked. Seeded clones are capped near 90 on desktop/tablet layout; this is
what made "accept it" look reasonable to both agents.

## 4. REA

| | v2 (no REA) | v3 (REA, `understand`) |
|---|---|---|
| site scripts fetched | 11, in its first 3 minutes (curl) | **none** |
| reason | "found the script URLs in the capture" | "The HAR contains no script bodies, so code.md remains the only code evidence" |
| hero | rules from `hero.js` (timeline, scrub, morph targets) | recorded px curves |
| cords | 2D port of the `scenes.js` config | eyeballed from frames |
| time | 85 min | 97 min (understand 4.8 min, and it crashed `states` by running alongside it) |

code.md's handler excerpts were enough to *look* complete and too little to build from (minified windows; on stripe
every handler resolved to React's root dispatcher: "I could not use it for rules"). Its existence replaced reading the
scripts instead of leading to them. Our own capture made it worse: the HAR is recorded with `content: 'omit'`, so the
script bodies the agent looked for were not there.

What was genuinely useful in code.md: the ranking of scripts by what ran, and the list of controls with a handler.
Both are available without REA: Playwright's JS coverage (`page.coverage`) and CDP `DOMDebugger.getEventListeners`.

Verdict: remove `understand` from the standard flow; capture saves every script body (beautified) with the coverage
ranking and listener locations pointing into those files; keep `npx trueclone rea` as a passthrough for the rare deep
case. The README stops claiming REA as part of the core flow.

## 5. Time

| | v1 | v2 | v3 | stripe |
|---|---|---|---|---|
| total | 2h09 | 85 min | 97 min | 2h47 |
| waiting on the tool | ~29 min | ~46 min | ~37 min | ~118 min of calls ≥30 s, 91 min of them seeds |
| re-seeds just to apply a patch | – | 0 | 0 | 5 of 6, ~70 min |
| score runs | 18 (incl. 5 next --verify) | 13 + 2 next | 7 + interact + next | 5 full + partial |

- The single biggest waste is stripe's seeds: 13–20 min each, no progress output, and a patch change needed a full
  re-seed. Patches must re-apply in seconds.
- v2/v3 spent 30–45 % of their time blocked on scores; v1 too. Full scores are 3.5–8 min.
- v2, v3 and v4 ran **at the same time** (20:01–22:53 UTC, overlapping). Three browsers competed: v3's `states`
  crashed on a wheel timeout, seed times and load scores got noisier. Future benchmark runs go one at a time.
- v1's extra time went into *building* (29 min writing scenes, 27 min fix loop) and a Next.js stretch with three
  generator defects (21 min). That time bought the result.

Was the time worth it? v1's was. v2/v3 spent most of theirs reaching numbers the user's eyes don't agree with.

## 6. The agents' behaviour

- They optimise what is measured and stop where the measurement says done. Nothing in 0.3.0 measured the things the
  user complained about.
- They follow the strongest signal, not the longest instruction. SKILL.md is 22 KB; v2/v3 skipped `owned`,
  `--hide-until-boot`, `tcBoot.hold()`, `rules`, the site's breakpoints and hover scenarios, but obeyed every score.
- Given a pre-solved scene, they extend it rather than rebuild it, even when the skill says the opposite
  ("your script owns them, so rebuild them from the captured markup").
- v1 behaved best when the tool gave it the least: it had to understand the site to get anywhere.

## 7. Stripe: why it went well, what broke

It went well because stripe's layout is responsive CSS, not script-computed geometry, so the seed's markup and
stylesheets carried it (desktop layout 98.2 before any code), and its motion is mostly CSS reveals the player replays.
The agent did good engineering: tested patch CSS in the browser before each re-seed, batched fixes, read rules on
both sides.

What broke: 16-px placeholder images collapsing aspect ratios (template mode), 20-minute silent seeds, patch changes
requiring re-seeds, loops recorded as reveals, a scorer that serves the clone uncompressed (the load gap it "accepted"
is ours), a single-sample drift false alarm, and the Next generator: cascade-layer order (globals declares
`theme, base, …` before the site's `reset, base, app`, so the reset overrides the base: layout 55–76, detail 8–16),
`head-*.html` patches not carried, relative `@import` not rewritten, `command`/`commandfor` failing the type check,
and REPORT.md overwritten by `next --verify` (all three runs hit that one).

## 8. What we did right, what we did wrong

Right: capture, mirror and seed now give a correct *structure* (stylesheets, media, shadow roots, boot contract);
patches instead of hand edits; per-check reports; `rules`, `explain`, `--only`; the regression discipline found real
bugs. Stripe shows the structure path works.

Wrong (mine): I turned recordings into the clone instead of evidence for the agent; I validated features by scores
measured at the same widths the features were fitted to (the definition of overfitting); I shipped a pin conversion
I never looked at; I gave the agent ways to accept and stop without a floor; I kept REA in the flow after the
evidence (no source maps on any benchmark) said it would be thin.

## 9. Plan

Priority stays accuracy, then speed. Every item is general; none mentions varsity or stripe.

### Phase A: the checks see what a visitor sees (2 days)
1. **Held-out widths.** Score layout, states and load also at 1920×1080 and 1280×800, widths the seed never uses.
   A clone right at the three and wrong at the held-out ones is overfit, and the report says so in those words.
2. **`trueclone review`** (productised `tools/compare-runs.mjs`): reference and clone side by side at a held-out
   width, at load (0.3/1.5/4.5 s) and at every section, with a hover on the first interactive element of each section.
   The agent must read every frame and record a verdict per section in notes.md before it may stop.
3. **Canvases count**: compare canvas regions in states frames (colour histogram and coverage), so an empty or wrong
   canvas costs points.
4. **Hovers and interactions compare outcomes**, not "something changed": the region's pixels after the action vs the
   reference's; hovers include class-toggled hovers (cards, panels).
5. **No exits without a floor**: states target absolute (≥ 95), accepted differences cannot lift a check below 95,
   need an evidence file, and the verdict line reports raw failures first.
6. **Fix the mask asymmetry**: re-mark media created after masking (observer during the full-page shot) on both sides.

### Phase B: the seed hands over structure, not answers (2–3 days)
7. **Script-computed values are not constants.** Capture inline styles at five sizes (the three plus 1280×800 and
   1920×1080). A value that fits `a·vw + b·vh + c` exactly is emitted as that `calc()`; one that doesn't is not seeded:
   its element is listed as script-owned in `owned` and left to the agent. Same for pin distances.
8. **Recordings become evidence, not playback, wherever a script computed them**: one-shot CSS-style reveals still
   replay; scroll curves, hero-like geometry and class toggles inside script-owned regions are written to
   `reference/motion/` for the agent to read, not wired into the clone.
9. **Recorder fixes**: pointer moved off the page while recording (no hover contamination); left/top/width/height and
   visibility recorded; pins as a sticky element in a spacer whose *height* (not padding) holds the distance,
   verified by eye in the regression.
10. **Script bodies in the capture**: every script that ran, saved and beautified under `reference/scripts/`, ranked by
    Playwright JS coverage, with each control's listener location (CDP) pointing into those files. `understand` and
    REA leave the standard flow.
11. **Skill rewrite, half the length**: "Structure comes from the seed. Behaviour is code: port the site's algorithm
    from `reference/scripts/`; never replay a recorded px value a script computed. Done means every check passes at
    every scored width, held-out widths included, and `review` signed off section by section."

### Phase C: no dead time (1–2 days)
12. Patches re-apply in seconds on the cached seed output (`seed --patches`); seed prints progress; template text
    shaping profiled and cached.
13. The scorer serves the clone compressed (gzip/brotli), like a real host.
14. `next --verify` writes `REPORT.next.md` and `compare-next/`; never touches the HTML clone's report.
15. Next generator: the site's `@layer` order first in globals; `head-*` patches into the layout head; `@import`
    rewritten; unknown attributes (`command`, `commandfor`) typed; favicon links kept; vendored libraries noted in
    package.json.
16. `drift` takes two samples; `serve()` normalises paths; `tiles`/`interact` help fixed; `curves --draft` from the
    recorded scrubs when the motion inventory is empty.

### Phase D: prove it, one run at a time
17. Cold varsity run with the v1 prompt, alone on the machine; judged first by `review` at 1920 and by the user's eye,
    then by scores. Target: v1's visual result at every width, in ≤ 75 minutes.
18. Stripe again (template), then apple.com/airpods-pro as the hard case. Then the site-kind matrix (Phase 6 of the
    plan).
