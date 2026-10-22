# RC4 evaluation: varsity (exact, 2 pages, Webflow + GSAP + three.js r160)

Evidence: `C:\dev\tc-tests\rc4-varsity` (abbreviated `site/` = `sites/varsity/`), timeline
`docs/eval-rc4/data/varsity.timeline.json` (TL), transcript `C:\dev\tc-tests\exact responses - rc4.txt` lines 1607-4180
(TR:line), CLI source `node_modules/@trueclone/cli/scripts/` (src/). Times UTC unless marked IST.
Legend: **Obs** = seen in a file, **Inf** = my reasoning, **Rec** = recommendation.

## 1. Run facts

| Item | Value |
|---|---|
| Site / mode / flags | https://www.varsity.vc/ as `varsity`, `--mode exact --permission "site owner"`; routes `/`, `/legal` (TL steps 0-1) |
| Start | 2026-10-20 21:08:31Z = 21 Oct 02:38:31 IST (TL summary.turns[0].start) |
| Terminal status | exit **0** at 2026-10-21 08:30:59.54Z (site/terminal-status.json; site/final-status.txt; TL step 209 `status` exit [0,0]) |
| End of turn | 2026-10-21 08:36:37Z = 14:06:37 IST (final message) |
| Elapsed (wall) | **11 h 28 m** (688 min) |
| Machine/API stall | **3 h 37 m** with no event at all: last event 00:27:25Z (reasoning item), next 04:04:34Z (raw session JSONL). The zero and allbirds runs stall in the same window (00:26-04:07Z): environment, not agent (Obs, TL calls of all five runs) |
| Active turn time | **~7 h 51 m** (471 min) = wall minus stall |
| User messages | 1 (the runbook prompt, "Clone https://www.varsity.vc/ with trueclone, in exact mode..."); no check-ins, no questions |
| Compactions | 5 (22:25, 23:26, 04:11, 06:07, 08:10) |
| Tokens | 233.6 M total: 233.2 M input (230.5 M cached), 423 k output, 229 k reasoning |
| Tool calls | 1013 (exec 739, wait 268, sleep 6; sleeps 270 s) |
| trueclone commands (211) | status 81, score 34, review 27, brief 26, report 16, seed 10 (1 + 9 `--patches`), next 4, explain 4, capture 2, vendor 2, states 2 (reference-self replays), reads 1, design 1, curves 1 |
| Final exit code | **0** "Every gate passes" while `REPORT.next.md` says "1 check(s) below target" (site/REPORT.next.md:9, :21) |
| Deviations: config | model gpt-6.1-sol effort **high** (runbook: Extra High); sandbox network off, so capture #1 failed on DNS and every browser command ran with `require_escalated` (TR:1620; TL 21:08:39) |
| Deviations: agent | loaded non-trueclone skills ("brainstorming and Ponytail", TR:1682; TL 21:23:12 reads `.codex/plugins/cache/ponytail/.../SKILL.md`); fetched one asset by hand (`Invoke-WebRequest ... stories-close.svg -OutFile clone/patches/story-close.svg`, TL 04:07:21); used the internal `TC_COMPARE` env var to isolate two reference-self replays (TR: "Ran $env:TC_COMPARE = 'compare-reference-self-2'"); ran `score` with `--step-minutes 60` from 05:19 on; wrote 24 own `.mjs` scripts in site/ (21 `diagnose-*.mjs` that open Chrome via `lib.mjs`, plus `update-review.mjs`, `repair-motion-map.mjs`, `build-final-audit.mjs`) |

## 2. Ideal vs actual workflow (C0-C16)

| # | Expected | What happened (UTC) | Verdict | Evidence |
|---|---|---|---|---|
| C0 | init, doctor ok | Pre-installed by user; agent did not touch AGENTS.md or skill | followed | no patch or Set-Content on AGENTS.md / SKILL.md in any TL call |
| C1 | capture, 2 routes, no overlay | 21:08:39 capture failed (sandbox DNS), 21:08:52 re-run escalated, done 21:14:22: 2 routes, 5 sizes, 64 assets, 34 scripts, 9 interactions | followed (2nd run = environment) | site/RUN.md rows 1-2; TL steps 0-1 |
| C2 | n/a | no overlay warning | n/a | status never issued `--hide` (TL said 3-4) |
| C3 | n/a (documents) | - | n/a | - |
| C4 | one `reads` | 21:14:32-21:22:26, one call | followed | TL step 3 |
| C5 | design | 21:22:31 | followed | TL step 5 |
| C6 | seed, /legal at own path, canvases marked | 21:22:42; `/legal` scored at own address throughout | followed | TL step 7; REPORT.md Routes row |
| C7 | brief per section, in order | briefs 1-8 in 2 min (21:22:56-21:24:51), one per status | followed (fast) | TL steps 9-23 |
| C8 | Behaviours with file:line | written after each brief (8 cited by 21:25), grew to 20 cited | followed | TL said 27, 213 |
| C9 | script.js ports the rules | first script.js in one patch at 21:27:15; first score states 78.9-82.1 shows a thin first port; the cords, labels, stories, team, portfolio were ported later inside the review loop (22:51-04:27) | late | TL calls 21:27:15; steps.txt states values |
| C10 | first full score | 21:27:26-21:38:18 (10.8 min): 7 below target | followed | TL said 34 |
| C11 | fix loop in order; every try changes clone; set aside after 3 | layout laptop 21:38-21:58 (fixed), then review-frame steps; every scored try changed clone/ (B1 memory: max count 2, site/compare/status-steps.json); no set-asides; **one Next re-verify on an unchanged clone (08:12, clone last changed 07:09:32) turned status from "make the Next.js app match" into exit 0** | repeated | TL steps 28-171, 208; `find clone -newer` |
| C12 | `curves --draft`, motion measured | issued 05:09:46 after every other check passed; draft defective (duplicate names, non-finite ranges), agent repaired the map, motion 98.1/100/99 at 05:25 | followed (tool defect worked around) | TL said 210, steps.txt 05:23-05:25 |
| C13 | review all sizes, verdicts with tokens, reasons < 85% | 5 sizes + /legal wide/mobile, 22:04-22:25; 217 frames closed (207 same, 10 "tool" with evidence files for the intro frames); verdict lines once written via `update-review.mjs` with hand-written texts | followed | site/notes.md:50-275; site/update-review.mjs |
| C14 | Findings complete | 33 Findings lines (site/REPORT.md:51-83) + TOOL-DEFECTS.md (18) | followed (verbose) | site/notes.md:276 |
| C15 | Next within 1 point | 4 verifies (05:41, 06:29, 07:36, 08:12). Final: canvases desktop 95.79 vs 98.78 and frame 50.28 (<60); load desktop/mobile/laptop 1.04-1.24 below clone | failed (tool allowed it) | site/REPORT.next.md:117,121 |
| C16 | exit 0 or 3; report matches | exit 0 at 08:30:59; final message discloses the contradiction | followed (false exit 0 is the tool's) | TR:4140, 4180 |

## 3. Final results vs expectations

REPORT.md (HTML clone, scored 07:14-07:26Z) and REPORT.next.md (Next app, scored 08:15Z). Test plan columns from
docs/test-plan-0.5-rc4.md:183-195.

| Check | Target | rc.3 | Expect rc.4 | REPORT.md (d/t/m/lap/wide) | REPORT.next.md | Verdict |
|---|---|---|---|---|---|---|
| Layout (structure) | ≥98 | 97.2-99.96 | 98-100 | 100/100/100/100/100 | 100 all | within |
| Scroll states | ≥95, frame ≥80 | 97.4-99.3 | 96-99 | 99.51/99.4/98.37/99.34/99.69 | 99.52/99.38/98.39/99.34/99.77 | within |
| Canvases | ≥90, frame ≥60 | 91.5-98.7 (38) | 88-97, worst ≥60 | 98.78/98.53/96.97/98.98/99.52; worst 94.92/91.65/72.51/96.72/97.87 | 95.79/97.17/96.71/99.41/99.52; worst **50.28**/75.26/75.41/97.79/98.07 | HTML within; Next **below target** |
| Motion curves | ≥95 | not scored | 70-90, set aside | 98.4/100/99 | 98.4/100/99.2 | above expect (map repaired by agent) |
| Detail | ≥95 | ok | 96-100 | 100/100/100 | 100/100/100 | within |
| Hovers | ≥90 | 100 | 95-100 | 100 | 100 | within |
| Load | ≥95 | ok | 95-99 | 99.87/99.74/98.25/96.66/98.19 | 98.63/98.99/97.21/95.52/99.13 | within; Next 1.04-1.24 below clone |
| Interactions | all | 6/6 | 6-9 | 9/9 | 9/9 | within |
| Review | all frames | - | - | 36/36/60/40/45 | same rows (HTML review, report.mjs:67) | pass |
| Notes / Coverage | - | - | - | 20 cited; 9/9 scripts, 69/69 curves | same | pass |
| Routes `/legal` | ≥98 / ≥95 | - | - | 100/99.99 at all sizes | same | pass |
| Next = clone ±1 | ±1 | detail 97.7 vs 100 | within 1 | - | canvases −3.0 mean (desktop), load −1.04..−1.24 | **not met** |
| By eye | - | ~85 | 85-90 | evaluator ~92 (section 7) | - | above |
| Exit, time | - | 3, 183 min | **3**, 120-200 | **0**, 688 min wall / 471 active | - | exit wrong (tool), time 2.4-3.4x |

Verified by artifacts: every REPORT value above matches `site/compare/states/report.mask.json`,
`site/compare-next/states/report.mask.json` and `site/compare-next/verdict.json` (canvases `pass:false`). Reference-self
replays verified from `site/compare-reference-self-{1,2}/states/report.mask.json` and by viewing desktop `17.png`.
Only claimed: "all 79 app frames manually inspected" (VERDICTS-209.md exists, 83 lines; inspection itself unverifiable);
"no generated clone/index.html hand-edited" (index.html mtime 07:09:32 coincides with `seed --patches` at 07:09:26, consistent).

## 4. Findings

**VAR-1** | C, not previously documented (gap in the A8 fix) | severity **major** | release-blocker
- Expected: exit 0 only when every gate passes, including Next "within a point everywhere" (SKILL.md:129, :155).
- Observed: status exit 0 "Every gate passes" (08:30:59) while REPORT.next.md says "1 check(s) below target", canvas desktop y 7650 at 50.28 (<60) and mean 95.79 vs clone 98.78.
- Root cause (confirmed in source, confidence high): `status.mjs:282-284` reads `compare-next/verdict.json` only for its `.at` freshness, never its `checks[].pass`; the parity pairs at `status.mjs:290-314` cover layout, scroll-state mean, detail, hovers, load, interactions, review frames, but **not canvases (mean or worst) nor motion curves**. Earlier (06:44, Next #2) status also ignored the mobile canvas 50.74 failure.
- Stage C15/C16. Impact: accuracy + trust (false terminal pass). Cause location: tool defect.
- Fix (tool): in step 8, fail on any `nextVerdict.checks` with `pass:false` whose clone counterpart passes, and add `canvas` and `canvasWorst` (per viewport) and `curves` to the pairs. Test: fixture where the app's canvas frame is blanked; status must not exit 0 and must name `canvases desktop`.

**VAR-2** | C, not previously documented (consequence of the A5 fix) | **major** | release-blocker
- Expected: a canvas frame floor that a faithful clone can meet ("do not chase a number inside the noise", SKILL.md:126).
- Observed: the live site replayed against its own capture fails the floor at the same frame: desktop y 7650 51.55 / 49.21, mobile y 7596-7597 44.65 / 48.23 (compare-reference-self-1/-2). The same frame swings run to run: Next desktop 92.81 → 49.57 → 50.28, Next mobile 50.74 → 87.13 → 75.41, HTML desktop 49.92 → 67.63 → 95.97 (evidence JSONs 184/187/192/202, final reports). Viewing `17.png`: the captured reference shows three cords, the live replay one; the scene is a time-integrated physics exit (Obs).
- Root cause (high): `report.mjs:35` CANVAS_FLOOR=60 on a single sample; `lib.mjs:538-556` canvasSimilarity is half ink-coverage, which flips when a cord leaves the view; no reference self-repeat for canvases (routes have one, rc.3 C7).
- Impact: time (~1.5 h of cord-controller/physics work 06:48-07:36 and two replays chasing a noise frame), accuracy (noise passes and noise fails). Cause: tool defect / weak verification.
- Fix (tool): at `reads`, capture states twice; a canvas frame whose reference-vs-reference similarity is below the floor is marked unstable and judged against its own self-similarity (or excluded, listed in REPORT). Test: varsity capture: y 7650 desktop is marked unstable; a seeded clone passes; a clone with the cords deleted still fails the other frames.

**VAR-3** | C, not previously documented | **major** | release-blocker
- Observed (verified false pass): `score --only states --viewport desktop` (07:09) rewrote `compare/states/report.mask.json` with the desktop entry only (compare/states-192-partial-evidence.json). The next report (07:22:42) said "every scored check meets its target" and status (07:23:29) moved on to `next --verify` with 4 of 5 state/canvas widths unmeasured. The agent overrode status and ran `--only states --fresh` (TL step 195).
- Root cause (high): `states.mjs:155` writes the filtered aggregate over the full one; `report.mjs:128-129` `present()`/`all()` judge only widths present.
- Fix (tool): merge per-viewport results into the existing report (or keep `missing` widths failing/stale). Test: run `score --only states --viewport desktop` on a passing clone; REPORT must still show 5 widths, or mark the other 4 "not measured" and status must request them.

**VAR-4** | C, not previously documented | **major**
- Observed: `score` exit 0 although its load child exited 1 (RUN 133: 441 s; Next RUN 173: 591 s; steps.txt 04:24:58, 06:05:21). Next 173's REPORT.next.md said "every scored check meets its target" with load "not measured" (compare/REPORT-next-173-evidence.md:9, :25), and status's parity skipped the missing load (`status.mjs:288` compares only when both values are numbers).
- Root cause (high): `score.mjs:106-160` never sets a non-zero exit; prints only the last 4 child lines (`:131`); `report.mjs:124-125` drops a check whose value is null from `checks`.
- Fix (tool): exit non-zero when any child fails; a check that was requested and produced no value is a failing "not measured" row; status treats a missing Next value as a gap. Test: kill `load.mjs` mid-run; REPORT verdict must not be "every scored check meets its target".

**VAR-5** | C, not previously documented (motion first measured in rc.4; rc.3 E) | **major**
- Observed: the drafted motion map has 88 entries, 53 sharing a duplicated name, and 72 scroll ranges with `"undefined"` or `"+=5600"` (site/compare/motion-map-generated-evidence.json). Agent repaired names and ranges from live triggers (site/repair-motion-map.mjs) before scoring.
- Root cause (high): `curves.mjs:59` names entries `section + sel` (not unique) and stringifies function/relative positions; caches key by name (`curves.mjs:249-268`); resolver parses only two position words (`curves.mjs:187-195`), yielding NaN.
- Fix (tool): unique names (append index), resolve ranges from live ScrollTrigger `start/end` numbers per viewport at draft time. Test: `curves --draft` on varsity yields 0 duplicate names and only finite ranges.

**VAR-6** | C, not previously documented | minor (time)
- Observed: every "fix review frame" step is followed, once clone/ changes, by re-scoring every failing check (`status.mjs:132-140`) including the 5-width cold load (85-432 s per run) that was failing for an unrelated reason. 34 score commands; HTML scoring alone ~193 min (estimate below). Review fixes for intro frames needed 10 "tool" verdicts because review shots count from each side's load event (`review.mjs:96-103`) while the reference intro starts 245-335 ms before load (notes.md:126, :200).
- Fix (tool): after a review-frame step, re-measure only checks whose inputs the change can touch, or batch; anchor load frames to first paint/navigation for both sides. Test: varsity intro frames match at equal age without "tool" verdicts.

**VAR-7** | B, partially improved (rc.3 B1) | minor
- Observed: exit 0 came from a re-verify of an unchanged app (Next #3 07:36 gaps: load desktop 97.82 vs 99.87 and mobile review frames 27/31/33; Next #4 08:12 on the same clone, gaps vanished: load 98.63 within the 2-point slack). B1 stops unchanged re-scores from counting as tries, but not from re-rolling a noisy check into a pass.
- Cause: tool (no repeat-confirmation for a pass after a fail on unchanged input) + agent (C11 red flag, disclosed honestly in Findings).
- Fix (tool): a gap that disappears on an unchanged clone needs a second confirming run (or is reported as unstable). Test: re-verify twice on unchanged input; status requires both to agree.

**VAR-8** | A, verified success (targeted issues resolved: A5, A10, D2, C4, B4, rc.3 E motion)
- Canvas floor routes a step (`port the canvas scene at y 7650 (desktop): it draws 49.92%`, TL said 259; portfolio frame 46.45 caught at 23:19, TR line "canvas average is now 92.98%"); stories shadow-DOM cards in review (frames 26-29 "between-1"); /legal Back passes 9/9 (inline head boot kept); script names by URL hash (`369690-...700.js`); Notes edits did not reopen Next; motion scored for the first time.

**VAR-9** | A, verified success
- Clone quality: HTML clone passes every gate at all 5 sizes including held-out laptop/wide, 217 review frames closed, interactions 9/9, coverage 9/9 scripts and 69/69 curves; cord scenes and team/stories/portfolio behaviours ported from source with file:line (notes.md:12-45). The agent's verification was unusually rigorous: reference-vs-reference replays, equal-age intro captures, paired operation checks.

**VAR-10** | D, unresolved observation
- 3 h 37 m stall (00:27:25-04:04:34Z) with no events in the session file; zero and allbirds stalled in the same window. Strongest hypothesis: host sleep or a Codex/API outage (environment). Not attributable from available files.
- Machine-lock waits invisible: `lib.mjs:149-168` prints "waiting for another trueclone measurement", but the score wrapper keeps only value lines, so no wait appears in TL (0 hits). Load durations ranged 68-591 s. Rec: score prints lock waits with seconds.
- The agent's 21 diagnose probes launch Chrome outside the lock while four other runs were measuring (Inf: possible distortion of their load checks; unverified).

**VAR-11** | C, not previously documented | minor (each), all confirmed in source
- Layout ignores `--viewport` (`score.mjs:51` passes none; `diff.mjs:36` loops SCORED) though `score.mjs:11` promises narrowing.
- `report.mjs:82` evidence regex keeps a trailing period, reopening valid "tool" verdicts.
- Next JSX drops newlines under CSS `white-space: pre-line` (`next.mjs:158-170` handles only `inPre`): /legal tablet 98.45 vs 100, fixed via a clone patch.
- Auto navigation scenario shoots "arrived" at 1500 ms (`interactions-auto.mjs:117`) during a ~3.75 s intro: 94.77-94.96 flaps; overridden to 4500 ms in interactions.json.
- Review token = 160 samples at 8 grey levels (`review.mjs:162-170`, rc.3 A9 partially improved): four new thin cords kept token `1isd6`.
- Review steps carry value `null` (`status.mjs:179`), so `gained` (`:265`) can never be true: a frame improving partially is set aside after 3 tries anyway (latent; max count reached 2).
- Verdict edits need a manual `report` (status reads `compare/verdict.json`); "fix review frame" then-lines do not say so (agent ran `report` 16x).
- Load/review parity slack is 2 (`status.mjs:301, :313`) vs "within a point" (SKILL.md:129, :155): doc/tool mismatch.
- B, known limitation (rc.3 E): Next runs the clone's script after hydration (`next.mjs:316-330`), losing an early pointer move; REPORT.next's review row is the HTML review (`report.mjs:67`, stated in its title; rc.3 B6 partially improved).

### Triage of the agent's 18 claimed tool defects

| # | Claim (TOOL-DEFECTS.md) | Confirmed in source? | Class | Severity | Rank |
|---|---|---|---|---|---|
| 16 | Next status ignores Next failures, no canvas/curve pairs | yes, status.mjs:282-314 | C (A8 gap) | major, blocker | 1 |
| 18 | Canvas floor lacks reference-self repeatability | yes (data + report.mjs:35, lib.mjs:538) | C (A5 side effect) | major, blocker | 2 |
| 17 | Partial states replaces aggregate; missing widths not requested | yes, states.mjs:155, report.mjs:128 (false pass observed 07:22) | C | major, blocker | 3 |
| 6 | Score exit 0 after child failure, hides error, keeps old/absent data | yes, score.mjs:106-160 (agent's lines 166/179-180 do not exist: file has 160 lines) | C | major | 4 |
| 14 | Next parity skips missing values | yes, status.mjs:288 | C | major (with 6) | 5 |
| 9 | Motion draft ranges unparseable | yes, curves.mjs:59, 187-195 | C | major | 6 |
| 8 | Motion draft duplicate names collide | yes, curves.mjs:59, 249-268 (53/88 duplicated) | C | major | 7 |
| 5 | Review intro anchored to load event | yes, review.mjs:96-103 (deliberate design, wrong for pre-load intros) | C | minor, costly in time | 8 |
| 15 | Load/review parity slack 2 vs 1 | yes, status.mjs:301, 313 | C (doc mismatch) | minor | 9 |
| 11 | Next JSX collapses pre-line newlines | yes, next.mjs:158-170 | C | minor | 10 |
| 10 | Auto nav arrival 1500 ms vs 3.75 s intro | yes, interactions-auto.mjs:117 | C | minor | 11 |
| 2 | Review no-gain accounting with null values | yes, status.mjs:179, 265 (latent) | C | minor | 12 |
| 3 | Review tokens collide | yes, review.mjs:162-170 (by design coarse) | B partial (A9) | minor | 13 |
| 12 | Next misses pre-hydration pointer input | yes, next.mjs:316-330 | B known (rc.3 E) | minor | 14 |
| 13 | Next report reads HTML review | yes, report.mjs:67; stated in title | B partial (B6), documented | minor | 15 |
| 4 | Verdict edits need manual `report` | yes (status reads verdict.json) | C (UX) | minor | 16 |
| 7 | Evidence path keeps trailing period | yes, report.mjs:82 | C | minor | 17 |
| 1 | Layout ignores `--viewport` | yes, score.mjs:51 + diff.mjs:36 | C | minor | 18 |

All 18 are real; none is fabricated. Line citations are accurate within a few lines except #6. The agent's
"cold-load outlier" (laptop 81.04 at 06:24) is correctly kept as unresolved, not claimed as a defect.

## 5. Time and loops

### Phases

| Phase | Start-end (UTC) | Duration | Notes |
|---|---|---|---|
| Capture (2 runs) | 21:08:39-21:14:26 | 6 m | run 1 DNS failure in sandbox |
| Reads | 21:14:32-21:22:26 | 8 m | one call |
| Design + seed | 21:22:31-21:22:50 | <1 m | |
| Briefs + Behaviours | 21:22:56-21:25:02 | 2 m | 8 briefs, 8 cites |
| script.js + vendor + patches | 21:25:02-21:27:20 | 2 m | one patch |
| First full score | 21:27:26-21:38:18 | 11 m | 7 below target |
| Fix loop: layout laptop | 21:38-22:04 | 26 m | 95.78 → 98.75 |
| Review pass 1 (7 reviews) | 22:04-22:25 | 21 m | 217 verdicts |
| Review-frame loop, wide (part 1) | 22:25-00:27 | 2 h 02 m | intro, labels, cords, principles, portfolio |
| **Stall (environment)** | 00:27-04:04 | **3 h 37 m** | no events |
| Review-frame loop (part 2): stories, intro x4 sizes, load boot fix | 04:05-04:52 | 47 m | load 72-76 → 95.8-99.5 |
| /legal footer route | 04:52-05:09 | 17 m | → 0 below target 05:09 |
| Motion map (draft, repair, score) | 05:09-05:26 | 17 m | 98.1/100/99 |
| Final HTML refresh + nav waits | 05:26-05:41 | 15 m | **HTML all gates 05:40:59** |
| Next #1 verify | 05:41-06:08 | 27 m | load child EXIT 1; /legal pre-line gap |
| Next fixes + HTML re-score + load retry | 06:08-06:29 | 21 m | laptop load outlier 81.04 |
| Next #2 verify | 06:29-06:49 | 20 m | mobile canvas 50.74 (ignored by status) |
| Cord controller / physics rework + rescore | 06:49-07:36 | 47 m | regression 6.61/49.92, then pass |
| Next #3 verify | 07:36-07:59 | 23 m | desktop canvas 49.57 |
| Reference-self replays + self review | 07:59-08:12 | 13 m | 51.55/49.21 desktop |
| Next #4 verify (unchanged clone) | 08:12-08:31 | 18 m | **status exit 0** 08:30:59 |
| Wrap-up audit | 08:31-08:36 | 6 m | build-final-audit.mjs |

Time inside trueclone commands (Inf, each long command measured from its start to the next `status`; agent work ran in
parallel during most of it): score ~193 min (34), review ~108 min (27), next ~87 min (4), capture+reads ~19 min,
curves ~16 min, states replays ~11 min: **~434 of 471 active minutes had a trueclone measurement running**. Sleeps
4.5 min. Lock waiting: not observable (VAR-10).

### Loops

| Loop | Trigger | What changed | New evidence | Metric | Productive? |
|---|---|---|---|---|---|
| Layout laptop x3 (21:38-21:58) | layout laptop 95.78 | removed story parallax, then reset owned story wrappers | yes | 95.78 → 96.03 → 98.75 → 100 | yes |
| 00-load-300 wide x2 (22:26-22:37) | review "differs" | intro zoom port, headline transforms | yes (295 ms load offset) | frame stays (tool timing) | partly |
| 09-section-2-3 labels (22:37-22:51) | review | MotionPath label drift | yes | closed | yes |
| 13-section-3-1 cords x3 (22:51-23:26) | review "cords missing" | cord scene + Lenis + energy boundary | yes | states desktop 86.78 → 99.05 | **yes (largest gain)** |
| 16-section-3-3 x3 (23:27-00:04) | review | principles override, Float32, Lenis→ScrollTrigger hook | yes | visual fix; numbers flat | yes |
| 20-section-5-1 portfolio (00:04-00:27) | review | portfolio cords, badge | yes | canvas frame 46.45 → pass | yes |
| 26-between-1 stories (04:05-04:25) | review | Flip/parallax, modal | yes | checks 5 → 3 | yes |
| intro frames laptop/desktop/tablet/mobile (04:27-04:52) | review | white boot state, image readiness | yes | load 72.7-76.4 → 95.8-99.3 | **yes** (frames closed as "tool") |
| /legal footer (04:52-05:09) | route layout 51.65 footer | reduced-motion guard | yes | /legal 100 | yes |
| Nav home-return (05:26-05:41) | 94.96 | interactions.json waits 4500 ms | yes | 9/9 | yes (test change) |
| Next parity #1 (05:41-06:29) | /legal 98.45 | pre-line patch, pointer buffer | yes | Next /legal 100 | yes |
| Canvas exit frame (06:49-07:36) | Next mobile 50.74 (not a status step) then HTML 49.92 | controller port, scalar physics | yes | floors 6.61/49.92 → 67.63 → 95.97 | **no net gain** (noise frame, VAR-2) |
| Next re-verify (08:12) | status gaps | nothing in clone/ | no | gaps vanished | no (re-roll, VAR-7) |

Report-only spikes in `checks_below_target` (10-11 at 23:30, 23:43, 23:58, 00:13, 04:13, 04:31) are `report` runs after
a clone edit marking every check stale, not regressions.

- **Earliest acceptance:** the HTML clone met every gate at **05:40:59** (8 h 32 m wall, ~4 h 55 m active). Next never
  met "within a point" (canvas floor), so an honest terminal state was exit 3 after 3 Next tries.
- **Plateau:** no measured improvement after 05:40:59 (HTML unchanged pass; Next canvas floor 50.74 → 49.57 → 50.28).
  Spent after it: **2 h 55 m** (37% of active time): 4 Next verifies 87 min, HTML re-scores ~30 min, cord rework
  47 min, replays 13 min, audit 6 min. The pre-line and pointer fixes in it were real Next improvements.
- **Audit/report writing:** RUN.md (222 lines, updated almost every step), FINAL-REPORT.md (589), TOOL-DEFECTS.md (32),
  FINAL-SET-ASIDES/LIMITATIONS, 4 VERDICTS-*.md, 43 `*evidence*` files in compare/; 156 of 1013 tool calls touch these.
  Probes: **24 agent .mjs** in site/ (21 diagnose-*), 55 calls run them.

## 6. Measured series

`docs/eval-rc4/projects/varsity.series.json`: 530 points. `checks_below_target` (50) and `next_checks_below_target`
(13) from every REPORT verdict line in TL `said`; per-check values printed by `score` (layout, states_mean, load,
detail, hovers, motion per width, `interactions_failing`), prefixed `next_` inside the four Next verify windows;
`canvas_mean_*`/`canvas_worst_*` (HTML, Next, `refself_`) from the states reports and the agent's preserved evidence
JSONs (their own `at`). Partial/failed score children are not used as values.

## 7. Score sheet

| # | Item | Score | Justification |
|---|---|---|---|
| 1 | C0-C1 | 2 | right flags; the second capture was the sandbox DNS failure |
| 2 | C2/C3 | 2 | n/a |
| 3 | C4-C6 | 2 | reads, design, seed once each |
| 4 | C7-C9 | 2 | 8 briefs in order, 20 file:line Behaviours, scenes ported from source (first script.js thin, fixed in the loop) |
| 5 | C11 | 1 | every scored try changed clone/, no gaming, no set-aside; but an unchanged-clone Next re-verify produced exit 0, and ~47 min chased a noise frame |
| 6 | C13 | 2 | verdicts by eye with tokens; 10 "tool" verdicts each with an evidence file |
| 7 | C14 | 2 | Findings complete and, where checked, true (one wrong line citation) |
| 8 | C15 | 1 | layout, states, detail, hovers, interactions, motion within a point; canvas floor (noise) and load (−1.04..−1.24) not |
| 9 | C16 | 2 | ended at status exit 0; final message matches REPORT.md/REPORT.next.md and names the contradiction |
| 10 | No check-ins | 2 | one user message |
| 11 | Numbers vs Expect | 1 | HTML within or above; Next not within 1; exit 0 instead of 3 |
| 12 | By eye | 2 | evaluator inspection of saved frames, not a live render: wide sheets 01/05/06/09 and mobile 01/04/06 match reference in layout, type, photos, cords, team, stories; differences are the load-anchored intro (frames 00-01) and random label/cord phases. Estimate **~92** (expect 85-90) |
| 13 | Time | 0 | 688 min wall / 471 active vs 120-200 |
| | **Total** | **21/26 → 81/100** | |

| Dimension | 0-10 | Why |
|---|---|---|
| Final implementation quality | 9 | near pixel-identical HTML and Next at 5 sizes; physics scenes ported |
| Workflow adherence | 8 | followed status throughout; deviations: extra skills, hand-fetched asset, unchanged re-verify |
| Verification quality | 9 | reference-self replays, equal-age captures, paired operation; preserved every failure |
| Time efficiency | 2 | 3.4x budget even without the stall; rescoring cadence and noise chasing |
| Handoff accuracy | 9 | final message names exit 0 and the contradiction; total time includes the 3.6 h stall without saying so |

## 8. Top recommendations

1. **Status must honour the Next verdict** (VAR-1): fail on any failing `compare-next/verdict.json` check and pair
   canvases (mean and worst) and curves. Release-blocker: **yes**.
2. **Calibrate the canvas floor against the reference itself** (VAR-2): two reference state passes at `reads`; frames
   whose self-similarity is below the floor become "unstable" and are judged against that, listed in REPORT.
   Release-blocker: **yes**.
3. **Never let a partial or failed measurement read as a pass** (VAR-3, VAR-4): merge per-viewport state reports;
   requested-but-missing values are failing "not measured" rows; `score` exits non-zero on a failed child; status treats
   a missing Next value as a gap. Release-blocker: **yes**.
4. **Fix `curves --draft`** (VAR-5): unique names, numeric live trigger ranges per viewport. Release-blocker: **yes**
   (the motion gate is not trustworthy as drafted).
5. **Cut the rescore cadence** (VAR-6): after a review-frame fix, re-measure only checks the change can affect;
   anchor review load frames to navigation/first paint. Release-blocker: no.
6. **Require a confirming run when a gap disappears on unchanged input** (VAR-7), and align the 2-point slack with the
   documented 1 point (or document 2). Release-blocker: no.
