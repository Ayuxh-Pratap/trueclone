# rc.7 issue ledger

Every issue from the RC5 zero test, the RC6 evaluation (`C:\dev\tc-tests\rc6-results\evaluation\REPORT.md`, kept
outside this repository with its private evidence), the earlier release blockers still open, and what rc.7's own
work found. Rules: `docs/policy.md`. What changed: `docs/rc7-notes.md`. Readiness and retest: `docs/rc7-status.md`.

## Legend

**Scope.** G global; M mode-specific (T template, X exact, A canvas app); B behaviour- or check-specific; S
site-specific; E agent or environment.

**Confidence of the evidence.**

| Code | Meaning |
|---|---|
| R | reproduced (a script or a test fails without the fix) |
| C | established from the code |
| H | hypothesis (the original output is lost, or not reproduced) |

**Status.**

| Status | Meaning |
|---|---|
| Fixed + test | changed, with a test that fails without the change |
| Fixed | changed, with no dedicated test |
| Limit | documented, not fixed (why given) |
| Agent | not a tool defect |
| App | the clone's own work, kept visible |

**Verified.** The test or replay that passed, on this tree.

**Release.** Whether public release depends on it:

| Code | Meaning |
|---|---|
| B | yes |
| C | the next campaign must confirm it |
| – | no |

## 1. RC5 zero defects (fixed in rc.6), and what RC6 showed

| ID | Issue | Fix (rc.6) | RC6 evidence | Verified | Release |
|---|---|---|---|---|---|
| R5-1 | own-bundle files recorded empty (Chrome hands over no body for a Blob-consumed fetch) | recorder verdicts, bounded recovery, provenance (`lib.mjs recordBundle`) | zero: 66/66 whole, 11 recovered, sizes and sha1 match | verified effective (zero, live); `test/browser/bundle.test.mjs` | – |
| R5-2 | status crashed on a "differs" review frame | review objectives carry `below: []`; status's crash net (Blocked, owner tool) | astro: the step was issued 4× without a crash | verified effective (astro) | – |
| R5-3 | the reference journey drew the gesture before the gate appeared | `journey.mjs gateStep` | zero: gate passed at both sizes, "XP" reached, `errors: []` | verified effective (zero, live); `test/e2e/journey-gate.test.mjs` | – |
| R5-4 | re-capture steps dropped exact mode and other flags | one `recapture()` keeps the site's settings | not reached in RC6 | unit test; the permission is now also quoted safely (RC6-20) | C |
| R5-5 | a re-read reference left calibration and journey results looking current | calibration and journey identity invalidated | zero: status asked for calibrate after journey; journey results "invalid" | verified effective (zero); now judged by content (RC6-26) | – |
| R5-6 | a stale "differs" frame counted as passed | passes only when shot again and closed | not reached | unit test | C |

## 2. RC6 findings

Scope, confidence and the files changed. "Accept." is the acceptance criterion; how each was verified is in the
"Verified" column.

| ID | Issue | Scope / conf. | Cause → contract | rc.7 fix | Regression test | Accept. | Verified | Release |
|---|---|---|---|---|---|---|---|---|
| RC6-01 | clone and app review verdicts collide (zero: 52 frames flip) | G, A / R | one `## Review` list read by id + size for both sides | separate `## Review: app` section (`verdict.mjs reviewVerdicts`); status, review and journey indexes, skill, test helper (own app tokens) | contracts: both orders with different tokens; app lines under the clone heading | zero replay closes both reviews | Fixed + test; zero decision replay: both reviews pass | B |
| RC6-02 | template review flags every placeholder text; a clipped skip link first (astro) | M T / R | clone-only text test has no notion of the seed's own text; clip ignored | `inview.mjs`: the seed's own text (`.seed-base*.html`) exempt in template mode; clipped/sr-only not in view | `test/browser/inview.test.mjs` | astro: 0 placeholder clone-only frames; added text still flagged | Fixed + test; live re-shoot of astro pending (rc7-status §4) | B |
| RC6-03 | status names a step that cannot change anything, without limit (astro, allbirds) | G / R | no counter of named-but-ineffective steps; review step on an unchanged clone | `progress.mjs` (failed/ineffective/idle counters, journal), review objective step = the clone change, declarations | contracts: ran without effect; idle + declaration (work step, objective); never-run command | no step named > 2× after running without effect | Fixed + test; astro decision replay escalates at the 4th naming | B |
| RC6-04 | a repeated error or an unrun plan leaves "Incomplete … verified as they are" with nothing listed | G / R | errors classified by a word list; plan excluded from re-measure; outcome built from objectives only | `failures.mjs` classification; error ledger counts measurements; plan scheduled; `accounting.mjs`; pending at an outcome is Blocked | contracts: 4 repeated errors by owner, clone-owned error, missing and stale plan, accounting set equality | every terminal outcome accounts for every item; audit finds nothing | Fixed + test; replays: heybhaskar retries once (migration), zero ends Incomplete 122/126 passed, 4 listed | B |
| RC6-05 | the lint rejects trueclone's own output (allbirds) | G / R | origin substring anywhere in the file; seed output not distinguished | `loadsOrigin` (loads only); owner per finding; seed-owned → Blocked; patch named; capture and seed producer side (see §5 F) | contracts: selector and marker not loads; seed-owned Blocked; patch-owned names the patch | allbirds: 0 findings | Fixed + test; allbirds decision replay: no lint step | B |
| RC6-06 | REPORT crashes on a lint check; score exits 0 | G / R | the lint check has no units; report exit ignored | report renders units-less checks; score and status propagate a report failure | contracts: lint row renders; score fails on an unwritable REPORT | — | Fixed + test | B |
| RC6-07 | encoded route names 404 in the clone server (elise) | G / R | encoded identity, encoded folder, decoding server | `routes.mjs` one rule; capture, seed, serve, checks, next, interact | `test/routes.test.mjs`; `test/e2e/routes-site.test.mjs` (space, parentheses, café, %25: 200, measured; bare % 400) | elise Landing measured | Fixed + test; Next probe: encoded folders (decoded 404) | B |
| RC6-08 | parallel checks crash on the shared hash cache (heybhaskar) | G / R | unguarded parse of a file rewritten in place | tolerant read, atomic write with Windows retries; results and loop files too | contracts: 8 processes × 25 rounds, 0 failures, one hash; corrupted cache tolerated | 0 failures in the trials | Fixed + test (a sample: not a proof that no race remains) | B |
| RC6-09 | Desktop and Mobile columns swapped | G / R | hard-coded header | header from the size list | contracts: distinct values per size under their own header | — | Fixed + test | B |
| RC6-10 | a failure's cause lost ("states exit 1: Node.js v24.19.0") | G / R | last line kept; CRLF | `failureLine`; full step log kept; error units carry kind and log | contracts: failureLine on the RC6 stack shape | — | Fixed + test | B |
| RC6-11 | behaviour killed at a fixed limit loses finished units | G / R | results written at the end; fixed 20 min | units written as measured, kept on rerun; score limits from the work | `test/e2e/resume.test.mjs` (kill after one unit, rerun keeps it) | — | Fixed + test (see rc7-status §3.1 for the e2e result) | B |
| RC6-12 | calibrate: no resume, draws deleted on rerun, no log, error lost, "5-15 min" | G / R (mechanism), H (varsity's exact exception) | rm per draw; output in memory; estimate fixed | progress kept and resumed; log; failed.json and no partial noise; EPIPE guard; estimate from shots and scroll steps | `test/e2e/resume.test.mjs` (kill after one check, resume) | varsity-like timing printed; nothing lost on rerun | Fixed + test; varsity estimate 107 min (11-213) vs ~160 projected | B |
| RC6-13 | a killed step's timing lock blocks others; doctor says "running" | G / R | lock liveness by time only | pid in the lock, dead holder taken over, score releases a killed child's lock, doctor reports it | contracts: dead holder taken over; resume e2e: no lock after a kill | — | Fixed + test | B |
| RC6-14 | REPORT stale through the loop | G / R | rendered only after score or a terminal status | status renders when its inputs changed; render time in REPORT | contracts: a verdict edit shows at the next status | — | Fixed + test | C |
| RC6-15 | seed styles keyed by position: allbirds +750 px | G / R | positional paths shift between sizes | see §5 F | see §5 F | allbirds height within 1% | see §5 F | B |
| RC6-16 | layout blind to extra height on a near-white page | G / R | white padding matches | see §5 F | see §5 F | a 10% longer page scores below the bar | see §5 F | B |
| RC6-17 | router views and second-level pages never captured (elise 3 of 8) | G / R | discovery from the top page only | breadth-first over captured pages; `routesFound`, `routesNotCaptured`; status asks once; REPORT lists | routes e2e (second-level pages found, one beyond the cap listed); contracts RC6-17 | elise: 7 of 8 views found (NASA.html is only in a script's map: Limit) | Fixed + test | C |
| RC6-18 | mobile nav behind a closed menu dropped | G / R | detector clicked once | opener found and replayed first; menu toggle scenario | `test/browser/menu-opener.test.mjs`; routes e2e (mobile scenario replays) | — | Fixed + test; widgets at mobile: Limit (seed reads desktop widgets only) | C |
| RC6-19 | status's stop text contradicted its behaviour | G / C | text ahead of behaviour | text, skill, AGENTS.md and prompt state the recovery policy | skill lint | — | Fixed | – |
| RC6-20 | permission recorded as `"site` (varsity's launcher) | G, E / R | no validation; unsafe quoting | status quotes safely; REPORT flags a truncated permission; capture validation (§5 F) | §5 F | — | Fixed (status, report); capture §5 F | – |
| RC6-21 | auditor writes into the run and misses a run that did not end | G / R | `evaluate` writes hash caches; no terminal check | read-only evaluation; terminal, accounting, console/outcome/REPORT agreement | contracts: snapshot equal; "in progress" is a finding | — | Fixed + test | B |
| RC6-22 | live shop.app iframe in a shadow root (template); a selector matching nothing | M T / R | placeholder pass misses `<template shadowrootmode>`; src-less iframe selector | §5 F | §5 F | — | see §5 F | – |
| RC6-23 | structure mode hides iframes: an empty stage scores 100 (elise) | G / R | `iframe{visibility:hidden}` in the mask | §5 F | §5 F | — | see §5 F | C |
| RC6-24 | wording: "every frame closed" while failing; duplicate exit-3 lines; activity from the first measured status only | G / C | — | review row truthful; app items labelled; activity from the first status call | contracts (report rows) | — | Fixed | – |
| RC6-25 | doctor in a sandbox; agents differ (elise waited 19 min) | E / R | setup not stated | doctor explains no-network and how to run; AGENTS.md, skill, policy "Permissions and preflight"; plan records the setup | — | doctor ok in the chosen setup before capture | Fixed (docs + doctor) | C |
| RC6-26 | calibration staleness by file times (a copy recalibrates) | G / R | mtime comparison | noise.json records the reads' content hash | resume e2e (noise has reads.sha1) | — | Fixed + test | – |

## 3. Found by rc.7's own work and replays

| ID | Issue | Scope / conf. | Fix | Test / evidence | Release |
|---|---|---|---|---|---|
| RC7-27 | a journey the reference varies on could only be "not verifiable" (no envelope measured); a states unit judged by its varying frames ignored its stable ones | M A, B / R | units judged frame by frame (`verdict.mjs`); journey envelopes from the calibration draws, interface text by the same rule | contracts RC7-27; zero measurement replay: desktop fails at 2 checkpoints outside the reference's range, mobile fails its stable load frame; all other varying checkpoints within their draws | B |
| RC7-28 | an RC6 loop record's error entries (no measurement time) read as a second measurement: heybhaskar Blocked on the first rc.7 status | G / R | entries without a time count as one | heybhaskar as-is replay retries once | – |
| RC7-29 | an objective's step that starts with a look command (explain) would have counted as "ran without effect" | G / R | objective steps are work steps | contracts (objective declaration) | – |
| RC7-30 | a clone seeded by older seed code was never re-seeded after an upgrade (RC6 seed defects would persist) | G / C | `.seed.json` records the seed's code; status re-seeds on a change | helper; status | C |
| RC7-31 | REPORT said "Libraries: none" for libraries bundled into the site's modules (ALLBIRDS-12 part) | G / R | library signatures in the site's own scripts (excluded widgets left out) | replays: allbirds GSAP, ScrollTrigger, Swiper; varsity unchanged; astro/elise/bhaskar none | – |
| RC7-32 | the animation-stop lint counted occurrences: a multi-page clone repeats styles | G / C | compared rule by rule; script stops against the site's scripts | contracts (lint) | – |
| RC7-33 | calibrate wrote noise.json from whatever finished, silently, when a check failed | G / C | a failed check writes no noise.json | resume e2e | B |
| RC7-34 | the reference's own interface text varies between loads (zero's XP counter) | M A / R | text judged against the nearest draw | zero replay: step-1 mobile passes on text | – |
| RC7-35 | Next.js 16.4 `next build` alternately fails with a security "upgrade nudge" (scratch probe) | M / R? | see §5 G | §5 G | C |

## 4. Earlier release blockers (`docs/rc5-status.md` §4C) and deferred defects

| ID | Issue | Status in rc.7 |
|---|---|---|
| 4C-1 | no run on a real site | RC6 ran six; none terminal. Now: the campaign (`docs/test-plan-0.5-rc7.md`) |
| 4C-2 | `holdStill` on heavy pages unmeasured | RC6: every calibration self-consistent (allbirds 117 keys at 100, zero 57, elise 310, varsity draws within 0.15) and no capture broken by it; cost is the scroll steps (rc7-status §2). No longer a blocker; time remains a C item |
| 4C-3 | behaviour has not met a real site | partly: astro n/a everywhere (nothing moves); heybhaskar killed before finishing (two 66.67 results lost). Still open: needs the campaign |
| 4C-4 | the loop window rests on one historical run | unchanged; the campaign measures it |
| 4C-5 | deferred defects a user would meet | ALLBIRDS-5, ALLBIRDS-7, VAR-11c, VAR-11h, ALLBIRDS-12: §5 G / F |
| 4C-6 | no full loop to exit 0 with the Next.js build | still open: needs the campaign |

## 5. Fidelity (F) and app-generator (G) work, and their results

Each test listed fails on the rc.6 scripts and passes on rc.7.

| ID | Fix | Test | Verified result | Release |
|---|---|---|---|---|
| RC6-05 (producer) | capture marks its exclusion style (`data-tc-ignore`) and leaves it out of rendered.html; seed removes the marked style (or the legacy exact shape), elements matching meta.ignore, and excluded-origin marked elements, open shadow roots included; nothing else | `test/browser/seed-fidelity.test.mjs`, `test/e2e/fidelity-capture.test.mjs` | allbirds scratch re-seed: no exclusion residue | B |
| RC6-15 | inline styles keyed by unique id or `tag[n]` steps from the nearest id'd ancestor, with a tag/class signature; keys whose element differs across sizes left out; seed verifies each key on the untouched mirror and never applies one that finds another element | `test/fidelity.test.mjs`, seed browser test, fidelity e2e | allbirds re-seed: desktop 5912 = reference 5912 (was 6662); tablet, laptop, wide exact. **Mobile 6492 vs 5820** (the footer; already +672 in RC6; needs a re-capture with the new keys, unverified) | B (mobile: C) |
| RC6-16 | padding is a sentinel colour always counted as different | `test/fidelity.test.mjs` | RC6 allbirds images recomputed: layout 88.73 (was 99.99); an image against itself 100 | B |
| RC6-23 | structure mode paints an iframe as a flat box (presence and box compared; content still masked) | `test/browser/mask-iframe.test.mjs` | an empty stage or a moved frame scores below 98; different frame content still 100 (an empty frame in place is left to layout-real and the review: Limit) | C |
| RC6-22 | template placeholder pass reaches open shadow roots (frames, media, links); src-less frame exclusions use class/name/title or record why; an `about:blank` frame no longer empties the third-party list (found here) | seed browser test, fidelity e2e | allbirds' shop.app frame now about:blank. Text inside shadow roots is not placeholdered (older gap: Limit) | – |
| elise frames | exact mode points a same-host frame at the captured route's local page (query kept); uncaptured ones stay, are warned and recorded (`.seed.json liveFrames`, REPORT lists them); the seed's own browser pass loads nothing off the local server | seed browser test | elise re-seed: Landing and About frames local; New Craft Society listed live (not captured). One development re-seed loaded elise-ux.com frames before the block was added | C |
| ALLBIRDS-7 | images decoded before the placeholder alpha test (D5); closed dialogs: same cause as RC6-15 (D4), fixed by it | seed browser test | RC4 and RC6 allbirds re-seeds: all four policy modals keep `display:none`; floating images become silhouettes | – |
| RC6-20 (capture) | `--permission` trimmed; empty, stray-quote or unbalanced values rejected before anything runs | `test/fidelity.test.mjs` | — | – |
| page errors | `meta.pageErrors` per route: count and up to 5 messages; REPORT lists them | fidelity e2e | errors thrown in timer callbacks under the page clock never reach Playwright (Limit) | – |
| RC7-30 (producer) | `.seed.json` records `code` and `tool` for document and own-bundle seeds | – | status re-seeds on a change | C |
| RC7-36 | reveal and widget players keyed by position: allbirds resolved 0/8 reveals, 0/3 widgets (found by F) | records carry a stable `id` and signature (`keys:"id-path"`); seed finds and checks every record before marking, never marks another element; status reads reveals and widgets again when their records predate rc.7 | `test/browser/seed-fidelity.test.mjs` (rc.6 marks a reveal on `.hero`) | allbirds' RC6 records (positions only): 0/8 and 0/3 found, none applied to a wrong element; a fresh read is needed (the campaign captures fresh) | B |
| RC7-37 | the structure mask changed (RC6-23): reference masks taken with the old one compared unevenly | capture records `maskVersion`; status captures again when it differs | contracts RC7-37 | the elise measurement replay showed it: start page 5.33 against an rc.6 mask (Landing and About 100) | B |
| RC7-35 / Next | (G) generated `next.config` sets `experimental.agentUpgrade: false`; the pin moved from 16.4.0 (two critical advisories, npm audit) to 16.4.2 (audit clean, 8 days old) | `test/next-generator.test.mjs`; a real `next build` of the fixture with 16.4.2 | probe: with the agent environment, builds 1/0/1 before, 0/0/0 after; 16.4.2 builds | B |
| VAR-11c | (G) text keeps its line breaks and no-break spaces | `test/next-generator.test.mjs` | edge whitespace alone at an element's edge and `pre-wrap` spaces still collapse (Limit) | – |
| ALLBIRDS-12 (TS2352) | (G) `!important` inline styles as `string` | generator test; real build | type-checks | – |
| ALLBIRDS-5 | (G) dialog openers and expand toggles outside the header as scenarios, each checked to close on the reference | `test/browser/dialogs-arrival.test.mjs` | replays end where they started on both sides | C |
| VAR-11d | (G) a scenario that navigates is shot at the same page age on both sides (interaction cache key v5: references measured again) | `test/browser/dialogs-arrival.test.mjs` | — | – |
| VAR-11h | (G) app scripts start after hydration | – | Limit, documented in the skill | – |

## 5c. Remaining limitations: disposition, not a fix

None of these is fixed. Their full reconciliation is in `docs/rc7-status.md` §5.

| Limitation | Disposition | Release |
|---|---|---|
| router-only pages not discovered | accepted, disclosed scope limitation (explicit `--routes` list supported; elise uses it) | – |
| widgets read at desktop only | unresolved product defect (P2), disclosed | C |
| template mode: shadow-root text keeps its original wording | unresolved product defect | B |
| structure mode: an empty frame in place | accepted measurement design (real-pixel layout and the review judge content) | – |
| allbirds mobile height (6492 vs 5820) on the RC6 capture | observation requiring the fresh capture | C |

## 6. Agent and environment (not tool defects)

| ID | What | Disposition |
|---|---|---|
| E-1 | varsity: the agent's own wrapper quoting broke the first capture and truncated the permission | agent; rc.7 rejects a malformed permission (F) and documents quoting-free commands |
| E-2 | varsity: the agent's 1-hour launcher timeout killed cmd.exe, not calibrate | agent, invited by the tool's estimate; rc.7: the estimate from the work, background + "waiting", logs and EPIPE guard |
| E-3 | the sandbox without network (every run); elise waited 19 min for the user | environment; rc.7 doctor and the plan state the two supported setups |
| E-4 | zero: after the run, the same agent thread deployed a copy publicly and changed it | out of TrueClone's scope; not test evidence; not altered or redeployed by this work. Decision for the owner (rc7-status §7) |
| E-5 | the RC6 prompts' stop rule (stop on any command error) | test instruction; it stopped heybhaskar and varsity where status had a supported next step; rc.7's prompt stops only on terminal exits and two backstops |

## 7. Application work to keep visible in the next campaign (not tool defects)

| Site | What | Evidence |
|---|---|---|
| astro | the mobile tutorial tracker shows a label the reference leaves empty and selects the wrong section (`clone/script.js:165,172`) | RC6 review frames; layout scored 100: only the review sees it |
| heybhaskar | case-study routes: layout 9.7-16.1 at desktop, laptop, wide; reduced motion 11-15 at desktop; two behaviour results at 66.67 (reasons lost) | RC6 results |
| zero | journey: desktop step-18 and step-20 outside the reference's own range; mobile load checkpoint 50.3 against a reference stable at 99.7 | rc.7 measurement replay (offline, real data) |
| elise | the agent's CSP patch blocked live iframes (a containment workaround); the seed gap behind it is fixed in rc.7 (F) | RC6 clone/patches |

## 8. The RC7 campaign's Elise run (2026-10-23, 0.5.0-rc.7): fixed in rc.8

Evidence: `C:\dev\tc-tests\RC7\elise\sites\elise-ux` and `C:\dev\tc-tests\RC7\results\elise` (preserved). The run ended
Blocked (owner tool) after `reads` failed twice; the campaign gate stopped there. Nothing about fidelity was learned.

| Id | Defect | Root cause (established) | Fix | Tests | Status |
|---|---|---|---|---|---|
| RC7-E1 | reads timed out on the start page's load event (widgets, motion, spec, reveals crashed; states fell back); capture lost `/NASA%20(Draft).html` and three inline-style sizes the same way | not a hung request: the start page is a shell whose view iframes autoplay ~12.6 MB of video and load ~6 MB of photos (20.9 MB, HTTP/2); at the ~300-400 KB/s this machine gets from the site, load came at 46 s (start page) and 57 s (`NASA (Draft)`) for one visitor, and later when reads loaded it side by side. A fixed 60 s limit cannot tell slow from stalled; four readers also skipped the shared readiness (`openUrl`) and crashed | readiness is the load event, waited for while bytes or requests keep arriving; fails on 30 s of silence or a 10-minute ceiling (`lib.mjs gotoLoaded`). Capture requires it (`loadLive`; a stall is the live page not loading, owner environment); every read uses `openUrl` (a stalled request: the parsed page, said) | `test/browser/load-readiness.test.mjs` (slow behind an iframe waited for; stall; ceiling; the old fixed limit fails; owner) | Fixed + test; live probe below |
| RC7-E2 | capture listed `/NASA%20(Draft).html` as captured ("each captured at 5 sizes", `routesNotCaptured: []`) and counted it among "8 separate page(s) mirrored" right after "not mirrored" | a route joined `meta.routes` before it loaded; a failed size only printed a warning; the mirror counted pages attempted | a route is captured at every size (and its own page saved) or listed in `routesNotCaptured` with the sizes and error, and dropped from routes, scenarios and navigation; the mirror counts pages mirrored. It stays required: not verifiable (owner from its error), so the run is at best Incomplete with it named, never Verified on the routes that loaded | `test/e2e/capture-failed-route.test.mjs` (fails everywhere; fails at mobile only through the load readiness); `test/contracts.test.mjs` RC7-E2b (Incomplete, not Verified; REPORT covers the routes captured, not the request) | Fixed + test |
| RC7-E3 | the Blocked outcome recorded 323 items pending, 0 blocked | `blockedEarly` accounted unreached items as pending, against the contract that nothing pending is ever terminal | at Blocked, every item still pending is blocked by the cause (`account({ blockedBy })`): owner, "not reached" and the cause | `test/contracts.test.mjs` RC7-E3/E4; corrected status on a copy of the run: 323 blocked, 0 pending | Fixed + test |
| RC7-E4 | the auditor called that outcome consistent | Blocked was exempt from "nothing pending" and from "has accounting" | pending at any terminal outcome is a finding; so is a Blocked with required items and no accounting (unless trueclone crashed), a blocked item without an owner, counts that do not add up | RC7-E3/E4; the corrected auditor on a copy of the run: "323 item(s) are still pending at a blocked outcome" | Fixed + test |
| RC7-E5 | (found while fixing E3) the Blocked message says to run status again once a fixed version is installed, but the failure count would re-block at once | the inputs a repeated failure is counted on did not include the trueclone version | the installed version is one of those inputs | RC7-E5 | Fixed + test |

Live probe (2026-10-24, from this machine): the start page alone reached load at 46.4 s; `NASA (Draft).html` at 56.7 s;
four start pages at once: one at 26.5 s, one not within 90 s (images of the About view queued behind video downloads).

## 9. The RC8 Elise retry (2026-10-24, 0.5.0-rc.8): fixed in rc.9

Evidence: `C:\dev\tc-tests\rc8-elise-retry1` (kept as it was) and its copy `C:\dev\tc-tests\rc8-elise-retry1-evidence`, with
`ORIGINAL-MANIFEST.sha256.txt` (7,444 files). The network was good throughout this run.

**The run, from its journal.** capture 06:42 (9 min, `--routes 1000 --bundle`), reads (9 min), calibrate (72 min),
design, seed and two briefs (1 min), score (48 min, exit 1), status's retry of the failed checks (15 min), then Blocked
(owner tool) at 09:16. 2 h 34 min in all, 63 min of it scoring a clone that could not answer five of its nine routes.
The agent did not run the prompt's explicit nine-route list: it captured with `--routes 1000` (discovery found all
nine anyway) and added `--bundle`, the own-bundle mode, which the prompt did not ask for.

| Id | Defect | Root cause (established) | Fix | Tests | Status |
|---|---|---|---|---|---|
| RC8-R1 | the clone had no page for /Kruiz.html, /AISS.html, /NASA%20(Draft).html, /Codazen.html, /NASA.html: every check on them was `net::ERR_HTTP_RESPONSE_CODE_FAILURE` on 127.0.0.1 (70 errors) | with `--bundle` the clone is the bundle, and the bundle was recorded on one desktop load of the start page: it held the start page, the two views the shell iframes and one it prefetched. The seed's bundle branch never consulted `meta.routes`, counted only the main frame's document (`pages: 1`), and status called the 84 files "whole" | capture records every captured page into the bundle and fetches whole every file it saved that the pages did not load (`bundle-complete.mjs`); `record-bundle <name>` does the same for an existing capture without capturing again; status names it when the bundle lacks a route's page or a saved file, and is Blocked (owner environment) if it is still missing after; the seed refuses a bundle without a route's page; any frame's document is a page | `test/e2e/bundle-routes.test.mjs` (shell + iframe view + encoded and plain pages, served and measured; an rc.8 bundle completed); RC8-B1 | Fixed + tests; recovery shown on a copy of this run |
| RC8-R2 | missing images and wrong-looking About page: the About galleries' photos (`ctc-*`, `uci-*`, `friends-*`), the New Craft Society and project videos absent; About scored 75.7-88.5 (real pixels), 74-91 (scroll states) | the same: 76 of the 144 files the capture saved were never in the bundle, so the clone's service worker answered them 404 ("not recorded"). The capture's own asset list is no substitute: it held `cs-4.mp4` as a 206 range of 25,252 of its 680,612 bytes | as RC8-R1: the missing files fetched whole through the recorder's validation (status 200, own declared length, media type) | RC8-B1, the e2e; on the copy every one of them is served whole | Fixed; the About and New Craft Society scores must be measured again |
| RC8-R3 | an hour of scoring before the missing pages were known | no check that each captured route has its page in the clone | after the seed, status checks from the files that every captured route of its own document has its page, Blocked (owner tool) at once if not | RC8-B2 | Fixed + test |
| RC8-R4 | REPORT: "313 required result(s) cannot be measured; 0 not reached"; 63 measured failures shown "not reached", owner tool | rc.8's accounting at Blocked (RC7-E3) turned every pending item into "blocked, not reached", measured failures included | measured failures are "failing" (the clone's, open), unretried errors stay errors with their owner, only unmeasured items are "not reached"; REPORT counts the three apart; the auditor rejects a measured result shown as not reached | RC8-B3 | Fixed + test |
| RC8-R5 | "behaviours (0 cited)" and two briefs asked for, in own-bundle mode | the bundle runs the site's own code: nothing is ported, so neither is required; status still listed and asked for them | status asks for neither in own-bundle mode and says why | (status text) | Fixed |
| RC8-R6 | `npm install` reports 4 high-severity findings | one advisory (zod < 4.6.6, memory exhaustion on oversized constrained collections) counted through its dependents: zod 3.25.76 for `@google/design.md` 0.4.0 (requires `^3.24.0`; no patched 3.x exists) and zod 4.4.3 pinned by `rea-agents` (6.7.0, its latest, still pins it). Both run inside the CLI on local inputs it writes itself (DESIGN.md lint; REA, the optional deep case); the generated Next.js app does not depend on zod | none applied: npm `overrides` in a published package do not reach its users, and forcing zod 4 on `@google/design.md` would break it. Disposition: low practical exposure (local, trusted input; denial of service only); fix upstream (`rea-agents`: depend on zod `^4.6.6`; `@google/design.md`: move to zod 4) | – | Documented |

**Open, measured again only after rc.9 (not fixed, not waived):**
- the four nav links' hovers ("WRONG OUTCOME", desktop 0);
- the About page's horizontal scrollers (interactions 82.9-91.5);
- the shell's view transitions (94.7-97.5);
- the reference start page shows "About" underlined in the nav while the home view is shown (`reference/desktop.png`). This is a hypothesis about the reference's own state at capture (a hover, or the shell's last view), not established.
