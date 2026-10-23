# rc.6 pilot: continuing the RC5 zero run

> **Record (2026-10-23).** Run on 2026-10-22; evaluated with the other RC6 runs. Its prompt forbade editing notes.md,
> where review verdicts must be written: a defect of the prompt, not of the agent that wrote them. The current
> campaign and its prompt: `docs/test-plan-0.5-rc7.md`.

The first test of 0.5.0-rc.6. It continues the paused RC5 run in `C:\dev\tc-tests\rc5-zero` (why.zero.university,
exact mode with the owner's permission as recorded in that run), after preserving the RC5 evidence. What changed and
why: `docs/rc6-notes.md`. Varsity, astro, heybhaskar and allbirds wait for the outcome (section 6).

## 1. Publish rc.6 and verify it (you: npm asks for your one-time password)

```powershell
cd C:\dev\rea-lab
git log --oneline -1                                  # 0856fb4 or later (later commits: documents only)
npm test                                              # 82 tests pass
npm publish --tag next                                # opens a browser for the one-time password; "latest" stays 0.4.0
npm view @trueclone/cli dist-tags                     # next: 0.5.0-rc.6
npm view @trueclone/cli@0.5.0-rc.6 version dist.shasum
```

Then install the published version in an empty folder:

```powershell
$v = "$env:TEMP\tc-rc6-verify"; Remove-Item -Recurse -Force $v -ErrorAction SilentlyContinue; New-Item -ItemType Directory $v | Out-Null; Set-Location $v
npx -y @trueclone/cli@0.5.0-rc.6 init
npx trueclone --version                               # 0.5.0-rc.6
npx trueclone doctor                                  # every line ok
```

## 2. Preserve the RC5 evidence (before anything runs in that folder)

```powershell
$src = 'C:\dev\tc-tests\rc5-zero'; $dst = 'C:\dev\tc-tests\rc5-results\zero-rc5-as-run'
New-Item -ItemType Directory -Force $dst | Out-Null
Copy-Item -Recurse "$src\sites\zero" "$dst\zero"
Copy-Item "$src\trueclone-doctor-zero*.txt","$src\zero-asset-probe.mjs","$src\package.json","$src\package-lock.json" $dst
(Get-ChildItem -Recurse $dst | Measure-Object -Sum Length).Sum / 1MB   # about 470
```

## 3. Upgrade the run folder to rc.6

```powershell
Set-Location C:\dev\tc-tests\rc5-zero
npm install --save-dev --save-exact @trueclone/cli@0.5.0-rc.6
npx trueclone init --no-install                       # the rc.6 skill and AGENTS.md (the package is already installed)
npx trueclone --version                               # 0.5.0-rc.6
npx trueclone doctor                                  # every line ok
```

Codex, as for RC5: model gpt-6.1-sol, effort high, permissions **Full access** (network on). Sleep disabled.

## 4. The prompt

```text
Continue the trueclone run for "zero" (https://why.zero.university/, exact mode; the owner's permission is recorded in sites/zero/reference/meta.json) with the new trueclone release, 0.5.0-rc.6. It fixes the three tool defects this run found: files recorded empty in the bundle, the reference journey drawing the "zero" before the gate appeared, and status crashing on review frames marked "differs".

1. Keep what is here. Do not delete or edit sites/zero/clone/patches, sites/zero/notes.md, sites/zero/journey.json, or anything under sites/zero/reference except through trueclone commands. The RC5 evidence is archived in C:\dev\tc-tests\rc5-results\zero-rc5-as-run; check that folder exists before you start, and leave it alone.
2. Check the tool: run `npx trueclone --version` (it must print 0.5.0-rc.6; if not, run `npm install --save-dev --save-exact @trueclone/cli@0.5.0-rc.6` and `npx trueclone init --no-install`), then `npx trueclone doctor` (every line ok; include its output in your report).
3. Loop on `npx trueclone status zero`: do exactly the step it names, then run it again. Expect it to start with `npx trueclone journey zero` (it records the bundle again: nine files were empty), then `npx trueclone calibrate zero`, then `npx trueclone seed zero`, then the scores, then the review: every journey frame looked at again and given a new verdict. Each of these is a step status names; run nothing else in their place.
4. Change the clone only where status asks for clone work, and only in sites/zero/clone/patches (the clone runs the site's own bundle: a checkpoint that differs is usually a file or a recorded answer, so read status's step and Findings first). Never edit the installed trueclone package, sites/zero/reference, or any results, and never set NODE_OPTIONS.
5. Continue until status exits 0 (Verified), 2 (Blocked) or 3 (Incomplete). On exit 1, continue; do not stop, summarise, or ask me anything before a terminal exit. Give every trueclone command a timeout of at least 20 minutes; a quiet command is still working.
6. If status reports Blocked, or a trueclone command itself fails with an error, stop changing the clone: keep the output and the files it names, and report it. A tool failure is not fixed by changing the clone. Do not retry the same failing step more than twice.
7. Never try to make a frame match by forcing an animation frame, a random draw or a timer: frames are compared at equal states by the tool.

When status exits 0, 2 or 3, report:
1. the exit code, what status printed, and the total time;
2. every step you ran, in order, each with one line on what status said and what you did;
3. the Outcome section of sites/zero/REPORT.md and of REPORT.next.md as written (what passed, what is unresolved with its best and current values, what the tool could not verify, the next action);
4. every row of the Scores tables;
5. what is under Attempts and Findings in notes.md;
6. anything in the tool you believe is a defect, with the evidence (file paths and the exact output).
```

## 5. What to expect (measured on a copy of this run with rc.6, 2026-10-22)

| Step | Took | Result on the copy |
|---|---|---|
| `journey zero` | 7 min | 64 files recorded whole (11 recovered), reference journey past the gate at both sizes |
| `calibrate zero` | 14 min | 57 keys; 15 where the reference differs from itself beyond the hard floor (judged by its envelope) |
| `seed zero` | 1 s | 68 files from 3 hosts, all whole |
| `score zero --only journey,load` | 9 min | journey desktop 89.68, mobile 87.98 (RC5: 1.11 and 20.27); load 99.5-99.9 (RC5: 44-48) |
| then | | review verdicts for 55 frames, then the loop |

These are a preview on a copy, before any agent work, not the pilot's result.

## 6. Criteria for going on to the other four sites

Zero validates rc.6 enough to start varsity, astro, heybhaskar and allbirds only if **all** hold. Check each from the
run's files: `node C:\dev\rea-lab\tools\audit-run.mjs C:\dev\tc-tests\rc5-zero\sites\zero`, `compare/loop.json`,
`reference/bundle/manifest.json`, `reference/journey/journey.json`.

| # | Criterion | Pass | Fail means |
|---|---|---|---|
| 1 | Asset integrity | status's "done" line shows `bundle (N files whole)`; no manifest entry has `failed`; no review frame shows "ERROR LOADING ASSETS" | the recorder fix is incomplete: stop, fix |
| 2 | Reference journey | both sizes in `reference/journey/journey.json` pass the gate ("XP" in the checkpoint text) and have `errors: []`; the calibration was made after it | the gate fix is incomplete: stop, fix |
| 3 | Review and status | every "differs" frame became a status step naming it; no TypeError or crash in any status output; any Blocked names its owner and cause | the review/status contract is broken: stop, fix |
| 4 | Truthful terminal outcome | status ended the run at 0, 2 or 3 by itself; `audit-run.mjs` finds nothing; REPORT's claims match what you see | a truthfulness defect: a release blocker |
| 5 | No tool-owned loop | no status step repeated more than 3 times without its results changing; `journey zero` for the bundle at most once; no Blocked that the agent "worked around" | loop control or a tool failure path is wrong: stop, fix |
| 6 | Visual and behavioural result | journey desktop and mobile at least the preview above (≈88-90) and ideally ≥ 95; your by-eye score, wide and phone, ≥ 90 (the exact-mode expectation); load ≥ 95 | below the preview: something regressed; below 95 with a truthful Incomplete: acceptable, record it |
| 7 | Time | terminal within about 6 h of active time | slower: look at `compare/score-times.json` and lock waits before the next runs |

If 1-5 hold, the four document sites can start (`docs/test-plan-0.5-rc5.md`, with rc.6 installed by
`npx -y @trueclone/cli@0.5.0-rc.6 init`). 6 and 7 inform expectations; they do not block. Keep the same Codex
configuration for all of them, and record it on the score sheet.
