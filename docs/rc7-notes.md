# 0.5.0-rc.7: the pipeline's component contracts, after the RC6 evaluation

Date: 2026-10-23. Previous: 0.5.0-rc.6 (`docs/rc6-notes.md`). Canonical rules: `docs/policy.md` (updated for rc.7).
The issue ledger, every finding with its evidence, fix, test and verification: `docs/rc7-ledger.md`. Readiness,
release blockers and what must be tested again: `docs/rc7-status.md`. The next test campaign: `docs/test-plan-0.5-rc7.md`.

## 1. Where this comes from

The test sequence:

1. RC5 failed during the first zero test.
2. rc.6 fixed those blockers. Its fixes held wherever a run reached them:
   - zero's own bundle: 66 of 66 files whole, 11 recovered;
   - the reference journey passed its gate at both sizes;
   - status crashed nowhere.
3. Zero resumed on rc.6.
4. Five other sites were tested on rc.6 for the first time: astro, varsity, heybhaskar, allbirds and elise-ux.

None of the six RC6 runs reached a terminal outcome. The evaluation found 9 defects that block a release, all predating
rc.6, plus 11 of priority P1 and 6 of P2. Its systemic causes, which rc.7 is organised around:

| Cause | What RC6 showed | rc.7 |
|---|---|---|
| No model of failure ownership | Tool output named as clone work (allbirds lint, astro placeholders); a repeated tool error dropped from every list (elise, heybhaskar) | §2 |
| Completion judged from what was asked, not what is required | An interaction plan never measured; "Incomplete … verified as they are" with nothing listed | §2 |
| One key, several meanings | Review frames shared between clone and app (zero); a route as a URL and as a folder (elise); an element keyed by position across sizes (allbirds) | §3, §5 |
| Shared state without atomicity | The hash cache rewritten in place by parallel checks (heybhaskar); a lock released only in `finally`; calibrate deleting its draws | §4 |
| Failure output discarded | One line kept of a stack; calibrate's child output in memory only; a report crash ignored | §4 |
| Tests on happy paths, not contracts | The same review token on both sides; lint tested without the report; no template review fixture | §6 |
| Time estimates not derived from the work | "5-15 minutes" for a calibration that takes 3 to about 160 | §4 |

## 2. Outcomes: every required item accounted for, failures classified, recovery bounded

**Accounting (`scripts/accounting.mjs`).**

- At every terminal outcome, status writes into `compare/outcome.json` every required item of both sides, each with
  exactly one disposition: passed, unresolved, not verifiable, blocked or pending.
- An item is any of:
  - a unit, the interaction plan included;
  - a review frame, or a review folder not shot yet;
  - a written check (notes, coverage);
  - a lint finding.
- A terminal outcome never has a pending item. Reaching one with any is Blocked, owner tool, with the items named.
- Verified has no item not passed. Incomplete lists exactly the items not passed, with the policy's wording: never
  "verified as they are".
- `tools/audit-run.mjs` recomputes the required set and checks that the ids are equal.

**Scheduling.**

- The interaction plan, when missing or stale, is scheduled (`score --only interact`).
- Objectives whose result became "not verifiable" are retired, never counted as passed.

**Failures (`scripts/failures.mjs`).** Every error unit carries the step's first error line, its kind (timeout or crash)
and its log. Status classifies it as environment, clone or tool, then:

- **First failure:** remeasures it once, alone after a crash (`--serial`).
- **The same failure again on the same content, really remeasured** (counted by measurement time, not by status
  calls):
  - environment or tool: **Blocked**, every unit named with its log;
  - the clone's own page that crashes or never loads: an **objective**.
- The fixed-pattern `TOOL_ERR` heuristic is gone.

**Repeated steps (`scripts/progress.mjs`).** The journal (§4) says which steps ran and how they ended. For every step
status names, it counts:

| Counter | What it counts | Result |
|---|---|---|
| failed | the step ran and failed | 2 → Blocked |
| ineffective | the step ran, succeeded, and changed nothing status decides on | 2 → Blocked: the step and status disagree |
| idle | named again, nothing changed, nothing ran | 3 → the step text offers a declaration; 8 → Blocked, owner run |

- A step still running is never counted; status says "waiting".
- A clone-work step (an objective) counts only clone changes, even when it starts with a look command.
- A trueclone command is run, never declared.
- **The declaration:** `- cannot: <step>: <why>` under ## Findings. For an objective it concludes the objective, listed
  in Incomplete. For any other step it ends the run Blocked, owner as declared.
- **The digest:** what status decides on (the clone and the app, records, results, frames, configuration, the notes
  sections that count). It excludes status's own records and the declaration lines.

**Clone work never names a file the agent may not edit.**

- A lint finding in the seed's own output (`.seed-base*.html`) is the tool's: Blocked at once, right after seed.
- One a patch put back names the patch.
- The lint counts only loads (§3).
- A "differs" review frame's step is the clone change; status shoots the frame again afterwards. It never names
  `review` on an unchanged clone.

**Pages left out.** Pages the site links to that capture left out at its route cap are named once: capture again with
them, or say under Findings why they are out of scope. REPORT always lists them.

## 3. Identities that mean one thing

- **Review verdicts by side.** The clone's go under `## Review`, the app's under `## Review: app`
  (`verdict.mjs reviewVerdicts`). Status, the review and journey indexes, the skill and the test helper all use them.
  The app gets its own tokens in the helper, which used to hide the collision.
- **Routes (`scripts/routes.mjs`).**
  - **Identity:** the encoded URL path, as capture always stored it.
  - **Files:** decoded segments made safe for the file system, used by seed and served by the clone server, which
    answers 400 on a malformed escape and never crashes.
  - **Next.js:** a probe showed it serves encoded folder names (decoded ones 404; a non-ASCII decoded name fails the
    build), so the app keeps encoded folders.
  - **Capture:** follows links on captured pages up to `--routes`, and records `routesFound` and `routesNotCaptured`.
  - **Folder clashes:** never captured twice.
- **Template placeholder text (`scripts/inview.mjs`).** In template mode, review exempts exactly the text the seed
  wrote: its own record, `.seed-base*.html`. Text the clone adds is still clone-only, as are fixed boxes, frames and
  shadow hosts. Clipped and sr-only text is not in view on either side.
- **The lint.**
  - An excluded origin counts only where it would load: an attribute that loads or links, a script string, url() or
    @import. A selector's text or the capture's `data-tc-origin` marker is not a load.
  - Animation stops are compared rule by rule (a multi-page clone repeats its styles).
  - Seed working files are not linted.
  - Every finding names its owner and the file to change.

## 4. State, evidence and time

- **The hash cache.** Several checks of one score share it. It is read tolerantly and written to a temporary file
  renamed into place, with Windows retries.
  - RC6 failure shape: 11 of 100 trials at 4 processes, 45 of 50 at 8.
  - rc.7 test: 8 processes × 25 rounds, no failure, one hash; a corrupted cache reads as empty.
  - Results, aggregates and the loop file use the same atomic write.
- **The timing lock.** It records its holder's process id. A dead holder is taken over at once. Score releases the lock
  of a step it killed. Doctor says "left by a stopped run".
- **The journal and logs.**
  - Every step run through `npx trueclone` on a site writes `logs/commands.jsonl` (start and end) and its whole output
    to `logs/`. The step itself writes its log and end record, so a killed launcher loses nothing.
  - EPIPE on a closed console no longer kills a step. This is the most likely cause of varsity's exit, not proven: the
    original output was lost.
  - A failed score step keeps `logs/score-<time>-<step>.log`, and its error units cite it.
- **Time limits.** A score step's limit is 2.5× the estimate for its units, never under 20 minutes.
- **Behaviour.** It writes each unit as it finishes and skips units already measured on this content, so a rerun does
  only what is left.
- **Calibrate.**
  - It keeps every finished check (`reference/calib/progress.json`) and resumes for the same capture, reads and code.
  - It logs every check (`reference/calib/log.txt`) and prints progress and the time left.
  - A failed check writes `failed.json` and no `noise.json`.
  - Status resumes it once, then ends Blocked with the log.
  - Its estimate comes from the work: shots per route × size and scroll steps from the page heights. RC6's long
    calibrations came from long pages (varsity: 267 steps), not canvases.
  - Staleness is judged by the content of the reads it replays, not file times.
- **Reports.**
  - The Scores header follows its cells.
  - Checks without units (the lint) render as rows.
  - A REPORT that cannot be written fails `score`, and fails status at a terminal outcome.
  - Status renders REPORT whenever what it describes changed. REPORT carries its render time and the outcome's full
    accounting.
  - Bundled libraries are named from the site's scripts, by signature: allbirds' GSAP and Swiper, previously "none".
  - A permission that looks truncated is flagged, and re-capture commands quote it safely.
- **Doctor and AGENTS.md.** Both state what the steps need (network, a browser), the two supported setups, and how to
  run long steps.

## 5. Measurement

- **Reference self-variance.** A unit whose reference varies on itself is judged frame by frame: by its envelope where
  the reference varies, at its bar elsewhere, and "not verifiable" only where a varying frame has no envelope.
  - The journey now measures each varying checkpoint's envelope from the calibration draws, with the interface text
    still gated. RC6 zero's journey could only be "not verifiable".
  - The scroll and canvas checks no longer ignore their stable frames in that case.

## 5a. Seed fidelity and provenance

**Stable element keys.** Inline styles, reveals and widgets are keyed by a unique id, or by tag steps from the nearest
id'd ancestor, each with a signature. Seed checks every key before it marks anything.

- **Why:** a late third-party body child shifted every positional key between capture sizes. RC6 allbirds:
  - a hidden pixel container lost `height:0` (+750 px);
  - its styles landed on another section;
  - 0 of 8 reveals were found.
- **After:** allbirds' desktop height is 5912, equal to the reference.
- **Upgraded captures:** reveals and widgets recorded before rc.7 are read again.

**Excluded widgets.** They are removed from the clone, with the capture's own exclusion style.

**Frames.**

- Template placeholders reach open shadow roots.
- In exact mode, frames of same-host pages point at the captured local page.
- Frames still loading the live site are listed in REPORT.

**Seed and capture provenance.**

- The seed records its code: a clone seeded by other seed code is seeded again.
- Capture records its structure mask: a reference masked differently is captured again (RC7-37).
- Capture records the live page's errors per route.

**Measurement.**

- Extra page height always counts as different (allbirds recomputed: 99.99 → 88.73).
- Iframes are compared as boxes in structure mode.

## 5b. The Next.js app and interactions

- **The app's Next.js version.**
  - **Old pin:** generated apps were pinned to next 16.4.0. npm's advisory feed lists `>=16.0.0 <=16.4.0` under two
    critical remote code execution advisories (Image Optimization with SVG; `use cache`) and a high denial-of-service
    one. npm audit: 16.4.0 critical; 16.4.1 and 16.4.2 clean.
  - **New pin:** 16.4.2, released 8 days earlier, chosen over 16.4.3, which was released on the day of this change.
  - **The flaky build:** Next 16.4 turns on "agent upgrade reminders" (`experimental.agentUpgrade`). Under a coding
    agent, with an advisory listed, `next build` fails, passes, then fails, every 5 minutes. Seen with the agent's
    environment set: 1/0/1. Generated apps set `agentUpgrade: false`, the documented switch: verification must not depend
    on who runs it.
  - **The upgrade instruction:** the reminder tells the agent to run an upgrade command. That text is data; nothing
    here acts on it.
- **Older generator defects:**
  - line breaks under `white-space: pre-line` and no-break spaces are kept (RC4 VAR-11c);
  - `!important` inline styles type-check (RC4 ALLBIRDS-12, TS2352).
- **Interactions.**
  - Dialog openers and expand toggles outside the header become scenarios (RC4 ALLBIRDS-5). Each is checked to close
    on the reference.
  - A scenario that navigates to another page shoots it at the same page age on both sides (RC4 VAR-11d).
- **brief.** Finds a route by the canonical rule.
- **Known limit (VAR-11h).** The app's scripts start after hydration; a pointer move before that is unseen until the
  next one.

## 6. Tests added for the contracts

`test/contracts.test.mjs` runs status, verdict, report, score, the journal and the cache across their boundaries. Each
test reproduces an RC6 mechanism:

- **Repeated errors:** of each owner, measured twice.
- **Interaction plan:** missing and stale.
- **Accounting:** set equality against the evaluated items.
- **Review sides:** different clone and app tokens in either order; app lines under the clone's heading.
- **Lint:** the selector and marker non-loads; seed-owned versus patch-owned findings.
- **Report and score:** a lint row; columns checked with distinct values per size; score exiting non-zero on a failed
  report.
- **Repeated steps:** a step that ran without effect; work-step and objective declarations; a command never run.
- **Running steps:** "waiting", never counted.
- **REPORT freshness:** after a verdict edit.
- **Cache and lock:** the cache race; the dead lock.
- **Auditor:** read-only, with snapshot equality, and it finds a run that did not end.
- **Route cap:** pages left out.
- **Self-variance:** the frame-by-frame judgement.

Also:

- **`test/browser/inview.test.mjs`:** the template text rule and clipped text, in Chromium.
- **`test/routes.test.mjs`, `test/browser/menu-opener.test.mjs`, `test/e2e/routes-site.test.mjs`:** encoded routes
  end to end (capture, seed, server, diff, interact), second-level discovery, and a mobile menu opened before its link.
