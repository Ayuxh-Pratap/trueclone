# trueclone RC5 remediation plan

> **Status (2026-10-22): approved (D1-D6, exit 2) and implemented in 0.5.0-rc.5.** `docs/policy.md` is canonical
> where the two differ; `docs/rc5-status.md` maps every finding to its change and test. This plan is kept as written.
> Superseded here:
> - **Progress** (2.2 row 1, 3.2, the note under 2.3): not a reduction of one summed shortfall, but a new best on any one
>   pass condition (the mean's gap, the floors' gaps, the number of frames below). The summed form concluded the RC4
>   zero replay at about 71 (test/replay.test.mjs).
> - **Conclusion** (3.3): after 4 attempts without progress, not 3 (same replay: 3 stops mobile at 80.5).
> - **Virtual time** (4, R5): the page clock starts at one instant on both sides and runs at real speed; stills are held at
>   46.3 s of page time after DOMContentLoaded with every due timer fired in order (`lib.mjs holdStill`), not paused for
>   the whole check.
> - **"Drop CANVAS_FLOOR"** (5.3): the histogram floor is gone; an uncalibrated canvas frame is held to a fixed floor on
>   composition and colour layout (75, template 60) until calibrated.
> - **Capture staging** (5.4): a completion mark in meta.json and a re-capture, not a `reference.staging/` folder.
> - **The staged retest** (7.2, stages A-C one layer at a time): every stage landed in one build; see
>   `docs/test-plan-0.5-rc5.md` for the retest as it now stands.
> - **Not implemented**: flip confirmation by a second agreeing run (VAR-7); the clock-incompatibility fallback (4,
>   "Feasibility"); `NOISE_LIMIT` as twice the reference's spread for load (5.3 table); the R12 affected-set by file type.

Status: **proposal for approval, 22 Oct 2026.** Nothing has been implemented. The tested runs, the skill and the tool
are unchanged.

Inputs:
- the RC4 evaluation (`docs/eval-rc4/REPORT.md` and `projects/*.md`);
- the RC4 run folders;
- the tool source exactly as tested (rea-lab `17cd6cf`, `scripts/*.mjs`);
- three research audits written for this plan:
  - `research/pipeline.md`: measurement → verdict → exit code, and 24 adjacent failure paths, 13 of them reproduced on
    scratch fixtures;
  - `research/changing-content.md`: what actually varies on the five sites, and why;
  - `research/metrics.md`: each similarity metric tested on RC4 frames.

Labels:
- `file:line` is the tested source;
- **Obs** = observed in an artifact;
- **Repro** = reproduced during this investigation;
- **Src** = supported by source, not reproduced;
- **Est** = an estimate, to be confirmed by retest.

---

## 1. Assessment: the core failure mechanisms

RC4 produced good clones and untrustworthy conclusions. Every material failure traces to one of **six mechanisms**. Each
one lives in shared code, so every public run that meets the triggering condition will hit it.

| # | Mechanism | Where | What it produced in RC4 |
|---|---|---|---|
| **M1** | **No declared set of required results.** A verdict is built from whichever result files exist, judged on whichever widths, routes and values they contain. Missing, partial, failed and stale results are not distinct states, and several are indistinguishable from a pass | `report.mjs:125-129` (`present`/`all`), `status.mjs:130`, `score.mjs:106-160` (no failing exit) | **varsity:** a partial measurement read as a pass (07:22), and a Next check failing while status said "every gate passes". **allbirds:** load wide never named. **Repro:** 8 more false exit-0 paths |
| **M2** | **Results have no identity.** Freshness is judged by file mtime against a report timestamp. Nothing records which capture, hide profile, tool version, environment or app build a number belongs to | `status.mjs:129,132,260`, `report.mjs:109,232`, `load.mjs:117-119` | a `report` run counts as a "try"; journey, review and route results never go stale; an agent-patched instrument (allbirds) and an edited motion map produce numbers indistinguishable from stock ones |
| **M3** | **The loop has no model of progress.** Retry memory exists only for the last issued step, keyed by the *current worst item*. When the worst item changes, its history is deleted as "fixed". A "gain" is measured against the last value. There is no run-level progress, no regression tracking, and no outcome for steps only the tool can fix | `status.mjs:206,212,231,259-278` | **zero:** 56 cycles, never set aside, ran 32 h until stopped. **allbirds:** mobile scroll, 7 cycles. **bhaskar:** stopped at exit 1 because no honest exit existed |
| **M4** | **Measurement is asymmetric and uncontrolled where content changes.** Review frames are timed from each side's own `load` event (the reference over the network, the clone from disk). `Math.random` is seeded only in the journey check. There is no clock control. Endless animations are frozen at time 0, and the layout gate runs in reduced-motion mode | `review.mjs:96-103`, `lib.mjs:107` (used only in `journey.mjs:125`), `lib.mjs:197, 398-406`, `journey.mjs:137-147` | **varsity intro:** clone vs reference 5.8-9.2%, but reference vs reference 97.85%. **bhaskar:** the shuffled route and the case-sheet frames. **zero:** checkpoints shot up to 69 s apart. A stopped marquee would pass every gate |
| **M5** | **Thresholds are fixed constants and the canvas metric is position-blind.** No target is calibrated against what the reference achieves against itself, except one desktop-only route check that is then applied to every size | `report.mjs:28-36, 211-213`, `capture.mjs:378`, `lib.mjs:538-556` | **varsity:** the reference fails its own canvas floor (y 7650: 44-52). **bhaskar:** the mobile bar is one the reference fails 5/6 times. **zero:** histogram 90.5 vs structure 63; r = 0.04 with pixels; 127 vs 128 scores 50 |
| **M6** | **Reference collection has silent defects, and the review gate accepts unproven "tool" verdicts.** | `lib.mjs:180-188` (profile race), `scripts-evidence.mjs:21` + `capture.mjs:345` (inline names), `seed.mjs:381` (non-atomic), `load.mjs:40` (error page as reference), `report.mjs:83` (any evidence file closes "tool") | **allbirds:** `--hide` reached 1 of 5 viewports; 103/105 "tool" verdicts over a clone-only widget. **astro:** briefs cite the wrong code. **astro and bhaskar:** a half-seeded clone counted done |

Two further causes are **behavioural and environmental**, not mechanisms in shared code:

- **The skill has no rule for what to do when the tool is wrong.** Agents improvised three incompatible responses:
  - **stop** (bhaskar);
  - **patch the instrument** (allbirds, `NODE_OPTIONS --import`);
  - **fit the metric** (zero: reference colour statistics and GLB animation data).
- **The machine paused for 3h37m during the long runs**, and zero had a further 7h50m overnight gap. Effort was `high`
  and the sandbox restricted, both against the runbook. The evidence ties the sandbox to minute-scale retries, which
  exposed a real defect (ASTRO-4). **No evidence ties either deviation to the multi-hour delays.**

**What this means for the plan.** The order of work follows the dependency chain:

1. **Results must be valid** (M1, M2) before any loop rule can be trusted.
2. **Measurements must be symmetric and calibrated** (M4, M5) before "no progress" can be told apart from "noise".
3. **Only then can loop control** (M3) **decide** when to continue, change strategy, or conclude.

Fixing M3 first would just make the loop stop on wrong numbers.

---

## 2. Issue → evidence → fix matrix

### 2.1 Remediation items (referenced throughout)

| ID | Remediation | Mechanism |
|---|---|---|
| **R1** | Required-results ledger and one shared evaluator for status, report and Next | M1 |
| **R2** | Result identity, invalidation and atomic writes; `score` exit codes | M2 |
| **R3** | Loop controller: objectives, total-shortfall progress, regressions, strategy changes, tool-owned outcomes, terminal states | M3 |
| **R4** | The delivered app is what is verified: the Next verdict is authoritative, and `next/` is hashed | M1, M2 |
| **R5** | Symmetric, controlled measurement: seed + draw signature, navigation-anchored frames, virtual clock, phase-seeked loops, reduced-motion policy | M4 |
| **R6** | Calibration: reference self-draws per route × viewport × check, `noise.json`, envelope for unstable frames, hard floors | M5 |
| **R7** | Small metric system: structure (S), appearance (A), envelope (E), behaviour (B); histogram demoted to diagnostic | M5 |
| **R8** | Reference-collection fixes: profile promise, inline script identity, atomic seed, failed navigation, capture staging, motion draft, drift, journey draft, auto-scenarios | M6 |
| **R9** | Review gate: "tool" needs diagnostic evidence; clone-only elements are `differs`; perceptual frame hash; app-mode review early | M6 |
| **R10** | Third-party and optional-content policy (detect, decide, hide on both sides or port, lint the clone) | M4, M6 |
| **R11** | Skill rules for tool defects, instrument integrity, template fitting, probes, third-party content | behaviour |
| **R12** | Time: re-measure what a change can affect; defer stale passing checks; one score per change; lock-wait visibility | M3 |
| **R13** | Harness and environment: keep-awake, active vs wall time, config recorded in REPORT, `doctor` checks the sandbox | environment |

### 2.2 Material issues: the full chain

Each row: **evidence → cause (confidence) → correction → regression test → acceptance criterion.** The coverage table
(2.3) maps every remaining finding ID to these rows.

| # | Issue (IDs) | Evidence | Cause (confidence) | Correction | Regression test | Acceptance |
|---|---|---|---|---|---|---|
| 1 | **Rotating failures evade the retry limit** (ZERO-2, ALLBIRDS-10b, A17) | zero `compare/status-steps.json` holds only `__last`; 56 issued checkpoints, never more than 2 in a row; allbirds scroll key flipped y 1688↔2110 | `status.mjs:262` deletes the memory of a key that is no longer a candidate; keys embed the worst item (`:206,212,218,186`); `:265` compares with the last value (high) | **R3**: objectives keyed by check × route × viewport (stable); progress = reduction of the objective's total shortfall against its best so far, beyond its measured noise; memory persists until the objective passes | Fixture where the worst checkpoint alternates while the mean is flat (and a series replay of RC4 zero) | Concludes within K = 4 no-progress attempts; never deletes history on rotation; RC4 zero replay concludes near its plateau, not before (3.4) |
| 2 | **Tool-owned steps have no honest exit** (BHASKAR-2, -12) | `137-status-blocker.log` names `review --route /playground`, which answers "nothing changed"; no Findings path for routes (`status.mjs:231` vs `:240-241`) | Missing decision rule: status can only issue clone work or set aside after clone changes (high) | **R3** "tool-owned" outcome: a unit the reference cannot pass under calibration (R6), or that could not run on the reference, is classified by the tool, never issued as clone work, and reported as a tool limitation. **R11** skill: a tool defect is never a reason to stop | bhaskar folder copy with RC4 data: status must not name a route step for `/playground` mobile; it must reach Next | No status step whose command cannot change its own result; bhaskar reaches Next and ends at 0/2/3 |
| 3 | **Desktop variability applied to mobile** (BHASKAR-1) | `meta.json` unstable 96.57 (desktop only); agent probe mobile self 92.95-95.57 | `capture.mjs:378` (`if (vp.name === 'desktop')`); `report.mjs:213` applies it to layout and states at 5 sizes (high) | **R5** first: seed both sides plus a draw signature. The bhaskar shuffle is a startup `Math.random` call (`6c0f70-app.js:868`), so seeded draws should be identical. **R6**: where control fails, N = 3 self-draws per route × viewport × check, keyed tolerance | Fixture with a seeded shuffle gallery (pass expected at strict targets); a variant whose clone shuffles in a different order (fail expected) | bhaskar `/playground` scored at strict targets with equal draw signatures; no tolerance read across viewports (`noise.json` key includes viewport) |
| 4 | **Clone-vs-reference variability misread** (BHASKAR-3, -9, VAR-6) | varsity intro 5.8-9.2% clone vs reference, 97.85% reference vs reference; bhaskar novatr 96.66 → 60.4 on an unchanged area | `review.mjs:96-103` anchors frames at each side's `load`, real network vs disk (high) | **R5**: review frames timed from navigation start with the same emulated network as `load.mjs:30-40`, then virtual-time ages | Fixture whose intro starts before `load` on a slow network | Reference-vs-reference and a faithful clone both at least 95 at load+300 |
| 5 | **Status declares success over failing Next checks** (VAR-1, A11, ZERO-8 parity) | `compare-next/verdict.json` `Canvases pass:false`; status exit 0 at 08:30:59 | `status.mjs:282-284` reads only `.at`; parity (`:290-314`) omits canvases, curves and journey (high) | **R4**: the Next app is the delivered artifact, so its own verdict (same evaluator, R1) gates exit 0. Parity with the HTML clone becomes a diagnostic | Repro `next-unseen` (`research/pipeline.md` §6) | Any failing, missing or stale unit in the app verdict means no exit 0 |
| 6 | **Re-measuring one viewport erases others** (VAR-3, A2-A4) | `compare/states-192-partial-evidence.json`; REPORT "every scored check meets its target" with 4/5 widths unmeasured | `states.mjs:155`, `detail.mjs:258`, `drift.mjs:53`, `interact.mjs:320` replace the whole aggregate; `report.mjs:128-129` judges what is present (high) | **R1** units stored per (check, route, viewport, state); partial runs merge per unit; **R2** atomic per-unit writes | Repro `partial-widths` and status's own `--only states,detail --viewport mobile` (`rc5-repro-cmd`) | After any partial run every required unit still exists with its own identity; nothing passes unmeasured |
| 7 | **Missing measurements treated as passing** (VAR-4, P1, P9, P13-P15, A14, A22, A23) | Repro `missing-files` (exit 0); `score` exit 0 with a failing child (`score-out.txt`) | No required set (`report.mjs:125`); `score.mjs` never sets a non-zero exit (high) | **R1** required set; missing = failing state "not measured"; **R2** `score` exits non-zero when a requested unit errors or times out | Delete a result file, kill a child, null a hover score | Status names the missing unit; exit 0 impossible |
| 8 | **A below-target size never named** (ALLBIRDS-10a) | load wide 94.1 at exit 3 | `status.mjs:199,245`: one key per non-scroll check (`c.failing[0]`) (high) | **R3** one objective per failing (check, route, viewport) | Synthetic verdict with laptop and wide load failing | Two objectives; exit 3 lists both |
| 9 | **Repeated "tool" verdicts over a clone-only widget** (ALLBIRDS-8, A10, ASTRO-10) | 103/105 "tool"; widget only in clone frames; with it excluded, frame 04 agrees 99.99% | `report.mjs:83` accepts any existing evidence file; the token (`review.mjs:162-170`) flips on noise and misses small changes (high) | **R9**: "tool" needs a diagnostic record tied to the frame (reference-vs-reference result or a named tool fault); a clone-only element (present in clone DOM/pixels, absent from every reference draw) forces `differs`; perceptual frame hash with a tolerance. **R10** third-party policy | Fixture with a clone-only floating widget and 21 "tool" verdicts sharing one JSON | Review stays open; status names the widget, not a "tool" frame |
| 10 | **The reference fails its own thresholds** (VAR-2) | `compare-reference-self-1/-2`: y 7650 at 51.55 / 49.21 (desktop), 44.65 / 48.23 (mobile) | One sample, a fixed `CANVAS_FLOOR` 60 (`report.mjs:35`), coverage-weighted histogram (`lib.mjs:538-556`), uncontrolled physics dt (`2dd5aa:15568`) (high) | **R5** clock and seed for canvas scenes; **R6** N = 3 self-draws; a frame below the hard floor against itself is "reference varies here", judged by the envelope colour sequence and behaviour (`research/metrics.md` §3 E); **R7** drop `CANVAS_FLOOR` | RC4 varsity frames offline: Next desktop 17 (nearest-draw 98.1) passes; Next mobile 18 (0.00 cord colour) **fails**; synthetic "cords deleted" fails | Reference vs reference passes its own calibrated bar; the RC4 false pass (mobile 87.13 with no cord) is caught |
| 11 | **Histogram improves while structure stays weak** (ZERO-4, ZERO-5) | zero canvas 90.5 / 88.9 vs pixels 63.2 / 58.5; r(canvas, pixels) = 0.04; step-10 canvas 93.88, composition 31.8 | Template journey uses only `canvasSimilarity` (`journey.mjs:459`) (high) | **R7**: template journey = masked UI structure + 32 px composition (S-comp), against noise, with a stated template allowance (decision **D4**), plus behaviour (checkpoint reached, UI text, scene reads). Histogram is diagnostic only. **R11**: template mode never fits reference pixels or media | zero RC4 frames offline: step-10 fails on composition; a recoloured identical frame passes; flat 127 vs 128 scores ≥ 99 | No gate reads a position-free colour metric |
| 12 | **Hide-profile race** (ALLBIRDS-2) | desktop states 19.88 → 98.03 with no clone change; `compare/profile-race.json` [1,0,0] | `lib.mjs:181-188` memoises `null` before `await` (high) | **R8**: memoise the promise; bump the reference cache key; record the hide profile in result identity (R2) | `Promise.all` of 3 `newPage` on a mock gives 3 hide sheets; overlay fixture states at 5 sizes have no dialog | All 5 viewports apply the profile; results carry its hash |
| 13 | **Inline-script collisions across pages** (ASTRO-5) | 12 scripts saved as `1d0a5c-script.js` | `capture.mjs:345` passes the route URL without its trailing slash; `scripts-evidence.mjs:21` compares exactly; `:127-129` names by page hash (high) | **R8**: inline = the script URL equals the *navigated* document URL (`page.url()`, normalised), and inline names always use the content hash | astro capture copy: no repeated `file` in any route's `scripts.json` | Briefs cite the right file; coverage counts real scripts |
| 14 | **Interrupted seed counted as complete** (ASTRO-4, BHASKAR-11) | astro RUN-LOG 5-7; bhaskar `08-`/`09-seed*.log` | `seed.mjs:381` writes `clone/index.html` before the browser pass at `:548`; `status.mjs:96` checks existence; `:328` refuses a re-run (high) | **R8**: write to a temp file and rename after success, plus a `clone/.seed.json` completion record (inputs and identity); status requires it | Kill seed during the browser pass | Status re-issues `seed`; a plain `seed` re-runs |
| 15 | **Error page cached as the load reference** (A15, Repro) | `score-out.txt`: closed port, load "ok … desktop 100", reference curve all 100 | `load.mjs:40` `goto().catch(() => null)` keeps shooting; `:91` caches it (high) | **R8**: a failed navigation (or HTTP ≥ 400) makes the sample invalid, is never cached, and status reports a blocker | Closed-port reference | Unit state `invalid` with the reason; no score |
| 16 | **Instrument changed mid-run without invalidating evidence** (ALLBIRDS-3, ALLBIRDS-14, P8, A18-A20) | `warm-profile.mjs` via `NODE_OPTIONS` from 00:07; motion map re-authored (91.5 → 100 with no clone change) | Identity lacks env, tool version and config hashes; `status.mjs:129` ignores `motion-map.json`/`journey.json` (high) | **R2**: `refId` = hash(capture id, hide/cookie/locale profile, journey.json, motion-map.json, interactions.json, tool version). A change invalidates the dependent units, and REPORT lists "instrument changed at T: N results re-measured". `NODE_OPTIONS` `--import`/`--require` marks results "instrument modified" and they cannot pass. **R11** skill rule | Edit motion-map after a passing score; run score with a dummy `--import` | Status requires re-measure; REPORT shows the change; no pass on modified instrument |
| 17 | **A report run counts as a try** (A16, Repro) | `tries-out.txt`: 2 tries counted with zero measurements | `status.mjs:260` uses `verdict.at`, which `report.mjs:232` sets to report time (high) | **R3** counts an attempt only when the objective's own units were re-measured with a new clone identity | `tries.mjs` repro | Count stays 0 without a measurement |
| 18 | **App-mode review never issued** (ZERO-3) | 0/57 verdicts | `status.mjs:192` skips review for apps; verdicts ordered after the journey (high) | **R9/R3**: in every mode, first-pass review verdicts are issued right after the first full score, before the fix loop | App fixture with a failing journey | Review step precedes the second journey fix |
| 19 | **Freeze and reduced-motion hide behaviour** (changing-content F4) | `freezeLoops` seeks loops to 0 (`lib.mjs:398`); layout runs `reducedMotion:'reduce'` (`lib.mjs:197`); bhaskar marquees `animation:none` under reduce | Stabiliser design (high) | **R5**: seek loops to two equal non-zero phases on both sides; behaviour scalars (duration, direction, play-state on hover); layout gate at `no-preference` under control; reduce variant as its own check (decision **D2**) | Fixture with a marquee: clone stopped, reversed, and at 2× speed | Each fails; a faithful clone passes |
| 20 | **Third-party widget decided ad hoc** (ALLBIRDS-9) | 2.5 h on the AI assistant | No policy; `--hide` is reference-host only (`lib.mjs:208`) (high) | **R10**: capture detects third-party shadow hosts or iframes that differ across self-loads; the decision (default: excluded on both sides, decision **D3**) is recorded in `meta.json` and REPORT; a clone-side lint fails any excluded widget | allbirds-like fixture with a cross-origin widget | Detected at capture; same flat box on both sides when excluded; clone copy of it = `differs` |

### 2.3 Coverage table: every finding mapped

Legend:
- **Row** = a chain in 2.2;
- **R#** = remediation without its own row;
- **Keep** = verified success to preserve, with a regression test that guards it;
- **Info** = not a defect.

| Finding | Maps to | Notes |
|---|---|---|
| ASTRO-1 | Keep | control site; a regression fixture must still reach exit 0 |
| ASTRO-2 (A3 resolved) | Keep | broken scenarios stay visible |
| ASTRO-3 closed `<details>` targets | R8 | `interactions-auto.mjs:11-16`: `checkVisibility()` plus closed-disclosure awareness, open the summary first; error text "matched but not operable" |
| ASTRO-4 | Row 14 | |
| ASTRO-5 | Row 13 | |
| ASTRO-6 desktop start-page nav missing | R8 | filter to captured routes inside `detectInPage` before the 40-link cap (`interactions-auto.mjs:108`) |
| ASTRO-7, ASTRO-8, ASTRO-9 | Keep | start address, per-page evidence, review found 2 real defects |
| ASTRO-10 | Row 9 | perceptual hash |
| ASTRO-11 stale counted as "below target" | R1 | distinct states in REPORT: "N failing, M stale, K missing" |
| ASTRO-12 Next review start page only | R4 | app reviewed per route at wide and mobile (`next.mjs:844`) |
| ASTRO-13 two rescores per change, lock wait | R12 | one score command per change; lock wait printed |
| ASTRO-14 sandbox failures | R13 | `doctor` tests DNS and a localhost load inside the agent's sandbox |
| ASTRO-15 unrelated skills loaded | Info | non-hermetic environment; record loaded skills in the run log (R13) |
| VAR-1 | Row 5 | |
| VAR-2 | Row 10 | |
| VAR-3 | Row 6 | |
| VAR-4 | Row 7 | |
| VAR-5 motion draft names/ranges | R8 | `curves.mjs:59` unique names (append index); `:187-195` resolve ranges from live ScrollTrigger numbers per viewport |
| VAR-6 | Row 4 | |
| VAR-7 re-roll on unchanged input | R2/R3 | a result flip on the same identity needs a second agreeing run; re-verify on unchanged input is not an attempt |
| VAR-8, VAR-9 | Keep | canvas floor routed a step; clone quality |
| VAR-10 stall, lock waits invisible | R13, R12 | |
| VAR-11a layout ignores `--viewport` | R1 | units per viewport make `--viewport` honest (`score.mjs:51`, `diff.mjs:36`) |
| VAR-11b evidence regex trailing period | R9 | evidence becomes a structured record, not a regex on prose |
| VAR-11c Next pre-line newlines | R4 | `next.mjs:158-170` preserve whitespace under `pre-line`/`pre-wrap` |
| VAR-11d auto nav arrival 1500 ms | R5 | arrival judged after the page settles under the clock, not at a fixed ms |
| VAR-11e review null gain | Row 1 | objectives always carry a numeric shortfall |
| VAR-11f verdict edits need `report` | R1 | the evaluator reads notes.md directly on every status |
| VAR-11g slack 2 vs "within a point" | R4/R6 | parity is diagnostic; the app has its own calibrated verdict |
| VAR-11h Next loses pre-hydration pointer | R4 | known limitation (rc.3 E): documented, with a fixture test of an early pointer move |
| BHASKAR-1 | Row 3 | |
| BHASKAR-2, -12 | Row 2 | |
| BHASKAR-3 | Row 3 | the distribution rule fails a clone below every reference draw (`research/changing-content.md` §3.3 step 5) |
| BHASKAR-4 empty-page ratio across draws | R7 | absolute floor (ink < 0.01, main DOM missing, HTTP ≥ 400) |
| BHASKAR-5 un-clickable auto scenarios | R8 | trial click at detection |
| BHASKAR-6 status reads stale verdicts | R1 | as VAR-11f |
| BHASKAR-7, -8 | Keep | load fix, no gaming |
| BHASKAR-9 | Row 4 | |
| BHASKAR-10 stale re-measures | R12 | stale *passing* units re-measured once in the pre-final sweep |
| BHASKAR-11 | Row 14 | |
| ALLBIRDS-1, -4, -6, -13 | Keep | overlay detection, addresses, hovers, re-read after re-capture |
| ALLBIRDS-2 | Row 12 | |
| ALLBIRDS-3 | Row 16 | |
| ALLBIRDS-5 few auto scenarios | R8 | auto-scenarios for `[aria-expanded]` toggles and dialog openers; a Behaviours entry for an operable element without a scenario becomes a status step |
| ALLBIRDS-7 D4 dialog `display:none`, D5 lazy images | R8 | carry `display:none` for closed dialogs whose alternatives are unset; decode lazy images before the alpha test |
| ALLBIRDS-8 | Row 9 | |
| ALLBIRDS-9 | Row 20 | |
| ALLBIRDS-10 | Rows 1, 8 | |
| ALLBIRDS-11 slack 2 | R4 | as VAR-11g |
| ALLBIRDS-12 TS2352 `!important`, Libraries "none", drift misses SDK | R4, R8 | generator type-safe styles; report library detection; drift fingerprints third-party script URLs |
| ALLBIRDS-14 | Row 16 | |
| ALLBIRDS-15, ZERO-6, VAR-10 host pause | R13 | keep-awake; active vs wall time in REPORT |
| ALLBIRDS-16, ZERO-9 probe overhead | R11, R12 | probes need a purpose; probes must not take the timing lock; status reports elapsed per objective |
| ZERO-1 | Keep | app-mode front half works on a live third-party app |
| ZERO-2 | Row 1 | |
| ZERO-3 | Row 18 | |
| ZERO-4, -5 | Row 11 | |
| ZERO-7 phone draft stops silently | R8 | wait out post-gate transitions; always print why the draft stopped (`journey.mjs:347-352`) |
| ZERO-8 report paths, "Scored –", unequal settle, journey parity | R1, R5, R4 | app review paths; journey `at`; shared virtual clock; app verdict includes the journey |
| Pipeline P1-P17, A1-A24 | Rows 5-7, 14-17; R1, R2, R4 | every reproduced path becomes a golden false-pass test (section 7.1) |
| Content F1-F5 | Rows 3, 4, 9, 10, 19, 20 | |
| Metrics (§1 inventory) | Rows 10, 11; R7 | canvasSimilarity diagnostic only; `CANVAS_FLOOR` dropped; token replaced |

**Where I depart from the RC4 report's recommendations:**

1. **The report's item 1** ("one key per check+viewport, gain beyond best-so-far") **is right but insufficient on
   its own.** Replaying zero's measured series:
   - with the mean as the only progress signal, a 3-attempt rule stops at **2.2 active h, at 70.7**;
   - the run actually improved to 91 through real work over the next 12 hours.

   Progress must count reductions in *every gate quantity* (mean and worst-item floor), which R3 does with total
   shortfall. Replayed this way (mean or worst, ε = 0.5, K = 4), the stop lands at **16.0 h at 91.2 / 88.3**, against
   a run best of 91.3 / 88.9.
2. **The report's item 4** ("take scroll states twice, hold unstable frames to their own minimum") **is the fallback,
   not the primary fix.** The content audit shows most RC4 variability was measurement asymmetry or controllable
   randomness. R5 (control both sides) comes before R6 (sample what cannot be controlled). Sampling alone would have
   *tolerated* bhaskar's shuffle; seeding *removes* it and restores strict targets, which also exposes BHASKAR-3 if it
   is real.
3. **The report's item 10** proposed a structure term inside the template journey with soft-binned histograms. The
   metrics audit shows the histogram is uncorrelated with structure even soft-binned, and SSIM at 180 px misses large
   flat errors. So the histogram is **demoted to diagnostic**, and S-comp (32 px composition correlation) is the
   tested structure measure.

---

## 3. Loop control and terminal states

### 3.1 How rotating failures evade the current limit (exact mechanism)

1. Each `status` run builds **candidates**, then **issues the first one not set aside** (`status.mjs:271-276`). It
   saves `__last = { key, at: verdict.at, cloneAt, value }`.
2. The key embeds the current worst item:
   - `journey:<vp>:<checkpoint>` (`:212`);
   - `scroll:<vp>:<y>` (`:206`);
   - `canvas:<vp>:<y>` (`:218`);
   - `layout:<vp>:<section>` (`:186`).
3. **On the next status, only `__last` is evaluated** (`:259-269`). If its key is **not among the new candidates**,
   because a different checkpoint is now the worst, the code takes it as fixed and deletes its memory (`:262`).
4. **Otherwise, a gain is "now > last value + 0.5"** (`:265`). On a noisy value, any upward wobble resets the count to
   0.
5. **A count reaches 3 only if the same key stays worst for three consecutive scored attempts with no wobble.** With a
   mean target and a floor, fixing the worst checkpoint promotes another one almost every cycle. So zero never held a
   count in 56 cycles, and the loop had no exit while the mean sat at about 90.
6. **The same `__last` logic counts a `report`-only run as an attempt** (`verdict.at` changes, `:260`; Repro), and
   deletes history when a check vanishes from the verdict (A17).

### 3.2 The model

**Objective.** One per failing **(check, route, viewport)**:
- `journey::desktop`;
- `scroll:/:mobile`;
- `canvas:/:desktop`;
- `load::wide`;
- `interaction:<scenario name>`;
- `review:<frame id>:<size>`.

The key never contains a worst item. Items (checkpoints, frames, sections) are the objective's **members**. The step
text names the current worst member, for the agent's benefit only.

**Shortfall.**

- **For an objective:** `Σ over members max(0, bar_m − value_m)` plus each aggregate condition's shortfall, e.g.
  `max(0, 95 − mean)`.
- **Bars** come from calibration (R6), so noise is already inside them.
- **For the run:** the sum of objective shortfalls, normalised per objective, so one big objective does not dominate.
- **Rotation is handled for free.** Fixing member A while breaking member B leaves the shortfall unchanged.

**Noise margin ε.** Per objective: the measured spread of its value on unchanged input. That comes from reference
self-draws (R6) and from any repeat measurement of the clone at the same identity. Minimum 0.5.

**Attempt.** Counted only when all of these hold:
1. status issued the objective;
2. the clone identity changed afterwards (content hash, R2);
3. the objective's own units were re-measured at the new identity.

A `report` run, a re-score of unchanged input, or work on another objective counts for nothing.

**Per-objective record.** Kept until the objective passes; never deleted by rotation. It holds:
- `attempts`;
- `bestShortfall`, `bestAt` (clone hash);
- `noProgressStreak`;
- `history[]`, one entry per attempt: `{cloneHash, shortfall, memberValues, focusMember, diagnosis?}`.

Member values per attempt are what RC4 lacked: zero's per-checkpoint values were overwritten on every score.

**Progress.** An attempt makes progress when the objective's shortfall falls below `bestShortfall − ε`. Then:
- the streak resets;
- `best` updates.

**Regression.** After every score, any objective, or any member of a passing check, that was passing at an earlier
identity and now fails beyond its noise is a **regression**. Then:
- the attempt that caused it does not count as progress for any objective, even its own;
- status's next step is "restore": the regressed unit and the change that caused it (clone hash pair). It comes before
  new work.

**Diagnosis and change of strategy (bounded).**
- When an objective's `noProgressStreak` reaches 2, status issues one **strategy step** for it before another attempt
  counts:
  1. write a `## Attempts` entry in notes.md: what was tried, what the evidence showed, and what the next attempt will
     do differently;
  2. reference at least one new diagnostic artifact (an explain crop, a brief, a reference self-read, a probe output),
     newer than the last score.
- The tool checks that the entry exists, is new, and names an artifact that exists. It cannot judge quality: that is
  what the next measured attempt is for.
- **Exactly one strategy step per streak.** A diagnostic step is not an attempt and does not reset anything. So
  diagnosis is useful but never an unlimited exception.

**Tool-owned units.** A unit is tool-owned, never issued as clone work, when any of these holds:
- (a) the reference fails its own calibrated bar for it and no property or behaviour check covers it (R6);
- (b) the scenario could not run on the reference (today's `toolOnly`, `status.mjs:240`, generalised to every check);
- (c) its measurement is `invalid`: failed navigation, crashed child, modified instrument (R2).

What happens:
- tool-owned units are listed in REPORT under "Not verified by the tool", with the evidence;
- (c) first triggers a **bounded recovery**: re-measure once. If it is still invalid, the run is **blocked** if the
  unit is required, or the unit is listed as not verified.

**Run-level plateau.** If the run shortfall has not reached a new best (beyond the summed ε) for **K = 4 consecutive
counted attempts** across all objectives, every open objective is concluded:
- this catches cross-objective rotation (fix A, break B, fix B, break A);
- K is a parameter, calibrated in the retest (3.4).

### 3.3 Decision table

| State | Trigger | Status prints / exit | User sees | Preserved |
|---|---|---|---|---|
| **Building** | Required inputs missing (capture, reads, seed, behaviours) | the next build step / 1 | the step and why | everything |
| **Measuring** | Any required unit `missing` or `stale` for the current identity | `score --only <units>` (merged, R1) / 1 | which units, why stale (identity change named) | prior units |
| **Restoring** | A regression detected | "restore <unit>: it passed at <hash>, fails since <hash>" / 1 | the regressed unit and the causing change | both identities' results |
| **Productive work** | Highest-priority open objective with streak < 2 | "work on <objective> (worst member X)" / 1 | objective, current shortfall, best so far, attempts | objective history |
| **Change of strategy** | Objective streak = 2 | "record an attempt plan for <objective>" / 1 | the last two attempts and their values | notes `## Attempts` |
| **Objective concluded** | Streak reaches 3 after a strategy step, or a run-level plateau | moves to the next objective; the concluded one is listed as "unresolved" | "concluded after N attempts, best value V" | its full history |
| **Pre-final sweep** | No open objective (each passed or concluded) | re-measure every stale passing unit once (R12) / 1 | "final re-measure" | — |
| **App verification** | Sweep done | `next --verify` (R4) / 1 | — | — |
| **Verified** | Every required unit passes on the delivered app and the HTML clone, at their current identities, review closed by eye, nothing invalid or tool-owned without alternative verification | exit **0** | "Verified" + REPORT | everything |
| **Incomplete** | Some objectives concluded unresolved, or tool-owned units remain unverified; the app verified as the delivered artifact | exit **3** | "Incomplete: N application differences remain (list), M items not verifiable by the tool (list)". **Never "pass"** | everything; resumable |
| **Blocked** | Measurement cannot be made valid after one bounded recovery: reference unreachable or invalid, capture incomplete, browser or sandbox failure, required unit invalid | exit **2** | the blocker, what was tried, what the user can do (network, `--hide`, permission) | everything; resumable after the cause is fixed |

**Exit codes.**

| Code | Meaning |
|---|---|
| 0 | Verified |
| 1 | Work left (not terminal) |
| 2 | Blocked (new) |
| 3 | Incomplete |

`skill/SKILL.md:40-41` and the AGENTS.md block in `bin/trueclone.mjs` change accordingly. Exit 4 has been unused since
rc.4.

**Resume.** Objective records live in `compare/loop.json`. They are keyed by identity, not by time, and survive status
restarts. A capture change (new `refId`) archives them to `compare/loop.<refId>.json` and starts fresh, because results
against a different reference are not comparable.

### 3.4 Calibrating K and ε before release

**Replay the measured RC4 series offline against the controller.** Retrospective, approximate: zero's per-checkpoint
history was not stored, so the mean and the issued worst checkpoint stand in for members.

| Run, objective | Rule | Concludes at | Value then | Run best |
|---|---|---|---|---|
| zero journey | mean only, ε 0.5, 3 tries | 2.2 active h | 70.7 / 70.3 | 91.3 / 88.9 |
| zero journey | mean or worst, ε 0.5, K 3 | 15.5 h | 90.7 / 87.5 | " |
| zero journey | mean or worst, ε 0.5, **K 4** | **16.0 h** | **91.2 / 88.3** | " |
| zero journey | mean or worst, ε 1.0, K 3 | 5.6 h | 78.5 / 73.1 | " |
| allbirds scroll mobile | mean, ε 0.5, K 4 | 3.6 h | best 94.3 | (it passed at 4.7 h only after a re-capture: an instrument change, not clone work) |

**Conclusions:**
- **The rule must see the floor as well as the mean.** Shortfall does this exactly, where "mean or worst" only
  approximates it.
- **K = 3 is fragile to ε. K = 4 is robust in this data.**
- **ε must come from measured noise, not a constant.**

**Acceptance for the controller:** on the zero replay it concludes no earlier than the point where 95% of the run's
eventual gain is reached, and no later than 1.5 h of active time after the plateau begins.

---

## 4. Animated, randomized and changing content

**Principle (proposed definition of fidelity; decision D1).**

- **What the clone must reproduce:** the site's **rules for change**: the same shuffle rule, the same carousel
  interval, transition and controls, the same loop speed and direction, the same physics and timing.
- **How fidelity is judged:**
  - **pixels at equivalent states**, which the tool creates by controlling randomness and time on both sides;
  - **stable properties** (layout, dimensions, typography, media boxes and cropping);
  - **measured behaviour**.
- **What is not penalised:** catching a different valid carousel item or animation phase.
- **What is still penalised:** a clone that freezes the content, uses a different rule, or skips behaviour, because
  behaviour is tested separately from screenshots.

**The evidence corrects one assumption.** Most RC4 "inconsistent captures" were not random. They were the tool
measuring the two sides differently (`research/changing-content.md` §0 F1, §1.6):

| Cause | RC4 cases | Count | Treatment |
|---|---|---|---|
| Measurement asymmetry: frame anchored to each side's `load`, network vs disk | varsity intro, bhaskar case sheets | 4 | **Fix the instrument** (navigation start, same network, virtual time) |
| Controllable randomness (startup `Math.random`) | bhaskar `/playground`, varsity hero labels, zero particles | 5 | **Seed both sides** + draw signature check |
| Time-integrated physics, frame-rate-dependent code | varsity cords, zero clouds and camera lerps | 3 | **Virtual clock + seed + identical input** |
| Endless loops (marquees, tickers) | bhaskar ×3, allbirds brand marquee | 4 | **Seek both sides to two equal non-zero phases**, plus speed/direction/hover-pause behaviour |
| Autoplay carousel / banner | allbirds banner (5000 ms) | 1 | **Drive to the same index**, then compare; interval, transition and controls measured |
| Personalisation / geo | allbirds geofencing | 1 | **Pin** (`--cookie`, `--locale`, `--hide`, race fixed) |
| Third-party widget | allbirds assistant | 1 | **Decide** (D3): exclude on both sides, or port and verify as behaviour |
| Delayed / lazy loading, network noise | astro mobile load, allbirds load wide | 3 | **≥ 3 runs, interquartile spread**, never "not scored" |
| Capture / network failure | allbirds SDK `ERR_ABORTED`, A15 | 2 | **Invalidate the sample**, retry once, else blocked or not verified |
| Live data | bhaskar IST clock, GitHub chart | 2 | **Fixed clock**; live fetches served from the capture while measuring |

**Order of strategies** (R5, then R6):

1. **Symmetric measurement:**
   - same emulated network and time anchor (navigation start, then virtual age);
   - same seed;
   - same input script;
   - same motion preference.
2. **Control the cause, on both sides:**
   - `addInitScript(seededRandomInPage)` everywhere (today only `journey.mjs:125`);
   - Playwright `page.clock` (1.64 installed; fakes `Date`, timers, rAF, `performance.now`);
   - CSS/WAAPI animations seeked through `getAnimations()` or the CDP Animation domain.
3. **Drive to equivalent states:** same carousel index, same virtual age, same animation `currentTime`.
4. **Sample only what cannot be controlled:** N ≥ 3 reference draws. The clone passes when every clone draw is within
   the reference's own range, min-vs-min per viewport and check (`changing-content.md` §3.3). A clone below every
   reference draw fails with "below the reference's own range". That makes BHASKAR-3 automatic.

**How a carousel or canvas stays verified when pixels vary.** It is never masked away.

| Layer | Carousel / marquee | Canvas scene |
|---|---|---|
| Structure | container, slide and control boxes, gaps, overflow, track geometry | canvas box, backing size / DPR, z-order, visibility |
| Style | radii, object-fit/position of slide media, control and active-dot styles | background, blend, opacity curve on scroll |
| Pixels at equal states | at the same driven index, after the transition | at equal virtual time + seed + input |
| Behaviour | interval (±10%), transition duration/easing, wrap, pause on hover/focus, step = 1, swipe threshold, loop speed and direction | reacts to input; frame cadence; scene reads (camera, uniforms, object counts) within the reference's spread |
| Fallback when pixels are unstable on the reference itself | envelope: nearest reference draw + stable colour-presence sequence | same (proven on varsity y 7650: catches the RC4 false pass) |

**Stabilisation stays evaluation-only, and is proven not to hide behaviour:**

| Safeguard | How |
|---|---|
| Injected only at measurement time, never into clone files | every control goes through the Playwright context or CDP (`newPage(…, { stabilise })`) |
| Listed in REPORT | REPORT names the stabilisers used |
| One **unstabilised live pass** per dynamic region | the carousel advances within 2× its interval; the marquee moves; the canvas changes between two frames 500 ms apart; two unseeded reloads give different shuffle orders (if the reference does). A clone that hard-codes a state fails this pass |
| **Clone lint** | fails if clone files override `Math.random`, `Date`, `performance.now` or rAF, or set `animation:none` outside a `prefers-reduced-motion` query |

**When exact media cannot be obtained** (template mode), the tool claims only what it can verify:
- geometry;
- media type and attributes (autoplay/muted/loop, poster, srcset sizes, loading);
- timing;
- behaviour.

REPORT states "structure- and behaviour-equivalent; media replaced", **not** a pixel percentage. Replacement media is
never treated as equivalent (decision D4 sets the template journey gate).

**Feasibility and risks** (`changing-content.md` §4):

| Risk or limit | Handling |
|---|---|
| A site that breaks under clock control (signed URLs, timing-sensitive bot scripts) | detect by new page errors, failed requests or a different DOM signature vs an unclocked load; mark it "clock-incompatible" and fall back to sampling, stated in REPORT |
| Web Workers, OffscreenCanvas, `AudioContext` clocks | not covered by `page.clock`; detect them and fall back to the envelope |
| Frame-exact control (`HeadlessExperimental.beginFrame`) | out of scope: it needs a different browser binary |

---

## 5. Measurement, reference integrity and pass/fail rules

### 5.1 Data model (R1, R2)

**Unit.** One result per **(check, route, viewport, state)**:
- `state` is a frame, checkpoint, scenario or hover target where the check has members;
- stored in `compare/results/<check>.json` as a map of unit key → record;
- written atomically (temp + rename) under a per-file lock.

Partial runs **merge per unit**. Nothing else in the file changes.

**Record.**
- `value`, `members` (per-member values), `bar`, `noise`, `pass`;
- `state ∈ {measured, error, timeout, invalid}`, `reason`;
- `identity`:
  - `startedAt`, `endedAt`;
  - `subjectHash`: content hash of `clone/` for the clone, or of `next/` (excluding `.next/`) for the app; computed
    **at the start** of the measurement;
  - `refId`;
  - `toolVersion`, `codeHash`;
  - `env`: `instrumentModified` if `NODE_OPTIONS` has `--import`/`--require`;
  - `stabilisers`;
  - `args`.

**Required set.** `requiredUnits(meta, mode, journey, interactions, motionMap)` lists every unit that must exist:
- documents: every route × every scored viewport × each check;
- held-out sizes are required too (P3);
- app mode: the journey checkpoints × viewports;
- every interaction scenario, every review frame.

**Evaluation (one function, `scripts/verdict.mjs`).** For each required unit the effective state is:

| State | When |
|---|---|
| `missing` | no record |
| `invalid` | record invalid, or `env.instrumentModified`, or `refId` ≠ current |
| `stale` | `subjectHash` ≠ current subject hash; or `codeHash` ≠ current |
| `error` | measurement failed |
| `fail` | measured below bar |
| `pass` | measured at or above bar |
| `accepted` | below target, at or above the floor, with a structured evidence record; **never if stale** (fixes P5) |
| `tool-owned` | see 3.2 |

**Who reads it.**
- **REPORT.md** shows counts per state ("41 pass, 2 fail, 3 stale, 1 missing") and every non-pass unit.
- **status** reads the same evaluation, never REPORT text and never `verdict.at`.
- **`verdict.json`** becomes a cache of the evaluation, recomputed on every status (fixes BHASKAR-6 / VAR-11f).

**Scoring.**
- `score` exits non-zero if any requested unit ends `error`, `timeout` or `invalid`.
- Children report per-unit outcomes in a machine-readable line, not by regex on prose (`score.mjs:123-138`).
- Stamp reuse checks that the stored unit still carries the stamp's identity (A19).
- `reference/cache` is removed from the clone hash (A20, time only).

### 5.2 Invalidation rules

| Change | Units invalidated | How comparability is restored |
|---|---|---|
| Clone content (hash) | all clone units → `stale` | re-measure (status issues the affected units) |
| `next/` content, or app regenerated | all app units → `stale`; a failed build → app `invalid` (A12) | `next --verify` |
| Capture redone, `--hide`/`--cookie`/`--locale` changed (new `refId`) | **every** unit → `invalid`; `noise.json` and loop records archived | full score at the new `refId`; REPORT names the change and time |
| `journey.json`, `motion-map.json`, `interactions.json` changed | the dependent check's units → `invalid`; edits outside a status step listed in REPORT as "instrument edited by the agent" | re-measure; REPORT shows the diff summary |
| Tool upgrade (`codeHash`) | units of changed checks → `stale`; reference caches keyed by `codeHash` | re-measure |
| `NODE_OPTIONS` imports code, or files under `node_modules/@trueclone` modified (hash check at start) | results → `invalid`, "instrument modified" | remove the modification; re-measure |
| Measurement crossed its bar on the **same** identity (flip) | the unit needs a second agreeing run (VAR-7) | automatic re-run, once |

**Bounded recovery vs unsupported workaround.**

- **Bounded recovery** happens through the tool: re-measure, `--refresh-ref`, a re-capture that status issues, a
  documented flag. It always produces new identities, so the evidence is updated.
- **An unsupported workaround** changes what the instrument measures without changing its identity: a preload, an
  edited `node_modules`, a hand-edited config. R2 detects the detectable ones and invalidates their results.
- **The skill (R11) forbids all of them.**

### 5.3 Metrics (R7; `research/metrics.md` §3)

| Measure | Definition | Gates | Replaces |
|---|---|---|---|
| **S** structure | **S-dom:** masked pixel match (today's layout/states masks). **S-comp:** 32 px luminance composition correlation for canvas and media regions | layout, scroll frames, journey UI layer + scene, interaction end states | `canvasSimilarity` as a gate; `CANVAS_FLOOR` |
| **A** appearance | 16×10 spatial mean-colour grid; exact mode adds real-pixel match | same places; informational only in template mode | — |
| **E** envelope | for units the reference varies on: nearest of N reference draws + stable colour-presence sequence per frame | only for frames flagged unstable on the reference | the lowered "own match − 1" bar |
| **B** behaviour | interactions, hovers, motion curves, load, loop/carousel scalars, journey (checkpoint reached, UI text, gate), scene reads | everywhere behaviour exists | freezing as a substitute for verification |

**Why these four:**
- **S, spatial structure:** interpretable as "same layout and composition".
- **A, colour:** carried spatially, so palette fitting without the right composition does not pass.
- **E, legitimate variation only:** confined to frames the reference itself varies on.
- **B, everything that moves:** each is a scalar a person can check.

**Tested and rejected** (`metrics.md` §3):

| Measure | Why rejected |
|---|---|
| Edge F1 | saturates on texture |
| SSIM at 180 px | shift-sensitive; misses large flat errors |
| Histogram, even soft-binned | uncorrelated with structure |

**Thresholds** (R6):
- calibrated per (route, viewport, check, frame) from N = 3 reference draws: capture + 2;
- stored in `reference/noise.json` with the capture id and code hash;
- `bar = min(target, noise − max(1, spread))`;
- **hard floors** (S 90, A 85, interaction 95) are never lowered. Below a floor, the frame is "reference varies here" and
  judged by E and B, never passed by declaration;
- a key that isn't found uses the fixed target and says "not calibrated";
- a desktop tolerance cannot be read for mobile, because the key includes the viewport.

**Cost.** About 15-25 extra minutes per capture (estimated in `metrics.md` §4). RC4 spent about 1.5 h chasing one false
canvas failure and lost one run entirely to an uncalibrated bar.

### 5.4 Reference integrity (R8): changes and detection

| Defect | Change (source) | Detection before clone work |
|---|---|---|
| Profile race | `lib.mjs:180-188`: `let p; profileOfSite = () => (p ??= load())`; bump cache `v` | the hide profile hash is part of `refId`; every reference page records which profile it applied, and status fails a unit whose page lacked it |
| Inline script identity | `capture.mjs:345`, `scripts-evidence.mjs:21,127-129`: inline by navigated URL; content-hash names always | capture asserts no two different sources share a file name |
| Seed non-atomic | `seed.mjs:381,548,328`: write temp, rename after the browser pass; `clone/.seed.json` | status requires `.seed.json` with the current `refId` |
| Error page as reference | `load.mjs:40,91`; same pattern in every `goto().catch(() => null)` caller | navigation failure or HTTP ≥ 400 means sample `invalid`, never cached |
| Partial capture | `capture.mjs:71-72,481`: write to `reference.staging/` and swap on success; `meta.json` last as the commit marker | a missing commit marker means the capture is incomplete, and status re-issues capture |
| Motion draft | `curves.mjs:59,187-195,249-268` | capture asserts unique names and finite ranges |
| Drift blind to third-party code | `drift.mjs:1-5`: add script-URL fingerprints | drift reports which origin changed |
| Journey draft stops silently | `journey.mjs:347-352`: wait out post-gate transitions; always print the stop reason | the reason is recorded in `journey.json` |
| Auto-scenarios not operable | `interactions-auto.mjs:11-16,85-118`: `checkVisibility()`, closed `<details>`, trial click, captured-route nav filter | a scenario that cannot run on the reference is tool-owned at capture, not discovered in the loop |

**Validity gate.** Before any clone work, status checks **reference validity**:
- commit marker present;
- profile applied on every page;
- no invalid samples;
- self-draw calibration done.

The run never spends agent time on a clone measured against an invalid reference. This is the RC4 allbirds lesson
(~2.4 h against a reference under a modal).

### 5.5 Review gate (R9) and third-party content (R10)

**"tool" verdicts.**
- A "tool" verdict must name a diagnostic record **for that frame**:
  - a reference-vs-reference result showing the reference varies there (computed by `review` itself);
  - or a known tool fault ID.
- A free-form evidence file is no longer enough (`report.mjs:83`).
- More than 20% "tool" verdicts at one size raises a status step to re-check them.

**Clone-only elements are `differs`.**
- *Clone-only* means present in the clone's DOM or pixels and absent from every reference draw.
- The review computes this per frame, so excluding an element can't hide it.
- An element the user has decided to exclude (D3) is excluded on **both** sides and linted out of the clone. A clone
  that keeps it fails, so the exclusion cannot hide a clone-only defect.

**Frame hash.** A 64-bit perceptual hash (dHash), compared by Hamming distance against the reference's own replay
distance. Stale only beyond that distance. Today's token flips on +1 RGB level in 20/20 zero frames.

**Third-party widgets.**
- Capture lists cross-origin shadow hosts or iframes that differ across self-loads (`#ads-agent-host` on allbirds).
- The decision is recorded in `meta.json`:
  - default (D3): **excluded on both sides** via a new `--ignore <selector>` that paints the same flat box on both
    sides (as `diff.mjs:47-56` does for view-mounted content);
  - or ported, and verified as behaviour.
- REPORT lists every exclusion.

---

## 6. Implementation sequence

Ordered by correctness dependencies.

| Stage | Depends on | Why it comes before what follows |
|---|---|---|
| 0 | — | Nothing else can be proven without the fixtures |
| 1 | 0 | Every later rule depends on valid units |
| 2 | 1 | Calibration needs a correct reference |
| 3 | 1, 2 | Loop progress needs symmetric, calibrated numbers |
| 4 | 1-3 | Loop control decides on those numbers |
| 5 | 4 | Time optimisation reuses the controller's knowledge of what a change affects |
| 6 | 0-5 | Retest |

### Stage 0: test harness (prerequisite)

**Golden false-pass suite** (`tools/fixtures/verdict/`). Synthetic site folders built from `research/pipeline.md` §6
(`mk.mjs`). Each must **never exit 0**:

| Group | Cases |
|---|---|
| Missing and partial results | missing files, partial widths, held-out missing |
| Stale and identity | drift stale; stale + accepted; review frames of an old clone; motion-map edited; journey stale |
| Next app | failing app check; app value missing; `next/` edited after verify; build failure after regenerate; `--quick` verify leftovers |
| Score and tries | failed child; report-only "tries"; error-page reference |

**True-pass fixtures.** Each must exit 0. They catch over-strictness:
- static document;
- seeded shuffle gallery;
- marquee + carousel;
- intro starting before `load`;
- physics canvas under the clock;
- overlay + third-party widget, excluded on both sides;
- multi-page with route inline scripts;
- the existing `tools/fixtures/canvas-app`.

**RC4 offline replays.**
- Copies of the five RC4 site folders, with the original folders untouched, re-evaluated by the new evaluator.
- The zero, allbirds and varsity measured series replayed through the loop controller.

**Acceptance.** All of these run in under 10 minutes with `npm test`, and all pass before any stage merges.

### Stage 1: result integrity (R1, R2, R4 core; blockers)

**Issues:** rows 5-8, 15-17; P1-P17; A1-A16, A19-A24; VAR-3, -4, -7; ALLBIRDS-10a, -11; ASTRO-11.

**Changes:**
- **New `scripts/verdict.mjs`:** `requiredUnits()`, `evaluate(root, target)`; per-unit records and atomic merge
  helpers in `lib.mjs`.
- **Every check writer emits units with identity** (an identity block today only in stamps): `diff.mjs`,
  `states.mjs:155`, `detail.mjs:258`, `hovers.mjs:232`, `interact.mjs:262,320`, `load.mjs:117-119`, `curves.mjs:274`,
  `journey.mjs:445`, `drift.mjs:53`, `review.mjs`.
- **`report.mjs`** renders `evaluate()`; remove `present`/`all` (`:125-129`) and `verdict.at` semantics (`:232`).
- **`score.mjs`** exit codes, machine-readable unit lines, stamp/identity check (`:104,123-160`), `NODE_OPTIONS` check.
- **`status.mjs`:**
  - sections 5-8 read `evaluate('clone')` and `evaluate('app')`;
  - exit 0 requires the app verdict;
  - `next/` hash.
- **`next.mjs:840-845`:** review failure is an error, not a warning; `--quick` not allowed for verify.

**Regression tests:** the golden false-pass suite (all exit ≠ 0); true-pass fixtures (exit 0); RC4 varsity copy (no
exit 0 while its app verdict fails).

**Risks:**
- **Compatibility of existing site folders:** old result files are treated as `missing`, so the first status after
  upgrade asks for one full score. Documented in the changelog.
- **Over-strictness:** caught by the true-pass fixtures.

### Stage 2: reference integrity (R8; blockers 12-15)

**Changes:** listed in 5.4:
- `lib.mjs:180-188`;
- `capture.mjs:71-72,345,378-392,481`;
- `scripts-evidence.mjs:21,127-129`;
- `seed.mjs:328,381,548`;
- `load.mjs:40,91`;
- `curves.mjs`, `drift.mjs`, `journey.mjs:347-352`, `interactions-auto.mjs`.

**Tests:**
- profile `Promise.all` mock;
- kill seed mid-pass;
- kill capture mid-pass;
- closed-port reference;
- astro copy has no inline-name collisions;
- motion draft uniqueness.

**Acceptance:** every RC4 instance reproduces as fixed on the copies. The reference validity gate blocks clone work on
an invalid reference.

### Stage 3: symmetric measurement, calibration, metrics (R5, R6, R7; blockers 3, 4, 10, 11, 19)

**Changes:**
- **`lib.mjs`:**
  - `newPage` gains `stabilise` (seed, clock, animation seeking);
  - `freezeLoops` replaced by two-phase seeks (`:398-406`);
  - motion-preference policy (`:197`);
  - `canvasSimilarity` becomes diagnostic only (`:538-556`);
  - new S-comp, A-grid and envelope functions;
  - absolute empty-page floor (`:569-579`).
- **`review.mjs:96-103`:** navigation anchor and emulated network.
- **`capture.mjs`:** N = 3 self-draws per route × viewport × check → `reference/noise.json`; draw signature; third-party
  detection.
- **`states.mjs:46,83,110-124`:** clock for canvas frames; serialise canvas frames instead of five parallel viewports
  sharing the GPU.
- **`journey.mjs:137-147,220,439-459`:** one shared virtual clock; template journey measures (D4).
- **`report.mjs:28-36,211-216`:** keyed bars and hard floors.
- **New `behaviour` measures:** loop speed/direction, carousel interval and controls. They extend the interaction
  scenarios with measured steps.

**Tests:**
- true-pass fixtures (seeded gallery, marquee, carousel, pre-load intro, physics canvas) pass, and their defective
  variants fail (stopped, reversed, 2× speed, wrong shuffle rule, deleted cords);
- RC4 varsity offline: mobile y 7596 with no cord fails;
- zero offline: step-10 fails on composition;
- 127 vs 128 flat scores ≥ 99.

**Risks:**
- clock-incompatible sites: fallback, flagged in REPORT;
- added capture time (Est. 15-25 min);
- template gate parameters depend on D4.

### Stage 4: loop controller and review gate (R3, R9, R10; blockers 1, 2, 9, 18, 20)

**Changes:**
- **`status.mjs:157-278`** rewritten as the controller:
  - `compare/loop.json`: objectives, shortfall, ε, attempts, streaks, regressions, strategy steps, plateau, tool-owned
    units;
  - terminal states and exit 2.
- **`report.mjs:62-84`:** the review gate (diagnostic records, clone-only detection, dHash).
- **`review.mjs:162-170`:** dHash.
- **`--ignore`:** `lib.mjs:204-214` for both sides; `diff.mjs`/`states.mjs` paint.

**Tests:**
- rotation fixture concludes;
- regression fixture issues "restore" first;
- report-only tries count 0;
- RC4 zero replay concludes in the 3.4 window;
- bhaskar copy reaches Next;
- clone-only widget fixture keeps the review open;
- excluded widget passes only if absent from the clone.

**Acceptance:** no fixture loops without concluding. Every terminal state matches its definition in 3.3.

### Stage 5: skill rules, time, harness (R11, R12, R13)

**Skill (`skill/SKILL.md`): four rule changes.**
1. **Never change the instrument:** no `NODE_OPTIONS`/`--import`, no edits under `node_modules`, no hand-edits to
   `motion-map.json`/`journey.json`/`interactions.json` except when status asks. A suspected tool defect is reported
   with evidence; status's tool-owned path handles it.
2. **A tool defect never stops the run.** Exit 2 (blocked) is the tool's call, not the agent's. Replaces lines 33-35
   "a tool defect you proved".
3. **Template mode:** never sample, fit or extract the reference's pixels, textures, models or animation data. Art and
   motion are ported from the site's code; media is your own.
4. **Third-party widgets follow the recorded decision (D3).** Probes are for diagnosing a named objective; they must
   not take the timing lock.

Also update the exit codes (0/1/2/3) in the skill and in the AGENTS.md block (`bin/trueclone.mjs`).

**Time (R12):**
- after a change, re-measure the failing units plus the units the changed files can affect (CSS/markup → layout,
  states, detail; script → interact, curves, journey, states);
- stale **passing** units only in the pre-final sweep;
- one score command per change;
- `lib.mjs:149-168` prints lock-wait seconds into the unit records.

**Harness (R13):**
- `doctor` tests DNS, a localhost page load and the timing lock;
- REPORT shows wall vs active time, the model/effort/sandbox if provided, stabilisers and instrument changes;
- the runbook adds keep-awake.

**Tests:**
- a skill lint (the AGENTS.md block matches the exit codes);
- a time fixture: a CSS-only change triggers no load or interact re-measure; the final sweep re-measures them once.

---

## 7. Regression tests and staged retest

### 7.1 Test inventory (all automated, Stage 0 onward)

| Suite | Count (planned) | Must | Catches |
|---|---|---|---|
| Golden false-pass | 16 site variants (pipeline §6 + VAR-1/-3/-4 + ALLBIRDS-10a) | never exit 0; status names the right unit | M1, M2 |
| True-pass fixtures | 8 | exit 0 at strict or calibrated bars | over-strictness from R1-R7 |
| Defect variants of the true-pass fixtures | about 14 (stopped/reversed/2× marquee, wrong shuffle, frozen carousel, deleted cords, clone-only widget, error-page reference, partial capture, half seed, profile race, inline collision, phone-draft stop, post-load intro) | fail, with the correct cause named | M4-M6 |
| Loop controller | 6 (rotation, regression, report-only try, strategy step, plateau, tool-owned) | conclude correctly; never delete history | M3 |
| RC4 offline replays | 5 site copies + 3 series | varsity no exit 0; bhaskar reaches Next; allbirds review stays open over the widget; zero concludes in its window; astro unchanged | regression against real evidence |

### 7.2 Controlled retest

**Preserve RC4.**
- The `C:\dev\tc-tests\rc4-*` folders and the transcript are read-only.
- RC5 runs go to new folders `rc5a-*`, `rc5b-*`, and so on.
- Every REPORT records the tool commit, the stage and the configuration.

**Comparability.**
- Metrics change in Stage 3. So each RC5 REPORT also prints the RC4 metrics (canvas histogram, old bars) as
  diagnostics. Improvements can then be attributed to the tool or to the measurement.
- By-eye scores (yours) are the common currency across RC4 and RC5.

| Stage | Change under test | Runs (one at a time, same model `gpt-6.1-sol`, same effort `high`, same sandbox as RC4) | Pass criteria |
|---|---|---|---|
| A | Stages 1-2 | varsity, bhaskar, astro | varsity: no exit 0 while the app fails a unit; bhaskar: reaches Next; astro: exit 0 (regression guard). Every REPORT state count matches an independent audit of its files |
| B | + Stage 3 | bhaskar, varsity, zero | bhaskar `/playground` at strict bars with equal draw signatures (or a correctly diagnosed difference); varsity: no canvas chase on the noisy frame, a missing-cord frame fails; zero: template journey on structure; histogram diagnostic only |
| C | + Stage 4 | zero, allbirds | zero: terminal state (0/2/3) with no indefinite loop, review verdicts written early; allbirds: widget decided at capture, no "tool" bulk-closing, load wide named |
| D | + Stage 5, runbook config (Extra High, Full access, keep-awake), all five in parallel | all five | same terminal states as A-C; lock waits reported; no instrument modification detected; time recorded per phase |
| E (release check) | unchanged tool | **one unseen site** (not used to tune anything) + astro on a cheaper model | honest terminal state; your by-eye within the expected band |

**Every stage also passes the full automated suite (7.1).**

**Attribution.** Each stage changes one layer, so a difference in outcome is attributed to that layer. A stage that
fails is fixed and re-run before the next begins.

---

## 8. Expected benefits, risks and uncertainties

**Benefits** (all **Est.** until retest):

| Run | RC4 measured waste | Fix | Expected effect |
|---|---|---|---|
| zero | 7.2 active h after the plateau with no measured gain; 0 review verdicts; no terminal state | R3 controller (replayed concluding at about 16.0 h with 91.2 / 88.3), R9 early review, R7 honest template score | a terminal state about 4-5 active hours earlier on the RC4 trajectory, with eyes on frames from the first score. **Numbers will differ** under the new metric, so the trajectory itself will differ |
| allbirds | about 2.4 h scored against a reference under the modal (21:53-00:15, desktop states 14-25%); about 2.5 h on the assistant widget (overlapping); 56 min mobile oscillation | R8 profile fix, R10 widget decided at capture, R3 objectives | most of those hours removed. **Upper bound**, because some of that time was real work on other checks |
| varsity | 2.9 h after all HTML gates: 47 min cord rework on a noise frame, 13 min reference replays, 4 Next verifies (87 min) | R6/R7 calibrated canvas, R4 authoritative app verdict | the noise chase avoided; the false exit 0 replaced by the true state. The 2 Next verifies that fixed real app differences (pre-line, pointer) remain |
| bhaskar | stopped at 2.4 h with no Next app | R5 seeding (removes the shuffle variability), R3 tool-owned path | **longer** run (Next + interactions still to do), with a truthful end |
| all | stale passing checks re-measured after every fix (bhaskar 18 of 39.6 scoring min); lock waits (astro about 15 min; allbirds about 80 min, inferred) | R12; lock-wait reporting | fewer minutes per fix cycle; lock time visible (still real when runs overlap) |

**Configuration.** Effort `high` and the restricted sandbox stay visible in every retest REPORT. Stages A-C keep them,
to stay comparable with RC4. Only Stage D uses the runbook settings, so their effect is measured, not assumed.

**Risks:**
- **R1/R2 over-strictness:** a correct clone could fail on bookkeeping. Mitigation: the true-pass fixtures and a
  one-time "migrate" score.
- **R5 clock control breaks some sites.** Mitigation: detection plus fallback, stated in REPORT.
- **R6 adds 15-25 min per capture.** It is paid once.
- **R3 K and ε could conclude a slow but real improver too early.** Mitigation: the strategy step; replay calibration;
  K as a parameter; resumable state.
- **Stage 1 rewrites the result format.** Old site folders need one full re-score.

**Uncertainties** (not resolvable from RC4 evidence):

| Uncertainty | Why open | What resolves it |
|---|---|---|
| Whether bhaskar's desktop `/playground` gap (BHASKAR-3) is a real clone defect | needs seeded measurement | Stage B |
| How often real sites are clock-incompatible | — | Stages B-E |
| Exact template allowance (D4) | needs calibration | 2-3 canvas apps beyond zero |
| The host pause (likely sleep) | cause unknown | keep-awake in D |
| How much the parallel probes' lock use delayed other runs | not quantified | lock-wait logging in D |

---

## 9. Decisions needed from you

| # | Question | Recommendation | Alternative | Effect on fidelity / time / UX | Blocks |
|---|---|---|---|---|---|
| **D1** | What counts as faithful for changing content (shuffles, carousels, marquees, physics)? | **Same rules of change**, verified by pixels at tool-created equivalent states (seed, clock, driven index) + stable properties + measured behaviour (interval, speed, controls); an unstabilised live pass proves the clone still moves | **Same captured instance**: the clone reproduces exactly the captured order or phase (freeze it) | Recommended: highest real fidelity, about 15-25 min more per capture, honest about variable sites. Alternative: easier, higher pixel scores, but a frozen carousel would "pass" and the delivered site would not behave like the original | Stage 3 design |
| **D2** | Is the reduced-motion presentation part of the clone? | **Yes, as a small separate check** (the site's `prefers-reduced-motion` rules must also hold); the main layout gate moves to the default presentation under clock control | Ignore the reduce variant (layout at `no-preference` only) | Recommended: adds a minor check; catches clones that drop the site's accessibility branch. Alternative: simpler, slightly less complete | No (Stage 3 detail) |
| **D3** | Third-party widgets (AI/chat assistants, consent, review/rating widgets, social embeds): in the clone or not? | **Excluded by default**, on both sides, listed in REPORT, linted out of the clone; first-party UI is always cloned; a flag ports a named widget when you want it | Port every third-party widget the reference shows | Recommended: removes allbirds' biggest time sink; the clone is the site, not its vendors. Alternative: closer to what a visitor saw, but these widgets vary per visit, often cannot run offline, and cost hours | Stage 4 (R10) |
| **D4** | Template mode for canvas apps: what is the gate? | **Structure + behaviour**: masked UI layer + 32 px composition vs reference noise, minus a stated allowance (start at 15 points, calibrate on 2-3 apps) + checkpoint/UI/gate/scene-read behaviour; REPORT says "structure- and behaviour-equivalent; media replaced", no pixel % | (a) Template canvas apps are **report-only** (no pass possible, always exit 3 with a quality summary), or (b) canvas apps only in exact mode | Recommended: a fair, honest pass for ported scenes with your own art; no incentive to fit colours. (a) is safest but can never succeed; (b) narrows the product | Stage 3 template measures |
| **D5** | How should incomplete and blocked outcomes be presented to a user? | Three outcomes: **Verified** (0), **Incomplete** (3: "N application differences remain" + "M items the tool could not verify", each with evidence and best value reached), **Blocked** (2: the cause and the user action). A tool limitation never upgrades to Verified unless an alternative check verified the item | Fold tool limitations into "Verified with limitations" (exit 0) | Recommended: "Verified" always means verified. Alternative: friendlier headline, but it re-opens the trust problem RC4 exposed | Stage 4 messaging (not the logic) |
| **D6** | When the loop concludes on a plateau, end automatically (exit 3, resumable) or pause and ask you? | **End automatically** at exit 3 with the full objective history; you can resume by adding guidance (notes or flags) and re-running status | Pause at the plateau and wait for a user choice ("continue N more attempts / conclude") | Recommended: matches "unattended", never loops. Alternative: more control, but the agent must not ask mid-run per the current design | Stage 4 |

**Not asked** (invariants I will treat as fixed):
- missing, stale, failed or invalid results never pass;
- no indefinite loops;
- the delivered app is the one verified;
- stabilisation never ships in the clone;
- the agent never modifies the instrument.

---

## 10. Public-release gate

The tool is releasable when **all** of these are demonstrated, each by an artifact:

| # | Gate | Evidence |
|---|---|---|
| 1 | The golden false-pass suite never exits 0; the true-pass fixtures all exit 0; the defect variants fail with the right cause | CI run of `npm test` |
| 2 | Retest stages A-D: every run reaches a terminal state (0/2/3) whose REPORT state counts match an independent audit of its files; zero indefinite loops; zero instrument modifications | retest REPORTs + audit |
| 3 | No run spends more than 1.5 h of active time after its last measured progress (the controller's window), and none concludes before 95% of its eventual measured gain (replayed) | `compare/loop.json` per run |
| 4 | Your by-eye scores on the five sites meet or beat RC4 (astro ≥ 95, heybhaskar ≥ 93, varsity ≥ 88, allbirds ≥ 85 without the clone-only widget, zero ≥ the level agreed in D4), and no REPORT claims more than you see | your scores vs REPORT |
| 5 | Stage E: one unseen site reaches an honest terminal state within your by-eye expectation, and astro reaches exit 0 on a cheaper model | runs + your scores |
| 6 | The skill and AGENTS.md describe exactly the shipped exit codes and rules (lint) | test |

---

## Recommended direction

**Approve the six-stage plan in this order:**

1. **Stage 0:** test harness.
2. **Stage 1:** result integrity.
3. **Stage 2:** reference integrity.
4. **Stage 3:** controlled and calibrated measurement.
5. **Stage 4:** loop controller and review gate.
6. **Stage 5:** skill, time and harness.

**Stages 0-2 can start immediately and need no decision from you.** They are pure correctness:
- no false passes;
- no wrong references.

**Decisions needed for later stages:**

| Decision | Needed before | Recommendation |
|---|---|---|
| **D1** (changing-content fidelity) and **D4** (template canvas gate) | Stage 3 | the definitions in section 9 |
| **D3** (third-party widgets) and **D6** (plateau behaviour) | Stage 4 | the definitions in section 9 |
| **D2** and **D5** | — | can follow my recommendations unless you object |

**To approve:**
- confirm or amend D1, D3, D4 and D6;
- say whether the exit-code change (adding 2 = Blocked) is acceptable for the public CLI.

Then implementation starts with Stage 0.
