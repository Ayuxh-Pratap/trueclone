# 0.5.0-rc.5 controlled retest (prepared, not started)

> **Superseded (2026-10-23)** by `docs/test-plan-0.5-rc7.md`. Kept as the record.

The next test of trueclone after the RC5 remediation. It is ready to run and has not been started. What it must show
is in `docs/rc5-status.md` §4 (the readiness rubric, conditions for score B, and the release blockers); the rules the
tool applies are in `docs/policy.md`. Predictions are made before the runs: a run that differs is a finding. Do not
tune the tool toward this sheet.

## 0. What is under test

| | |
|---|---|
| Tool | `@trueclone/cli` **0.5.0-rc.5**, repository commit `6cb5e34` (the last code commit of the rc.5 work; `git log --oneline 17cd6cf..6cb5e34` lists them; later commits change documents and dev tools only) |
| Baseline | 0.5.0-rc.4 (`17cd6cf`), runs in `C:\dev\tc-tests\rc4-*`: **read-only, never opened by these runs** |
| Installed from | npm: `@trueclone/cli@0.5.0-rc.5`, published under the `next` tag (step 2), installed into each folder by `init` |
| Folders | `C:\dev\tc-tests\rc5-<site>` (new) |
| Results archive | `C:\dev\tc-tests\rc5-results\<site>\` (copied after each run, step 6) |

All rc.5 stages landed in one build, so PLAN.md §7.2's stage-by-stage attribution (A-C) is not possible. Differences
from RC4 are attributed per check instead: every REPORT shows each result's state, bar and calibration, and the old
histogram stays beside each canvas score as a diagnostic.

## 1. Configuration (same as RC4 actually ran, so the numbers compare)

| Setting | Value | Why |
|---|---|---|
| Agent | Codex CLI (record the version: RC4 used 0.163.0-alpha.10.2) | as RC4 |
| Model | `gpt-6.1-sol` | as RC4 (data/run-facts.json) |
| Reasoning effort | `high` | what RC4 actually used (the RC4 runbook said Extra High; the runs used high) |
| Approvals / sandbox | on-request, workspace-write, network through escalations | as RC4. Doctor runs inside it first (step 3): if DNS or the local page fails there, the run is Blocked (exit 2) by the tool, which is itself a result |
| Runs | **one at a time**, in the order below | no lock contention between runs; times compare |
| Host | sleep disabled for the duration (Settings → System → Power → Screen and sleep → Never), restored afterwards | the RC4 host paused (ALLBIRDS-15, ZERO-6) |

Order and flags (the same capture flags as RC4):

| # | Folder | Site | Mode | Why in this order |
|---|---|---|---|---|
| 1 | rc5-astro | docs.astro.build/en/getting-started/ (`--routes 4`) | template | regression guard: RC4's one true exit 0 |
| 2 | rc5-varsity | www.varsity.vc (exact, "site owner") | exact | RC4's false exit 0 (VAR-1), the noisy canvas frame (VAR-2) |
| 3 | rc5-bhaskar | www.heybhaskar.com (exact, "site owner") | exact | stopped before Next in RC4; the shuffle route (BHASKAR-1/-3) |
| 4 | rc5-allbirds | allbirds.com/products/mens-tree-runners (`--routes 1`) | template | the hide race, the third-party widget, rotation |
| 5 | rc5-zero | why.zero.university (exact: needs the owner's permission, recorded with `--permission`) | exact, canvas app (its own bundle) | the 32 h loop. **Changed from RC4** (template): exact mode runs the site's own recorded bundle offline, so this run tests app mode's own-bundle path, not D4's template scene port; its numbers do not compare with RC4 zero |

## 2. Preflight (in the repository, before any run)

```powershell
cd C:\dev\rea-lab
git status --short                      # only tools/portfolio/ (another session's) may be listed
git diff --stat 6cb5e34 HEAD -- scripts bin skill package.json   # must print nothing: the tool is 6cb5e34
npm test                                # 76 tests, all pass (about 30 seconds)
npm run test:browser                    # 5 tests, all pass (about 4 minutes)
npm run test:e2e                        # 4 tests, all pass (about 15 minutes); starts the fixture servers itself
node bin/trueclone.mjs doctor           # every line ok
npm pack --dry-run                      # lists scripts/MANIFEST.json and 0.5.0-rc.5 (the manifest is removed again after)
npm whoami                              # signed in to npm as the package's owner
npm publish --tag next                  # publishes 0.5.0-rc.5 under "next" ("latest" stays where it is)
npm view @trueclone/cli dist-tags       # next: 0.5.0-rc.5
```

The package carries `scripts/MANIFEST.json`: it is how an installed copy detects an edited instrument.

## 3. Make a folder and install (per run, just before it starts)

```powershell
$s = 'rc5-astro'; $d = "C:\dev\tc-tests\$s"; New-Item -ItemType Directory -Force $d | Out-Null; Push-Location $d
npx -y @trueclone/cli@0.5.0-rc.5 init   # skill, AGENTS.md, .gitignore, and the package pinned as a dev dependency
npx trueclone --version                 # 0.5.0-rc.5
npx trueclone doctor                    # Node, Chrome, DNS, a local page, the timing lock: every line ok
Pop-Location
```

Then, in Codex inside that folder, run doctor once more **from the agent's own sandbox** (the first prompt line does
it), so an environment that cannot reach the network or localhost is found before any work.

## 4. The prompt (one body; only the first paragraph changes)

```text
Clone https://docs.astro.build/en/getting-started/ and the next pages it links to, 4 pages in all, with trueclone, in template mode. Name the site "astro". First run `npx trueclone doctor` and include its output in your report. Then capture with:
npx trueclone capture https://docs.astro.build/en/getting-started/ astro --routes 4

Then follow AGENTS.md and .claude/skills/trueclone/SKILL.md exactly: loop on `npx trueclone status astro`, do exactly the step it names, and run it again. status decides when the run ends: exit 0 (Verified), 2 (Blocked) or 3 (Incomplete). On exit 1, continue; do not stop, summarise, or ask me anything before a terminal exit. Give every trueclone command a timeout of at least 20 minutes; a quiet command is still working. Never change the instrument (no NODE_OPTIONS, no edits under node_modules).

When status exits 0, 2 or 3, report:
1. the exit code, what status printed, and the total time;
2. every step you ran, in order, each with one line on what status said and what you did;
3. the Outcome section of sites/astro/REPORT.md and of REPORT.next.md as written (unresolved objectives, what the tool could not verify, the next action);
4. every row of the Scores tables;
5. what is under Attempts and Findings in notes.md;
6. anything in the tool you believe is a defect, with the evidence.
```

First paragraphs for the others (RC4's flags):

- **varsity:** `Clone https://www.varsity.vc/ with trueclone, in exact mode: the site owner has given permission for an
  exact copy. Name the site "varsity". First run `npx trueclone doctor` and include its output in your report. Then
  capture with: npx trueclone capture https://www.varsity.vc/ varsity --mode exact --permission "site owner"`
- **bhaskar:** `Clone https://www.heybhaskar.com/ with trueclone, in exact mode: the site owner has given permission for
  an exact copy. The whole site, every page it links to. Name the site "heybhaskar". First run `npx trueclone doctor`
  and include its output in your report. Then capture with: npx trueclone capture https://www.heybhaskar.com/
  heybhaskar --mode exact --permission "site owner"`
- **allbirds:** `Clone this one product page with trueclone, in template mode, only this page and not the rest of the
  shop: https://www.allbirds.com/products/mens-tree-runners. Name the site "allbirds". First run `npx trueclone doctor`
  and include its output in your report. Then capture with: npx trueclone capture
  https://www.allbirds.com/products/mens-tree-runners allbirds --routes 1`
- **zero (exact, changed from RC4):** `Clone https://why.zero.university/ with trueclone, in exact mode: the site owner
  has given permission for an exact copy. Name the site "zero". First run `npx trueclone doctor` and include its output
  in your report. Then capture with: npx trueclone capture https://why.zero.university/ zero --mode exact --permission
  "<who authorised it>"`

(Replace `astro` in the loop and report paragraphs with the site's name.)

## 5. Start, resume, stop

- **Start:** open the folder in Codex with the configuration in §1 and paste the prompt. Leave it alone.
- **Questions:** if the agent asks something mid-run, answer only "keep going: follow status" and note it on the
  sheet (row 11).
- **Resume:** after a crash, a host sleep or a Blocked run whose cause you fixed, open the same folder and paste:
  `Continue the trueclone run for <name>: loop on npx trueclone status <name> as before, until it exits 0, 2 or 3, then
  report as asked before.` Status resumes from the files (`compare/loop.json` keeps every objective, attempt and
  conclusion; nothing is redone that is still current).
- **Stop by hand:** only if a run shows no new status step for 2 hours of active work, or exceeds 24 h of wall time.
  Record it as a tool failure (row 3).

## 6. After each run: archive and audit

```powershell
$s = 'astro'; $src = "C:\dev\tc-tests\rc5-$s\sites\$s"; $dst = "C:\dev\tc-tests\rc5-results\$s"
New-Item -ItemType Directory -Force $dst | Out-Null
Copy-Item "$src\REPORT.md","$src\REPORT.next.md","$src\notes.md" $dst -ErrorAction SilentlyContinue
Copy-Item -Recurse "$src\compare\results","$src\compare-next\results" "$dst\" -ErrorAction SilentlyContinue
Copy-Item "$src\compare\outcome.json","$src\compare\loop.json","$src\compare\score-times.json","$src\reference\noise.json","$src\reference\meta.json" $dst -ErrorAction SilentlyContinue
node C:\dev\rea-lab\tools\audit-run.mjs $src | Tee-Object "$dst\audit.txt"
```

Where everything is:

| What | Where |
|---|---|
| The outcome and why | `compare/outcome.json`, REPORT.md "Outcome" |
| Every result, with identity, members (frames, checkpoints, scenarios) and bars | `compare/results/<check>.json`, `compare-next/results/` |
| Per-objective, per-attempt history (shortfall, conditions, member values, progress) | `compare/loop.json` → `objectives[*].history[]` |
| The reference's self-calibration | `reference/noise.json` (entries: self, spread, draws per check, route, size, frame) |
| Third-party decisions | `reference/meta.json` → `thirdParty`, `ignore` |
| Time per step, lock waits | `compare/score-times.json` (history), `compare/loop.json` → `activity` |
| The agent's session | `%USERPROFILE%\.codex\sessions\<yyyy>\<mm>\<dd>\` (parse read-only, as for RC4) |

`audit-run.mjs` recomputes the evaluation from the files and flags the run when:

- its outcome record is for other content;
- REPORT's counts differ from the recomputed ones;
- the lint fails;
- a result was measured by a modified instrument.

Any audit finding is a tool failure (row 2).

## 7. Score sheet (one column per run)

| # | Row | Expect | astro | varsity | bhaskar | allbirds | zero |
|---|---|---|---|---|---|---|---|
| 1 | Terminal exit (0 / 2 / 3) and time to it (wall, active) | every run terminal | | | | | |
| 2 | `audit-run` finds nothing | always | | | | | |
| 3 | No manual stop, no indefinite loop | always | | | | | |
| 4 | Doctor in the agent's sandbox: all ok (or the run is Blocked with that cause) | | | | | | |
| 5 | Calibration: keys below the hard floor (count; which) | few; each judged by its envelope | | | | | |
| 6 | Third-party decisions at capture (what was excluded) | allbirds' assistant excluded; nothing on astro | | | | | |
| 7 | Behaviour: members failing at the end, with reasons | | | | | | |
| 8 | Objectives concluded: label, best, last, attempts, strategies | each with a reason; none before its progress stops | | | | | |
| 9 | Not verifiable by the tool (list) | each with a reason | | | | | |
| 10 | Lock-wait minutes; calibrate and behaviour minutes | under 20% of wall time together | | | | | |
| 11 | Questions asked mid-run | none | | | | | |
| 12 | Instrument modifications detected | none | | | | | |
| 13 | Your by-eye score, wide and phone (0-100) | astro ≥ 95, bhaskar ≥ 93, varsity ≥ 88, allbirds ≥ 85, zero (exact, own bundle) ≥ 90 | | | | | |
| 14 | REPORT claims nothing you do not see | always | | | | | |

**Predictions** (before the runs):

- **astro:** exit 0.
- **varsity:** no exit 0 while any app result fails; no canvas chase on a frame the reference varies on; a frame with
  no cord in view fails.
- **bhaskar:** reaches the Next.js app; `/playground` at strict bars once seeded (or a named difference); ends 0 or 3.
- **allbirds:**
  - the assistant is excluded at capture;
  - the hide profile is applied at every size;
  - no bulk "tool" verdicts;
  - load wide is named if it fails.
- **zero:**
  - review verdicts are written right after the first score;
  - exact mode: the clone runs the site's own bundle offline (recorded at capture and along the journey); a checkpoint that differs is usually a file the journey never loaded;
  - terminal at 0 or 3 well before RC4's 32 h.

## 8. How to read the outcome

| Exit | Means | It is a tool failure when |
|---|---|---|
| 0 Verified | every required result passes on the clone and the app as they are now | your eye disagrees (row 14) or the audit finds anything (row 2) |
| 2 Blocked | the environment or the tool could not measure; the cause and the action are printed | the cause is the tool's own (a crash, a false "unreachable") |
| 3 Incomplete | the loop concluded with differences left, each listed with best and current values | it concluded while values were still rising (compare `loop.json` history), or a listed difference is not real |

**What counts as an agent failure instead:**

- stopping on exit 1;
- asking mid-run;
- editing the instrument (the tool should detect it: if it did not, that is a tool failure too);
- writing verdicts without looking.

After the five runs, fill `docs/rc5-status.md` §4 with the measured scores (A → measured) and decide on the next
stages (PLAN.md §7.2 D-E: all five in parallel with the runbook configuration, then one unseen site).
