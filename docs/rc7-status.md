# 0.5.0-rc.7: readiness, what must be tested again, release gates

Date: 2026-10-23. Supersedes `docs/rc5-status.md` (its rubric, §4 there, is kept unchanged here). What changed:
`docs/rc7-notes.md`. Every issue: `docs/rc7-ledger.md`. The next campaign: `docs/test-plan-0.5-rc7.md`.

Four kinds of evidence are kept apart on this page:

- **Automated:** `npm test`, `npm run test:browser`, `npm run test:e2e`, on fixtures in this repository.
- **Artifact replay:** the rc.7 code run on copies of the six RC6 site folders (real recorded data). A *decision
  replay* re-stamps the RC6 results as measured by the current code to exercise the decisions on them; it is a
  simulation and is named as one. A *measurement replay* measures again, offline, from the recorded reference.
- **Targeted live check:** one bounded probe of a live site, with its hypothesis and stopping condition written first.
- **End to end:** a full agent run on a real site to a terminal outcome. None exists yet for any site on any version
  since rc.4.

## 1. Executive outcome

- **Every finding has a disposition.** All 26 RC6 findings, the RC5 fixes, the open earlier blockers and deferred RC4
  defects, and the 11 issues rc.7's own work and replays found (RC7-27 to RC7-37) are listed in `docs/rc7-ledger.md`,
  each with a disposition. Every evidenced P0, P1 and P2 has a fix with a test, or an explicit limit with the reason.
- **The systemic causes are corrected as shared mechanisms, not per site:**
  - failure ownership and bounded recovery;
  - complete accounting of required results;
  - canonical identities (review side, route, template text, seed code);
  - safe concurrent state;
  - durable logs and resumable long steps;
  - truthful reports and exit codes.
- **What is proven:** each RC6 failure mechanism is fixed, by a test that reproduces it and by replays on the real RC6
  data.
- **What is not proven:** no site has yet completed end to end. That is the campaign's job, and the reason all six
  sites run again (§4).

## 2. Readiness score (`docs/rc5-status.md` §4 rubric, unchanged)

The rubric has seven dimensions with fixed weights and anchors:

| Anchor | Meaning |
|---|---|
| 0 | absent or known broken |
| 25 | untested |
| 50 | synthetic tests |
| 75 | real-browser fixtures or replays of real data |
| 100 | confirmed on the real-site retest, with audit and by-eye scores |

No defect was found in the rubric itself, so it is unchanged.

| # | Dimension (weight) | RC6 evaluation | Now (rc.7) | Basis | After a successful campaign (projection) |
|---|---|---|---|---|---|
| 1 | Fidelity on real sites (25) | 8 | 9 (36%) | Still no finished clone and no by-eye scores. rc.7 removes the RC6 seed defect behind allbirds' +750 px and makes the metrics see it (height, iframes). Zero re-measured with rc.7 on real data: journey 89.4 / 86.6, with three specific checkpoints outside the reference's own range; the rest within | 16-19 (65-75%) |
| 2 | Reference and measurement integrity (15) | 8.25 | 10.5 (70%) | Real calibrations self-consistent (RC6). rc.7 closes the measured blind spots: extra height and iframes (fixture tests), template text (a live re-shoot: 6 clone-only frames → 0), self-varying references judged frame by frame (zero, real data) | 12.75 (85%) |
| 3 | Truthfulness (20) | 10 | 15 (75%) | Accounting invariant with set equality; Incomplete never unlisted; reports and exit codes agree; auditor read-only and finding non-terminal runs; the decision replay of zero ends Incomplete with 122/126 passed and 4 listed, audit clean. No real-run audit of a terminal outcome yet | 18 (90%) |
| 4 | Loop termination and recovery (15) | 3 | 9 (60%) | Every RC6 stop mechanism reproduced and bounded (contracts, resume e2e); a running step is waited for, not counted. 0 of 6 runs terminal so far | 12.75 (85%) |
| 5 | Setup and first use (10) | 4.5 | 6 (60%) | Doctor explains the sandbox; two setups documented; logs survive a killed launcher; calibrate's estimate from the work (varsity 107 min estimated against ~160 projected). The packed-package check is in §6 | 8 (80%) |
| 6 | Tests and reproducibility (10) | 6 | 8 (80%) | Contract tests across component boundaries; replays on real data. Windows and Chrome only; e2e about 30 min | 8.5 (85%) |
| 7 | Documentation (5) | 2.75 | 4 (80%) | One policy; skill, AGENTS.md, status text and the prompt agree; superseded documents marked | 4.5 (90%) |
| | **Total** | **42** | **61.5 → 61** | | **80-84 → 74-84** |

**Confidence.**

- **Dimensions 2-7:** the "now" scores rest on automated tests and replays of real data. That is the 75 anchor at
  best, which caps them.
- **Dimension 1:** limited by missing by-eye scores and finished clones.
- **The projection's range:** 74 is the low end if the campaign reaches terminal and truthful outcomes but by-eye
  scores stay below RC4 on some sites.

**What the numbers do not say.** 61 is not "close to release":

- **Code defects still open:** the limits in §5.
- **Missing real-site evidence:** dimensions 1, 3 and 4 cannot pass 75% without terminal runs, audits and by-eye
  scores. That evidence cannot be produced by more development.

## 3. Verification performed (this tree)

### 3.1 Automated

| Suite | Result | Notes |
|---|---|---|
| `npm test` | 124/124 | includes `test/contracts.test.mjs` (the contract tests across status, verdict, report, score, journal, cache, auditor), routes, fidelity and generator units |
| `npm run test:browser` | 17/17 | inview, menu opener, behaviour, bundle, interactions, profile, scripts evidence, seed fidelity, iframe mask, dialogs and arrival, brief route |
| `npm run test:e2e` | 8/8 (about 30 min) | doc-site, canvas app, journey gate, reference integrity, routes site, resume (interrupted and resumed behaviour and calibrate; no lock after a kill), fidelity capture |
| Real Next.js build | pass | the generator fixture built with the new pin, next 16.4.2 |
| Concurrency | 8 processes × 25 rounds hashing one folder: 0 failures, one hash | a sample, not a proof |

### 3.2 Artifact replays on copies of the RC6 folders

| Site | Kind | Result |
|---|---|---|
| zero | as is | rc.7 names `score --only interact`: RC6's interaction plan was measured by rc.5 code and is stale. All results are stale: shared measurement code changed |
| zero | decision replay, app verdicts under `## Review: app` | both reviews pass; exit 3 Incomplete; 122 of 126 items pass, 4 "not verifiable" (the journey before rc.7's envelope); audit clean |
| zero | measurement replay (journey re-measured offline with rc.7) | desktop 89.37: 8 of 10 varying checkpoints within their draws, step-18 and step-20 outside. Mobile 86.56: every varying checkpoint within, including step-1's text (the reference's own counter varies); its stable load checkpoint is at 50.3 against 95. A real verdict replaces "not verifiable" |
| astro | decision replay | the interaction plan is scheduled first; the 4th naming escalates; no infinite loop |
| astro | targeted live check (one review size) | hypothesis: rc.7 flags no placeholder text. At wide, clone-only frames 6 (RC6) → 0, on the unchanged clone |
| allbirds | decision replay | no lint step (0 findings); REPORT renders; libraries GSAP, ScrollTrigger, Swiper named |
| elise-ux | as is | the encoded-route errors are retried once; the second identical failure would be Blocked (owner tool), never Incomplete unlisted |
| elise-ux | measurement replay (re-seed + layout and states at desktop, offline) | the Landing page is seeded at `clone/Landing Page.html/` and measured: 100 (RC6: 404). About 100. The start page 5.33: its reference mask was taken with rc.6's mask (iframes hidden), the clone's with rc.7's (iframes as boxes). rc.7 now captures again in that case (RC7-37); a fresh capture measures both sides alike |
| heybhaskar | as is | first rc.7 status retries the 48 errors once (RC6 records migrated as one measurement), `--serial` where the kind is known |
| varsity | as is | names calibrate with an estimate from the work: 20 shots and 287 scroll steps per draw, about 107 min (11-213) |

### 3.3 What no test here shows

- A full status loop to a terminal outcome on a real site, including the Next.js build, and a person's by-eye score.
- The behaviour check finishing on a real multi-route site (heybhaskar was killed in RC6).
- Next.js 16.4's alternating build failure in a real run (§5).

### 3.4 The packaged release candidate

**The tarball.**

- File: `npm pack` → `trueclone-cli-0.5.0-rc.7.tgz`, 54 files, sha1 `19290664F89024298D958B0B5A3D71F573EF85A5`.
- Contents: the new modules and `scripts/MANIFEST.json`.

**Installed in an empty folder** (`npm install <tgz>`, `trueclone init --no-install`). Every check below passed through
the installed CLI, with sites built by the test helpers:

- `--version` prints 0.5.0-rc.7;
- doctor is ok on every line;
- the skill and AGENTS.md carry the new contract;
- a verified site exits 0, its steps are journaled, and the auditor finds nothing;
- an error is measured once more, then the same error ends Blocked (owner tool);
- an interaction plan never measured is scheduled;
- REPORT renders with a lint finding, its header in the order of its cells;
- a NODE_OPTIONS preload ends Blocked.

The check script is kept outside the repository with the evaluation's scratch work.

## 4. What must be tested again, and why: the clearance matrix

**Three kinds of clearance:**

1. A defect is fixed: the ledger's "Verified" column.
2. A workflow segment passed: below.
3. A site passed end to end: none yet.

**Why every site runs again end to end:**

- rc.7 changes the shared measurement code (lib, identity and results enter every check's code hash), so every RC6
  result is stale by design.
- It changes capture (route discovery, exclusions, page errors) and seed (style keys, exclusions, iframes, route
  folders), so every clone is regenerated.
- It changes how every outcome is decided.
- No site has ever reached a terminal outcome.

What remains reusable is the knowledge (each site's behaviours, its known clone work), not the measurements.

**Clearance codes used in the matrix:**

| Code | Meaning |
|---|---|
| P | previously demonstrated and still applicable |
| T | newly verified by regression or integration tests |
| R | artifact replay |
| L | a targeted live check |
| E | requires end-to-end retesting |
| N | not verified or blocked |

| Project | Behaviour / segment | Status now | Evidence | rc.7 changes on its path | Prior evidence invalidated? | Minimum further validation |
|---|---|---|---|---|---|---|
| zero | own bundle recorded whole | P | RC6 live: 66/66 | none to the recorder | no | E (fresh capture) |
| zero | reference journey gates | P | RC6 live: both sizes | none | no | E |
| zero | journey judged where the reference varies | T, R | contracts; measurement replay | verdict, journey envelope | yes (results stale) | E: the loop works step-18/-20 (desktop) and the load checkpoint (mobile) |
| zero | clone/app review | T, R | contracts; decision replay | review sections | yes | E: verdicts under both headings |
| zero | Next build and verify | P (RC6: built 16.4.0) | RC6 | generator fixes (G); build flakiness (G) | yes | E |
| zero | terminal outcome | N | – | everything | – | E |
| astro | template review text | T, L | browser test; live re-shoot | inview | yes (frames re-shot) | E: review all sizes and routes |
| astro | loop on a review objective | T, R | contracts; decision replay | progress, workStep | yes | E: the tracker fixed or concluded |
| astro | interactions (20 scenarios) | N | never measured | plan scheduling | – | E |
| astro | layout/scroll/reduced/detail/hovers/load | P (RC6 values 99.86-100) | RC6 | shared code | yes (stale) | E (re-measured by status) |
| astro | terminal outcome | N | – | – | – | E |
| allbirds | lint vs tool output | T, R | contracts; decision replay | verdict, capture/seed (F) | – | E |
| allbirds | page height (seed styles) | T (fixture), R (re-seed, §5) | fidelity tests | seed (F) | yes | E: layout and review at every size |
| allbirds | REPORT with a lint finding | T | contracts | report, score | – | E |
| allbirds | the rest (24 units, review, Next) | N | never reached | – | – | E |
| elise | encoded routes | T | routes e2e; Next probe | routes everywhere | yes (re-seed) | E |
| elise | the site's views (7 of 8 discoverable) | T | routes e2e | capture BFS | yes (re-capture) | E: `--routes` covering the views; NASA.html only in a script (limit) |
| elise | iframe shell measured | T (F) | mask test | lib mask (F), seed iframe src (F) | yes | E |
| elise | mobile menu scenario | T | menu-opener test | interactions-auto | yes | E |
| heybhaskar | parallel checks (cache race) | T | contracts | identity | yes | E: the full score in one go |
| heybhaskar | behaviour over 8 routes | T (resume e2e) | e2e | behaviour, score limits | yes | E: it finishes within its limit |
| heybhaskar | case-study routes (clone work) | App | RC6 | – | – | E: worked by the loop |
| varsity | calibrate (long pages) | T | resume e2e | calibrate | yes | E: within 2× the printed estimate |
| varsity | permission recorded | T (F) | capture validation | capture | – | E |
| varsity | everything after calibrate | N | never reached | – | – | E |
| all | doctor in the chosen setup | P | RC6: ok when escalated | doctor text | – | E (recorded on the sheet) |

**Why not fewer runs.** Each site exercises a path no other one does:

| Site | Path |
|---|---|
| astro | template, multiple routes, placeholder review |
| allbirds | template, exclusions, seed styles |
| elise | encoded routes, discovery, iframe shell, mobile menu |
| heybhaskar | 8 exact routes, parallel scoring, long behaviour |
| varsity | exact, long pages, the longest calibration |
| zero | canvas app, own bundle, journey envelope, both reviews |

None has ever ended. A run that ends Blocked with the environment as owner can be repeated alone; one that ends on a
new tool-owned defect stops the campaign (`docs/test-plan-0.5-rc7.md` §5).

## 5. Known limits and remaining release blockers

**Release blockers (any one blocks `latest`, whatever the score):**

1. **No site has ended.** Terminal and truthful runs on all six sites are needed, with clean audits.
2. **No by-eye scores.** Needed at or above RC4's on every site.
3. **The behaviour check on real multi-route sites is unproven.** RC6 heybhaskar was killed; astro was n/a.
4. **The Next.js app in a real `next --verify`.** Generated apps now pin next 16.4.2: the old pin, 16.4.0, had two
   critical advisories. They also turn off the agent upgrade reminder that made builds alternate. A fixture build
   passes; the campaign must show a real site's app built and verified.
5. **One unseen site.** None run yet.

**Remaining limitations, reconciled (2026-10-24).** None of these is fixed. Each keeps its disposition in the campaign's
coverage and in this readiness assessment.

| Limitation | Disposition | In the campaign | Public release |
|---|---|---|---|
| Pages reachable only through a script's router (no link, no sitemap) are not discovered | **Accepted, disclosed scope limitation** of automatic discovery; supported workaround: an explicit `--routes` list | Elise is captured with an explicit list of its 8 router views. Every prompt asks the agent to compare the site's router or script view maps with the captured routes and to list any missing view as unverified | Not a blocker. It must be in the user documentation, and each run's report must list the views it found but did not capture |
| Widgets (tabs, menus, dialogs) are read at desktop size only; the seed replays desktop widget states | **Unresolved product defect (P2)**, disclosed | Mobile menus and openers are covered by interaction scenarios (rc.7). A mobile-only widget state is still measured by the checks and the review, so it cannot pass silently, but the seed does not pre-build it | Not a blocker on its own; any campaign site where it causes an unresolved difference makes it one |
| Template mode leaves the site's own text inside open shadow roots (placeholders do not reach shadow-root text) | **Unresolved product defect**: it breaks template mode's promise of placeholder text | Template sites (astro, allbirds) record any shadow-root text that kept original wording | **Public-release blocker** (template mode's content promise); not a blocker for this prerelease test |
| Structure mode compares an iframe's presence and box, not its content; an empty frame in the right place is only caught by real-pixel layout (exact mode) and the review | **Accepted, disclosed measurement design** (structure mode is content-blind by definition) | The review must judge every frame's content; exact sites also have real-pixel layout | Not a blocker |
| allbirds mobile: the re-seeded RC6 clone is 6492 px against the reference's 5820 (footer); the RC6 capture predates rc.7's stable keys | **Observation requiring a fresh capture** | The allbirds run captures fresh: its mobile layout and review decide it | If it persists on the fresh capture, it is an unresolved seed defect and a blocker for allbirds' fidelity |

**Other known limits:**

- **Unit estimates.** Calibrate's and the score steps' estimates are ranges from RC6 data; they print, they do not
  promise.
- **Concurrency tests are samples.** No finite trial count proves a race is gone.
- **Windows and Chrome only** for the test suites.
- **The unseen site.** The six campaign sites are all familiar; the release gate's unseen-site run remains separate
  and outstanding.

## 6. Release-candidate status and gates

**Release candidate 0.5.0-rc.7:**

- the version is set in `package.json` and `package-lock.json`;
- committed on `main`; publication under the `next` tag (never `latest`) follows the commit, so its registry checks
  (dist-tag, a clean install of the published version, `--version`, doctor, the installed-package checks) are recorded
  in the hand-off, not here;
- a test prerelease: publishing it does not change the readiness score (61) or any gate below.

**Gates:**

| Readiness for | Requires |
|---|---|
| The campaign (`docs/test-plan-0.5-rc7.md`) | §3.1 suites pass; §3.2 replays as recorded; the tarball installs and passes doctor |
| A wider prerelease | the campaign: 6 of 6 terminal and truthful; ≥ 3 Verified or Incomplete listing only differences; no P0 open |
| Public users (`latest`) | all of the above; no P1 open; by-eye ≥ RC4 on every site; one unseen site clean; ≥ 80 on this rubric; template mode's shadow-root text fixed (§5) |

## 7. Decisions for the owner

1. **The permission setup for the campaign:** Full access (decided 2026-10-24); a run that cannot have it uses the
   sandbox with escalation and records the deviation.
2. **Zero's public deployment** (made after the RC6 run, outside this work): whether the owner's permission covers
   public hosting. It is not test evidence, and this work does not change it.
