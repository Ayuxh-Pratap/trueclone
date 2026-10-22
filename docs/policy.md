# trueclone policy (rc.5)

This page is the canonical statement of what trueclone claims and when. Code comments, the skill
(`skill/SKILL.md`), the AGENTS.md block (`bin/trueclone.mjs init`) and REPORT.md point here. Where an older document
(`docs/eval-rc4/`, `docs/plan-rc5/`, earlier test plans) says something different, this page wins; those documents
are kept as the record of how the decisions were reached.

Decisions D1 to D6 below were approved on 2026-10-22 (docs/plan-rc5/PLAN.md §9).

## Outcomes

`trueclone status <name>` decides the outcome from the files alone, every time it runs. Running it never changes a
result and never counts as an attempt.

| Exit | Outcome | When |
|---|---|---|
| 0 | Verified | Every required result passes (or is accepted with evidence, or has nothing to measure) on the HTML clone **and** on the Next.js app, each measured on its content as it is now, against the current reference; the review closed by eye; notes, coverage and the clone lint pass; nothing invalid, stale, missing, errored or tool-owned |
| 1 | Work left | Not terminal: the next step is printed. Building, measuring, restoring a regression, working an objective, recording a change of strategy, the final sweep, app verification |
| 2 | Blocked | The required measurement cannot be made valid after one bounded recovery: the live reference does not load, a capture is incomplete, the browser or sandbox fails, the instrument is modified (NODE_OPTIONS preload, edited package files) |
| 3 | Incomplete | The loop concluded with differences left, or results remain that the tool cannot verify; the clone and app are verified as they are |

**Wording (D5).** REPORT.md and status say, in these words:

- Verified: "Verified: every required result passes on the clone and on the Next.js app as they are now."
- Incomplete: "Incomplete: N difference(s) remain (listed), M item(s) not verifiable by the tool (listed)." Never
  "pass", never "done".
- Blocked: the blocker, what was tried, and what the user can do (network, `--hide`, permission, unset NODE_OPTIONS).

**An incomplete or blocked run reports (D6):** what passed; every unresolved objective with its best and current
values, its attempts and strategy changes, why it stopped, and who owns it (clone, tool or environment); the next action
and how to resume. Everything is kept: `compare/outcome.json` (the outcome, valid only for the content it was decided
on), `compare/loop.json` (every objective's full history), every result. `status <name>` resumes from there.

## What is required

`scripts/verdict.mjs requiredUnits` lists every result a site must have. A result is one **unit**: (check, route,
viewport, state).

| Site | Required |
|---|---|
| Document | layout and scroll states for every route × 5 sizes (390, 768, 1440 built from; 1280, 1920 held out); behaviour and reduced motion for every route × desktop and mobile; detail × 3; hovers (desktop); load × 5; motion curves × 3 when the reference has scroll curves or a motion map exists; real-pixel layout × 5 in exact mode; a canvas unit wherever the reference draws one |
| Canvas app | the journey × its sizes; load × 5 |
| Both | every interaction scenario planned; every review frame of the clone and of the app with a verdict given to that picture |

Each unit has one state: pass, accepted, fail, missing, stale, invalid, error, tool, na. **Only pass, accepted and na
count as verified.** Nothing absent is ever read as a pass.

## Identity and invalidation

Every result carries the identity it was measured under (`scripts/identity.mjs`), taken at the start of the
measurement:

| Field | What | A change makes the result |
|---|---|---|
| subjectHash | content hash of `clone/` (or `next/`), not file times; computed with uncommitted changes | stale |
| refId | the capture, its visit profile (hide, ignore, cookies, locale, unroll) and its measurement controls | invalid |
| configHash | journey.json, motion-map.json, interactions.json | invalid (that check) |
| codeHash | the check's script and the shared measurement code | stale |
| env | a NODE_OPTIONS / execArgv preload, or a packaged script that differs from `scripts/MANIFEST.json` | invalid (and status is Blocked) |

Results are written per unit, atomically, under a lock; a partial run merges and leaves the other units as they were. A
check that records a failed measurement exits non-zero (`scripts/results.mjs`).

## Measurement

### Symmetric controls (decisions D1, D2)

Every page any check opens, on the reference and the clone alike, is opened under the same controls, applied through
the browser context only, never written into clone files (`scripts/lib.mjs STABILISERS`):

| Control | Value | Why |
|---|---|---|
| seed | `Math.random` seeded with 20261021 | a startup shuffle shows the same order on both sides when the rule is the same |
| clock | Date and performance start at 2026-01-15T12:00:00Z, then run at real speed | dates and times shown match |
| motion | `prefers-reduced-motion: no-preference` | the page every visitor without the setting sees |
| stills | taken at 46.3 s of page time after DOMContentLoaded, every timer due by then fired in order, the clock held | an autoplay carousel is on the same slide on both sides (RC4 shot each side whenever it got there) |
| loops | every endless CSS/WAAPI animation held at 2.3 s; finite ones still running finished | a stopped, reversed or faster loop is somewhere else; a slide caught mid-transition is not |

46.3 s and +10 s per scroll step are at least 300 ms from a step of any timer with a common interval (1, 2, 2.5, 3,
4, 5, 6, 8 s). A capture made before these controls (no `meta.stabilise`) is captured again.

**Reduced motion (D2)** is checked on its own, twice, desktop and mobile, every route, and never stands in for the
animated page:

- **Layout.** `diff --reduce`: the reference's reduced-motion page, shot live, against the clone's.
- **Motion.** The behaviour watch repeated under `prefers-reduced-motion: reduce` (members `reduce:…`): what the site
  still moves, and what it stops, for a visitor who asked for less motion. The layout shot freezes CSS animations on
  both sides, so only the second check can see a clone that ignores the setting.

### What changes by itself (D1)

A faithful clone follows the same observable rules of change. Stills cannot show those rules, so the behaviour check
(`scripts/behaviour.mjs`) watches both live pages (12.5 s at the top, 1.6 s on every screen, three loads under two
seeds) and compares, matched by place:

| Member | Passes when |
|---|---|
| move | same axis and direction, speed within ±15% |
| cycle | interval within ±10%, same direction, same kind (slide or fade) |
| random | the reference and the clone agree on whether the order depends on `Math.random` at startup |
| extra | (always fails) something moves or cycles on the clone where nothing does on the reference |

A stopped marquee, a carousel that never advances and a fixed gallery order fail here, whatever the stills say.
Not covered: loops that run only under the pointer, cycles slower than one step every ~6 s, canvas scenes (journey and
canvas checks).

### Calibration and bars

`calibrate` loads the live reference two more times through the same checks (N = 3 with the capture) and writes
`reference/noise.json`, keyed by check, route, viewport and frame (a desktop tolerance is never read for mobile),
valid for that capture only. Status requires it before any clone work.

- bar = min(target, self − max(1, spread)), where self is the reference's lowest score against its own capture;
- a key below its hard floor (layout 90, real-pixel layout 85, scroll 90, canvas 85, journey 85) is a frame the
  reference varies on: judged by its **envelope** (the clone's nearest reference draw against the draws' own
  leave-one-out minimum, and for canvas regions the share of strong colour in view within [0.5 × min, 1.5 × max] of the
  draws), never passed by declaration;
- a key that is not calibrated uses the fixed target and says so.

| Check | Target | Every frame / checkpoint |
|---|---|---|
| layout, real-pixel layout, reduced motion | 98 | – |
| scroll states | 95 | its calibrated bar (else 80) |
| canvas | 90 (template: 75) | its calibrated bar (else 75; template 60) |
| journey | 95 | 80 |
| behaviour | 100 | every member |
| detail, load, curves, interactions | 95 | – |
| hovers | 90 | – |

### Metrics (`scripts/measure.mjs`)

No result is gated on a position-free measure.

| Measure | Definition | Used for |
|---|---|---|
| S-dom | masked pixel match | layout, scroll frames, the journey's UI layer |
| S-comp | Pearson r × 100 of luminance at ~32 px wide; null when both sides are flat, 0 when one is | canvas regions, journey scenes |
| A-grid | 16 × 10 mean colour grid, 100 − 4 × mean \|Δ\|/255 × 100, 2 levels of noise ignored | canvas regions and scenes (exact mode gates on the lower of S-comp and A-grid) |
| E | nearest of the reference draws, plus colour presence | frames the reference varies on |
| dHash | 64-bit perceptual hash; a verdict holds while the picture moves less than 6 bits or the reference's own replay distance | review tokens |
| empty | under 1% of the shot differs from its own background | interaction end states (absolute: light cards are content) |

The colour histogram (`canvasSimilarity`) is kept as a diagnostic only.

### Template canvas apps (D4)

A template-mode canvas scene is the clone's own art. Each journey checkpoint is the lowest of:

- the UI layer (S-dom of a masked shot);
- the scene's composition (S-comp), plus a stated **15-point allowance**;
- the interface text (shared words).

The UI layer gets no allowance. The allowance comes from research/metrics.md 2a: the reference holds 92-94 against
itself, a faithful port with its own art about 80, and a different framing (RC4 zero step-10) 31.8. REPORT says
"structure- and behaviour-equivalent; media replaced", never a pixel percentage. On the canvas-app fixture, the same
colours in another arrangement score 98-99 on the histogram and 4-62 on composition, and fail
(test/e2e/canvas-app.test.mjs).

## Third-party content (D3)

- **Detected at capture.** Elements another site's script inserted (the stack of the inserting call), shadow hosts and
  fixed frames from another registrable domain.
- **Excluded on both sides by default.** They are hidden on every page any check opens, listed in `meta.ignore` and in
  REPORT ("Excluded on both sides").
- **Inclusion is explicit.** `capture --include "<selector>"` keeps a widget; it is then cloned and verified like
  everything else. `capture --ignore "<selector>"` excludes more by hand.
- **Exclusions are scoped and inspectable.** One selector per widget, never a page's own content: a frame in the page's
  flow (a video, a map), anything holding a main, heading or navigation, or covering 30% of the window is kept, and
  the decision is recorded in `meta.thirdParty`.
- **They cannot conceal clone-only defects.** The clone lint fails a clone that keeps an excluded widget (its origin or
  id in the clone's files), and review flags anything only the clone shows (a fixed box, a frame or shadow host
  where no reference load has one, text that appears nowhere on the reference page) as a difference, whatever the
  verdict.
- **Drift watches where the page's scripts come from.** An origin added or gone since the capture (other than an
  excluded widget's) marks the reference stale.

## The clone lint

The clone (and the app) fail when they:

- keep an excluded widget;
- replace `Math.random`, `Date.now`, `performance.now` or `requestAnimationFrame` (the measurement's controls built
  into the clone);
- stop more animations (`animation: none`, `animation-play-state: paused`) outside a `prefers-reduced-motion` rule than
  the reference's own CSS does.

## Review

- **Frames.** Every frame is shot from navigation start on both sides under the same emulated network (40 ms, 10
  Mbit/s), the reference twice: "reference vs itself" per frame.
- **Verdicts are given to a picture.** The perceptual token above.
- **"tool" closes a frame only with evidence for that frame.** The reference under 95% against itself there with the
  clone as close as the reference is to itself, or an evidence file named after the frame.
- **Too many "tool" verdicts reopen a size.** More than 20% of a size's frames (with at least 5) closed as "tool"
  reopens that size.

## Loop control (D6)

The loop ends automatically when progress stalls. `scripts/loop.mjs`, records in `compare/loop.json`.

- **Objective.** One failing required result: a check at a route and a size, a scenario, a review frame marked
  different. Its key never names a worst frame (RC4 zero ran 56 cycles because it did).
- **Attempt.** Counted only when status issued the objective, the content changed afterwards, and the objective's own
  results were measured again on it. A report, a re-score of unchanged content or work on something else is not an
  attempt.
- **Progress.** A new best on one of the objective's pass conditions, each tracked separately: the mean's gap to its
  bar, or the summed gaps of the frames below their floors (by more than eps, the objective's measured spread, at least
  0.5), or fewer frames below their floors than ever. An attempt that broke something that passed is never progress,
  and the regression is issued first ("restore").
- **Change of strategy.** After 2 attempts without progress, status asks for one line under `## Attempts` naming the
  objective, with evidence made since the last attempt. Asked twice and never recorded, the objective concludes.
- **Conclusion.** After 4 attempts in a row without progress (the last after a change of strategy), or when 4 counted
  attempts in a row across all objectives brought progress on none (the run-level plateau). A concluded objective that
  later passes counts as passed.
- **Tool-owned results.** A scenario that cannot run on the reference, a reference that varies beyond its floor with no
  envelope, or a measurement still invalid after one recovery is never issued as clone work. It is listed as "not
  verifiable by the tool", and the outcome is at best Incomplete.

**Evidence for the parameters** (test/replay.test.mjs, test/loop.test.mjs):

| Parameter | Value | Evidence |
|---|---|---|
| progress | per pass condition | One summed shortfall concluded RC4 zero at ~71 (eventual best 91.3 / 88.9): its worst checkpoint swung by 20 points between scores and hid a mean that rose 22 points |
| concludeAfter | 4 | On zero's 57 scores, 3 concludes mobile at 80.5 (the "3 attempts" rule that stopped zero too early); 4 concludes both at score 45 (91.1 / 87.7), with ≥ 97% of the eventual gain, while RC4 ran 11 more hours |
| runWindow | 4 | rotation fixtures conclude within 8 cycles; zero's run-level plateau at score 45 |
| strategyAfter | 2 | one change of strategy per streak (PLAN.md 3.2) |
| eps | 0.5, or the calibrated spread if larger | noise fixtures: a wobble below eps is not progress |

**Limits of the replay.**

- **No per-checkpoint history.** RC4 kept none, so each viewport's worst checkpoint is carried forward from status's
  issued step (a lower bound on the shortfall).
- **Every score is taken as an attempt on changed content.** RC4 kept no content hashes.
- **RC4's journey metric was the histogram.** The rc.5 metric differs, so absolute values are not comparable.
- **The timing target is not met.** PLAN.md 3.4's acceptance asked for a conclusion within 1.5 h of the plateau.
  Desktop concludes 5 scores (about 2.0 h of wall time) after its plateau began, because a 4-attempt window over
  attempts of ~25 min cannot be shorter. 3 attempts meets the time and loses 8 points on mobile. Accuracy first:
  4 stays, and the retest measures it again.

## Time

- **Wall and active time are reported separately.** Gaps of 15 minutes or more between status runs are not active.
- **Timing checks take a machine-wide lock.** Load, behaviour, reveals and the journey run one at a time; the wait is
  printed.
- **Status re-measures selectively.** It re-measures missing, invalid and errored results, the pending objective's
  check, and stale failing results; stale passing results wait for one final sweep.
- **Doctor checks the environment.** Node, the browsers, DNS, a localhost page in the browser, and the timing lock.
