# RC4 run evaluation: astro (docs.astro.build, template, 4 pages) - the control site

Investigator scope: run folder `C:\dev\tc-tests\rc4-astro`, timeline `docs/eval-rc4/data/astro.timeline.json`,
transcript `C:\dev\tc-tests\exact responses - rc4.txt` lines 869-1607, CLI 0.5.0-rc.4 source in
`rc4-astro/node_modules/@trueclone/cli/scripts/`. Paths below are relative to `rc4-astro/sites/astro/` unless they
start with `cli/` (= `rc4-astro/node_modules/@trueclone/cli/`) or `tl` (= timeline time, UTC).
Not available: the raw Codex JSONL (reading it was refused by this machine's permission policy); everything below comes
from the parsed timeline, the transcript and the run folder.

## 1. Run facts

| Item | Value |
|---|---|
| Site, mode, flags | `astro`, template, `capture https://docs.astro.build/en/getting-started/ astro --routes 4` (as the runbook prompt) |
| Routes captured | `/en/getting-started` (start), `/en/tutorial/0-introduction`, `/1-setup`, `/2-pages`; `meta.app = "pages"` (reference/meta.json) |
| Start | 2026-10-20 21:17:32.9Z = 21 Oct 02:47:33 IST (tl summary.turns[0].start) |
| First exit 0 | 22:36:20Z = 04:06:20 IST (tl steps: `status astro` exit [0]) |
| Turn end | 22:38:59.8Z = 04:08:59 IST; elapsed 1 h 21 min 27 s; to first exit 0: 1 h 18 min 47 s |
| Active turn time | 81.4 min (one turn, no idle gap); 38.3 min of it in agent `sleep` calls while background commands ran (sleepSeconds 2300) |
| User messages | 1 (the runbook prompt, "Clone the Astro docs "Getting started" page and the next pages it links to, 4 pages…"). No check-ins |
| Compactions | 0 |
| Tokens | input 45,430,975 (cached 44,879,488), output 53,748 (reasoning 16,427), total 45,484,723 |
| Tool calls | 235; trueclone commands 71: status 34, review 13, score 6 (1 full, 3 `--only interact`, 2 `--only layout,states,detail,hovers,load`), report 6, seed 4, brief 3, capture 2, reads 1, design 1, next 1 |
| Final exit code | **0**, from status output "Every gate passes" (tl said 22:36:20 and 22:37:42), exit code [0] in tl steps |
| Set aside | none (compare/status-steps.json holds two review keys at count 1, value null) |
| Deviations: config | effort `high` (runbook: Extra High); sandbox `workspace-write`, network off (runbook: Full access). Effect: capture failed `ERR_NAME_NOT_RESOLVED`, seed and brief 1 failed `ERR_NETWORK_ACCESS_DENIED` on localhost; each retried with escalated access (RUN-LOG.md:7-14, notes.md:21) |
| Deviations: agent | read two unrelated user-level skills at start (`brainstorming`, `ponytail`, tl call 21:17:39) and said "I'll use the ponytail skill to keep it small" (transcript:930); ran `report` with internal env vars `TC_COMPARE`/`TC_REPORT` after exit 0 to refresh REPORT.next.md (tl 22:37:29; cli/scripts/lib.mjs:40,61); no edit to AGENTS.md or the skill (mtimes 02:13 IST, before the run) |
| Agent-written logs | RUN-LOG.md (42 rows, written during the run), evidence/interactions-before-rewrite.json (copy of a tool report); 6 inline `node` probes via stdin, 0 probe `.mjs` files saved in the site folder |
| Session file | `lastEvent` 2026-10-22T04:42Z, 30 h after the turn, with no second turn or user message (unresolved; likely the session was reopened) |

## 2. Ideal vs actual workflow (C0-C16)

| # | Expected | What happened (UTC) | Verdict | Evidence |
|---|---|---|---|---|
| C0 | init, doctor all ok; skill untouched | done by the user before the run (02:13 IST); agent read SKILL.md + AGENTS.md | n/a (followed) | tl call 21:17:39, 21:18:27 |
| C1 | capture once, 5 sizes per route, meta.json | 21:17:48 failed (sandbox DNS); 21:18:09 retry ok, captured 21:19:30; 4 routes x 5 sizes | followed (retry forced by environment) | reference/meta.json `capturedAt`; RUN-LOG.md:7-8 |
| C2 | overlay re-capture | no overlay; `hide: []` | n/a | reference/meta.json |
| C3 | journey | not an app | n/a | - |
| C4 | `reads` once | 21:19:43-21:23:33, one call; agent read scripts/INDEX.md meanwhile as status asked | followed | tl steps; reference/reveals.*.json 02:52-02:53 IST |
| C5 | `design` | 21:23:40, exit 0 | followed | DESIGN.md, globals.css, clone/tokens.css |
| C6 | `seed` once | 21:23:51 failed in browserPass (sandbox), 21:24:03 refused ("already has an index.html"), status counted seed done; 21:25:37 `seed --force` ok; 21:50:18 `seed --patches` (search CSS patch) | repeated (tool defect ASTRO-4 + environment) | tl steps; cli/scripts/seed.mjs:328-331,381,548; status.mjs:96 |
| C7 | one brief per section | 2 sections: brief 1 failed (sandbox) 21:24:16, ok 21:24:28; brief 2 21:24:46 | followed (1 env retry) | compare/brief/desktop-1.md, -2.md |
| C8 | Behaviours with file:line | 21:25:33 "behaviours (19 cited)"; 8 behaviour lines, each citing pretty.js lines | followed | notes.md:6-15; tl said 21:25:33 |
| C9 | script.js ported (tcOwn first) | 21:27:03 script.js done; `tcOwn(...)` line 2; TOC observer, tabs, theme, checklist ported in own code (not pasted) | followed | clone/script.js:2, 145-176 vs reference/scripts/fd78eb-starlight-toc.CTCQXEge.pretty.js |
| C10 | first full score | 21:27:09-21:36:34 (9.4 min): "2 check(s) below target" (interactions: 6 broken scenarios; review not done) | followed | tl said 21:36:34; RUN-LOG.md:20 |
| C11 | fix loop in order, every try changes clone/ | review "differs" first (status.mjs:178-180), then interactions; 2 clone fixes, each followed by `--only interact` then the stale checks; 6 tool-broken scenarios routed to Findings/rewrite; no gaming, no set-aside | followed | tl 21:49:48-22:25:49; status-steps.json |
| C12 | `curves --draft` if curves | 0 curves recorded; status never asked | n/a | REPORT.md:20, 62 |
| C13 | review every size + every route wide/mobile, verdicts by eye with tokens | 5 sizes of the start page + 3 routes x (wide, mobile) = 13 reviews, 103 frames, every verdict with token; agent viewed every sheet ("Viewed 3/4 images" after each); found 2 real defects | followed | notes.md:30-133; transcript:1001-1239 |
| C14 | Findings with evidence | 11 Findings lines incl. 4 tool defects with file:line; one root cause misdiagnosed (ASTRO-5) | followed (minor inaccuracy) | notes.md:17-28 |
| C15 | `next --verify`, within 1 point | 22:26:09-22:35:39; REPORT.next.md equals REPORT.md on every row; agent also judged the 20 app frames | followed | REPORT.next.md; compare-next/score-times.json |
| C16 | exit 0/3, report matches | exit 0 at 22:36:20; final message reproduces both reports correctly | followed | transcript:1501-1607 |

## 3. Final results vs expectations

REPORT.md and REPORT.next.md score rows are identical except "Scored" (22:03:19Z vs 22:27:20Z) and "Scoring time"
(REPORT.md "1 min (full, only interact): interact 62s"; REPORT.next.md "7.4 min (full)").

| Check (REPORT.md = REPORT.next.md) | Desktop | Tablet | Mobile | Laptop° | Wide° | Status | Plan target | rc.3 | rc.4 expect | Verified by |
|---|---|---|---|---|---|---|---|---|---|---|
| Layout (structure) | 100 | 100 | 100 | 100 | 100 | pass | ≥ 98 | 100 | 100 | compare/*.mask.clone.png byte-identical (md5) to reference/*.mask.png; .stamps.json |
| Scroll states | 100 | 100 | 100 | 100 | 100 | pass | ≥ 95 | 100 | 100 | .stamps.json states |
| Motion curves | – | – | – | – | – | – | - | - | - | 0 curves (reveals.desktop.json) |
| Detail (styles) | 100 | 100 | 100 | – | – | pass | ≥ 95 | ok | - | compare/detail.json (54/49/55 probes clean) |
| Hovers | 100 | – | – | – | – | pass | ≥ 90 | 100 | 100 | hovers.desktop.json |
| Load sequence | 98.76 | 100 | – (not scored) | 100 | 100 | pass | ≥ 95 | ok | 95-99 | compare/load.json: mobile `unstable`, reference noise 16.39 |
| Review (by eye) | 11/11 | 11/11 | 40/40 | 11/11 | 30/30 | pass | all closed | - | - | notes.md ## Review; tokens match frames.json |
| Notes (behaviours) | 19 cited | | | | | pass | - | - | - | notes.md:6-15 |
| Coverage (site code) | 12/12 scripts, 0/0 curves | | | | | pass | - | - | - | overstated: route inline scripts collapsed (ASTRO-5) |
| Interactions | 100% (26/26; "20 found by the capture") | | | | | pass | all | "10/10" (13 dropped) | 20-23 of 23 | compare/interact/report.json and compare-next/interact/report.json: 26 pass, `skipped: []` |
| Routes | 3 routes ≥ 98 / ≥ 95 | | | | | pass | ≥ 98 / ≥ 95 | 100 | - | Routes table below |
| Next | = clone on every row | | | | | | = clone ± 1 | = clone | = clone | REPORT.next.md; status.mjs:287-319 found no gap |
| Exit, time | 0, 81 min | | | | | | - | 0, 97 min | 0, 60-110 min | tl |

Routes (layout / states), both reports: `/en/tutorial/0-introduction` 100/100, tablet 99.85/99.9, 100/100, 100/100,
100/100; `/1-setup` and `/2-pages` 100/100 at every size.

Verified vs claimed: every number above is in a tool file (compare/, compare-next/). Claimed only by the agent:
"none skipped" (true: `skipped: []`), "the brief's campaign snippets are not present in their saved source" (false,
see ASTRO-5). The "26 vs 23" scenario count: 13 tab scenarios (the ones dropped in rc.3) + 13 navigation/expand; 6 of
the 26 are the agent's overrides by name of auto scenarios (interactions.json), so "20 found by the capture" is right.

## 4. Findings

**ASTRO-1** - A verified success. Control site ends at exit 0, every check 100 (load desktop 98.76), Next equal, in
81 min (rc.3: 97). Expected: exit 0, 60-110 min. Observed: as expected. Stage: whole run. Evidence: REPORT.md,
REPORT.next.md, tl 22:36:20. Impact: none. The stricter Phase 8 instruments did not break the easy site.

**ASTRO-2** - B, targeted issue resolved (A3). The 13 tab scenarios dropped in rc.3 now run; the 6 that cannot run are
`broken: true, pass: false` with errors, listed, and status routes each to "write under ## Findings … or rewrite it
in interactions.json" instead of counting it a pass. Evidence: evidence/interactions-before-rewrite.json (6 broken,
20 pass); cli/scripts/interact.mjs:299; status.mjs:240-241; tl said 22:24:08. Impact: honest report (accuracy).

**ASTRO-3** - C, not previously documented; tool defect (scenario drafting). Six auto scenarios "tabs Unit 1 (0/6
Complete) 1" at tablet and mobile on all three routes click `a.tab-link@5/@6` inside the closed
`mobile-starlight-toc` `<details>`; Playwright times out after 5000 ms on both sides. Expected: a drafted scenario is
runnable on the reference. Stage: capture (draft) -> C11. Evidence: reference/interactions.auto.json (the `@0` tab
list at tablet/mobile, `@1` at desktop); before-rewrite errors "locator.click: Timeout 5000ms exceeded" on reference
and clone. Root cause (confidence medium-high): `visible()` in cli/scripts/interactions-auto.mjs:11-16 checks box size,
display, visibility and opacity only; content of a closed `<details>` keeps a box and computed display, so the tabs
pass the filter at :86. Secondary: the error text "a selector found nothing" (interact.mjs:299) is wrong here (the
selector matched; the element was not operable). Alternative: the tracker opens on load on the live site at some
moment (no evidence for this). Impact: accuracy (6 scenarios unmeasured until rewritten), time (~2 min here).
Severity: minor here, major for a weaker agent (the tempting exit is `skip`). Cause location: tool defect. Fix (tool):
filter with `el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })` and
`!el.closest('details:not([open]) > :not(summary)')`; when the list sits in a closed disclosure, prepend a click on its
`summary` (same idea as the agent's rewrite); say "matched but not operable" in the error. Test: capture this site
again; interactions.auto.json has the tablet/mobile Unit 1 scenarios with a summary click first and all 26 pass with
no interactions.json.

Is the agent's rewrite legitimate? Yes. interactions.json keeps the six exact names, opens `mobile-starlight-toc
summary`, then clicks the 2nd and 3rd tab of that list (`.tab-list > li:nth-child(2|3) a`: structural, no random ids)
and shoots after each, the same intent as `@5/@6`. Both sides changed (`expect.ref/clone: true`) and the tab-2 and
tab-3 shots show different panels (compare/interact/-en-tutorial-1-setup-tabs-Unit-1-…-mobile-.tab-2/.tab-3.ref.mask.png),
so a dead tab on the clone would still fail on the end-state comparison. One small weakening: `expectChange` moved to
`mobile-starlight-toc .panels`, which the disclosure opening alone already changes; the end-state shots still carry
the test. It was done only when status named it (tl 22:24:08 -> 22:24:29), with the failing report preserved first.

**ASTRO-4** - C, not previously documented; tool defect (checkpointing). A seed that fails after its first write is
counted as done, and cannot be re-run without `--force`. Expected: status re-issues `seed` after a failed seed.
Observed: `seed` failed in browserPass (sandbox blocked localhost), the retry was refused, status printed "done: …
seed" and asked for brief 1 (tl 21:24:12). Evidence: cli/scripts/seed.mjs:381 writes `clone/index.html` (the
unprocessed mirror, `passFile`) before `browserPass` loads it at :548; seed.mjs:328-331 refuses when index.html exists;
status.mjs:96-101 treats `clone/index.html` existing as seeded. Confidence: high. Impact: accuracy/time; here 3 status
steps ran on a half-seeded clone, caught by the agent (seed --force 21:25:37, ~2 min). A weaker agent writes script.js
over raw markup with no template processing. Severity: major. Cause: tool defect (completion criteria). Fix (tool):
write the pass file to a temp name and rename to `index.html` only after browserPass succeeds, or write a
`clone/.seed-complete` stamp that status.mjs requires; let `seed` re-run without `--force` when the stamp is missing.
Test: run `seed` with the local server blocked (or kill Chrome mid-pass); status must print `next: npx trueclone seed`
and the retry must run.

**ASTRO-5** - C, not previously documented; tool defect introduced with the rc.4 per-page evidence (C2) and URL-hash
names (C4). Every inline script on a route page is saved under one file name and overwritten. Expected: each script
of each page saved once under a stable name. Observed: reference/routes/en__tutorial__0-introduction/scripts/scripts.json
lists 12 different scripts (766, 1756, 967 … bytes) all as `1d0a5c-script.js`; the saved `1d0a5c-script.js` (166 B)
is the Fathom campaign snippet, its `.pretty.js` (998 B) the sidebar-persist script, and the listener rows (`change`
at :1:634, `keydown` at :1:830) belong to the theme and tab scripts. Same for `7cab8d-` (1-setup) and `c63c8b-`
(2-pages). Root cause (confidence high): cli/scripts/capture.mjs:345 passes `new URL(r.path, home).href` without the
trailing slash; the document is served at `…/0-introduction/`, so `inline` in scripts-evidence.mjs:21 (`e.url ===
pageUrl`) is false and :127-129 names each inline script by the page URL's hash with basename `script`; files are
overwritten in a loop. The merge (capture.mjs:433-436) then keeps one entry per name. Impact: accuracy of evidence:
brief 2 and INDEX cite wrong code (compare/brief/desktop-2.md:29-40), the coverage gate reports "12/12" over 3
collapsed files instead of the routes' 36 inline scripts. On astro the route inline scripts duplicate the start
page's (theme, tabs, sidebar), so the clone was not harmed. The agent reported the symptom ("brief attributes …
handlers to wrong files") but misdiagnosed it, and notes.md:27 says the campaign snippets "are not present in their
saved source", which is false (they are the whole `.js`). Severity: major (an instrument that points at the wrong
code, the trust problem Phase 8 targets). Cause: tool defect. Fix (tool): decide `inline` by `e.url` equal to
`page.url()` after navigation (or by `!e.url` / the document URL normalised for a trailing slash and redirects), and
name inline scripts by content hash always. Test: capture astro; each route's scripts.json has no repeated `file`,
`inline-<hash>` names appear for routes, and `1d0a5c-script.js` no longer exists.

**ASTRO-6** - B, partially improved (C5). The captured-route filter now runs before the 8-link cap
(cli/scripts/capture.mjs:408-411) and links back to the start route are kept: "go to /en/getting-started" at tablet,
mobile and desktop from 0-introduction. But the start page itself has navigation only at mobile and tablet (`go to
/en/tutorial/0-introduction`), none at desktop (reference/interactions.auto.json). Hypothesis (confidence medium):
`detectInPage` stops at 40 visible links (`navs >= 40`, interactions-auto.mjs:108) and 48 scenarios (capture.mjs:251)
before the filter; at desktop the expanded Guide sidebar fills them, the hero's tutorial link comes later; at mobile
the sidebar is closed. Alternative: the desktop link failed `visible()`. Impact: accuracy (start page Back/address
untested at desktop). Severity: minor. Fix (tool): pass the captured paths into `detectInPage` and draft only links to
them (cap after). Test: re-capture; a desktop "go to /en/tutorial/0-introduction" scenario exists and passes.

**ASTRO-7** - B, targeted issue resolved (A1, D2 start address). The start page answers at its own path in the clone
(clone/en/getting-started/index.html) and in Next (next/app/(home)/en/getting-started/page.tsx); interact compares
relatively (clone `before: "/"`, reference `"/en/getting-started"`, pass) and route scenarios arrive at
`/en/getting-started` on both sides; no `replaceState` hack in clone/script.js. Evidence: compare/interact/report.json.

**ASTRO-8** - B, targeted issue resolved with a defect (C2, C4). Script evidence exists for every page
(reference/routes/*/scripts/) and is merged into reference/scripts/INDEX.md "Scripts of the other pages"; shared
files keep one URL-hash name across pages (13c165-Search… in all four folders). No script was fetched by hand (rc.3).
See ASTRO-5 for the inline-script collision. Cosmetic: INDEX.md lists `inline-65723d.js` twice.

**ASTRO-9** - A, verified success. Review by eye found two real behaviour defects that no number could (layout masks
text): the mobile TOC label shown at load on /1-setup, and the label advancing early on /2-pages. status put the
"differs" frames first (status.mjs:178-180); the agent fixed both by porting the reference's rule (empty label, 53 px
IntersectionObserver band; clone/script.js:145-168 vs fd78eb-starlight-toc pretty.js), re-shot, and closed them.
Evidence: tl said 21:49:48, 22:00:50; notes.md:38, 47; compare/review/routes/en__tutorial__1-setup/mobile/00-load-300.png.

**ASTRO-10** - C, not previously documented; weak verification (A9 design). The review token samples a 16x10 grid at
8 grey levels (cli/scripts/review.mjs:162-170), so a re-shot frame with a small fix keeps its token: the old
"differs" verdict stays valid for a changed picture, and a "same" verdict would survive a small regression (setup
mobile 00-load-300 kept `18w64` while its match moved 93.36 -> 93.43, per notes.md:20). Agent claim confirmed in source.
Impact: accuracy (a verdict can outlive the picture it judged). Severity: minor. Fix (tool): hash the full
downscaled frame (e.g. 64x40, 16 levels) or include the frame's pixel match rounded to 0.1. Test: change one label
in a clone, re-shoot; the token must change.

**ASTRO-11** - C, not previously documented; UX (status/report wording). After `score --only interact`, the verdict
line says "7 check(s) below target" (tl said 21:51:48, 22:03:03) although nothing failed: five checks were only stale
(all passed unchanged minutes later). REPORT.md "Scoring time: 1 min (full, only interact)" calls a partial score
"full" (compare/score-times.json `kind: "full", only: ["interact"]`). Severity: minor. Fix (tool): print "N below
target, M stale"; label partial scores "partial". Test: the same sequence prints "0 below target, 5 stale".

**ASTRO-12** - B, partially improved (B6). Next is reviewed by eye only on the start page at wide and mobile:
cli/scripts/next.mjs:844 runs `review --size` without `--route`, and status.mjs:311-314 compares only start-page frames.
The three tutorial routes of the app were never shot; REPORT.next.md's title says its review is the HTML clone's.
Severity: minor (numbers per route are compared). Fix (tool): shoot the app per route at wide and mobile. Test: a
planted app-only difference on /en/tutorial/1-setup produces a `next:equal` step.

**ASTRO-13** - B, known limitation outside the fix (machine-wide timing lock, plan-0.6 C4). The second 5-check rescore
took 18.1 min, of which the load step 961 s (compare/.stamps.json) queued behind other runs (the agent read the lock
file at 22:08, 22:10, 22:16: another run's load, then a journey measurement; transcript:1315-1355). No deadlock (it
cleared in 16 min). Status issues the post-fix rescore as two commands (`--only interact`, then the stale checks;
status.mjs:138-148), so each clone change cost two rounds. Impact: time (two fix loops 31.5 min, ~15 of it waiting).
Severity: minor. Fix (tool): one command re-measuring interact plus every stale check. Test: a fix loop on this site
runs one score command.

**ASTRO-14** - C, environment. The Codex sandbox (network off, workspace-write) failed capture, seed and brief once
each; the agent retried with escalation. Cost ~1 min, but it triggered ASTRO-4. Fix (docs/harness): the runbook's
"Full access" must be applied; `doctor` could test DNS and a localhost page load inside the agent's sandbox.

**ASTRO-15** - D, unresolved. The agent loaded `brainstorming` and `ponytail` skills from the user's global Codex
setup and said it used ponytail for the port. No visible effect on the port; it shows the run is not hermetic.

## 5. Time and loops

| Phase | UTC | Minutes |
|---|---|---|
| Skill read, capture (1 sandbox failure, 1 ok) | 21:17:33-21:19:32 | 2.0 |
| Reads (agent reads INDEX.md and 15 source files meanwhile) | 21:19:34-21:23:33 | 4.0 |
| Design, seed (fail + refusal), briefs (1 env retry) | 21:23:35-21:24:56 | 1.4 |
| Behaviours, Stack, `seed --force`, script.js | 21:24:56-21:27:03 | 2.1 |
| First full score | 21:27:09-21:36:34 | 9.4 |
| Review start page, 5 sizes | 21:36:36-21:44:00 | 7.4 |
| Review intro + setup routes (wide, mobile) | 21:44:00-21:49:41 | 5.7 |
| Fix loop 1: setup mobile TOC label | 21:49:41-21:57:54 | 8.2 |
| Review /2-pages (wide, mobile) | 21:57:54-22:00:50 | 2.9 |
| Fix loop 2: TOC intersection band (incl. ~15 min lock wait) | 22:00:50-22:24:08 | 23.3 |
| Interactions rewrite + interact score | 22:24:08-22:25:57 | 1.8 |
| `next --verify` (build + 7.4 min score + app review) | 22:26:09-22:35:39 | 9.5 |
| App frames by eye, final status | 22:35:39-22:36:20 | 0.7 |
| Wrap-up: notes, reports refreshed, RUN-LOG, final message | 22:36:20-22:39:00 | 2.7 |
| **Total** | | **81.1** |

- Inside trueclone commands ≈ 64 min (scores 37.9, next 9.5, reviews ~10, reads 3.8, rest ~3); agent-only work ≈ 17
  min. Sleeps (2300 s) all fell inside running commands; no idle time. Lock wait visible ≈ 15 min (ASTRO-13).
- Loop 1 (trigger: 7 setup-mobile frames "differs"): script.js changed + `seed --patches`; interact rescore (6 broken,
  unchanged), 5-check rescore (all 100, unchanged), re-review -> same. New evidence: yes (by eye). Metric gain: none
  measurable (already 100); visual defect closed.
- Loop 2 (trigger: 2 /2-pages mobile frames "differs"): ported 53 px band; same rescore pair (19 min); closed.
- Loop 3 (trigger: status "write under Findings … or rewrite"): interactions.json; interact 20/26 -> 26/26.
- Regressions: none. Re-scores: 6 (1 full + 5 partial); none on an unchanged clone.
- Earliest point all HTML acceptance criteria met: 22:25:49 ("every scored check meets its target"); Next at 22:34:46.
- Plateau: every measured check except interactions was at its final value from the first score (21:36:34).
  The 49 min after it went to by-eye fixes (real), the scenario rewrite, Next and the lock queue; none of it was
  wasted on gaming. Audit/report writing: RUN-LOG.md built row by row during the run, final message ~2.7 min.

## 6. Measured series

Written to `docs/eval-rc4/projects/astro.series.json` (29 points): `checks_below_target` at every REPORT.md verdict
(2, 2, 7, 2, 1, 2, 7, 2, 1, 0, 0; the two 7s are stale checks counted as below target, ASTRO-11),
`next_checks_below_target` (0, 0), `interactions_failing` 6 -> 0 and `interactions_passing` 20 -> 26, the final
layout/states/detail/hovers/load values, `load_step_seconds` 961, partial rescore and Next score minutes.

## 7. Score sheet

| # | Item | Score | Why |
|---|---|---|---|
| 1 | C0-C1 | 2 | right flags; the one retry was the sandbox's DNS failure, not a re-capture |
| 2 | C2/C3 | 2 | n/a |
| 3 | C4-C6 one go each | 1 | reads and design once; seed took fail + refusal + `--force` (tool defect ASTRO-4 + environment, not the agent) |
| 4 | C7-C9 | 2 | both briefs read, 19 file:line citations, rules ported in own code (TOC, tabs, checklist, theme) |
| 5 | C11 | 2 | every try changed clone/, no re-score of an unchanged clone, nothing set aside |
| 6 | C13 | 2 | 103 frames with tokens, every sheet viewed, two real "differs" found and fixed; no frame below 85% |
| 7 | C14 | 1 | complete and evidenced, but the brief-attribution finding misses the cause and states a falsehood (ASTRO-5) |
| 8 | C15 | 2 | REPORT.next.md equals REPORT.md on every row |
| 9 | C16 | 2 | exit 0; final message matches REPORT.md/REPORT.next.md |
| 10 | No check-ins | 2 | one user message |
| 11 | Numbers vs Expect | 2 | layout/states 100, interactions 26/26 (≥ expect), hovers 100, load 98.76-100 (mobile unscored, reference unstable), Next = clone |
| 12 | By eye | 2 | evaluator inspection of saved frames, not a live render: ~96 (wide and mobile, start page and routes: same structure, columns, cards, tracker, sticky header; template text/media placeholders; logos as grey boxes) - within 96-97 |
| 13 | Time | 2 | 81 min (budget 60-110) |
| | **Total** | **24/26 = 92/100** | |

Separate scores (0-10): final implementation quality **9** (pixel-identical structure, behaviour ported, local search
stand-in); workflow adherence **9** (loop followed step by step; extra skills loaded); verification quality **8**
(found two by-eye defects and three real tool defects; one misdiagnosed; Next routes unreviewed by tool design); time
efficiency **7** (inside budget; 15 min lock queue and doubled rescores); handoff accuracy **9** (matches artifacts;
one false sentence in Findings).

Phase 8 instruments on the control site: A1 start address - ran and passed (ASTRO-7). A3 dropped scenarios - ran,
caught 6 un-runnable scenarios honestly (ASTRO-2), exposed a drafting defect (ASTRO-3). C2 per-page script evidence -
ran, but corrupts route inline scripts (ASTRO-5). C5 navigation cap - filter-then-cap and the link back ran; start page
lacks desktop navigation (ASTRO-6). Also seen working: B1 tries, B4 (Findings edited after exit 0 did not reopen Next),
A8 Next within a point, A9 tokens (coarse, ASTRO-10).

## 8. Top recommendations

1. **Fix route inline-script naming** (ASTRO-5): `inline` from the navigated document URL, content-hash names always.
   Tool, scripts-evidence.mjs:21,127 + capture.mjs:345. Release-blocker: **yes** (evidence and coverage point at the
   wrong code, silently).
2. **Seed completion stamp** (ASTRO-4): write index.html last or require `clone/.seed-complete`; allow a plain re-run.
   Tool, seed.mjs:381 + status.mjs:96. Release-blocker: **yes** (one browser hiccup leaves a half-seeded clone that
   status calls done; likely under Codex's default sandbox).
3. **Draft operable scenarios** (ASTRO-3): `checkVisibility()` and closed-`details` awareness, auto-open the disclosure,
   correct the error text. Tool, interactions-auto.mjs:11-16,85-91; interact.mjs:299. Release-blocker: no.
4. **Filter navigation to captured routes inside `detectInPage`** (ASTRO-6) so desktop start pages keep their nav.
   Tool, interactions-auto.mjs:103-118. Release-blocker: no.
5. **One rescore per clone change, and "stale" not "below target"** (ASTRO-11, ASTRO-13). Tool, status.mjs:132-149,
   report verdict line. Release-blocker: no (time and clarity).
6. **Finish B6 and tighten tokens** (ASTRO-12, ASTRO-10): app review per route at wide/mobile; a finer review token.
   Tool, next.mjs:844, status.mjs:311, review.mjs:162. Release-blocker: no.
