# trueclone policy (rc.7)

This page is the canonical statement of what trueclone claims and when. Code comments, the skill
(`skill/SKILL.md`), the AGENTS.md block (`bin/trueclone.mjs init`) and REPORT.md point here. Where an older document
(`docs/eval-rc4/`, `docs/plan-rc5/`, `docs/rc5-status.md`, `docs/rc6-notes.md`, earlier test plans) says something
different, this page wins; those documents are kept as the record of how the decisions were reached. What changed in
rc.7 and why: `docs/rc7-notes.md`.

Decisions D1 to D6 below were approved on 2026-10-22 (docs/plan-rc5/PLAN.md §9). The rc.7 changes to outcomes,
recovery, review sections and the lint follow the RC6 evaluation (docs/rc7-notes.md §1).

## Outcomes

`trueclone status <name>` decides the outcome from the files alone, every time it runs. Running it never changes a
result and never counts as an attempt.

| Exit | Outcome | When |
|---|---|---|
| 0 | Verified | Every required result passes (or is accepted with evidence, or has nothing to measure) on the HTML clone **and** on the Next.js app, each measured on its content as it is now, against the current reference; the review closed by eye on both sides; notes, coverage and the clone lint pass; nothing invalid, stale, missing, errored or tool-owned |
| 1 | Work left | Not terminal: the next step is printed. Building, measuring, restoring a regression, working an objective, recording a change of strategy, the final sweep, app verification; or "waiting" while a trueclone step on the site is still running |
| 2 | Blocked | Something the clone cannot change stops the run, after its bounded recovery (below): the environment (no network, the live reference does not load), trueclone (a step that fails or crashes twice on the same input, a step that runs without effect, a lint finding in what the seed generated, a modified instrument, own-bundle files that cannot be recorded, status's own failure), or a step the agent declared cannot be done within its permitted edits. It names the owner (environment, tool, clone, run), the cause, the affected items, the log, and how to resume |
| 3 | Incomplete | Every required item is accounted for, none is pending and none is blocked; at least one is a difference the loop concluded or a result the tool cannot verify here. Each is listed |

**Every required item is accounted for (rc.7).** At any terminal outcome status writes, in `compare/outcome.json`
(`accounting`), every required item with exactly one disposition: passed, unresolved (a difference the loop
concluded), not verifiable (the tool's limit here), failing (Blocked only: measured below its bar, still open), blocked,
or pending. An item is a unit (check, route, size, state,
the interaction plan included) on the clone or on the app, a review frame, a review folder not shot yet, a written check
(notes, coverage) or a lint finding. Nothing pending is ever part of a terminal outcome: status names a step for it,
and reaching an outcome with any pending item is itself a defect (Blocked, owner tool). Verified has no item not passed;
Incomplete lists exactly the items not passed; `tools/audit-run.mjs` recomputes the required set and checks the two
sets of ids are equal. (RC6: an error seen twice and an interaction plan never run fell out of both the work queue and
the outcome: "Incomplete … verified as they are", with nothing listed.)

**At Blocked, the cause owns what it kept from being reached (rc.8), and nothing measured is relabelled (rc.9).** Every
item a Blocked outcome did not reach (never measured on this content: missing, stale, invalid, no verdict yet) is
blocked by that cause: disposition blocked, the blocker's owner, its reason "not reached" with the cause. What was
measured keeps what it is: a result below its bar (a frame that differs, a written check that fails) is **failing**,
the clone's, still open when the run stopped; an error not yet retried is a measurement error, owned by what it says.
REPORT's headline counts the three apart (errors, failing, not reached); the auditor treats a measured result reported
as not reached, and a "failing" item at any outcome but Blocked, as findings. (RC8 elise: 63 measured failures were
relabelled "not reached", owner tool, and REPORT said "313 cannot be measured; 0 not reached".) The auditor
treats a pending item at any terminal outcome, Blocked included, as a finding, and so a Blocked with required items and
no accounting (unless trueclone itself crashed). A Blocked run resumes under a new trueclone version: the version is
one of the inputs a repeated failure is counted on. (RC7 elise: Blocked with 323 items pending and none blocked, and
the auditor called it consistent.)

**Loading a page (rc.8).** A page is ready at its load event. It is waited for as long as the page keeps loading, and
fails only on silence (30 s with no byte received and no request starting or ending) or at a ceiling (10 minutes). A
capture requires the load event: a page that goes silent is the live page not loading (owner: the environment). A
read that meets a stalled request (a beacon that never answers) measures the parsed page and says so. Every read uses
the same rule. (RC7 elise: a 21 MB page of autoplaying video and photos at ~300 KB/s reached load at 46-57 s alone and
later when reads shared the link; a fixed 60 s limit failed every read, reported as "a request that never finishes",
and four reads crashed on it.)

**A route is captured at every size or not at all (rc.8).** A route that fails to load at any size, or whose own page
was not saved, is listed in `meta.routesNotCaptured` with the sizes and the error, and is not part of the reference:
not in `meta.routes`, not counted, not mirrored, no scenario drafted on or to it. It stays required: a route the
capture was asked for and could not capture is an item the tool cannot verify (owner from its error), so the run ends
Incomplete with it named, never Verified as if the request had been only the routes that loaded; REPORT says the result
covers the routes captured, not the request. Pages the request left out (a cap, a `--routes` list) are not required.
(RC7 elise: a route that failed at all five sizes was listed as captured, counted "captured at 5 sizes" and among the
pages mirrored.)

**Wording (D5).** REPORT.md and status say, in these words:

- Verified: "Verified: every required result passes on the clone and on the Next.js app as they are now."
- Incomplete: "Incomplete: N difference(s) remain (listed), M item(s) not verifiable by the tool (listed)." Never
  "pass", never "done", never "verified as they are".
- Blocked: the owner, the blocker, what was tried, and what the user can do (network, `--hide`, permission, unset
  NODE_OPTIONS, report a defect with the log named).

**An incomplete or blocked run reports (D6):** what passed; every item not verified with what happened to it; every
unresolved objective with its best and current values, its attempts and strategy changes, why it stopped, and who owns
it (clone, tool or environment); the next action and how to resume. Everything is kept: `compare/outcome.json` (the
outcome, valid only for the content it was decided on; "in-progress" with the step named while work is left),
`compare/loop.json` (every objective's full history and every step status named, with its counters), every result, and
every step's whole output in `logs/`. `status <name>` resumes from there.

**The console, the outcome and REPORT agree.** REPORT.md is rendered by status whenever what it describes changed
(the clone, the app, notes.md, a result) and at every terminal outcome; a REPORT that cannot be rendered fails the
command that tried (`score` exits non-zero; a terminal status becomes Blocked, owner tool), never silently.

## Failures and recovery (rc.7)

Every failure is classified before a recovery is chosen (`scripts/failures.mjs`), and every recovery is bounded:

| Condition | Examples (RC6) | Owner | What status does | Bound | Then |
|---|---|---|---|---|---|
| A measurement fails | a page that did not load, a check that crashed or ran out of time | by its error: environment (DNS, network, browser launch), clone (the clone's own page crashes or never finishes loading), tool (anything else) | measures it again, alone (`--serial` after a crash) | once, on the same content | environment or tool: **Blocked**, every such unit named with its error and log; clone: an objective, worked and concluded like any failing result |
| A step fails | calibrate, reads, a capture that exits non-zero or dies | as above, from its log | names it again (calibrate resumes what it finished) | twice on the same inputs | **Blocked**, with the step, the error line and the log |
| A step runs without effect | a command that ran and changed nothing status decides on | tool | – | twice | **Blocked** (owner tool): the step and status disagree |
| A step is named again and again, nothing changes, nothing runs | an agent that cannot do the step | – | after the third time, the step text says how to declare it: `- cannot: <step>: <why>` under ## Findings | eight times | the declaration: an objective concludes with that reason (listed in Incomplete); any other step ends **Blocked** (owner as declared). No declaration: **Blocked** (owner run) |
| A step is still running | a long calibrate, a background score | – | "waiting", exit 1; never counted | – | – |
| What trueclone generated is at fault | a lint finding in the seed's own output | tool | never named as clone work | – | **Blocked** at once, the files named |
| The reference varies on itself | a frame below its hard floor after calibration | tool | judged by its envelope; never clone work | – | "not verifiable" in Incomplete |
| trueclone itself fails | an exception in status | tool | – | – | **Blocked**, the stack kept |

Repeated read-only `status` calls only count as "named again with nothing changing"; they never consume an
attempt, and a step that runs is never counted as a repeat while it runs. Per-objective progress (attempts, strategy,
conclusion) and run-level progress (the plateau over all objectives) are unchanged (Loop control).

**The journal and logs.** Every trueclone step run on a site (through `npx trueclone`) records its start and its end in
`sites/<name>/logs/commands.jsonl`, and its whole output in `logs/` (status's in one rolling `status.log`). The step
itself writes its log and end record, so a launcher that times out and is killed takes nothing with it; a closed
console (EPIPE) does not stop a step. A failed score step keeps its whole output in `logs/score-<time>-<step>.log`, and
its error units carry the first error line, its kind (timeout, crash) and that log.

## What is required

`scripts/verdict.mjs requiredUnits` lists every result a site must have. A result is one **unit**: (check, route,
viewport, state).

| Site | Required |
|---|---|
| Document | layout and scroll states for every route × 5 sizes (390, 768, 1440 built from; 1280, 1920 held out); behaviour and reduced motion for every route × desktop and mobile; detail × 3; hovers (desktop); load × 5; motion curves × 3 when the reference has scroll curves or a motion map exists; real-pixel layout × 5 in exact mode; a canvas unit wherever the reference draws one |
| Canvas app | the journey × its sizes; load × 5 |
| Both | every interaction scenario planned; every review frame of the clone and of the app with a verdict given to that picture |

Each unit has one state: pass, accepted, fail, missing, stale, invalid, error, tool, na. **Only pass, accepted and na
count as verified.** Nothing absent is ever read as a pass. The interaction plan is a unit like any other: a plan
never measured, or measured by an earlier version of the check, is scheduled (rc.7).

**Routes (rc.7).** A route's identity is its encoded URL path, as capture records it (`scripts/routes.mjs`); its page
is written to one file name derived from it (decoded segments made safe for the file system), the one the clone server
answers, and the Next.js app keeps the encoded folder name (Next serves those at the encoded address; a decoded name
404s). Capture follows the links on every page it captures, not only the first, up to `--routes`; it records every
page found (`routesFound`) and every one left out with why (`routesNotCaptured`). Pages left out at the cap are named
once by status (capture again with them, or say why they are out of scope) and listed in REPORT as not verified. A
page reachable only through a script's router map, never through a link, is not found (a known limit).

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

**What the clone and the reference were made by (rc.7).** The seed records its code in `clone/.seed.json`: a clone
seeded by other seed code is seeded again (`clone/script.js` and `clone/patches/` kept). Capture records the structure
mask its masked shots were taken with (`meta.maskVersion`): a reference masked differently from how the clone is
measured is captured again. Reveal and widget records keyed by position only (before rc.7) are read again.

Results are written per unit, atomically, under a lock; a partial run merges and leaves the other units as they were. A
check that records a failed measurement exits non-zero (`scripts/results.mjs`). The content-hash cache that several
checks of one score share is read tolerantly and written atomically (rc.7; RC6 heybhaskar: a check died parsing a
half-written cache). A change to the shared measurement code (lib.mjs, identity.mjs, results.mjs, measure.mjs) changes
every check's codeHash: every result measured by an earlier version is stale and is measured again.

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
valid for that capture and the content of the reads it replays (rc.7: by content hash, not file times). Status
requires it before any clone work.

- **Durable (rc.7).** Each finished check of each draw is kept (`reference/calib/progress.json`); an interrupted or
  failed calibration resumes where it stopped, for the same capture, reads and check code. Every check's whole output
  is in `reference/calib/log.txt`, and progress with the time left is printed after each check.
- **Never partial.** A calibration with a failed check writes no `noise.json`; it records the failure in
  `reference/calib/failed.json`. Status resumes it once; a second failure is Blocked with the error and the log.
- **Its time is stated.** Status prints what to expect from the work: per draw, one shot per route × size per pixel
  check (about 45 s each) and a still at a fixed page age for every half screen of every page (about 8 s a step), × 2
  draws, with the range RC6 measured (0.4-13.5 s a step, 8-60 s a shot). It asks for no shorter time limit, or for
  the step to run in the background. RC6 took 3 min (astro: 4 template routes, 66 steps) to about 160 min projected
  (varsity: 2 exact routes, 267 steps: long pages, not canvases).

- bar = min(target, self − max(1, spread)), where self is the reference's lowest score against its own capture;
- a key below its hard floor (layout 90, real-pixel layout 85, scroll 90, canvas 85, journey 85) is a frame the
  reference varies on: judged by its **envelope** (the clone's nearest reference draw against the draws' own
  leave-one-out minimum, and for canvas regions the share of strong colour in view within [0.5 × min, 1.5 × max] of the
  draws; for journey checkpoints the same picture measures as the checkpoint's own, and the interface's words against
  the nearest draw's, at least what the draws achieve against each other), never passed by declaration;
- a unit whose own mean is below its hard floor is judged frame by frame (rc.7): each frame the reference varies on by
  its envelope, each other frame at its bar; it is "not verifiable" only where a frame the reference varies on has no
  envelope measured (rc.6 judged a scroll unit by its varying frames alone, and a journey unit could not be judged:
  RC6 zero ended "not verifiable" on both sides);
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

## Journeys: gates

A canvas app's journey replays the inputs its draft found. A gate the page names in words (the draft passes "draw ..."
with a gesture and "hold ..." with a hold, and counts it passed when the words leave the screen) is replayed by the
same rule, on the reference and the clone alike (`journey.mjs gateStep`, rc.6):

- wait up to 15 s for the gate's words to appear;
- make the input, then check that the words left;
- try again at most twice;
- report a gate that never passes as a journey error naming what the page still says.

RC5 zero's load checkpoint held still within about 2 s while its loader counted, and the gesture was drawn before the
gate existed (it appears 3-6 s after load). Every later checkpoint stayed at "DRAW A ZERO", silently. Drawn 6 s after
load the gesture passed 2 of 2 times; at 0.5-3 s, 0 of 6. Neither the seed nor the page clock changed that (8 of 8
passed with each combination).

## The site's own files (own bundle, exact mode)

A canvas app in exact mode (or any page captured with `--bundle`) runs the site's own recorded files offline, so each
recorded file is checked before it is kept (`lib.mjs recordBundle`, rc.6):

- **Verdicts.** Each body is compared with what the browser received and with the length the server declared (when
  the body is not content-encoded). The verdicts are ok, empty (legitimately: a 204, a zero-length answer), lost,
  incomplete, and partial (a 206 range answer).
- **Recovery.** Lost, incomplete and partial bodies are asked for again through the page's own browser context: its
  cookies, the request's headers, no Range, at most twice.
- **Validation.** An answer is kept only when it is the same resource: status 200, the same address after any
  redirect, the same media type, not an HTML page standing in for something else, and its own declared length.
  Otherwise the file is recorded as failed, with why.
- **Provenance.** Every manifest entry records how it was obtained (`via: browser` or `recovered`, the verdict, the
  bytes, a sha1) or why it failed.
- **The cause found on RC5 zero.** Chrome's DevTools protocol hands over an empty body for a fetch the page consumes
  as a Blob, although the bytes arrived; nine textures and videos were saved as 0-byte files.
- **Status checks the record, not the folder.** If a file is not whole (failed, missing, of another size, or an empty
  file from before rc.6), the files are recorded again once (a canvas app: the reference journey; a document site:
  `record-bundle`). If a file is still not whole after that, the run is Blocked with the files named: no change to the
  clone can supply them.
- **Whole is not enough: the bundle covers the capture (rc.9).** The clone of an own bundle is the bundle, so it holds a
  page for every captured route (any frame's document counts: a view a shell loads in an iframe is a page at its own
  address too) and every file the capture saved at any size. Capture records every captured page into the bundle and
  fetches whole each saved file the pages did not load (`bundle-complete.mjs`: through the recorder's own validation,
  so never a partial video). For a bundle that lacks any of these, status names `record-bundle <name>` once (the same
  recording, without capturing again: the reference's shots, reads and calibration stay valid), then the seed again; if
  something is still missing after that, Blocked (owner environment), what is missing named. The seed refuses a bundle
  without a page for a captured route (no completion record, the routes named). (RC8 elise: the bundle was recorded on
  one load of the start page; status called its 84 files "whole", the seed wrote 1 document, and the clone had no page
  for 5 of the 9 routes and none of 76 saved files, the About page's photos and the project videos among them.)
- **Every captured route has its page before anything is measured (rc.9).** After the seed, status checks from the
  files that the clone has a page for every captured route of its own document (`clone/<route>` or
  `clone/<route>/index.html`); a route without one is Blocked (owner tool) at once, the routes named, instead of an hour
  of scoring ending in HTTP errors on 127.0.0.1. It checks that the page exists, not that it is faithful: fidelity is
  every check after it.
- **No briefs or behaviours for an own bundle.** The clone runs the site's own code: nothing is ported, so status asks
  for neither, and says so (not "behaviours (0 cited)").

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
- **They cannot conceal clone-only defects.** The clone lint fails a clone that loads an excluded widget (its origin
  where it would be fetched: an src, href, srcset, data or action attribute, a script string, a stylesheet's url() or
  @import; or its id on an element), and review flags anything only the clone shows (a fixed box, a frame or shadow
  host where no reference load has one, visible text that appears nowhere on the reference page) as a difference,
  whatever the verdict. The text of an exclusion's own selector and the capture's `data-tc-origin` marker are not a
  load (RC6 allbirds: both were "kept widgets").
- **Template mode's placeholder text is the tool's own.** In template mode the seed replaces every text with
  placeholder; review exempts exactly the text the seed generated (it is in the seed's own record,
  `clone/.seed-base*.html`) from the clone-only text test, and still flags any other text, every fixed box, frame and
  shadow host, and every layout difference. Text a visitor cannot see (clipped, `sr-only`) is not "in view" on either
  side (RC6 astro: every placeholder, starting with a clipped skip link, was "clone-only", and no template site could
  be verified).
- **Drift watches where the page's scripts come from.** An origin added or gone since the capture (other than an
  excluded widget's) marks the reference stale.

## The clone lint

The clone (and the app) fail when they:

- load an excluded widget;
- replace `Math.random`, `Date.now`, `performance.now` or `requestAnimationFrame` (the measurement's controls built
  into the clone);
- stop an animation (`animation: none`, `animation-play-state: paused`) outside a `prefers-reduced-motion` rule that
  the reference's own CSS does not stop (compared rule by rule: a multi-page clone repeats the same styles on every
  page), or stop more in their scripts than the site's own scripts do.

Every finding names its owner. The agent may edit `clone/script.js` and `clone/patches/` only: a finding there, or put
into a generated page by a patch (the patch is named), is clone work, named by the file to change. A finding in what
the seed itself generated (it is in the seed's own record, `.seed-base*.html`) is trueclone's defect: Blocked at once,
never "fix the clone" in a file the agent may not edit (RC6 allbirds). In the app, a finding the clone has too is the
clone's; the rest is the generator's. The seed's working files (`.seed-*`) are not delivered and are not linted.

## Review

- **Frames.** Every frame is shot from navigation start on both sides under the same emulated network (40 ms, 10
  Mbit/s), the reference twice: "reference vs itself" per frame.
- **Verdicts are given to a picture.** The perceptual token above (journey frames: a 5-character token that must match
  exactly).
- **Each side has its own verdicts (rc.7).** The HTML clone's under `## Review` in notes.md, the Next.js app's under
  `## Review: app`: the two reviews share frame ids and sizes, not pictures. Nothing is inherited from one side to the
  other (RC6 zero: one shared list closed one side and reopened the other, 52 frames, for ever).
- **A frame marked "differs" is clone work: the step is the change.** Status names the frame and what to change; it
  shoots the frame again after the clone changed. It never names `review` on an unchanged clone (RC6 astro: "current,
  nothing changed", four times).
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
- **Tool-owned results.** A scenario that cannot run on the reference, or a reference that varies beyond its floor with
  no envelope, is never issued as clone work. It is listed as "not verifiable by the tool", and the outcome is at best
  Incomplete. An objective whose result becomes "not verifiable" is retired as such, never counted as passed. A
  measurement that fails again after its one recovery follows "Failures and recovery" above.
- **A declaration ends a stuck objective.** When an objective's step has been named again and again with nothing
  changing, a `- cannot: <objective>: <why>` line under ## Findings concludes it with that reason (owner tool when it
  says trueclone's output is at fault); it is listed like any unresolved difference. It is offered only then: a
  declaration made earlier is not read.

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
  Every status call counts, from the first (rc.7).
- **Timing checks take a machine-wide lock.** Load, behaviour, reveals and the journey run one at a time; the wait is
  printed. The lock records its holder's process id: a lock whose holder is gone (a step killed on its time limit) is
  taken over at once, and doctor says so (rc.7; RC6: such a lock read "a measurement is running" for 20 minutes).
- **A step's time limit follows its work.** In `score`, 2.5 times the estimate for the units the step measures, never
  under 20 minutes (RC6 heybhaskar: behaviour over 8 routes needs about 22 minutes on a first run; a fixed 20 killed it).
  Behaviour keeps every unit it finished, and a rerun measures only what is left.
- **Status re-measures selectively.** It re-measures missing, invalid and errored results, the pending objective's
  check, and stale failing results; stale passing results wait for one final sweep.
- **Doctor checks the environment.** Node, the browsers, DNS, a localhost page in the browser, and the timing lock.

## Permissions and preflight (rc.7)

trueclone's steps open the live site and a local page in Chrome (Playwright): they need network access and permission
to start a browser and a local server. A coding agent's sandbox usually has neither. Two supported setups, and the run
records which was used:

- **Full access** (Codex "Full access", network on): every step runs as is.
- **Sandbox with escalation** (Codex's default: approval on request, workspace-write, no network): the agent asks to
  run each `npx trueclone` step outside the sandbox, with network; the user or an auto-reviewer approves it. Doctor must
  be run the same way: a sandboxed doctor fails DNS and localhost by design, and says so.

`npx trueclone doctor` must say ok on every line in the setup the steps will run in, before capture. Long steps: never
put a time limit on a trueclone step shorter than status's estimate; a launcher that must time out runs the step in the
background and polls `status` (it says "waiting" while the step runs).
