# RC4 run: zero (why.zero.university, template, canvas app)

Investigator: evaluation agent, read-only. Evidence frozen after the run ended (user stop, last event
2026-10-22T04:59:40Z). Paths are relative to `C:\dev\tc-tests\rc4-zero\` unless absolute. `cmd#N` = line N of
`.trueclone-run/commands.jsonl` (its log is `.trueclone-run/NN-<step>.log`). Times UTC (IST = UTC+5:30).

## 1. Run facts

| | |
|---|---|
| Site / mode / flags | why.zero.university, `zero`, template, `capture https://why.zero.university/ zero` (no flags) |
| Start | 2026-10-20 20:47:09Z (21 Oct 02:17 IST), first turn |
| End | 2026-10-22 04:59:40Z (10:29 IST), final agent message after user stop |
| Elapsed | 32 h 12 min (agent's own figure 32h 11m 7.6s, RUN-AUDIT.md:5, measured to its last status) |
| Active turn time | ~20.7 h: elapsed minus two gaps with no model activity, 00:27-04:07Z on 21 Oct (3 h 40 min) and 20:50Z 21 Oct - 04:40Z 22 Oct (7 h 50 min) |
| User messages | (1) runbook prompt 20:47Z; (2) 04:40Z "how much time more this will take if we continue" (turn interrupted 04:48Z); (3) 04:58Z "no neeed to continue, lets finish this where it right now…" |
| Compactions / tokens | 9 compactions; 484.5 M input (479.6 M cached), 1.83 M output (1.28 M reasoning) |
| Tool calls | 2,128 (1,341 exec_command, 696 write_stdin, 234 apply_patch, 204 view_image, 79 sleeps = 3,855 s, 5 image_gen) |
| trueclone commands (281) | status 129, seed 77 (1 plain + 76 `--patches`), score 66 (57 with journey, 7 load-only, 2 arg errors), reads 3, journey --draft 1, capture 1, vendor 1, rules 3 |
| Final exit code | **1** (`.trueclone-run/281-status.log`: next = `score zero --only load`, load stale). Never 0 or 3 |
| REPORT.next.md | does not exist (Next never reached) |
| Deviations | config: effort high (runbook: Extra High), sandbox workspace-write. Agent: own wrapper `run.ps1` with no timeout (allowed, ≥20 min); `rules` ×3 not issued by status (cmd#232/233/237); `seed --patches` run while `reads` was running (cmd#13 vs #14); 2 failed scores from `--only journey load interact` (space list, cmd#20/#131); kept working (score cmd#280) inside the user's "how much longer" turn |

## 2. Ideal vs actual workflow (test plan section 5)

| # | Expected | What happened (time) | Verdict | Evidence |
|---|---|---|---|---|
| Z1 Capture | canvasApp detected, three.js r160, overflow hidden; no own bundle | 20:47:30-20:49:10, once. `meta.canvasApp` = canvas#webgl, three.js r160, bodyOverflow hidden; WARNING canvas-app line; template → port | followed | `.trueclone-run/01-capture.log`; `sites/zero/reference/meta.json` |
| Z2 Journey draft | desktop ~26 checkpoints; phone through both holds | 20:49:23-21:01:28 (12 min). Desktop **30** checkpoints (load…step-26, both holds). Phone **18**, stopped at hold-3 ("Introducing") | partly failed (phone short) | `.trueclone-run/03-journey.log` (last lines) |
| Z3 Agent reads draft | trim/merge; add steps by hand only when the draft stops short | Viewed draft frames during the draft (view_image 20:50-21:00, contact sheets `draft-desktop-1..5.png`); own replay `validate-mobile.mjs` 21:06Z proved the phone journey continues (9 more swipes); phone extended to **27** checkpoints; explicit waits (6 s dwell, `settle:1`) added at 22:06Z. No debug URL / stage parameter in journey.json | followed (late for the timing edit) | `sites/zero/journey.json` (`validation` field), `.trueclone-run/mobile-validation.log` |
| Z4 Reads | motion, reference journey, scenes, shaders | 3 runs: 21:01-21:07, 21:11-21:19, 22:07-22:19, each re-issued by status because journey.json changed after the read. Final: `reference/journey/desktop` 30, `mobile` 27; `reference/scene/` 30 files; `reference/shaders/` 45 frag + 31 vert + INDEX.md | repeated (status-driven, legit) | cmd#5, #14, #31; `12-status.log`, `30-status.log` |
| Z5 Seed | mirror seed: loader + empty canvas | 21:07:55 `seed zero`, 21:09:48 `vendor zero` (three r160) | followed | cmd#7, #10 |
| Z6 Port | script.js stage by stage from reference/scene + shaders; virtual scroll with site lerp; `score --only journey` after each | Behaviours + first script.js written 21:08-21:17; first full score 21:19-21:34 = journey 68.96/65.21. Then 56 fix→seed→score cycles to 22 Oct 04:55. Behaviours: 28 lines citing `8ad15d-main-…pretty.js:<line>` and `shaders/NNN`. Port includes gesture recognizer, SCROLL_LERP .075, stage lengths, holds 3 s / 1.5 s, orthographic map pan/zoom | followed, but loop never ends (see Z7) | `sites/zero/notes.md` ## Behaviours; `sites/zero/clone/script.js` (89.6 KB) + 26 patches |
| Z7 Set-aside | 3 tries without gain per checkpoint → Findings | **Never happened.** status issued 56 journey checkpoints; the same key was never issued more than 2 times in a row, and the retry memory never held a count (`compare/status-steps.json` = only `__last`) | failed (tool) | `status.mjs:212-218, 262-269`; status logs 17…275 |
| Z8 Review, Next | verdict per checkpoint at desktop + mobile; `next --verify` | No review step was ever issued; 0/30 desktop, 0/27 mobile verdicts; Next not reached | skipped (never reached) | `sites/zero/REPORT.md` Review row; no `REPORT.next.md` |
| End | exit 3 (expected), honest Findings | Stopped by the user at exit 1 after 32 h; final message says "unfinished" and matches REPORT.md | failed (no terminal state) | `281-status.log`; session task_complete 04:59:40Z |

## 3. Final results vs expectations

REPORT.md (final, written by score cmd#280 at 04:55Z). REPORT.next.md: not produced.

| Check | Desktop | Tablet | Mobile | Laptop° | Wide° | Status | Target | rc.3 | Expect rc.4 |
|---|---|---|---|---|---|---|---|---|---|
| Layout | – | – | – | – | – | – | n/a for apps | – | – |
| Journey (mean) | 90.5 | – | 88.91 | – | – | below | ≥ 95 | not run (0.5 stopped canvas apps) | 25-50 |
| Journey (worst) | step-13 77.61 | – | step-15 77.9 | – | – | below | ≥ 80 | – | 5-30 |
| Scroll / motion / detail / hovers | – | – | – | – | – | – | n/a | – | – |
| Load | 96.76 | 96.57 | not scored (ref unstable ±33.15) | 97.73 | 97.02 | below (stale: measured 20:36Z 21 Oct, before last change) | ≥ 95 | – | 90-99 |
| Review (by eye) | 0/30 | – | 0/27 | – | – | below | all frames closed | – | verdicts per checkpoint |
| Notes (behaviours) | 28 cited | | | | | pass | | | |
| Coverage | 1/1 scripts, 0/0 curves | | | | | pass | | | |
| Interactions | no scenarios | | | | | – | as documents | | |
| By eye (evaluator) | ~65 | | ~60 | | | | – | Opus ~20-30 predicted | 20-40 |
| Exit / time | exit 1 (user stop), 32.2 h elapsed / ~20.7 h active | | | | | | exit 0/3 | | exit 3, 120-240 min |

Verified vs claimed:
- Verified from `compare/journey/report.json` (at 04:55:17Z): desktop 90.5 (30 checkpoints, only step-13 < 80),
  mobile 88.91 (27, only step-15 < 80). Agent's final message matches (90.50 / 88.91 / 77.61 / 77.90).
- Verified: in template mode the journey number is the canvas-histogram score only (`journey.mjs:459`). The same
  report's **pixel** means are 63.22 desktop / 58.49 mobile (computed from `checkpoints[].pixels`).
- Verified: load 96.57-97.73 from cmd#274 (`274-score.log`), stale since seed cmd#276-278. "Every checkpoint above 80"
  claimed for score 239 is corroborated by status 240 issuing the worst checkpoint at 80.26%.
- Agent's "0/57 frames closed", "no set-asides", "Next not reached", "9 tool defects": all match artifacts.

## 4. Findings

**ZERO-1** | A verified success | App-mode front half works on a real third-party canvas app.
- Expected: Z1-Z5 per section 5. Observed: canvas app detected; draft passed the draw-a-zero gate and both holds on
  desktop (30 checkpoints); reads recorded 30/27 checkpoint frames, a scene JSON per checkpoint and 76 shader sources;
  the port reached journey 90.5/88.9 and, by eye, a recognisable template copy of every stage (section 7).
- Evidence: `01-capture.log`, `03-journey.log`, `31-reads.log`, `reference/scene/`, `reference/shaders/INDEX.md`,
  `compare/review/journey-*/`. Impact: accuracy (positive). The section-5 prediction (25-50, by eye 20-40) was far too low.

**ZERO-2** | B, unresolved (same class as rc.3 **B2**, "keys … reset") | The journey loop cannot terminate: set-aside never triggers.
- Expected: three tries with no gain per checkpoint → set aside → exit 3. Observed: 56 issued checkpoints over 23 h;
  the issued key changed almost every cycle (max 2 in a row: e.g. mobile step-19 at cmd#52/#56, desktop step-8 at
  #137/#142, mobile step-15 at #260/#267); `compare/status-steps.json` holds only `__last`, never a count.
- Root cause (high confidence): status adds **one** journey candidate, keyed by the current worst checkpoint
  (`status.mjs:208-218`); at the next status, if that key is no longer the worst it is absent from `candidates` and the
  memory is deleted as "fixed" (`status.mjs:263-264`). Any >0.5 gain also resets the count (`status.mjs:266-267`).
  With a mean target (95) and a floor (80), fixing the worst lifts it above the next one, so the key moves every
  cycle while the mean stays ~90. Since score 239 (18:51Z 21 Oct) every checkpoint but one was ≥ 80; the open gap is
  the mean, which no per-checkpoint key tracks. The agent reproduced this (`.trueclone-run/status-retry-audit.mjs`,
  `evidence/status-retry-audit.json`), which I confirmed by reading the code.
- Stage C11/Z7. Impact: time (≈ 6.5 active h on a plateau, plus 7.8 idle h with the run still "open"); UX (user had
  to stop it). Severity **blocker**. Cause location: missing decision rule (tool).
- Fix (tool, `status.mjs`): track the journey per check+viewport (`journey:<vp>` with the **mean** as value) in
  addition to the worst checkpoint, and count a try as no-gain unless the mean rises ≥ 0.5; never delete memory for a
  key just because another checkpoint became worse (keep all journey keys until the check passes). Test: fixture app
  whose clone alternates which checkpoint is worst while the mean is flat → status must exit 3 after 3 scored tries.

**ZERO-3** | C, not previously documented | In app mode the review is never issued while the journey fails.
- Expected (Z8, skill: "review as soon as the layout holds"): verdicts per checkpoint. Observed: 0/57 verdicts in 32 h.
- Root cause (high): for apps `review-size` steps are skipped (`status.mjs:192`, `if (!app)`) and `review-verdicts` is
  the last candidate (`status.mjs:252-255`), after `journey`; combined with ZERO-2 it is unreachable. Exit 0 is also
  impossible (review is a gate). Severity major. Location: missing decision rule.
- Fix: in app mode issue `review-verdicts` (journey frames) right after the first full score, before the journey fix
  loop, and again after each set-aside. Test: app fixture with a failing journey → status names review verdicts
  before the second journey fix.

**ZERO-4** | C, not previously documented | Template journey score is a position-free colour histogram; it rewards palette fitting.
- Observed: `journey.mjs:459` uses `canvas` only in template mode; `canvasSimilarity` (`lib.mjs:538-555`) is 50% a
  64-bin (2 bits/channel) histogram intersection + 50% "ink coverage". Final canvas means 90.5/88.9 vs pixel means
  63.2/58.5; e.g. desktop step-24..26 score 89-92 with pixels 27-29 (different city art). Hard bin edges: RGB 127 vs 128
  falls in different bins (agent's audit `evidence/canvas-histogram-audit.json`; consistent with the code). The agent
  saw the divergence itself ("phone intro fell 79.87->66.31 despite pixels improving", notes.md ## Iterations).
- Impact: accuracy of verification (high numbers on different pictures; 95 unreachable with replaced art, so the
  loop chases colour statistics). Severity major. Location: weak verification (tool).
- Fix: template journey = mean of canvas and a structure term (e.g. downscaled luminance/edge SSIM of the canvas),
  soft-binned histograms; and a template-mode target that a port with replaced art can meet (e.g. mean ≥ 85, worst ≥ 70),
  or report the template journey as informational with review verdicts as the gate. Test: same scene with a recoloured
  palette must score lower than the same palette with rearranged geometry only if geometry differs; two identical
  frames 1 RGB level apart must score ≥ 99.

**ZERO-5** | C, not previously documented | From mid-run, the agent fitted the clone's statistics to reference pixels and shipped data extracted from the site's assets.
- What is ported from behaviour (verified): notes.md ## Behaviours (28 lines) gives source rules with file:line
  (circle gate thresholds, SCROLL_LERP .075, stage lengths [175,250,325,368]×innerHeight, hold 3 s/1.5 s, map
  orthographic camera, garden layer depths from `pretty29480-29526`); script.js builds the renderer, stage machine and
  UI from those rules; art was generated (5 image_gen calls, prompts in `evidence/imagegen-prompts.md`, no reference
  image supplied).
- What is fitted (verified): 157 agent `.mjs` probes in `.trueclone-run/`; 55 hook `__THREE_DEVTOOLS__` on the live
  site, 58 compute histograms/quantiles/CDFs, 75 take the machine-wide timing lock. `fit-city-colour-style.mjs`
  solves 32 colour-offset nodes (8×4 grid) by Newton iteration so the clone's city cell means equal the source's
  rendered cell means (`evidence/city-grid-source.json`, sampled from the live 8192×4096 KTX2 map texture via
  `read-city-palette-gpu.mjs`) and writes `clone/patches/31-city-colour-style.js`. Likewise `29-city-palette.js`
  ("matched to aggregate source palette"), `30-map-shadow-profile.js` (source density CDF LUT), `19-red-palette.js`
  (per-frame source colour quantiles), `12-cloud-opacity.js` (source opacity histograms).
- Derived from original assets: `13-red-motion.js` (527 KB) and `15-green-motion.js` (1.7 MB) are base64 gzip camera
  and joint animation channels read from the site's GLB models ("Read camera_2/human_hand_2/glass_shards GLB node
  transforms, animation channels", notes.md ## Iterations); cloud transforms from the "recovered source seeded
  constructor stream".
- Judgment: the scenes are ported from code for structure and behaviour (not pixel gaming of the loop: every score
  followed a real clone change, no re-score loops), but after ~13:00Z on 21 Oct most cycles tuned art statistics to
  the reference's pixels to move a histogram score, which is fitting the metric, not porting behaviour. Keyframe
  tracks and fitted palettes derived from the owner's media sit in a grey zone for template mode ("no original media").
- Impact: time (most of the last 8 active h), accuracy claims inflated by ZERO-4. Severity major. Location: skill
  wording (no rule) + weak verification. Fix (skill): "Template: never sample or fit the reference's pixels, textures,
  model files or animation data into the clone; constants come from the site's code; art is your own." Tool: flag
  clone files containing large base64 blobs or arrays (> 50 KB) in template mode. Test: rerun zero; grep
  `.trueclone-run` and patches for `__THREE_DEVTOOLS__` probes and LUTs = none.

**ZERO-6** | D unresolved | Two long silent gaps inside the open turn.
- Observed: no model event between 00:27:22Z and 04:07:17Z (21 Oct) and between 20:50:51Z (21 Oct) and the user's
  message at 04:40:56Z (22 Oct); after each, cached input fell to 23,680 tokens (cache expired); after the second the
  backgrounded probe was gone ("Unknown process id 29290"). Session file: `summary.file` of the timeline.
- Hypothesis (medium): host sleep or the Codex app suspended the session overnight (IST 05:57-09:37 and 02:20-10:10).
  Alternative: a stalled client/API stream. Not the timing lock: no score log contains a lock-wait line.
- Impact: 11.5 h of the 32.2 h elapsed. Location: environment/harness. Fix (harness): keep-awake during runs; log
  wall vs active time in the run summary.

**ZERO-7** | B, unresolved (Z2 target "phone through both holds") | Phone draft stops after hold-3 without a warning.
- Observed: phone draft 18 checkpoints ending at hold-3; the 10-min/80-turn limits were not the cause: the loop stops
  when 3 swipes change nothing (`journey.mjs:347`) during the long post-hold transition, and the limit WARNING prints
  only when `quiet < 3` (`journey.mjs:352`), so nothing told the agent. The agent proved continuation by hand
  (`mobile-validation.log`, `mobile-continued-1..9.png`) and extended to 27. Severity minor (agent recovered, +~1 h).
- Fix (tool): after a hold/gate, wait for the transition (frames still for ≥ 2 s) before counting quiet swipes; print
  "stopped: 3 unchanged inputs" too. Test: zero phone draft reaches "Hired" with ≥ 25 checkpoints.

**ZERO-8** | C, not previously documented (minor tool defects proven by the agent, confirmed in source)
- `report.mjs:293` open-frame paths `compare/review/<size>/<id>.png` do not exist for apps (files are
  `compare/review/journey-<size>/NN-<name>.png`); list also truncated to 40 of 57.
- `report.mjs:279` "Scored" reads `layout?.at`, so app reports show "–" (visible in REPORT.md).
- Next parity in status: `pair()` only flags `app < clone - slack` (`status.mjs:288`), and no journey report is
  compared, so an app-mode Next could pass while its journey differs (static audit; Next never ran).
- `settle()` (`journey.mjs:137-146`) runs independently per side (agent: 6.4 s vs 1.0 s waits at phone step-19),
  so drifting scenes are sampled at different times; agent worked around with fixed dwells.
- Fix each in tool; tests: app REPORT links resolve; Scored shows the journey timestamp; Next with journey −10 → gap.

**ZERO-9** | C, agent execution | Large overhead outside the loop.
- 157 probe scripts, 285 non-command files in `.trueclone-run/` and 285 in `sites/zero/evidence/`; `RUN-AUDIT.md`
  250 KB / 767 lines, generated by `final-report.mjs` maintained from 07:13Z on 21 Oct; notes.md 90 KB. Probes held the
  machine-wide timing lock (75 scripts call `withMachineLock`), which could delay the four concurrent runs' load
  measurements (not quantified). Impact: time, machine contention. Severity minor-major. Fix (skill): probes of the
  live site must not take the timing lock; cap ad-hoc probes per step.

## 5. Time and loops

| Phase | Start-end (UTC) | Duration |
|---|---|---|
| Capture | 20:47:30-20:49:10 | 1.7 min |
| Journey draft (+ agent viewing draft frames) | 20:49:23-21:01:28 | 12 min |
| Reads #1 + phone validation | 21:01:54-21:07:24 | 5.5 min |
| Seed + vendor | 21:07:55-21:09:51 | 2 min |
| Behaviours + script.js + reads #2 (parallel) | 21:08-21:19:09 | 11 min |
| First full score | 21:19:35-21:34:07 | 14.5 min |
| Fix loop A (rise 69→78; incl. reads #3 22:07-22:19) | 21:34-00:27 | 2 h 53 min |
| Idle gap 1 | 00:27-04:07 | 3 h 40 min |
| Fix loop B (rise 74.5→88.9 / 72.6→88.2) | 04:07-13:58 | 9 h 51 min |
| Plateau (score 175 onward, ±1.5) | 13:58-20:50 | 6 h 52 min |
| Idle gap 2 | 20:50-04:40 (22 Oct) | 7 h 50 min |
| User question turn; score cmd#280 | 04:40-04:55 | 15 min |
| Wrap-up (status #281, RUN-AUDIT export, final message) | 04:58-04:59:40 | 2 min (audit script built earlier) |

- Inside trueclone: 11.4 h (score 10.6 h, reads 0.42 h, draft 0.2 h, status 0.08 h, seed 0.06 h). Agent work outside
  commands ≈ 9.3 h of the ~20.7 active h (sleeps 1.07 h). No timing-lock waits in any score log.
- Cycles: 56 fix→seed→score cycles after the first score, ≈ 21 min each on average (score ≈ 11-12 min, the figure the
  agent quoted to the user). 76 `seed --patches` builds.
- Every cycle changed `clone/` (a seed preceded each score; no unchanged re-score). Each targeted one checkpoint
  (status's worst); typical result: target up 10-60 points, another checkpoint down (notes.md ## Iterations, e.g.
  "phone17 regressed 94.62->71.42" at score 249).
- Trend (journey desktop / mobile): 68.96/65.21 (21:34) → 77.71/72.43 (00:20) → 82.45/81.69 (10:06) → 88.03/86.46
  (12:34) → 88.90/88.15 (13:58) → 91.34/88.93 max (18:51) → 90.50/88.91 final (04:55). Load: 49 → 58-60 (08:14) →
  94-99 (13:25) → 96.6-97.8 pass (18:51 onward).
- Acceptance: never met (mean < 95 at every score). Floor ≥ 80 at every checkpoint first at score 239 (18:51Z).
- Plateau: from score 175 (13:58Z): 19 more journey scores, desktop 89.2-91.3, mobile 86.6-88.9; spent ≈ 6.9 active h
  + 7.8 idle h; the work there was mostly palette/CDF/tone fitting (ZERO-5).
- Could the loop terminate? Not under rc.4 status (ZERO-2): no key ever reached count 3; without the user stop it
  would have continued indefinitely (agent estimated "another 2-4 hours, low confidence").

## 6. Measured series

`C:\dev\rea-lab\docs\eval-rc4\projects\zero.series.json` (463 points): `checks_below_target` (64, from every score
log: 3 throughout, 2 after each fresh passing load from score 239), `journey_desktop` / `journey_mobile` (57 each),
`load_tablet|desktop|laptop|wide` (56 each), `status_issued_worst_checkpoint_pct` (56, the checkpoint status issued,
with size and name in `source`), and final `review_open_frames` 57, `journey_worst_*`, `journey_pixels_mean_*`.
No `next_checks_below_target` (no REPORT.next.md).

## 7. Score sheet

| # | Item | Score | Why |
|---|---|---|---|
| 1 | C0-C1 install, capture once | 2 | one capture, right (no) flags, canvas app named |
| 2 | C3 journey draft read and fixed | 2 | frames viewed, phone continuation proven and added, waits added; no debug URL |
| 3 | C4-C6 reads/seed in one go | 1 | reads ran 3× because journey.json was edited after reading; seed run during reads |
| 4 | C7-C9 Behaviours with file:line; port | 2 | 28 cited rules from the bundle and shaders; no pasted site code (but see ZERO-5 on extracted data) |
| 5 | C11 tries change the clone, no gaming, set-asides | 1 | every try changed clone/ and no re-score loops; but late cycles fitted reference statistics; no set-aside (tool) |
| 6 | C13 verdicts by eye | 0 | 0/57 verdicts (never issued, ZERO-3) |
| 7 | C14 Findings complete and true | 2 | extensive; 9 tool-defect claims confirmed or plausible in source; limits stated honestly |
| 8 | C15 Next within a point | 0 | not reached |
| 9 | C16 end at 0/3; report matches | 1 | user-stopped at exit 1; final message accurate and says "unfinished" |
| 10 | zero check-ins | 2 | the agent never asked; the user intervened after 32 h |
| 11 | numbers within Expect | 2 | journey 90.5/88.9 above the 25-50 band (better, not worse; strict reading = 0); load 96.6-97.7 in 90-99 |
| 12 | by eye | 2 | evaluator inspection of saved frames, not a live render: desktop ~65, mobile ~60 vs expect 20-40. Composition, camera, palette, HUD and typography follow the original at every stage (gate, red hands/glass, green paper, clouds, map); words, city art and hands are template replacements |
| 13 | time within budget | 0 | 32.2 h elapsed (~20.7 h active) vs 120-240 min |
| | **Total** | **17/26 → 65/100** | |

Own scores (0-10): implementation quality **7** (a convincing template port of a hard canvas app; partly tuned to
reference statistics); workflow adherence **6** (followed status exactly, but long probe side-quests); verification
quality **4** (no verdicts; leaned on a lenient metric it knew diverged from pixels); time efficiency **1**; handoff
accuracy **9** (numbers, defects and "unfinished" match the artifacts).

## 8. Top recommendations

1. **Make app-mode set-aside terminate** (ZERO-2): key the journey by viewport with the mean as value; keep memory
   for every journey key; three scored no-gain tries on the mean → set aside. Release-blocker: **yes**.
2. **Issue journey review verdicts right after the first full score** in app mode (ZERO-3), so eyes precede the loop
   and exit 0 is reachable. Release-blocker: **yes**.
3. **Fix the template journey metric and target** (ZERO-4): add a structure term, soft bins; set a template target a
   port can meet (or gate on review). Release-blocker: yes for advertising canvas-app template clones.
4. **Skill rule against fitting reference pixels/media in template mode** (ZERO-5), plus a tool lint for big data
   blobs in clone/. Release-blocker: no.
5. **Harness: keep-awake and active-time logging; a run wall-clock budget** that status turns into set-asides (e.g.
   after N hours with < 1 point gain, exit 3). Release-blocker: no.
6. **Journey draft: wait out post-gate transitions and always print why it stopped** (ZERO-7); fix the report paths
   and "Scored" for apps (ZERO-8). Release-blocker: no.

Could not determine: the cause of the two silent gaps (sleep vs client stall); whether the agent's probes holding the
timing lock delayed other runs; the reference's own by-eye fidelity live (only saved frames inspected).
