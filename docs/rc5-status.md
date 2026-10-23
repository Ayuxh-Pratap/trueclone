# 0.5.0-rc.5: what is fixed, what is verified, what needs the next test

> **Superseded (2026-10-23)** by `docs/rc7-status.md`, which keeps this page's readiness rubric (§4) unchanged and
> re-scores it after the RC6 runs and rc.7. This page is kept as the record of the rc.5 assessment.

Date: 2026-10-22. Baseline: 0.5.0-rc.4 (`17cd6cf`) and its five runs (`docs/eval-rc4/`). Plan: `docs/plan-rc5/PLAN.md`
(approved with decisions D1-D6 and exit 2). Canonical rules: `docs/policy.md`.

Three kinds of evidence are kept apart on this page:

- **Automated.** `npm test` (unit, golden false-pass, historical replay), `npm run test:browser` and `npm run
  test:e2e` (real Chrome on local fixtures); they run on every change.
- **Historical replay.** Recorded RC4 data put through the new code. It is approximate, and each use says how.
- **Pending retest.** What only a run on the real sites can show (`docs/test-plan-0.5-rc5.md`). Nothing on this
  page claims a real-site result for rc.5.

## 1. Test inventory (as of this commit)

| Suite | Tests | Where | What it covers |
|---|---|---|---|
| Golden false-pass | 23 cases (19 site mutations, 3 clone-lint cases, 1 modified instrument) | `test/status.test.mjs` | Every reproduced RC4 and pipeline path to a false exit 0 (P1-P8, VAR-1/-4, A11, A14, A18, ASTRO-4, ALLBIRDS-2/-8, R5, R6, D1, D2, R9, the clone lint). Each must not exit 0 |
| True pass | 5 | `test/status.test.mjs`, `test/verdict.test.mjs` | A verified document (status and evaluator), a canvas app (status and evaluator), and an excluded widget left out with a stop inside prefers-reduced-motion. Each must exit 0 (guards against over-strictness) |
| Evaluator | 18 | `test/verdict.test.mjs` | Unit states, stale vs invalid, partial merges, floors, interaction plan, review gate |
| Loop controller | 10 | `test/loop.test.mjs` | Rotation, slow genuine progress, noise, report-only runs, re-measure before counting, regressions, run plateau, strategy steps, a concluded result that later passes |
| Historical replay | 3 | `test/replay.test.mjs` | RC4 zero's 57 measured scores through the controller |
| Measures | 8 | `test/measure.test.mjs` | S-comp, A-grid, envelope, colour presence, dHash, the empty floor (research/metrics.md §2c cases) |
| Capture units | 5 | `test/capture.test.mjs` | Inline scripts at a trailing-slash route, content hash, reference id, motion draft, environment |
| Skill and CLI lint | 2 | `test/skill.test.mjs` | Exit codes and step names agree in the skill, AGENTS.md, status and the policy |
| Browser | 5 | `test/browser/` | The profile race (fails on rc.4's lib), inline script collisions (fails on rc.4), operable auto-scenarios, behaviour (a faithful copy and 6 broken variants), behaviour under reduced motion |
| End to end | 4 | `test/e2e/` | The doc-site fixture captured, calibrated and scored (faithful passes everywhere; broken fails where it breaks; review finds clone-only content); the canvas app (D4); an interrupted seed; a reference that does not load; drift by script origin |

## 2. The validation checklist from the approval

| Check | Evidence | Kind | Result |
|---|---|---|---|
| False success from missing, partial, stale or failed results | golden P1, P2/P3, P6/P7, VAR-4/A14, A18, ASTRO-4 | Automated | never exits 0 |
| An app edited after verification | golden A11 (`next/` edited) | Automated | not exit 0 |
| Partial re-measures | verdict "a partial re-measure merges" | Automated | units not measured keep their own result |
| Profile race | `test/browser/profile.test.mjs` | Automated, and the old code fails it | 5/5 viewports hidden (rc.4: 1/5) |
| Script capture | `test/browser/scripts-evidence.test.mjs`, capture ASTRO-5 | Automated, and the old code fails it | 2 inline files (rc.4: 1 collided name) |
| Seed interruption and resume | `test/e2e/reference-integrity.test.mjs` | Automated (real seed, browser killed) | no record, no index.html; a plain seed recovers |
| Reference self-calibration | `test/e2e/doc-site.test.mjs`, `canvas-app.test.mjs` | Automated | every key ≥ 99 on a page with a shuffle, marquee, carousel, intro and widget (the first calibration found the capture's own timing asymmetry: 4-15% on the carousel, now fixed) |
| Animation, shuffle and reduced motion | `test/browser/behaviour.test.mjs`, doc-site e2e | Automated | stopped, reversed and 2× marquees, still and slow carousels, a fixed order and another shuffle rule each fail with their reason; the faithful copy passes |
| Canvas content with similar colours, another layout | `test/e2e/canvas-app.test.mjs`, measure tests | Automated | histogram 98-99 (RC4 would pass), composition 4-62: fails; the faithful port passes at 100 |
| "Tool problem" verdicts without evidence | golden ALLBIRDS-8, verdict ALLBIRDS-8 | Automated | stay open; a clone-only element is a difference |
| Rotating failures, slow genuine progress, plateaus, regressions | `test/loop.test.mjs` | Automated (synthetic) | each as specified |
| The same on real data | `test/replay.test.mjs` | Historical replay (approximate) | concludes zero at score 45 of 57 (91.1 / 87.7, ≥ 97% of its eventual gain); 3 attempts would stop mobile at 80 |
| Tool-owned blockers | golden NODE_OPTIONS (exit 2); verdict BHASKAR-1 class; status drift unreachable → Blocked | Automated | Blocked, or not verifiable, never clone work |
| Report-only runs counting as attempts | loop test; status "report is idempotent" | Automated | 0 attempts |
| Exit-code propagation | `scripts/results.mjs` (a recorded error sets exit 1), score, e2e A15 | Automated | load.mjs on an unreachable reference now exits 1 (rc.4: 0) |

Not verified by any test here:

- the review's navigation-start anchoring against a slow network (only shown by code and the varsity/bhaskar evidence);
- the behaviour check on real sites (GSAP and Lottie motion, parallax under the pointer);
- `holdStill` on heavy WebGL pages (the cost of running 46 s of frames);
- a full `status` loop to exit 0 on a real site, including the Next.js build.

## 3. Coverage of the 63 RC4 findings

Status:

- **Fixed + test**: changed, with an automated test that fails without the change.
- **Fixed**: changed; no dedicated test (retest shows it).
- **Partial**: some of the finding addressed.
- **Keep**: a verified success, guarded by a test.
- **Deferred**: not done in rc.5.
- **Info**: not a defect.

| Finding | Status | Change | Test |
|---|---|---|---|
| ASTRO-1 control site | Keep | – | true-pass fixtures; retest |
| ASTRO-2 broken scenarios visible | Keep | interact toolOnly → tool | verdict "BHASKAR-1 class" |
| ASTRO-3 closed `<details>` targets | Fixed + test | interactions-auto: open the summary first, checkVisibility, trial click | browser/interactions |
| ASTRO-4 interrupted seed | Fixed + test | seed: temp + rename, `clone/.seed.json`; status requires it | e2e reference-integrity; golden |
| ASTRO-5 inline script collisions | Fixed + test | scripts-evidence: inline by navigated URL, content-hash names | browser/scripts-evidence; capture |
| ASTRO-6 start-page nav missing | Fixed + test | captured-route filter before the cap | browser/interactions |
| ASTRO-7, -8, -9 | Keep | – | retest |
| ASTRO-10 token flips on noise | Fixed + test | dHash token, Hamming tolerance | measure; golden R9; e2e review |
| ASTRO-11 stale counted as failing | Fixed + test | unit states; REPORT counts per state | verdict |
| ASTRO-12 Next review start page only | Fixed | next --verify reviews every route (wide, mobile); app review required per route | verdict reviewDirs |
| ASTRO-13 two rescores, lock waits | Partial | lock wait printed and summed; status re-measures selectively | – (R12 affected-set by file type deferred) |
| ASTRO-14 sandbox failures | Fixed | doctor: DNS, a localhost page in the browser, the timing lock | run by hand (all ok) |
| ASTRO-15 unrelated skills | Info | – | – |
| VAR-1 exit 0 over a failing app | Fixed + test | status requires the app's own verdict | golden VAR-1 |
| VAR-2 reference fails its own bar | Fixed + test (fixtures) | calibration, keyed bars, envelope + colour presence, hard floors | measure; e2e calibration. RC4 varsity frames: research/metrics.md 2b (replay), not a repo test |
| VAR-3 partial erases others | Fixed + test | per-unit merge | verdict partial; golden P2/P3 |
| VAR-4 missing as passing | Fixed + test | required set; error units | golden P1, VAR-4 |
| VAR-5 motion draft names, ranges | Fixed + test | curves draft | capture VAR-5 |
| VAR-6 review anchored at load | Fixed | navigation start, same emulated network | – (retest) |
| VAR-7 re-roll on unchanged input | Partial | an unchanged re-score is not an attempt | loop test (flip confirmation deferred) |
| VAR-8, VAR-9 | Keep | – | retest |
| VAR-10 stall, lock waits invisible | Partial | lock waits printed; wall vs active time recorded | – (keep-awake in the runbook) |
| VAR-11 a-h | Partial | a, b, e, f, g fixed (units per viewport, frame-named evidence, numeric review objectives, evaluator reads notes, app verdict); c (pre-line), d (nav arrival under the clock), h (pre-hydration pointer) deferred | verdict; golden |
| BHASKAR-1 desktop tolerance applied to mobile | Fixed + test (fixtures) | seed both sides; noise keyed by viewport | e2e calibration |
| BHASKAR-2, -12 tool-owned steps | Fixed + test | tool state, Blocked/Incomplete paths, never clone work | verdict; golden; status |
| BHASKAR-3 below every reference draw | Fixed + test | envelope fails a clone below every draw | measure envelope |
| BHASKAR-4 empty-page ratio | Fixed + test | absolute floor (isEmpty) | measure |
| BHASKAR-5 un-clickable scenarios | Fixed + test | trial click at detection | browser/interactions |
| BHASKAR-6 stale verdicts read | Fixed + test | evaluator on every status | verdict |
| BHASKAR-7, -8 | Keep | – | retest |
| BHASKAR-9 load-relative frames | Fixed | as VAR-6 | – |
| BHASKAR-10 stale re-measures | Fixed | stale passing units wait for the final sweep | – (status logic) |
| BHASKAR-11 crashed seed | Fixed + test | as ASTRO-4 | e2e |
| ALLBIRDS-1, -4, -6, -13 | Keep | – | retest |
| ALLBIRDS-2 hide-profile race | Fixed + test | the profile is one promise | browser/profile (rc.4 fails) |
| ALLBIRDS-3 instrument modified | Fixed + test | env identity (preload, manifest), Blocked | golden NODE_OPTIONS; manifest checked by hand |
| ALLBIRDS-5 few auto scenarios | Deferred | – | – |
| ALLBIRDS-7 dialog display:none, lazy images | Deferred | – | – |
| ALLBIRDS-8 "tool" bulk-closing | Fixed + test | frame evidence, clone-only, tool-heavy sizes reopen | golden; verdict; e2e review |
| ALLBIRDS-9 third-party widget | Fixed + test | detected at capture, excluded on both sides, lint, REPORT | e2e doc-site; golden lint |
| ALLBIRDS-10 rotation, a size never named | Fixed + test | objectives per check × route × size | loop; replay |
| ALLBIRDS-11 parity slack | Fixed + test | the app has its own verdict | golden VAR-1 |
| ALLBIRDS-12 drift misses third-party code; TS2352; libraries "none" | Partial | drift compares script origins (Fixed + test); generator types and library detection deferred | e2e reference-integrity |
| ALLBIRDS-14 motion map re-authored | Fixed + test | config hash invalidates | golden P8 |
| ALLBIRDS-15 host pause | Partial | active vs wall time | – (keep-awake: runbook) |
| ALLBIRDS-16 probe overhead | Partial | skill: probes never take the timing lock | – |
| ZERO-1 | Keep | – | e2e canvas-app (app path) |
| ZERO-2 rotation, no exit | Fixed + test | loop controller | loop; replay |
| ZERO-3 no app-mode review | Fixed + test | review right after the first score | status ZERO-3 |
| ZERO-4, -5 histogram over structure | Fixed + test | UI layer + composition + text; histogram diagnostic | e2e canvas-app |
| ZERO-6 host pause | Partial | as ALLBIRDS-15 | – |
| ZERO-7 phone draft stops silently | Fixed | the draft waits out transitions and records why it stopped | – |
| ZERO-8 report paths, unequal settle, journey parity | Partial | the app verdict includes the journey; the clock starts at one instant (settle itself is not virtual) | verdict canvas app |
| ZERO-9 probe overhead | Partial | as ALLBIRDS-16 | – |

Totals:

Counted per ID (rows that group IDs count each one):

| Status | Findings |
|---|---|
| Fixed + test | 30 |
| Fixed | 6 |
| Partial | 10 |
| Keep | 14 (guarded by fixtures, confirmed only by the retest) |
| Deferred | 2 |
| Info | 1 |
| **Total** | **63** |

## 4. Public-readiness rubric (0-100)

Defined before scoring. It measures readiness for real public users, not the share of planned fixes done.

### Anchors (every dimension)

| Anchor | Meaning |
|---|---|
| 0 | absent, or known broken |
| 25 | implemented, untested |
| 50 | implemented, with synthetic tests |
| 75 | automated tests on real browsers (fixtures) or on replays of real recorded data |
| 100 | confirmed on the real-site retest, with an independent audit of each run's files and your by-eye scores |

### Dimensions and weights

| # | Dimension | Weight | Evidence it is scored on (and only here) |
|---|---|---|---|
| 1 | Visual and behavioural fidelity on real sites | 25 | Your by-eye scores and the final results of real runs (retest) |
| 2 | Reference and measurement integrity | 15 | Calibration (reference against itself), the stabilisers, Stage 2 fixes with old-code failure proofs, the metrics |
| 3 | Truthfulness of completion decisions | 20 | The golden false-pass suite, true-pass fixtures, the app gate, the outcome audit of real runs |
| 4 | Loop termination and recovery | 15 | Loop tests, the zero replay, resume, Blocked paths; on the retest, every run terminal |
| 5 | Setup and first-use reliability | 10 | Install from the package, init, doctor in the agent's sandbox, the time each phase adds |
| 6 | Test coverage and reproducibility | 10 | The breadth, determinism and runtime of the suites themselves (fixtures, e2e, replay data in the repo) |
| 7 | Documentation and user-facing clarity | 5 | One canonical policy, the skill and CLI in step (lint), REPORT's outcome wording |

**How the dimensions relate without counting evidence twice:**

- **Dimension 6 scores the suites as assets.** Breadth, repeatability and whether someone else can run them. What a
  test proves is credited once, where it belongs: a golden false-pass test to 3, a calibration test to 2.
- **Dimension 1 takes only real-site outcomes.** Fixture fidelity is not counted there; it supports 2 and 3.
- **Real-run audits split by question.** They count in 3 (were the claims true) and 4 (did each run end); 1 asks how
  good the clone is.

### A. Evidence-backed readiness now: 61 / 100 (provisional)

| # | Score | Basis |
|---|---|---|
| 1 | 7.5 / 25 | 30%. No rc.5 run on a real site. The fixtures show the checks now see what RC4 missed (a stopped marquee, a fixed shuffle, a reframed scene, clone-only content), which says the scores mean more, not that clones are better |
| 2 | 10.5 / 15 | 70%. Fixtures self-consistent at ≥ 99.5 after fixing the capture's own timing asymmetry; Stage 2 fixes proven against the old code. No real reference calibrated; no clock-incompatibility fallback |
| 3 | 16 / 20 | 80%. 23 golden false-pass cases and 5 true-pass cases, with real-browser e2e on both sides of the line. No audit of a real run yet |
| 4 | 9.75 / 15 | 65%. Synthetic loop tests and the zero replay pass; the replay's timing target is missed (2.0 h vs 1.5 h); resume is untested on a real run |
| 5 | 5.5 / 10 | 55%. Doctor checks DNS, localhost and the lock; the tarball install path is untested; the time added by calibrate, behaviour and the doubled review reference is unmeasured on real sites |
| 6 | 8 / 10 | 80%. 85 tests across unit, browser and e2e, deterministic on this machine, fixtures in the repo; only Windows and Chrome |
| 7 | 4.25 / 5 | 85%. Canonical policy, lint-tested exit codes, superseded documents marked |

### B. Expected readiness after a successful retest: 75-85 (a projection, not a measurement)

It assumes every condition below holds:

- every run ends at 0, 2 or 3, and `tools/audit-run.mjs` finds nothing;
- astro reaches exit 0 again;
- your by-eye scores meet PLAN.md §10 gate 4;
- the five references calibrate self-consistent once seeded and held, or their envelope judges the rest;
- calibrate, behaviour and the review's second reference load add under ~20% to each run.

It is invalidated by any one of:

- a false exit 0 found by the audit or by eye;
- a run that does not end;
- `holdStill` breaking a site (a timeout, a page error, a different page);
- behaviour members failing correct clones on GSAP, Lottie or parallax pages;
- by-eye scores below RC4's.

Each of these caps its dimension at the 50 anchor, and a false pass is also a release blocker.

### C. Release blockers (any one blocks a public release, whatever the total)

1. **No rc.5 run on a real site.** PLAN.md §10 gates 2-5 are unmet until the retest.
2. **`holdStill` on heavy pages is unmeasured.** Up to 46 s of page time runs in one burst, and there is no
   clock-incompatibility detection or fallback (PLAN.md §4 "Feasibility").
3. **The behaviour check has not met a real site.** A false "extra motion" would block a correct clone; a missed
   carousel would pass a wrong one.
4. **The loop window rests on one historical run with approximate data.** Its timing target is not met (2.0 h against
   1.5 h).
5. **Deferred defects a user would meet.** ALLBIRDS-5 and -7 (auto-scenario gaps, dialog and lazy-image seed traps),
   VAR-11c and -h (Next pre-line whitespace, early pointer), ALLBIRDS-12's generator type error.
6. **No full `status` loop to exit 0 with the Next.js build was run.** Every check was run in this session, but not
   as one uninterrupted loop.

### Moving up a level

- **To about 70.** Retest stage 1 (the five runs in `docs/test-plan-0.5-rc5.md`) passes its sheet, with blockers 2
  and 3 cleared by those runs.
- **To about 80.** Your by-eye scores at or above RC4 on all five, and blockers 4-6 resolved.
- **To release.** Plus the parallel run and one unseen site (PLAN.md §7.2 D-E), with nothing in C left.

## 5. Known limits (also in docs/policy.md)

- **The historical replay is approximate.** RC4 kept no per-checkpoint values; the worst checkpoint is carried
  forward.
- **The behaviour check has blind spots.** Hover-only loops, cycles slower than ~6 s and canvas scenes are not
  covered.
- **Reduced-motion carousels.** The motion side of reduced motion (behaviour under `reduce`) is tested on a marquee
  only.
- **Template canvas apps rest on one fixture.** The allowance (15) was derived from one RC4 app and checked on one
  fixture; PLAN.md §8 asks for 2-3 apps.

## 6. Changes after this page was first written

- **Behaviour under reduced motion (D2).** The reduced-motion layout check freezes CSS animations on both sides, so a
  clone that ignored `prefers-reduced-motion` for its motion passed it. The behaviour watch now also runs under
  `reduce` (`test/browser/behaviour.test.mjs` D2: a clone that keeps the marquee running fails).
