# Test plan: 0.5.0-rc.7, the end-to-end campaign

The campaign answers one question no run has answered yet: does each site reach a terminal outcome by itself, truthfully,
with a clone a person judges faithful? Why each run is needed, and what earlier evidence still counts:
`docs/rc7-status.md` §4. What rc.7 changed: `docs/rc7-notes.md`. Rules: `docs/policy.md`. The limitations that are
disclosed, not fixed: `docs/rc7-status.md` §5.

This is a test prerelease (`next` tag). The campaign does not stand in for the release gate's unseen-site run: all six
sites, Elise included, have been run before.

## 0. Before the campaign (done in development, recorded in docs/rc7-status.md §3)

- `npm test`, `npm run test:browser`, `npm run test:e2e` pass on the release commit.
- The artifact replays on copies of the six RC6 folders pass (rc7-status §3.2).
- The published package installs in an empty folder, prints `0.5.0-rc.7`, passes doctor and the installed-package
  checks.

## 1. Order and folders

One site at a time; start the next only after the previous one has reported and you have collected its evidence (§5).
**Elise first**; then decide from the Elise checklist (§6) whether to continue.

| # | Site | Folder | Site id | Mode |
|---|---|---|---|---|
| 1 | `https://www.elise-ux.com/` | `C:\dev\tc-tests\rc7-elise` | `elise-ux` | exact, permission "site owner", 9 explicit routes |
| 2 | `https://docs.astro.build/en/getting-started/` | `C:\dev\tc-tests\rc7-astro` | `astro` | template, 4 routes |
| 3 | `https://www.allbirds.com/products/mens-tree-runners` | `C:\dev\tc-tests\rc7-allbirds` | `allbirds` | template, 1 route |
| 4 | `https://www.heybhaskar.com/` | `C:\dev\tc-tests\rc7-bhaskar` | `heybhaskar` | exact, permission "site owner" |
| 5 | `https://www.varsity.vc/` | `C:\dev\tc-tests\rc7-varsity` | `varsity` | exact, permission "site owner" |
| 6 | `https://why.zero.university/` | `C:\dev\tc-tests\rc7-zero` | `zero` | exact, permission "site owner" |

Every folder is new. The setup refuses a folder that exists: never delete or reuse an earlier run's folder.

**Elise's routes.** Elise is a set of views its own script switches between; some views (`NASA.html`) are in the
script's view map and in no link, so automatic discovery cannot find every view (`docs/rc7-status.md` §5). The run
captures every view by name: `--routes` with a list is a single wave of exactly those routes, each spelled as the site
spells it and stored by its encoded path (`/Landing Page.html` → `/Landing%20Page.html`, `/NASA (Draft).html` →
`/NASA%20(Draft).html`). On 2026-10-24 all eight `.html` views answered 200, and the argument list was checked to reach
trueclone unchanged through `npx` from PowerShell.

## 2. Environment (the same for all six, recorded on the score sheet)

- **Agent:** Codex, model gpt-6.1-sol, effort high. A new Codex session per site, opened in the site's folder.
- **Permissions: Full access, with network.** Set it in the client before you send the prompt (the session's
  permission picker; in the Codex CLI, `/permissions`, or `/approvals` in older builds → Full access). Record the mode
  the client shows. If Full access is not available, use the default sandbox with escalation (approval on request,
  network on for every `npx trueclone` command) and record that as a deviation: a doctor that passes only when
  escalated is not Full access.
- **Machine:** sleep disabled; no other trueclone run on the machine during a site's run.

## 3. Setup (you, in Windows PowerShell; one block per site)

Each block refuses an existing folder, installs the exact published version into the folder (no global install), sets
the folder up with that version's `init`, and prints the version and the installed tree.

**Elise:**

```powershell
$d = 'C:\dev\tc-tests\rc7-elise'
if (Test-Path -LiteralPath $d) { Write-Error "$d already exists: nothing was changed. Choose a new folder." } else {
  New-Item -ItemType Directory -Path $d | Out-Null
  Set-Location -LiteralPath $d
  npm init -y | Out-Null
  npm install --save-dev --save-exact '@trueclone/cli@0.5.0-rc.7'
  npx --no trueclone init --no-install
  npx trueclone --version
  npm ls '@trueclone/cli'
}
```

**astro:**

```powershell
$d = 'C:\dev\tc-tests\rc7-astro'
if (Test-Path -LiteralPath $d) { Write-Error "$d already exists: nothing was changed. Choose a new folder." } else {
  New-Item -ItemType Directory -Path $d | Out-Null
  Set-Location -LiteralPath $d
  npm init -y | Out-Null
  npm install --save-dev --save-exact '@trueclone/cli@0.5.0-rc.7'
  npx --no trueclone init --no-install
  npx trueclone --version
  npm ls '@trueclone/cli'
}
```

**allbirds:**

```powershell
$d = 'C:\dev\tc-tests\rc7-allbirds'
if (Test-Path -LiteralPath $d) { Write-Error "$d already exists: nothing was changed. Choose a new folder." } else {
  New-Item -ItemType Directory -Path $d | Out-Null
  Set-Location -LiteralPath $d
  npm init -y | Out-Null
  npm install --save-dev --save-exact '@trueclone/cli@0.5.0-rc.7'
  npx --no trueclone init --no-install
  npx trueclone --version
  npm ls '@trueclone/cli'
}
```

**heybhaskar:**

```powershell
$d = 'C:\dev\tc-tests\rc7-bhaskar'
if (Test-Path -LiteralPath $d) { Write-Error "$d already exists: nothing was changed. Choose a new folder." } else {
  New-Item -ItemType Directory -Path $d | Out-Null
  Set-Location -LiteralPath $d
  npm init -y | Out-Null
  npm install --save-dev --save-exact '@trueclone/cli@0.5.0-rc.7'
  npx --no trueclone init --no-install
  npx trueclone --version
  npm ls '@trueclone/cli'
}
```

**varsity:**

```powershell
$d = 'C:\dev\tc-tests\rc7-varsity'
if (Test-Path -LiteralPath $d) { Write-Error "$d already exists: nothing was changed. Choose a new folder." } else {
  New-Item -ItemType Directory -Path $d | Out-Null
  Set-Location -LiteralPath $d
  npm init -y | Out-Null
  npm install --save-dev --save-exact '@trueclone/cli@0.5.0-rc.7'
  npx --no trueclone init --no-install
  npx trueclone --version
  npm ls '@trueclone/cli'
}
```

**zero:**

```powershell
$d = 'C:\dev\tc-tests\rc7-zero'
if (Test-Path -LiteralPath $d) { Write-Error "$d already exists: nothing was changed. Choose a new folder." } else {
  New-Item -ItemType Directory -Path $d | Out-Null
  Set-Location -LiteralPath $d
  npm init -y | Out-Null
  npm install --save-dev --save-exact '@trueclone/cli@0.5.0-rc.7'
  npx --no trueclone init --no-install
  npx trueclone --version
  npm ls '@trueclone/cli'
}
```

`--version` must print `0.5.0-rc.7` and `npm ls` must show `@trueclone/cli@0.5.0-rc.7`; otherwise do not start the
agent.

## 4. The prompts (one per site, complete as written)

### 4.1 Elise

```text
Clone https://www.elise-ux.com/ with trueclone, in exact mode. The site's owner has given permission for an exact copy; it is recorded as --permission "site owner". Name the site "elise-ux". You are in C:\dev\tc-tests\rc7-elise, where trueclone 0.5.0-rc.7 is installed locally (node_modules) with its AGENTS.md and .claude/skills/trueclone/SKILL.md. Read both before you start and follow them.

SCOPE
This site is a set of views its own script switches between. Some views are reachable only through the script's view map, not through any link, so trueclone's automatic discovery cannot find them all. You capture these 9 routes by name, in one capture (a --routes list is a single wave of exactly those routes):
/ , /Landing Page.html , /About.html , /New Craft Society.html , /AISS.html , /Codazen.html , /NASA.html , /NASA (Draft).html , /Kruiz.html
After the capture, before the first status, compare two lists and put both in your report: (a) the routes the capture says it captured and the ones it says it found and did not capture (its last lines, and later REPORT.md's "Not captured, not verified" line); (b) every view named in the site's own scripts (the router or view map in the captured reference: read the files under sites/elise-ux/reference, read-only). Any view in (b) that is not in (a)'s captured list is "discovered, not captured, not verified": list it. Never call the result a clone of the whole site unless every view in (b) was captured and verified; call it "these N routes".

BEFORE CAPTURE
1. Run: npx trueclone --version   (it must print 0.5.0-rc.7)
2. Run: npx trueclone doctor   in exactly the way you will run every trueclone command (same permissions, same network, same shell). It must exit 0 with no FAIL line. If anything says FAIL, or the Chrome line says warn, stop before capture and report the output. Put both outputs in your report, verbatim.
3. Record your environment as you observe it: client, model and effort if shown, the permission/sandbox mode, whether network is on, the shell. If you are not in Full access, say so. A doctor that passes only because you escalated it does not make the session Full access.

CAPTURE (once)
4. Run exactly:
npx trueclone capture https://www.elise-ux.com/ elise-ux --mode exact --permission "site owner" --routes "/,/Landing Page.html,/About.html,/New Craft Society.html,/AISS.html,/Codazen.html,/NASA.html,/NASA (Draft).html,/Kruiz.html"
Run it from PowerShell exactly like that: never through cmd /c or any wrapper that re-quotes arguments. If it fails before it saves anything (a network error), you may run the same command once more; otherwise run status.

THE LOOP
5. Run: npx trueclone status elise-ux   Do exactly the step it names, then run status again. Every trueclone command goes through npx trueclone from this folder: no global install, no node_modules paths, no cmd /c. trueclone keeps each step's whole output in sites/elise-ux/logs/ and journals every step (start, end, exit code) in sites/elise-ux/logs/commands.jsonl.
6. status's exit code decides: 1 means work remains (or "waiting": a step is still running), so continue and never stop, summarise or ask me anything on 1. 0 Verified, 2 Blocked, 3 Incomplete: stop and report.
7. Long steps. Calibrate on an exact-mode site can take two to three hours; status prints its estimate. Start every trueclone command so that it keeps running when your tool call returns: if your shell tool takes a timeout, give it at least status's estimate plus 30 minutes and never less than 60 minutes; if it cannot wait that long, start the command as a persistent background session and run status, which says "waiting" while it runs. Never wrap a command in anything that kills it or its launcher on a timer (no cmd /c wrappers, no Wait-Process -Timeout followed by Stop-Process). A quiet command is not stalled: read its log under sites/elise-ux/logs/ or run status before you conclude anything.
8. Recovery is bounded. If a trueclone command crashes or exits with an error, run status: it either names a step (do it; trueclone's own retry bound decides when a repeated failure ends Blocked) or ends the run. Never retry a failing command on your own more than once. When status says a step cannot be done within your edits and offers a "- cannot:" line under ## Findings in notes.md, write it only if it is true, with your evidence, then run status: it decides. Never declare a trueclone command: run it.
9. Two backstops, and only these: (a) a trueclone command crashed and the next status neither names a step for it nor ends Blocked; (b) status names the same step more than 10 times in a row while nothing changes. On either, stop changing the clone, keep every file as it is, and report it as a tool defect with the evidence (sites/elise-ux/logs/ has every command's output). An error that status turns into a step or a Blocked is not a backstop.

WHAT YOU MAY CHANGE
10. Only sites/elise-ux/clone/script.js, files under sites/elise-ux/clone/patches/, and sites/elise-ux/notes.md (behaviours, attempts, findings and review verdicts, as the skill describes). The HTML clone's verdicts go under "## Review", one line per frame with that frame's token from compare/review/<size>/index.md, for example: - 03-section-2 wide [0608cbcb01110180]: same   or   - 07-section-4-hover wide [060ecbcb00110180]: differs: the panel opens on the wrong card. The Next.js app's verdicts go under "## Review: app", with the app frame's own token from compare-next/review/<size>/index.md. A line under one heading never answers for the other. Look at every sheet before you write its verdicts; never write verdicts from pixel scores or with a script.
11. Never: edit the installed package or anything under node_modules; set NODE_OPTIONS; edit sites/elise-ux/reference, generated pages, compare/ or compare-next/ results, or anything under logs/; write a token or verdict for a frame you have not looked at; change a threshold or a tolerance; hide, mask or patch away a difference; force an animation frame, a random draw or a timer to make a frame match. The equivalent-state controls trueclone provides itself (the steps status names, its hold-still and calibration envelopes) are allowed.
12. Never deploy, push or publish anything. The clone stays local.

YOUR REPORT (when status exits 0, 2 or 3, or on a backstop)
1. The version and doctor outputs, verbatim.
2. Environment: client, model, effort, permission mode as observed, network, shell; every deviation from Full access.
3. Scope: the captured routes; the routes found and not captured, with why; the router-view comparison (lists (a) and (b) above); anything validation did not reach.
4. Every command you ran, in order: its start time, duration and exit code (quote the start and end records from logs/commands.jsonl for trueclone steps), with one line on what status said and what you did.
5. Stage timings (capture, reads, calibrate, seed, scores, review, next, next --verify) and the total from the capture's start to the last status.
6. The last status output in full and its exit code; the outcome, or why none was reached.
7. The Outcome sections of sites/elise-ux/REPORT.md and REPORT.next.md as written, including the "Not verified" tables, and every row of every Scores table.
8. Attempts and Findings from notes.md, as written.
9. Each remaining difference, with its unit or frame.
10. The Next.js app: whether it built, whether next --verify ran and its result, and the app review's state.
11. Every tool or environment failure: the command, its exit code, the log file path and the log's last 30 lines.
12. Anything you believe is a trueclone defect, with evidence (paths, log files, exact output), kept apart from clone work you did not finish.
State what the checks and the review show and nothing more.
```

### 4.2 astro

```text
Clone https://docs.astro.build/en/getting-started/ with trueclone, in template mode: the "Getting started" page and the pages it links to, 4 pages in all. Name the site "astro". You are in C:\dev\tc-tests\rc7-astro, where trueclone 0.5.0-rc.7 is installed locally (node_modules) with its AGENTS.md and .claude/skills/trueclone/SKILL.md. Read both before you start and follow them.

SCOPE
4 routes: the start page and the first pages the capture finds by following its links. Report every route the capture found and did not capture (its last lines, and later REPORT.md's "Not captured, not verified" line); they are not verified. Template mode replaces the site's text with placeholders: in your report, list any text in the clone that kept the site's own wording, in particular inside web components (shadow roots), which is a known gap.

BEFORE CAPTURE
1. Run: npx trueclone --version   (it must print 0.5.0-rc.7)
2. Run: npx trueclone doctor   in exactly the way you will run every trueclone command (same permissions, same network, same shell). It must exit 0 with no FAIL line. If anything says FAIL, or the Chrome line says warn, stop before capture and report the output. Put both outputs in your report, verbatim.
3. Record your environment as you observe it: client, model and effort if shown, the permission/sandbox mode, whether network is on, the shell. If you are not in Full access, say so. A doctor that passes only because you escalated it does not make the session Full access.

CAPTURE (once)
4. Run exactly:
npx trueclone capture https://docs.astro.build/en/getting-started/ astro --routes 4
Run it from PowerShell exactly like that: never through cmd /c or any wrapper that re-quotes arguments. If it fails before it saves anything (a network error), you may run the same command once more; otherwise run status.

THE LOOP
5. Run: npx trueclone status astro   Do exactly the step it names, then run status again. Every trueclone command goes through npx trueclone from this folder: no global install, no node_modules paths, no cmd /c. trueclone keeps each step's whole output in sites/astro/logs/ and journals every step (start, end, exit code) in sites/astro/logs/commands.jsonl.
6. status's exit code decides: 1 means work remains (or "waiting": a step is still running), so continue and never stop, summarise or ask me anything on 1. 0 Verified, 2 Blocked, 3 Incomplete: stop and report.
7. Long steps. Calibrate and the scores can take an hour or more; status prints its estimate. Start every trueclone command so that it keeps running when your tool call returns: if your shell tool takes a timeout, give it at least status's estimate plus 30 minutes and never less than 60 minutes; if it cannot wait that long, start the command as a persistent background session and run status, which says "waiting" while it runs. Never wrap a command in anything that kills it or its launcher on a timer (no cmd /c wrappers, no Wait-Process -Timeout followed by Stop-Process). A quiet command is not stalled: read its log under sites/astro/logs/ or run status before you conclude anything.
8. Recovery is bounded. If a trueclone command crashes or exits with an error, run status: it either names a step (do it; trueclone's own retry bound decides when a repeated failure ends Blocked) or ends the run. Never retry a failing command on your own more than once. When status says a step cannot be done within your edits and offers a "- cannot:" line under ## Findings in notes.md, write it only if it is true, with your evidence, then run status: it decides. Never declare a trueclone command: run it.
9. Two backstops, and only these: (a) a trueclone command crashed and the next status neither names a step for it nor ends Blocked; (b) status names the same step more than 10 times in a row while nothing changes. On either, stop changing the clone, keep every file as it is, and report it as a tool defect with the evidence (sites/astro/logs/ has every command's output). An error that status turns into a step or a Blocked is not a backstop.

WHAT YOU MAY CHANGE
10. Only sites/astro/clone/script.js, files under sites/astro/clone/patches/, and sites/astro/notes.md (behaviours, attempts, findings and review verdicts, as the skill describes). The HTML clone's verdicts go under "## Review", one line per frame with that frame's token from compare/review/<size>/index.md, for example: - 03-section-2 wide [0608cbcb01110180]: same   or   - 07-section-4-hover wide [060ecbcb00110180]: differs: the panel opens on the wrong card. The Next.js app's verdicts go under "## Review: app", with the app frame's own token from compare-next/review/<size>/index.md. A line under one heading never answers for the other. Look at every sheet before you write its verdicts; never write verdicts from pixel scores or with a script.
11. Never: edit the installed package or anything under node_modules; set NODE_OPTIONS; edit sites/astro/reference, generated pages, compare/ or compare-next/ results, or anything under logs/; write a token or verdict for a frame you have not looked at; change a threshold or a tolerance; hide, mask or patch away a difference; force an animation frame, a random draw or a timer to make a frame match. The equivalent-state controls trueclone provides itself (the steps status names, its hold-still and calibration envelopes) are allowed.
12. Never deploy, push or publish anything. The clone stays local.

YOUR REPORT (when status exits 0, 2 or 3, or on a backstop)
1. The version and doctor outputs, verbatim.
2. Environment: client, model, effort, permission mode as observed, network, shell; every deviation from Full access.
3. Scope: the captured routes; the routes found and not captured, with why; any text that kept the site's own wording; anything validation did not reach.
4. Every command you ran, in order: its start time, duration and exit code (quote the start and end records from logs/commands.jsonl for trueclone steps), with one line on what status said and what you did.
5. Stage timings (capture, reads, calibrate, seed, scores, review, next, next --verify) and the total from the capture's start to the last status.
6. The last status output in full and its exit code; the outcome, or why none was reached.
7. The Outcome sections of sites/astro/REPORT.md and REPORT.next.md as written, including the "Not verified" tables, and every row of every Scores table.
8. Attempts and Findings from notes.md, as written.
9. Each remaining difference, with its unit or frame.
10. The Next.js app: whether it built, whether next --verify ran and its result, and the app review's state.
11. Every tool or environment failure: the command, its exit code, the log file path and the log's last 30 lines.
12. Anything you believe is a trueclone defect, with evidence (paths, log files, exact output), kept apart from clone work you did not finish.
State what the checks and the review show and nothing more.
```

### 4.3 allbirds

```text
Clone https://www.allbirds.com/products/mens-tree-runners with trueclone, in template mode: only this product page. Name the site "allbirds". You are in C:\dev\tc-tests\rc7-allbirds, where trueclone 0.5.0-rc.7 is installed locally (node_modules) with its AGENTS.md and .claude/skills/trueclone/SKILL.md. Read both before you start and follow them.

SCOPE
1 route: this product page. Report the pages the capture found and did not capture (its last lines, and later REPORT.md's "Not captured, not verified" line); they are out of scope and not verified. Template mode replaces the site's text with placeholders: in your report, list any text in the clone that kept the site's own wording, in particular inside web components (shadow roots), which is a known gap. Report the page's height at the mobile size on the reference and on the clone as the layout results show them (an earlier run differed at the footer).

BEFORE CAPTURE
1. Run: npx trueclone --version   (it must print 0.5.0-rc.7)
2. Run: npx trueclone doctor   in exactly the way you will run every trueclone command (same permissions, same network, same shell). It must exit 0 with no FAIL line. If anything says FAIL, or the Chrome line says warn, stop before capture and report the output. Put both outputs in your report, verbatim.
3. Record your environment as you observe it: client, model and effort if shown, the permission/sandbox mode, whether network is on, the shell. If you are not in Full access, say so. A doctor that passes only because you escalated it does not make the session Full access.

CAPTURE (once)
4. Run exactly:
npx trueclone capture https://www.allbirds.com/products/mens-tree-runners allbirds --routes 1
Run it from PowerShell exactly like that: never through cmd /c or any wrapper that re-quotes arguments. If it fails before it saves anything (a network error), you may run the same command once more; otherwise run status. If the capture warns that a dialog covers the page at load, report it and follow what status says; never pass a login or a consent you were not given.

THE LOOP
5. Run: npx trueclone status allbirds   Do exactly the step it names, then run status again. Every trueclone command goes through npx trueclone from this folder: no global install, no node_modules paths, no cmd /c. trueclone keeps each step's whole output in sites/allbirds/logs/ and journals every step (start, end, exit code) in sites/allbirds/logs/commands.jsonl.
6. status's exit code decides: 1 means work remains (or "waiting": a step is still running), so continue and never stop, summarise or ask me anything on 1. 0 Verified, 2 Blocked, 3 Incomplete: stop and report.
7. Long steps. Calibrate and the scores can take an hour or more; status prints its estimate. Start every trueclone command so that it keeps running when your tool call returns: if your shell tool takes a timeout, give it at least status's estimate plus 30 minutes and never less than 60 minutes; if it cannot wait that long, start the command as a persistent background session and run status, which says "waiting" while it runs. Never wrap a command in anything that kills it or its launcher on a timer (no cmd /c wrappers, no Wait-Process -Timeout followed by Stop-Process). A quiet command is not stalled: read its log under sites/allbirds/logs/ or run status before you conclude anything.
8. Recovery is bounded. If a trueclone command crashes or exits with an error, run status: it either names a step (do it; trueclone's own retry bound decides when a repeated failure ends Blocked) or ends the run. Never retry a failing command on your own more than once. When status says a step cannot be done within your edits and offers a "- cannot:" line under ## Findings in notes.md, write it only if it is true, with your evidence, then run status: it decides. Never declare a trueclone command: run it.
9. Two backstops, and only these: (a) a trueclone command crashed and the next status neither names a step for it nor ends Blocked; (b) status names the same step more than 10 times in a row while nothing changes. On either, stop changing the clone, keep every file as it is, and report it as a tool defect with the evidence (sites/allbirds/logs/ has every command's output). An error that status turns into a step or a Blocked is not a backstop.

WHAT YOU MAY CHANGE
10. Only sites/allbirds/clone/script.js, files under sites/allbirds/clone/patches/, and sites/allbirds/notes.md (behaviours, attempts, findings and review verdicts, as the skill describes). The HTML clone's verdicts go under "## Review", one line per frame with that frame's token from compare/review/<size>/index.md, for example: - 03-section-2 wide [0608cbcb01110180]: same   or   - 07-section-4-hover wide [060ecbcb00110180]: differs: the panel opens on the wrong card. The Next.js app's verdicts go under "## Review: app", with the app frame's own token from compare-next/review/<size>/index.md. A line under one heading never answers for the other. Look at every sheet before you write its verdicts; never write verdicts from pixel scores or with a script.
11. Never: edit the installed package or anything under node_modules; set NODE_OPTIONS; edit sites/allbirds/reference, generated pages, compare/ or compare-next/ results, or anything under logs/; write a token or verdict for a frame you have not looked at; change a threshold or a tolerance; hide, mask or patch away a difference; force an animation frame, a random draw or a timer to make a frame match. The equivalent-state controls trueclone provides itself (the steps status names, its hold-still and calibration envelopes) are allowed.
12. Never deploy, push or publish anything. The clone stays local.

YOUR REPORT (when status exits 0, 2 or 3, or on a backstop)
1. The version and doctor outputs, verbatim.
2. Environment: client, model, effort, permission mode as observed, network, shell; every deviation from Full access.
3. Scope: the captured route; the pages found and not captured; any text that kept the site's own wording; the mobile page heights; anything validation did not reach.
4. Every command you ran, in order: its start time, duration and exit code (quote the start and end records from logs/commands.jsonl for trueclone steps), with one line on what status said and what you did.
5. Stage timings (capture, reads, calibrate, seed, scores, review, next, next --verify) and the total from the capture's start to the last status.
6. The last status output in full and its exit code; the outcome, or why none was reached.
7. The Outcome sections of sites/allbirds/REPORT.md and REPORT.next.md as written, including the "Not verified" tables, and every row of every Scores table.
8. Attempts and Findings from notes.md, as written.
9. Each remaining difference, with its unit or frame.
10. The Next.js app: whether it built, whether next --verify ran and its result, and the app review's state.
11. Every tool or environment failure: the command, its exit code, the log file path and the log's last 30 lines.
12. Anything you believe is a trueclone defect, with evidence (paths, log files, exact output), kept apart from clone work you did not finish.
State what the checks and the review show and nothing more.
```

### 4.4 heybhaskar

```text
Clone https://www.heybhaskar.com/ with trueclone, in exact mode: the whole site. The site's owner has given permission for an exact copy; it is recorded as --permission "site owner". Name the site "heybhaskar". You are in C:\dev\tc-tests\rc7-bhaskar, where trueclone 0.5.0-rc.7 is installed locally (node_modules) with its AGENTS.md and .claude/skills/trueclone/SKILL.md. Read both before you start and follow them.

SCOPE
The whole site: the capture follows the links of every page it captures and the sitemap, up to its default of 12 routes. Report every route it captured and every route it found and did not capture, with why (its last lines, and later REPORT.md's "Not captured, not verified" line); those are not verified. Never call the result a clone of the whole site while a found route is not captured; call it "these N routes".

BEFORE CAPTURE
1. Run: npx trueclone --version   (it must print 0.5.0-rc.7)
2. Run: npx trueclone doctor   in exactly the way you will run every trueclone command (same permissions, same network, same shell). It must exit 0 with no FAIL line. If anything says FAIL, or the Chrome line says warn, stop before capture and report the output. Put both outputs in your report, verbatim.
3. Record your environment as you observe it: client, model and effort if shown, the permission/sandbox mode, whether network is on, the shell. If you are not in Full access, say so. A doctor that passes only because you escalated it does not make the session Full access.

CAPTURE (once)
4. Run exactly:
npx trueclone capture https://www.heybhaskar.com/ heybhaskar --mode exact --permission "site owner"
Run it from PowerShell exactly like that: never through cmd /c or any wrapper that re-quotes arguments. If it fails before it saves anything (a network error), you may run the same command once more; otherwise run status.

THE LOOP
5. Run: npx trueclone status heybhaskar   Do exactly the step it names, then run status again. Every trueclone command goes through npx trueclone from this folder: no global install, no node_modules paths, no cmd /c. trueclone keeps each step's whole output in sites/heybhaskar/logs/ and journals every step (start, end, exit code) in sites/heybhaskar/logs/commands.jsonl.
6. status's exit code decides: 1 means work remains (or "waiting": a step is still running), so continue and never stop, summarise or ask me anything on 1. 0 Verified, 2 Blocked, 3 Incomplete: stop and report.
7. Long steps. Calibrate on an exact-mode site can take two to three hours; status prints its estimate. Start every trueclone command so that it keeps running when your tool call returns: if your shell tool takes a timeout, give it at least status's estimate plus 30 minutes and never less than 60 minutes; if it cannot wait that long, start the command as a persistent background session and run status, which says "waiting" while it runs. Never wrap a command in anything that kills it or its launcher on a timer (no cmd /c wrappers, no Wait-Process -Timeout followed by Stop-Process). A quiet command is not stalled: read its log under sites/heybhaskar/logs/ or run status before you conclude anything.
8. Recovery is bounded. If a trueclone command crashes or exits with an error, run status: it either names a step (do it; trueclone's own retry bound decides when a repeated failure ends Blocked) or ends the run. Never retry a failing command on your own more than once. When status says a step cannot be done within your edits and offers a "- cannot:" line under ## Findings in notes.md, write it only if it is true, with your evidence, then run status: it decides. Never declare a trueclone command: run it.
9. Two backstops, and only these: (a) a trueclone command crashed and the next status neither names a step for it nor ends Blocked; (b) status names the same step more than 10 times in a row while nothing changes. On either, stop changing the clone, keep every file as it is, and report it as a tool defect with the evidence (sites/heybhaskar/logs/ has every command's output). An error that status turns into a step or a Blocked is not a backstop.

WHAT YOU MAY CHANGE
10. Only sites/heybhaskar/clone/script.js, files under sites/heybhaskar/clone/patches/, and sites/heybhaskar/notes.md (behaviours, attempts, findings and review verdicts, as the skill describes). The HTML clone's verdicts go under "## Review", one line per frame with that frame's token from compare/review/<size>/index.md, for example: - 03-section-2 wide [0608cbcb01110180]: same   or   - 07-section-4-hover wide [060ecbcb00110180]: differs: the panel opens on the wrong card. The Next.js app's verdicts go under "## Review: app", with the app frame's own token from compare-next/review/<size>/index.md. A line under one heading never answers for the other. Look at every sheet before you write its verdicts; never write verdicts from pixel scores or with a script.
11. Never: edit the installed package or anything under node_modules; set NODE_OPTIONS; edit sites/heybhaskar/reference, generated pages, compare/ or compare-next/ results, or anything under logs/; write a token or verdict for a frame you have not looked at; change a threshold or a tolerance; hide, mask or patch away a difference; force an animation frame, a random draw or a timer to make a frame match. The equivalent-state controls trueclone provides itself (the steps status names, its hold-still and calibration envelopes) are allowed.
12. Never deploy, push or publish anything. The clone stays local.

YOUR REPORT (when status exits 0, 2 or 3, or on a backstop)
1. The version and doctor outputs, verbatim.
2. Environment: client, model, effort, permission mode as observed, network, shell; every deviation from Full access.
3. Scope: the captured routes; the routes found and not captured, with why; anything validation did not reach.
4. Every command you ran, in order: its start time, duration and exit code (quote the start and end records from logs/commands.jsonl for trueclone steps), with one line on what status said and what you did.
5. Stage timings (capture, reads, calibrate, seed, scores, review, next, next --verify) and the total from the capture's start to the last status.
6. The last status output in full and its exit code; the outcome, or why none was reached.
7. The Outcome sections of sites/heybhaskar/REPORT.md and REPORT.next.md as written, including the "Not verified" tables, and every row of every Scores table.
8. Attempts and Findings from notes.md, as written.
9. Each remaining difference, with its unit or frame.
10. The Next.js app: whether it built, whether next --verify ran and its result, and the app review's state.
11. Every tool or environment failure: the command, its exit code, the log file path and the log's last 30 lines.
12. Anything you believe is a trueclone defect, with evidence (paths, log files, exact output), kept apart from clone work you did not finish.
State what the checks and the review show and nothing more.
```

### 4.5 varsity

```text
Clone https://www.varsity.vc/ with trueclone, in exact mode. The site's owner has given permission for an exact copy; it is recorded as --permission "site owner". Name the site "varsity". You are in C:\dev\tc-tests\rc7-varsity, where trueclone 0.5.0-rc.7 is installed locally (node_modules) with its AGENTS.md and .claude/skills/trueclone/SKILL.md. Read both before you start and follow them.

SCOPE
The site as the capture finds it: it follows the links of every page it captures and the sitemap, up to its default of 12 routes. Report every route it captured and every route it found and did not capture, with why (its last lines, and later REPORT.md's "Not captured, not verified" line); those are not verified. Never call the result a clone of the whole site while a found route is not captured; call it "these N routes".

BEFORE CAPTURE
1. Run: npx trueclone --version   (it must print 0.5.0-rc.7)
2. Run: npx trueclone doctor   in exactly the way you will run every trueclone command (same permissions, same network, same shell). It must exit 0 with no FAIL line. If anything says FAIL, or the Chrome line says warn, stop before capture and report the output. Put both outputs in your report, verbatim.
3. Record your environment as you observe it: client, model and effort if shown, the permission/sandbox mode, whether network is on, the shell. If you are not in Full access, say so. A doctor that passes only because you escalated it does not make the session Full access.

CAPTURE (once)
4. Run exactly:
npx trueclone capture https://www.varsity.vc/ varsity --mode exact --permission "site owner"
Run it from PowerShell exactly like that: never through cmd /c or any wrapper that re-quotes arguments (an earlier run's wrapper cut the permission to a stray quote). If it fails before it saves anything (a network error), you may run the same command once more; otherwise run status.

THE LOOP
5. Run: npx trueclone status varsity   Do exactly the step it names, then run status again. Every trueclone command goes through npx trueclone from this folder: no global install, no node_modules paths, no cmd /c. trueclone keeps each step's whole output in sites/varsity/logs/ and journals every step (start, end, exit code) in sites/varsity/logs/commands.jsonl.
6. status's exit code decides: 1 means work remains (or "waiting": a step is still running), so continue and never stop, summarise or ask me anything on 1. 0 Verified, 2 Blocked, 3 Incomplete: stop and report.
7. Long steps. Calibrate on this site was estimated at about 107 minutes in development, with a range up to 3.5 hours; status prints its own estimate. Start every trueclone command so that it keeps running when your tool call returns: if your shell tool takes a timeout, give it at least status's estimate plus 30 minutes and never less than 60 minutes (for calibrate here, at least 4 hours); if it cannot wait that long, start the command as a persistent background session and run status, which says "waiting" while it runs. Never wrap a command in anything that kills it or its launcher on a timer (no cmd /c wrappers, no Wait-Process -Timeout followed by Stop-Process: an earlier run's one-hour wrapper killed calibrate's launcher). A quiet command is not stalled: read its log under sites/varsity/logs/ or run status before you conclude anything. Calibrate resumes where it stopped if it is interrupted: run status.
8. Recovery is bounded. If a trueclone command crashes or exits with an error, run status: it either names a step (do it; trueclone's own retry bound decides when a repeated failure ends Blocked) or ends the run. Never retry a failing command on your own more than once. When status says a step cannot be done within your edits and offers a "- cannot:" line under ## Findings in notes.md, write it only if it is true, with your evidence, then run status: it decides. Never declare a trueclone command: run it.
9. Two backstops, and only these: (a) a trueclone command crashed and the next status neither names a step for it nor ends Blocked; (b) status names the same step more than 10 times in a row while nothing changes. On either, stop changing the clone, keep every file as it is, and report it as a tool defect with the evidence (sites/varsity/logs/ has every command's output). An error that status turns into a step or a Blocked is not a backstop.

WHAT YOU MAY CHANGE
10. Only sites/varsity/clone/script.js, files under sites/varsity/clone/patches/, and sites/varsity/notes.md (behaviours, attempts, findings and review verdicts, as the skill describes). The HTML clone's verdicts go under "## Review", one line per frame with that frame's token from compare/review/<size>/index.md, for example: - 03-section-2 wide [0608cbcb01110180]: same   or   - 07-section-4-hover wide [060ecbcb00110180]: differs: the panel opens on the wrong card. The Next.js app's verdicts go under "## Review: app", with the app frame's own token from compare-next/review/<size>/index.md. A line under one heading never answers for the other. Look at every sheet before you write its verdicts; never write verdicts from pixel scores or with a script.
11. Never: edit the installed package or anything under node_modules; set NODE_OPTIONS; edit sites/varsity/reference, generated pages, compare/ or compare-next/ results, or anything under logs/; write a token or verdict for a frame you have not looked at; change a threshold or a tolerance; hide, mask or patch away a difference; force an animation frame, a random draw or a timer to make a frame match. The equivalent-state controls trueclone provides itself (the steps status names, its hold-still and calibration envelopes) are allowed.
12. Never deploy, push or publish anything. The clone stays local.

YOUR REPORT (when status exits 0, 2 or 3, or on a backstop)
1. The version and doctor outputs, verbatim.
2. Environment: client, model, effort, permission mode as observed, network, shell; every deviation from Full access.
3. Scope: the captured routes; the routes found and not captured, with why; anything validation did not reach.
4. Every command you ran, in order: its start time, duration and exit code (quote the start and end records from logs/commands.jsonl for trueclone steps), with one line on what status said and what you did.
5. Stage timings (capture, reads, calibrate with status's estimate beside it, seed, scores, review, next, next --verify) and the total from the capture's start to the last status.
6. The last status output in full and its exit code; the outcome, or why none was reached.
7. The Outcome sections of sites/varsity/REPORT.md and REPORT.next.md as written, including the "Not verified" tables, and every row of every Scores table.
8. Attempts and Findings from notes.md, as written.
9. Each remaining difference, with its unit or frame.
10. The Next.js app: whether it built, whether next --verify ran and its result, and the app review's state.
11. Every tool or environment failure: the command, its exit code, the log file path and the log's last 30 lines.
12. Anything you believe is a trueclone defect, with evidence (paths, log files, exact output), kept apart from clone work you did not finish.
State what the checks and the review show and nothing more.
```

### 4.6 zero

```text
Clone https://why.zero.university/ with trueclone, in exact mode. The site's owner has given permission for an exact copy; it is recorded as --permission "site owner". Name the site "zero". You are in C:\dev\tc-tests\rc7-zero, where trueclone 0.5.0-rc.7 is installed locally (node_modules) with its AGENTS.md and .claude/skills/trueclone/SKILL.md. Read both before you start and follow them.

SCOPE
The site as the capture finds it: it follows the links of every page it captures and the sitemap, up to its default of 12 routes; status switches to the journey (app) path by itself if the site is one. Report every route it captured and every route it found and did not capture, with why (its last lines, and later REPORT.md's "Not captured, not verified" line); those are not verified. A separate public deployment of an earlier zero clone exists: it is not part of this run, so never deploy, link, change or compare against it.

BEFORE CAPTURE
1. Run: npx trueclone --version   (it must print 0.5.0-rc.7)
2. Run: npx trueclone doctor   in exactly the way you will run every trueclone command (same permissions, same network, same shell). It must exit 0 with no FAIL line. If anything says FAIL, or the Chrome line says warn, stop before capture and report the output. Put both outputs in your report, verbatim.
3. Record your environment as you observe it: client, model and effort if shown, the permission/sandbox mode, whether network is on, the shell. If you are not in Full access, say so. A doctor that passes only because you escalated it does not make the session Full access.

CAPTURE (once)
4. Run exactly:
npx trueclone capture https://why.zero.university/ zero --mode exact --permission "site owner"
Run it from PowerShell exactly like that: never through cmd /c or any wrapper that re-quotes arguments. If it fails before it saves anything (a network error), you may run the same command once more; otherwise run status.

THE LOOP
5. Run: npx trueclone status zero   Do exactly the step it names, then run status again. Every trueclone command goes through npx trueclone from this folder: no global install, no node_modules paths, no cmd /c. trueclone keeps each step's whole output in sites/zero/logs/ and journals every step (start, end, exit code) in sites/zero/logs/commands.jsonl.
6. status's exit code decides: 1 means work remains (or "waiting": a step is still running), so continue and never stop, summarise or ask me anything on 1. 0 Verified, 2 Blocked, 3 Incomplete: stop and report.
7. Long steps. Calibrate on an exact-mode site can take two to three hours; status prints its estimate. Start every trueclone command so that it keeps running when your tool call returns: if your shell tool takes a timeout, give it at least status's estimate plus 30 minutes and never less than 60 minutes; if it cannot wait that long, start the command as a persistent background session and run status, which says "waiting" while it runs. Never wrap a command in anything that kills it or its launcher on a timer (no cmd /c wrappers, no Wait-Process -Timeout followed by Stop-Process). A quiet command is not stalled: read its log under sites/zero/logs/ or run status before you conclude anything.
8. Recovery is bounded. If a trueclone command crashes or exits with an error, run status: it either names a step (do it; trueclone's own retry bound decides when a repeated failure ends Blocked) or ends the run. Never retry a failing command on your own more than once. When status says a step cannot be done within your edits and offers a "- cannot:" line under ## Findings in notes.md, write it only if it is true, with your evidence, then run status: it decides. Never declare a trueclone command: run it.
9. Two backstops, and only these: (a) a trueclone command crashed and the next status neither names a step for it nor ends Blocked; (b) status names the same step more than 10 times in a row while nothing changes. On either, stop changing the clone, keep every file as it is, and report it as a tool defect with the evidence (sites/zero/logs/ has every command's output). An error that status turns into a step or a Blocked is not a backstop.

WHAT YOU MAY CHANGE
10. Only sites/zero/clone/script.js, files under sites/zero/clone/patches/, and sites/zero/notes.md (behaviours, attempts, findings and review verdicts, as the skill describes). The HTML clone's verdicts go under "## Review", one line per frame with that frame's token from compare/review/<size>/index.md (journey frames: compare/review/journey-<size>/, with the 5-character token, for example - journey/02-step-1 desktop [7djqh]: same), for example: - 03-section-2 wide [0608cbcb01110180]: same   or   - 07-section-4-hover wide [060ecbcb00110180]: differs: the panel opens on the wrong card. The Next.js app's verdicts go under "## Review: app", with the app frame's own token from compare-next/review/<size>/index.md (or compare-next/review/journey-<size>/). A line under one heading never answers for the other. Look at every sheet before you write its verdicts; never write verdicts from pixel scores or with a script.
11. Never: edit the installed package or anything under node_modules; set NODE_OPTIONS; edit sites/zero/reference, generated pages, compare/ or compare-next/ results, or anything under logs/; write a token or verdict for a frame you have not looked at; change a threshold or a tolerance; hide, mask or patch away a difference; force an animation frame, a random draw or a timer to make a frame match (the site's counters and draws vary by themselves: trueclone's calibration envelopes account for that). The equivalent-state controls trueclone provides itself (the steps status names, its hold-still and calibration envelopes) are allowed.
12. Never deploy, push or publish anything. The clone stays local.

YOUR REPORT (when status exits 0, 2 or 3, or on a backstop)
1. The version and doctor outputs, verbatim.
2. Environment: client, model, effort, permission mode as observed, network, shell; every deviation from Full access.
3. Scope: the captured routes or the journey's checkpoints; the routes found and not captured, with why; anything validation did not reach.
4. Every command you ran, in order: its start time, duration and exit code (quote the start and end records from logs/commands.jsonl for trueclone steps), with one line on what status said and what you did.
5. Stage timings (capture, reads, calibrate, seed, scores, journey, review, next, next --verify) and the total from the capture's start to the last status.
6. The last status output in full and its exit code; the outcome, or why none was reached.
7. The Outcome sections of sites/zero/REPORT.md and REPORT.next.md as written, including the "Not verified" tables, and every row of every Scores table.
8. Attempts and Findings from notes.md, as written.
9. Each remaining difference, with its unit, checkpoint or frame.
10. The Next.js app: whether it built, whether next --verify ran and its result, and the app review's state.
11. Every tool or environment failure: the command, its exit code, the log file path and the log's last 30 lines.
12. Anything you believe is a trueclone defect, with evidence (paths, log files, exact output), kept apart from clone work you did not finish.
State what the checks and the review show and nothing more.
```

## 5. After each run: collect the evidence (you, in Windows PowerShell)

Everything goes to `C:\dev\tc-tests\rc7-results\<site id>\`. The run folder itself is the evidence: never edit it after
the run. The auditor must be the one tied to this release: it reads the run with the repository's `scripts/`, so the
block checks that those match the package the run used, records the repository commit, and proves the audit wrote
nothing into the run. Shown for Elise; for another site change the first three lines (folder, site id).

```powershell
$run  = 'C:\dev\tc-tests\rc7-elise'
$id   = 'elise-ux'
$out  = "C:\dev\tc-tests\rc7-results\$id"
$site = Join-Path $run "sites\$id"
New-Item -ItemType Directory -Force -Path $out | Out-Null
# the auditor's commit, and its scripts against the package the run used
git -C C:\dev\rea-lab rev-parse HEAD | Out-File -Encoding utf8 "$out\auditor-commit.txt"
git -C C:\dev\rea-lab status --porcelain -- scripts tools bin | Out-File -Encoding utf8 -Append "$out\auditor-commit.txt"
$pkg = Join-Path $run 'node_modules\@trueclone\cli\scripts'
$mismatch = Get-ChildItem -LiteralPath $pkg -Filter *.mjs | Where-Object { (Get-FileHash -LiteralPath $_.FullName).Hash -ne (Get-FileHash -LiteralPath (Join-Path 'C:\dev\rea-lab\scripts' $_.Name)).Hash } | ForEach-Object { $_.Name }
"scripts that differ from the package: $(if ($mismatch) { $mismatch -join ', ' } else { 'none' })" | Out-File -Encoding utf8 -Append "$out\auditor-commit.txt"
# the audit, with the run's files hashed before and after
$before = Get-ChildItem -LiteralPath $site -Recurse -File | Get-FileHash -Algorithm SHA1 | ForEach-Object { "$($_.Hash) $($_.Path)" }
node C:\dev\rea-lab\tools\audit-run.mjs $site > "$out\audit.txt" 2> "$out\audit-stderr.txt"
"audit exit code: $LASTEXITCODE" | Out-File -Encoding utf8 -Append "$out\audit.txt"
$after = Get-ChildItem -LiteralPath $site -Recurse -File | Get-FileHash -Algorithm SHA1 | ForEach-Object { "$($_.Hash) $($_.Path)" }
$changed = Compare-Object $before $after
"files the audit changed: $(if ($changed) { ($changed | ForEach-Object { $_.InputObject }) -join '; ' } else { 'none' })" | Out-File -Encoding utf8 "$out\audit-readonly.txt"
Get-Content "$out\auditor-commit.txt", "$out\audit.txt", "$out\audit-readonly.txt"
```

The auditor is valid only when `auditor-commit.txt` shows the release commit, an empty `git status` and "scripts that
differ from the package: none". If not, check out the release commit in a separate worktree and run it from there.

Then:

1. Paste the agent's final message, unedited, into `C:\dev\tc-tests\rc7-results\<site id>\agent-report.md`.
2. Note the Codex session file (`%USERPROFILE%\.codex\sessions\…`) in `C:\dev\tc-tests\rc7-results\<site id>\session.txt`,
   with the client, model, effort and permission mode the session used.
3. Look at the clone (`npx trueclone serve <site id>` in the run folder) and the app (`npx trueclone serve <site id>
   --next`) beside the live site, at a phone size and a wide window.
4. Write your by-eye scores, 0-100, for wide and phone, with one line on what you saw, in
   `C:\dev\tc-tests\rc7-results\<site id>\by-eye.md`. Keep them apart from trueclone's scores: they are the human
   assessment, not a result of the run.

## 6. Elise: the checklist before the next site

Answer each from the files, not from the agent's summary. Five questions, kept apart:

**A. Was the pipeline truthful?**

- `audit.txt` ends with exit code 0, and `audit-readonly.txt` says "none".
- The last status output (`sites\elise-ux\logs\status.log`), `compare\outcome.json` and REPORT.md's headline name the
  same outcome; the agent's report quotes the same.
- REPORT.md's accounting accounts for every unit, plan item and review frame of both sides; nothing is "pending".
- The HTML review (`## Review`) and the app review (`## Review: app`) are separate: the app's lines carry tokens from
  `compare-next\review\…\index.md`, and no app frame is closed by a clone line.

**B. Does the app work?**

- `logs\commands.jsonl` has a `next` step and a `next --verify` step, each with an end record; REPORT.next.md states the
  build and verify result.
- The app was built and checked locally: no page of the app or the clone presents the live site inside a frame as if
  it were local. REPORT.md's "Frames that still load the live site" line is absent, or names only routes that were not
  captured.

**C. Is the scope covered?**

- All nine routes are captured: the encoded ones (`/Landing%20Page.html`, `/New%20Craft%20Society.html`,
  `/NASA%20(Draft).html`) load in the served clone, at their encoded paths, with their own content.
- The agent's router-view comparison lists every view in the site's scripts; any view not captured is in its
  "discovered, not captured, not verified" list and in REPORT.md's "Not captured, not verified" line.
- Interactions were scheduled: the interaction plan has items for the views' openers and links, and each item has a
  result or a listed reason.
- Frames (iframes) are accounted for: each frame on a captured page points at a captured local page, or is listed.
- Both sides were measured the same way: `sites\elise-ux\reference\meta.json`'s `maskVersion` is the one this version
  measures with (status re-captures by itself when it is not; any re-capture shows in `logs\commands.jsonl`), and the
  Scores tables show the reference and the clone at the same sizes.
- Nobody calls the result "the whole site" unless every view the scripts name was captured and verified.

**D. Fidelity.** Your `by-eye.md` scores, and the Scores tables, read separately. Exact mode expects ≥ 90 by eye.

**E. Clone work or tool defect?** For each remaining difference and each failure: is it clone work the agent did not
finish (its file is `script.js` or `patches/`), the environment (the live site, the network, the machine), or a trueclone
defect (status named something the agent may not edit, a crash status did not turn into a step or Blocked, a report line
the files contradict)?

**Recommendation** (write one in `C:\dev\tc-tests\rc7-results\elise-ux\decision.md`):

- **Proceed** to astro: A to C hold, and nothing under E is a trueclone defect.
- **Proceed with a disclosed limitation**: A and B hold, and C or E show a trueclone gap already listed in
  `docs/rc7-status.md` §5 that does not touch the other five sites' modes (for example a router-only view).
- **Pause for a shared defect**: A fails (any false claim), B fails, or E shows a trueclone defect not in §5 that the other
  sites would also meet (a crash, a mis-measurement, an accounting gap). Report it before the next site.

## 7. Pass criteria

**For each run:**

| # | Criterion | Fails if |
|---|---|---|
| 1 | Terminal by itself | status never exited 0, 2 or 3, or a backstop was used |
| 2 | Truthful | `audit-run` reports any finding; REPORT or the console says something the files do not; a Verified the by-eye look contradicts |
| 3 | Bounded | a step was named more than twice after running without effect (`loop.json` steps), or a recovery was repeated beyond its bound |
| 4 | Owned | a Blocked without its owner, cause, log and resume; clone work naming a file the agent may not edit |
| 5 | Complete coverage | a page the site links to (for Elise, a view its scripts name) missing from both the captured routes and the "not captured" lists |
| 6 | Time | calibrate beyond twice status's estimate; a step killed by its own limit on a first run |
| 7 | Fidelity (informs, does not block) | your by-eye score: ≥ 90 expected in exact mode, ≥ 85 for the structure in template mode |

**Stop the campaign** (and report before the next site) on any of:

- a false Verified;
- a run that does not end;
- a crash that status does not turn into Blocked;
- a Blocked whose owner is "tool" for a defect not already listed in `docs/rc7-status.md` §5.

A Blocked owned by the environment (the live site or network) is recorded and the next site starts.

## 8. What the campaign decides

The release gates are in `docs/rc7-status.md` §6. In short:

- **A wider prerelease:** six of six runs terminal and truthful, at least three Verified or Incomplete listing only
  differences, no P0 open.
- **Public users (`latest`):**
  - all of the above, with no P1 open;
  - your by-eye scores at or above RC4's on every site;
  - one unseen site run clean (none of the six counts);
  - the readiness score at least 80 on the unchanged rubric (61 now).
