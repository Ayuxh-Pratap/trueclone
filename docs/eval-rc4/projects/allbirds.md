# RC4 run: allbirds (template, 1 page, Shopify)

Investigator notes. Paths are relative to `C:\dev\tc-tests\rc4-allbirds\` unless absolute. "TL" = `docs/eval-rc4/data/allbirds.timeline.json`,
"S" = raw Codex session (`summary.file`), times UTC unless marked IST. Obs = observation, Inf = inference, Rec = recommendation.

## 1. Run facts

| | |
|---|---|
| Site / mode / flags | https://www.allbirds.com/products/mens-tree-runners, `allbirds`, template, `--routes 1` (+ `--hide "[data-testid='geofencing-modal']"`) |
| Start / end | 21:30:47Z 20 Oct (03:00:47 IST 21 Oct) to 07:37:10Z (13:07:10 IST); one turn (TL `summary.turns[0]`) |
| Elapsed | 10h06m23s wall. Agent says "10h 4m 18.408s" (21:31:02 to 07:35:20, first to last status): matches TL |
| Machine pause | 00:27:22-04:04:41Z (3h37m19s): one `write_stdin` blocked 13,033.8 s (TL calls[485]); zero, varsity and astro were silent in the same window too (TL of each run). Environment (host sleep), not the tool |
| Active turn time | ~6h29m (wall minus the pause) |
| User messages | 1, the runbook prompt ("Clone this one product page with trueclone, in template mode..."); 0 check-ins, 0 questions |
| Compactions | 4 (22:59:43, 00:19:52, 05:52:08, 07:32:04) |
| Tokens | 208.47 M total: 207.95 M input (205.30 M cached), 0.51 M output (0.33 M reasoning) |
| trueclone commands | TL parser: 217 (status 92, seed 30, brief 29, review 22, score 15, explain 12, report 10, capture 2, curves 2, reads/design/vendor 1). My dedup of S commands (`npx trueclone …` at line start): ≈ status 95, score 51, brief 45, seed 31, review 23 (+1 PowerShell loop over 5 sizes), explain 15, report 14, curves 5, capture 3, next 3, reads 2, states 1, drift 1, design 1, vendor 1. TL undercounts scores run through the agent's `warmPrefix` |
| Final exit | **3** from `status` itself: TL steps[214] 07:34:13 exit [3], steps[216] 07:35:20 exit [3]; set aside: `load:laptop` only (`compare/status-steps.json` count 3) |
| Deviations: config | `gpt-6.1-sol`, effort `high` (runbook: Extra High), approval `on-request` + guardian, sandbox `workspace-write`, network off (runbook: Full access); browser commands ran with `sandbox_permissions:"require_escalated"` (S, ~570 calls carry it). 5 runs overlapped on one machine |
| Deviations: agent | (a) **injected `--import=…/warm-profile.mjs` via NODE_OPTIONS** into most score/reads/capture/next commands from 00:07Z (S calls[429]); (b) **third capture on its own initiative** at 05:25Z (status had named `explain 1688 --viewport mobile`); (c) `npx trueclone states allbirds` re-read at 00:25Z without a re-capture; (d) `--step-minutes 60` and `--refresh-ref` on scores; (e) re-shot review at all 5 sizes in a shell loop at 07:05Z while status said `next --verify`; (f) final chat message delegates items 2-5 of the prompt to `RUN-AUDIT.md` |

## 2. Ideal vs actual workflow (C0-C16)

| # | Expected | What happened (UTC) | Verdict | Evidence |
|---|---|---|---|---|
| C0 | init/doctor ok; agent never edits AGENTS.md/skill | Installed before the run; AGENTS.md 02:13 IST, SKILL.md 02:11 IST, `node_modules/@trueclone/cli` untouched (no file newer than package.json) | followed | `ls` mtimes |
| C1 | capture once with right flags; overlay warning | 21:31:10 capture `--routes 1`: "WARNING `[data-testid='geofencing-modal']` covers 100% of the window at load"; 3rd capture 05:25:32 self-initiated (live SDK drift) | followed, then repeated | S 21:31-21:36; S 05:25:32 call |
| C2 | status names re-capture with `--hide`; agent runs it verbatim | status 21:36:18 "next: npx trueclone capture … --hide "[data-testid='geofencing-modal']""; run 21:36:22 (4 s later), verbatim | **followed** (but see ALLBIRDS-2: `--hide` not applied on concurrent reference pages) | TL said 21:36:18, steps[2] |
| C3 | n/a (not an app) | - | n/a | - |
| C4 | `reads` once | 21:40:41-21:44:06 one call; later `states` re-read 00:25 (no re-capture, to repair the race) and `reads` 05:30 after the 3rd capture | followed, then repeated | TL steps[4]; S 00:25:38, 05:30:35 |
| C5 | `design` | 21:44:41 | followed | TL steps[6] |
| C6 | `seed`; no hand edits of index.html | 21:44:54 seed; `seed --force` 05:37:46 (status-directed after re-capture); ~31 `seed --patches`; no edits to `clone/index.html`, `next/` or `reference/` found in S | followed | TL steps[8], [182] |
| C7 | brief per section, in order | briefs 1-9 at 21:45:14-21:48:01, status between each | followed | TL steps[10-26] |
| C8 | Behaviours with file:line | "behaviours (12 cited)" 21:48:10; 31 cited at end | followed | TL said 21:48:10; REPORT.md Notes row |
| C9 | script.js ports rules, `tcOwn` first | `tcOwn(...)` loop is line 2 of `clone/script.js` (243 lines); GSAP 3.14.2 + Swiper vendored to `clone/patches/`; plus a 15 KB `04-assistant.js` re-implementing a third-party widget | followed | `clone/script.js:1-3`; `clone/patches/` |
| C10 | first full score | 21:50:38-22:09:57 (19 min; load 728 s): 8 below target | followed | TL said 22:09:57 |
| C11 | fix loop in order; 3 real tries → set aside | 22:10-06:28; layout 86→99.4; review-frame loop on the assistant widget 22:47-00:04; mobile scroll loop 7 cycles 04:28-05:24 never set aside; `load:laptop` set aside 06:28:41 after 3 real tries | followed, with repeated loops and instrument changes | TL said 06:28:41; `compare/status-steps.json` |
| C12 | `curves --draft`, motion measured | status 06:28:41 → run 06:28:49; agent extended/re-authored `motion-map.json`; curves tablet 91.5 → 93.3 → 100 | followed (map edited, ALLBIRDS-14) | S scores 06:48:37, 06:53:24, 07:04:16 |
| C13 | verdicts by eye per frame with token; reasons < 85% | first pass 22:35-22:46 viewed all 7 sheets at all 5 sizes; final pass 07:05-07:15: 103/105 verdicts "tool", 2 "same", 0 "differs"; sheets 01-03 at desktop/tablet/mobile (27 frames, new tokens) not viewed before verdicts were written | **failed** (weak) | `notes.md:182-293`; S view_image calls 07:07-07:14 |
| C14 | Findings incl. set-asides | 43 bullets; `load:laptop` entry with the 3 tries; many proven tool defects | followed | `notes.md:87-171` |
| C15 | `next --verify`; within 1 point everywhere | status 06:29:11; first build exit 1 (TS2352), re-run ok 06:41; final 07:16-07:27; wide load app 92.73 vs clone 94.10 (−1.37) accepted by status (2-point slack) | late, partially failed | `REPORT.next.md` Load row; `status.mjs:301` |
| C16 | exit 0/3, report as asked | exit 3 at 07:34:13 / 07:35:20; final message 6 lines + link to `RUN-AUDIT.md` (152 KB) | followed (report partly delegated) | transcript lines 862-867 |

## 3. Final results vs expectations

REPORT.md (clone; generated 07:35 IST 13:05; values from scores 06:54-07:04Z):

| Check | Desktop | Tablet | Mobile | Laptop° | Wide° | Status | Target | rc.3 | Expect rc.4 | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| Layout | 99.97 | 99.63 | 99.43 | 99.72 | 99.91 | pass | ≥ 98 | 98.3-99.7 | 98.5-99.8 | within (top end) |
| Scroll states | 98.85 | 98.45 | 96 | 97.21 | 98.58 | pass | ≥ 95, frame ≥ 80 | 93.5-99.1 | 95-99 | within |
| Motion curves | 100 | 100 | 99.5 | – | – | pass | ≥ 95 | not scored | - | pass after map edit (ALLBIRDS-14) |
| Detail | 100 | 100 | 96.7 | – | – | pass | ≥ 95 | - | - | pass |
| Hovers | 100 | – | – | – | – | pass | ≥ 90 | 0 | 85-100 | within (14 effects, 2 unstable excluded) |
| Load | 95.11 | 95.27 | 97.35 | 92.2 | 94.1 | **below** | ≥ 95 | 98-99 (clone) | - | laptop set aside; wide never its own step (ALLBIRDS-10) |
| Review | 21/21 ×5 | | | | | pass | all closed | 42% "same" | - | closed by "tool" verdicts (ALLBIRDS-8) |
| Notes | 31 cited | | | | | pass | - | - | - | ok |
| Coverage | 14/14 scripts, 7/7 curves | | | | | pass | - | 14/14 | - | ok |
| Interactions | 100% (6/6; 6 found) | | | | | pass | all | 0/28 | 22-28 of 28 | not comparable: rc.3's 28 were agent-written (`rc3-allbirds/sites/allbirds/interactions.json`, 29 entries) |

REPORT.next.md (app; scored 07:18Z): Layout 99.97/99.63/99.43/99.81/99.91; Scroll 98.93/98.48/96/99.09/99.31; Motion 100/100/100;
Detail 100/100/96.7; Hovers 100; **Load 95.23/96.33/97.48/92.24/92.73 (below)**; Review 21/21 ×5 (the clone's frames: `report.mjs:67`);
Notes 31; Coverage 14/14, 7/7; Interactions 100% 6/6. Verdict "1 check(s) below target". App vs clone: within 1 point except
**wide load −1.37** (rc.3: 81-83 vs 98-99: Next load parity much improved). Test plan expectation "Load (Next) = clone ± 1": missed by 0.37.

Verified by artifacts: all rows above (tool-generated REPORTs, `compare/*.json`, `compare-next/*.json`), exit 3 and `load:laptop`
(`compare/status-steps.json`), 1.37 (94.10 − 92.73). Only claimed: "All 105 current baseline frames … were manually inspected"
(REPORT.md Findings bullet 1; final message "Inspected 105 clone frames"): contradicted for 27 frames (ALLBIRDS-8); "TIMEOUT …
cause undetermined" (`compare/run-incidents.json`): it was the host pause.

## 4. Findings

**ALLBIRDS-1** B / targeted issue resolved (C1). Expected: geometry-based overlay detection + `--hide` re-capture as status's first
step. Observed: capture warned at 100% coverage; status named the exact re-capture; agent ran it in 4 s. Stage C1-C2. Evidence: S
21:31-21:36, TL steps[1-2]. Impact: accuracy (positive). Severity: -. Rec: keep; add a fixture test that the re-capture command is
named verbatim.

**ALLBIRDS-2** C / not previously documented (tool defect). Expected: `--hide` applies to "every page any check opens on the
reference's host" (`lib.mjs:173-177`). Observed: `profileOfSite()` sets `referenceProfile = null` before awaiting `meta.json`
(`lib.mjs:180-188`); concurrent `newPage` calls (`states.mjs:46` Promise.all over viewports, also `reveals.mjs:292`, `interact.mjs:227`)
get `null` → no hide sheet, no cookies, on all but the first viewport. Effect measured: scroll states mobile 88-94 but tablet/desktop/
laptop/wide **14.3-24.6%** from 21:53 to 00:15 (S score outputs); after the reference states were re-recorded with the profile forced
(00:25), desktop went 19.88 → **98.03 with no clone change** (04:05:39). Agent's mock (`profile-race.mjs`) prints hideScripts [1,0,0]
(`compare/profile-race.json`) and [1,1,1] under the preload. Stage C4/C10-C11. Impact: accuracy (false fails for ~2.5 h of
active work), time. Severity: **major** (defeats the C2 fix on every concurrent check). Root cause: memoising the value instead of
the promise; confidence high (code + measured jump); alternative (clone changed) excluded by unchanged clone between 00:15 and 04:05.
Location: tool. Rec (tool): `let profilePromise; profileOfSite = () => profilePromise ??= load()`; invalidate reference caches written
under the old version (bump cache key). Test: `Promise.all` of 3 `newPage` on a mock browser → 3 init scripts; allbirds states at 5
sizes with no dialog in any reference frame.

**ALLBIRDS-3** C / not previously documented (agent altered the instrument; integrity). What `warm-profile.mjs` does (8 lines):
reads `sites/allbirds/reference/meta.json` and calls the CLI's exported `setReferenceProfile({url: finalUrl||url, hide, cookies,
unroll||'xy'})` before any tool code runs; injected with `$env:NODE_OPTIONS += ' --import=file:///…/warm-profile.mjs'` (S
00:07:39) and inherited by every child step (`score.mjs:76` copies `process.env`), including the Next build/start processes. Does it
change what is measured? **Not the math, thresholds or clone side**: the values are exactly what `profileOfSite()` would compute
(`lib.mjs:186`), the init script only touches the reference host (`lib.mjs:208`), and capture overrides it with its own profile
(`capture.mjs:29`). It **does** change the reference pages: it removes the race of ALLBIRDS-2, so reference frames no longer show
the region dialog (the documented intent). Integrity problems: (1) from 00:07 the scores come from a patched instrument that a stock
`npx trueclone score` would not reproduce (it would re-introduce the dialog on 4 viewports); (2) applied inconsistently (status,
seed, brief, report, review, some explains ran stock; scores, reads, the 3rd capture and Next ran patched); (3) disclosed only in
`notes.md:143`, `RUN-AUDIT.md` ("profile preload", 23 mentions), not in the final chat message. No evidence it inflated a clone-side
score; it made the reference correct. Stage C11. Impact: accuracy (positive), trust/reproducibility (negative). Severity: major
(process). Cause: tool defect + missing decision rule (skill says a proven tool defect is written in Findings, says nothing about
working around it). Rec: skill: "never load code into the tool's process (NODE_OPTIONS, --import, monkey-patches); prove the defect,
write it in Findings, and continue"; tool: `score`/`status` print `instrument modified` in REPORT.md when `NODE_OPTIONS` contains
`--import`/`--require`. Test: run score with a dummy `--import`; REPORT.md shows the warning.

**ALLBIRDS-4** B / targeted issue resolved (A1, B3). Expected: interactions compare addresses relative to the start page. Observed:
no address failures; final 6/6 scored scenarios pass at 95.32-98.79; 4 auto scenarios `notBehaviour` (neither side reacted).
Evidence: `compare/interact/report.json`. Impact: accuracy. Rec: keep.

**ALLBIRDS-5** C / not previously documented (instrument coverage). Expected (skill): "the capture finds every scroller,
carousel, tab set, accordion, menu and dialog". Observed: `reference/interactions.auto.json` has 10 scenarios (swipes, 2 menus,
2 "dialog Add to Cart" that never react); none for the details accordions, swatches, size buttons, zoom dialog or cart drawer that
rc.3's agent scripted. "Interactions 100%" therefore covers 6 behaviours. Severity: minor (honestly labelled "6 found by the
capture"). Rec (tool): auto-scenarios for `[aria-expanded]` toggles and `role=dialog` openers; (skill) ask for `interactions.json`
when Behaviours list operable elements with no scenario. Test: allbirds auto set includes ≥ 3 disclosure scenarios.

**ALLBIRDS-6** B / targeted issue resolved (A4). Hovers measurable: 60 rows, 14 real effects all 100, 2 unstable excluded
(`compare/hovers.desktop.json`). rc.3: 0.

**ALLBIRDS-7** B / seed traps: D3 resolved (mobile menu stays closed, review frames show no cover; "menu Open main menu (mobile)"
97.52); D4 **unresolved**: `clone/index.html` `#modal-refund-policy` lacks the `style="display: none;"` that `reference/rendered.html`
has; agent patched `clone/patches/05-dialog-state.css`; D5 **partially improved**: eager product images are alpha silhouettes
(review sheets), but both lazy `floating_img`/`floating-img` are opaque `#8c8c8c` rect SVGs in `clone/index.html` (agent built
`floating-*.png` patches) and unavailable-size slashes were filled boxes (agent Finding). Severity minor each. Rec (tool): carry
`display:none` when a closed dialog's alternatives are unset (D4 rule apparently not reached for Vue-managed dialogs; confidence
medium); decode lazy images before the alpha test (D5).

**ALLBIRDS-8** C / not previously documented (weak verification; tool + agent). Expected: "tool" only with evidence the difference
is the instrument's; every frame looked at. Observed: final Review: 103/105 "tool", 2 "same", 0 "differs"; Next Review 42/42 "tool"
(`notes.md:182-340`). The clone shows an assistant launcher + "Lorem ipsum dolor sit amet" nudge at the right in **every** frame
(on mobile over the swatches); the reference shows none (my look at `compare/review/{wide,mobile}/sheet-*.png`). That is the
clone's choice, yet every such frame is "tool: source assistant absent/varies". After the 07:05 re-shoot (new tokens for frames
00-08 at desktop/tablet/mobile) the agent viewed only sheets 04-07 at those sizes (S view_image 07:11:53, 07:13:34, 07:14:31) and
wrote 27 verdicts for pictures it had not seen. `report.mjs:83` closes a frame on `tool` + any existing evidence file, with no cap.
Impact: accuracy, UX (a visible overlay ships as "pass"). Severity: **major**. Rec (tool): a "tool" verdict needs a per-frame
evidence crop under `compare/review/<size>/evidence/` newer than the frame; more than ~20% "tool" at a size → a status step
"re-check tool verdicts"; (skill) "a clone-only element visible in a frame is `differs`". Test: notes with 21 tool verdicts and one
shared JSON → review gate stays open.

**ALLBIRDS-9** C / not previously documented (missing decision rule). A cross-origin AI shopping assistant (shadow DOM, Azure SDK,
varies per visit, sometimes fails to load) drove ~2.5 h of work: review-frame loop 22:47-00:04, mobile scroll loop 04:28-05:24,
re-capture 05:25, a 15 KB `04-assistant.js`. Impact: time. Severity: major (time). Rec (tool): capture flags fixed third-party
shadow hosts that differ across self-loads and status offers `--hide` for both sides; (skill) "third-party widgets (chat, reviews,
consent) are hidden, not ported". Test: allbirds capture lists `#ads-agent-host` as unstable/hide candidate.

**ALLBIRDS-10** C / partially improved B2 (tool). Two set-aside gaps: (a) non-scroll checks get one key per check
(`status.mjs:199` `c.failing.find(heldOut) || c.failing[0]`), so after `load:laptop` was set aside, **load wide 94.1 never became a
step** and the run exited 3 with it below target; (b) the scroll key includes the worst y (`status.mjs:206`) and a gain is > 0.5
(`status.mjs:265`): mobile scroll ran 7 explain→brief→seed→score cycles (94.33, 94.49, 94.47, 91.67, 92.86, 92.85, 92.85, 94.12)
without being set aside because the key flipped 1688↔2110 and noise counted as gain. Impact: time (~56 min), honesty (a failing
size never named). Severity: major. Rec: key every failing size of every check; gain = above best-so-far by > noise, not above
last. Test: synthetic verdict with laptop+wide load failing → two steps; oscillating values → set aside after 3 tries.

**ALLBIRDS-11** B / partially improved (A8). Next "within a point": `status.mjs:288` slack 1, but load (`:301`) and review frames
(`:313`) use 2; app wide load 92.73 vs 94.10 passed status. Agent disclosed it. Severity: minor. Rec: slack 1 everywhere (or state 2
in the skill). Test: compare/load.json 94.1 vs compare-next 92.7 → status step.

**ALLBIRDS-12** C / tool defects in Next and report (minor, each proven by the agent, checked here): first `next --verify` exit 1,
seven TS2352 on `"… !important"` inline styles (`compare/next-build-type-errors.txt`; agent bridge `clone/patches/css-important-values.d.ts`);
REPORT.next.md Review row reads `compare/review/*` not `compare-next/review` (`report.mjs:67`, B6 partial); REPORT "Libraries: none"
while Swiper ×3 and ScrollTrigger 3.14.2 ran (`report.mjs:296`, rc.3 E); layout ignores `--viewport` (`score.mjs:51` passes none to
diff.mjs); `drift` compares page height + section count only (`drift.mjs:1-5`) and missed the assistant SDK release the agent
proved (`compare/sdk-drift.json`). Rec: fix each in tool; add generator type test with `!important` values.

**ALLBIRDS-13** B / targeted issue resolved (B5). After the 3rd capture status asked for fresh reads (05:30:27 "next: npx trueclone
reads allbirds") then `seed --force` (05:37:39). Works as designed. (The re-capture itself was the agent's choice: skill says
re-capture only "if `drift` says the live site changed"; drift said nothing changed.)

**ALLBIRDS-14** D / unresolved observation (instrument configuration edited). Motion went tablet 91.5 → 93.3 → 100 between 06:48
and 07:04 while `clone/script.js` was last written 06:52:12 and `motion-map.json` 07:00:16 (file mtimes): the last gain came from
re-authoring the map (one-shot fades moved from scroll to time mode; duplicate names made unique; `--refresh-ref`), not from the
clone. The agent's reasons are evidenced (`compare/curve-name-collision.json`, `compare/fresh-reveals.json`), and status counted the
check as fixed. Whether the edited map is a fair measurement is unresolved. Rec (tool): status keeps the draft's hash; an edited map is
listed in REPORT.md with the changed entries.

**ALLBIRDS-15** D / environment. Host paused 00:27-04:04 (all runs). The in-flight score reported `TIMEOUT 13045s`; the 20-min
step timer (`score.mjs:113-117`) could not fire during sleep. Agent recorded it as an "incident … undetermined"
(`compare/run-incidents.json`); `RUN-AUDIT.md` counts it in the total. Rec (harness): keep-awake during runs; (tool) print wall vs
monotonic time in score-times.

**ALLBIRDS-16** C / agent execution (time). 6h29m active vs 90-150 min budget; 41 agent `*.mjs` probes in `sites/allbirds/`, 85
`notes.md` patches, 37 clone edits, 152 KB `RUN-AUDIT.md`. Severity: major (time). Rec (skill): budget per step; a probe script is
for proving a tool defect, at most one per defect.

## 5. Time and loops

| Phase | UTC | Min |
|---|---|---|
| Skill read, capture ×2 (incl. `--hide`) | 21:30:47-21:40:11 | 9.4 |
| Reads, design, seed | 21:40:41-21:45:03 | 4.4 |
| Briefs 1-9 + Behaviours, vendor, script.js | 21:45:14-21:50:32 | 5.3 |
| First full score | 21:50:38-22:09:57 | 19.3 |
| Layout fix + partial scores | 22:10-22:35:30 | 25.5 |
| Review, 5 sizes, all sheets viewed | 22:35:40-22:46:44 | 11 |
| Review-frame loop (assistant widget; 8 wide/laptop re-shoots, 5 mobile) | 22:47-00:04 | 77 |
| Full rescore, profile-race diagnosis, preload, `--refresh-ref`, `states` re-read | 00:04-00:27 | 23 |
| **Host pause** | 00:27:22-04:04:41 | 217 |
| Mobile scroll / interaction loop (7 cycles, no gain) | 04:04:41-05:24:50 | 80 |
| SDK drift probe, 3rd capture, reads, seed --force | 05:24:50-05:38:10 | 13 |
| Re-fix (menu, scroll, detail), load ×3 → set aside | 05:38-06:28:41 | 50.5 |
| curves draft, Next #1 (TS2352 fix) | 06:28:49-06:41:46 | 13 |
| Motion map re-authoring, load/interact rescores | 06:41:46-07:04:31 | 23 |
| Review re-shoot (shell loop) + verdicts | 07:05:14-07:15:50 | 10.5 |
| Next #2 + app review sheets | 07:16:07-07:33:12 | 17 |
| Exit 3, report, RUN-AUDIT (`build-run-audit.mjs`) | 07:33:12-07:37:10 | 4 |

- Inside trueclone commands (completed calls in S): ≈ 15,650 s (261 min) excluding the paused score; overlaps agent reading.
  Polling (`write_stdin`/wait) 75 min, explicit sleeps 9.2 min (11 × 50 s), other tool calls 82 min, model time ≈ 223 min (Inf).
- Machine timing lock: load steps took 17-778 s vs ~60 s uncontended; 14 runs over 120 s total 5,888 s → ≈ 80 min waiting for the
  lock (Inf; the agent read `%TEMP%\trueclone-timing.lock` in 19 tool calls).
- Loops: (1) review frames on the assistant, 22:47-00:04, no metric gain, ended by turning verdicts into "tool"; (2) mobile scroll,
  7 cycles 04:28-05:24, 94.33 → 94.12, ended by the self-initiated re-capture (then 96); (3) load laptop, 3 real tries 92.64/92.82/
  92.22 → set aside (mechanism worked); (4) motion tablet 91.5 → 100 by map edits; (5) Next ×2 (+1 failed build).
- Checks below target (REPORT.md runs): 8 → 5 by 22:47, 3 by 00:25, 1 from 06:05:59 (load). Earliest exit-3 state: `load:laptop`
  set aside 06:28:41 + Next verified 07:27; status exit 3 at 07:34. Plateau of the clone: ~06:28 (load laptop 92.22 → final 92.2,
  wide 94.09 → 94.1); 66 min after it went to Next, the motion map, the review re-shoot and the audit.
- Agent overhead: 41 probe scripts (`app-probe` … `widget-probe`), `run-history.json` rewritten on most steps, `RUN-AUDIT.md`
  generated by a 16 KB script.

## 6. Measured series

`allbirds.series.json`: 484 points, all tool-printed: `checks_below_target` (REPORT.md runs, 60 points), `next_checks_below_target`
(11), `layout_*`, `scroll_*`, `load_*`, `detail_*`, `curves_*`, `hovers_desktop`, `interactions_failing` per score run (clone),
`next_*` for the two app verifications, and `status_exit` 3 ×2. Times are when the output appeared in S. Partial scores print
higher "below target" counts (stale sizes count), hence the 3↔6 sawtooth from 04:05 to 05:24.

## 7. Score sheet

| # | Item | Score | Why |
|---|---|---|---|
| 1 | C0-C1 | 1 | right flags, `--hide` re-capture as told; a 3rd capture not asked for by status |
| 2 | C2 | 2 | overlay seen at 100%, status's re-capture run verbatim in 4 s |
| 3 | C4-C6 | 1 | reads/design/seed once each at first; `states` re-read without re-capture (00:25), reads again after the 3rd capture |
| 4 | C7-C9 | 2 | 9/9 briefs in order, 31 cited Behaviours, `tcOwn` first, libraries vendored, nothing pasted |
| 5 | C11 | 1 | tries changed the clone and no re-score loops, but the instrument was modified (NODE_OPTIONS preload, `--step-minutes 60`) and motion passed by map edits |
| 6 | C13 | 0 | 103/105 "tool" verdicts close a visible clone-only overlay; 27 verdicts written for frames not viewed after re-shoot |
| 7 | C14 | 2 | 43 Findings, set-aside with its 3 tries, most tool defects verified true here |
| 8 | C15 | 1 | Next built and scored; wide load −1.37 > 1 point (disclosed) |
| 9 | C16 | 1 | exit 3 confirmed; message delegates rows/steps to RUN-AUDIT.md and overstates "105 frames inspected" |
| 10 | No check-ins | 2 | 1 user message, no questions |
| 11 | Numbers vs Expect | 1 | layout/scroll/hovers within; Next load −1.37 (within 5); interactions not comparable (6 vs 28) |
| 12 | By eye | 1 | evaluator inspection of saved frames, not a live render: wide ~86, mobile ~80 (assistant overlay over content on every phone frame, grey placeholders), overall ~84 vs expect 85-88 |
| 13 | Time | 0 | 6h29m active (10h06m wall) vs 90-150 min |
| | **Total** | **15/26 → 58/100** | |

Own scores (0-10): implementation quality **7** (structure, menus, carousels, hovers right at all sizes; assistant overlay and
load wide/laptop below target); workflow adherence **5**; verification quality **4** (excellent defect proofs, but blanket "tool"
verdicts, unviewed frames, edited motion map, patched instrument); time efficiency **2**; handoff accuracy **6** (exit, set-aside,
1.37 and load rows correct; rows delegated to a file; frame-inspection claim overstated; preload not mentioned in chat).

## 8. Top recommendations

1. Fix the reference-profile race (memoise the promise; re-key caches). `lib.mjs:180-188`. **Release blocker: yes** (C2's
   `--hide` does not reach 4 of 5 viewports on any concurrent check).
2. Close the "tool" verdict loophole: per-frame evidence newer than the frame, cap on tool share, skill rule that a clone-only
   visible element is `differs`. `report.mjs:83`. **Release blocker: yes** (review gate passes a visible defect).
3. Skill rule + tool warning against loading code into the CLI (NODE_OPTIONS/--import); a proven defect goes to Findings, not to a
   workaround inside the instrument. Release blocker: no (but needed before trusting agent-run scores).
4. One set-aside key per failing size for every check, and gain measured against best-so-far beyond noise (`status.mjs:199,206,265`).
   Release blocker: no.
5. Detect third-party widgets (fixed shadow hosts, cross-origin, unstable across self-loads) at capture and offer `--hide` on both
   sides. Release blocker: no (biggest time sink here).
6. Next: slack 1 for load and review frames (`status.mjs:301,313`), review row from `compare-next/review` (`report.mjs:67`), TS-safe
   `!important` styles in the generator. Release blocker: no.

Could not determine: exact lock-wait minutes (no lock log; inferred from load step durations); whether detail desktop 85.5 → 100
came from the re-capture or from the profile fix (both changed between 05:14 and 05:48); whether the edited motion map is a fair
measurement.
