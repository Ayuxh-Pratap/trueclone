# Test plan: 0.5.0-rc.8, Elise, one manual run

One site, one fresh workspace, one Codex session you start yourself. No coordinator, no queue. This repeats the RC7 Elise
run on the corrected release; why it is needed: `docs/rc7-status.md` §8 and `docs/rc7-ledger.md` §8.

Elise is not an unseen site: this run cannot stand in for the release gate's unseen-site run. Whatever it ends in,
readiness is decided only on the unchanged rubric.

## 1. What rc.8 changes, and what this run must show

| Defect (RC7 Elise) | rc.8 | This run shows it fixed when |
|---|---|---|
| E1: reads timed out on the start page's load event (a slow 21 MB page, not a hung one) | readiness is the load event, waited for while the page keeps loading; fails on 30 s of silence or a 10-minute ceiling; every read uses it | `reads` completes. Any "no load event" warning names silence or the ceiling, and appears only where a request really stopped |
| E2: a route that failed at every size counted as captured and mirrored | a route is captured at every size or listed as not captured, with why; a requested route that failed stays required and not verifiable | every route in `meta.routes` has all five sizes; anything else is in `meta.routesNotCaptured` and REPORT's "Requested, not captured, not verified" line; the mirror line counts what it mirrored; with any requested route missing the outcome is Incomplete or Blocked, never Verified |
| E3: Blocked with 323 items pending | at Blocked, unreached items are blocked by the cause | if the run ends Blocked, `compare/outcome.json` counts 0 pending |
| E4: the auditor accepted it | pending at any terminal outcome is a finding | `tools/audit-run.mjs` at the rc.8 commit exits 0 on a consistent run, and you check its output |
| E5: a Blocked run could not resume under a fixed version | the version is one of the inputs | not exercised by a fresh workspace |

## 2. Setup (you, in Windows PowerShell, after rc.8 is published)

```powershell
$d = 'C:\dev\tc-tests\rc8-elise'
if (Test-Path -LiteralPath $d) { Write-Error "$d already exists: nothing was changed. Choose a new folder." } else {
  New-Item -ItemType Directory -Path $d | Out-Null
  Set-Location -LiteralPath $d
  npm init -y | Out-Null
  npm install --save-dev --save-exact '@trueclone/cli@0.5.0-rc.8'
  npx trueclone init --no-install
  npx trueclone --version
  npm ls '@trueclone/cli'
}
```

`npx trueclone --version` must print `0.5.0-rc.8` (not `npx --no …`, which prints npm's own version). Then open a new
Codex session in `C:\dev\tc-tests\rc8-elise`, set Full access with network in its permission picker, and paste the
prompt. Keep the machine awake and plugged in for the run.

## 3. The prompt

```text
Clone https://www.elise-ux.com/ with trueclone, in exact mode. The site's owner has given permission for an exact copy; it is recorded as --permission "site owner". Name the site "elise-ux". You are in C:\dev\tc-tests\rc8-elise, where trueclone 0.5.0-rc.8 is installed locally (node_modules) with its AGENTS.md and .claude/skills/trueclone/SKILL.md. Read both before you start and follow them.

WORKSPACE
Work only inside C:\dev\tc-tests\rc8-elise. Never install, upgrade or reinstall trueclone or any other package yourself (trueclone's own steps install what they need). Never end your turn, summarise or ask me anything while status exits 1.

SCOPE
This site is a set of views its own script switches between. Some views are reachable only through the script's view map, not through any link, so trueclone's automatic discovery cannot find them all. You capture these 9 routes by name, in one capture (a --routes list is a single wave of exactly those routes):
/ , /Landing Page.html , /About.html , /New Craft Society.html , /AISS.html , /Codazen.html , /NASA.html , /NASA (Draft).html , /Kruiz.html
After the capture, before the first status, compare two lists and put both in your report: (a) the routes the capture says it captured and the ones it says it did not capture, with why (its last lines, meta.routesNotCaptured, and later REPORT.md's "Not captured, not verified" line); (b) every view named in the site's own scripts (the router or view map in the captured reference: read the files under sites/elise-ux/reference, read-only). Any view in (b) that is not in (a)'s captured list is "discovered, not captured, not verified": list it. Never call the result a clone of the whole site unless every view in (b) was captured and verified; call it "these N routes".

BEFORE CAPTURE
1. Run: npx trueclone --version   (it must print 0.5.0-rc.8)
2. Run: npx trueclone doctor   in exactly the way you will run every trueclone command (same permissions, same network, same shell). It must exit 0 with no FAIL line. If anything says FAIL, or the Chrome line says warn, stop before capture and report the output. Put both outputs in your report, verbatim.
3. Record your environment as you observe it: client, model and effort if shown, the permission/sandbox mode, whether network is on, the shell. If you are not in Full access, say so. A doctor that passes only because you escalated it does not make the session Full access.

CAPTURE (once)
4. Run exactly:
npx trueclone capture https://www.elise-ux.com/ elise-ux --mode exact --permission "site owner" --routes "/,/Landing Page.html,/About.html,/New Craft Society.html,/AISS.html,/Codazen.html,/NASA.html,/NASA (Draft).html,/Kruiz.html"
Run it from PowerShell exactly like that: never through cmd /c or any wrapper that re-quotes arguments. It loads a heavy site at five sizes and can take a long time: never stop it because it is quiet. If it fails before it saves anything (a network error), you may run the same command once more; otherwise run status.

THE LOOP
5. Run: npx trueclone status elise-ux   Do exactly the step it names, then run status again. Every trueclone command goes through npx trueclone from this folder: no global install, no node_modules paths, no cmd /c. trueclone keeps each step's whole output in sites/elise-ux/logs/ and journals every step (start, end, exit code) in sites/elise-ux/logs/commands.jsonl.
6. status's exit code decides: 1 means work remains (or "waiting": a step is still running), so continue and never stop, summarise or ask me anything on 1. 0 Verified, 2 Blocked, 3 Incomplete: stop and report.
7. Long steps. Capture, reads and calibrate on this site can each take an hour or more; status prints its estimate for calibrate. Start every trueclone command so that it keeps running when your tool call returns: if your shell tool takes a timeout, give it at least status's estimate plus 30 minutes and never less than 60 minutes; if it cannot wait that long, start the command as a persistent background session and run status, which says "waiting" while it runs. Never wrap a command in anything that kills it or its launcher on a timer (no cmd /c wrappers, no Wait-Process -Timeout followed by Stop-Process). A quiet command is not stalled: read its log under sites/elise-ux/logs/ or run status before you conclude anything.
8. Recovery is bounded. If a trueclone command crashes or exits with an error, run status: it either names a step (do it; trueclone's own retry bound decides when a repeated failure ends Blocked) or ends the run. Never retry a failing command on your own more than once. When status says a step cannot be done within your edits and offers a "- cannot:" line under ## Findings in notes.md, write it only if it is true, with your evidence, then run status: it decides. Never declare a trueclone command: run it.
9. Two backstops, and only these: (a) a trueclone command crashed and the next status neither names a step for it nor ends Blocked; (b) status names the same step more than 10 times in a row while nothing changes. On either, stop changing the clone, keep every file as it is, and report it as a tool defect with the evidence (sites/elise-ux/logs/ has every command's output). An error that status turns into a step or a Blocked is not a backstop.

WHAT YOU MAY CHANGE
10. Only sites/elise-ux/clone/script.js, files under sites/elise-ux/clone/patches/, and sites/elise-ux/notes.md (behaviours, attempts, findings and review verdicts, as the skill describes). The HTML clone's verdicts go under "## Review", one line per frame with that frame's token from compare/review/<size>/index.md, for example: - 03-section-2 wide [0608cbcb01110180]: same   or   - 07-section-4-hover wide [060ecbcb00110180]: differs: the panel opens on the wrong card. The Next.js app's verdicts go under "## Review: app", with the app frame's own token from compare-next/review/<size>/index.md. A line under one heading never answers for the other. Look at every sheet before you write its verdicts; never write verdicts from pixel scores or with a script.
11. Never: edit the installed package or anything under node_modules; set NODE_OPTIONS; edit sites/elise-ux/reference, generated pages, compare/ or compare-next/ results, or anything under logs/; write a token or verdict for a frame you have not looked at; change a threshold or a tolerance; hide, mask or patch away a difference; force an animation frame, a random draw or a timer to make a frame match. The equivalent-state controls trueclone provides itself (the steps status names, its hold-still and calibration envelopes) are allowed.
12. Never deploy, push or publish anything. The clone stays local.

YOUR REPORT (when status exits 0, 2 or 3, or on a backstop)
1. The version and doctor outputs, verbatim.
2. Environment: client, model, effort, permission mode as observed, network, shell; every deviation from Full access.
3. Scope: the captured routes; the routes not captured, with why (meta.routesNotCaptured); the router-view comparison (lists (a) and (b) above); anything validation did not reach.
4. Every command you ran, in order: its start time, duration and exit code (quote the start and end records from logs/commands.jsonl for trueclone steps), with one line on what status said and what you did.
5. Stage timings (capture, reads, calibrate, seed, scores, review, next, next --verify) and the total from the capture's start to the last status.
6. The last status output in full and its exit code; the outcome, or why none was reached.
7. The Outcome sections of sites/elise-ux/REPORT.md and REPORT.next.md as written, including the "Not verified" tables, and every row of every Scores table; and the accounting counts from compare/outcome.json.
8. Attempts and Findings from notes.md, as written.
9. Each remaining difference, with its unit or frame.
10. The Next.js app: whether it built, whether next --verify ran and its result, and the app review's state.
11. Every WARNING line in the capture log and the reads logs (sites/elise-ux/logs/*capture*.log, *reads*.log), verbatim.
12. Every tool or environment failure: the command, its exit code, the log file path and the log's last 30 lines.
13. Anything you believe is a trueclone defect, with evidence (paths, log files, exact output), kept apart from clone work you did not finish.
State what the checks and the review show and nothing more.
```

## 4. After the run (you)

Copy the agent's final message to `C:\dev\tc-tests\rc8-results\elise\agent-report.md`. Then run the auditor of the rc.8
commit, read-only, with the run hashed before and after:

```powershell
$site = 'C:\dev\tc-tests\rc8-elise\sites\elise-ux'
$out = 'C:\dev\tc-tests\rc8-results\elise'
New-Item -ItemType Directory -Force -Path $out | Out-Null
git -C C:\dev\rea-lab log -1 --format='%H %s' | Out-File -Encoding utf8 "$out\auditor-commit.txt"
$before = Get-ChildItem -LiteralPath $site -Recurse -File | Get-FileHash -Algorithm SHA1 | ForEach-Object { "$($_.Hash) $($_.Path)" }
node C:\dev\rea-lab\tools\audit-run.mjs $site > "$out\audit.txt" 2> "$out\audit-stderr.txt"
"audit exit code: $LASTEXITCODE" | Out-File -Encoding utf8 -Append "$out\audit.txt"
$after = Get-ChildItem -LiteralPath $site -Recurse -File | Get-FileHash -Algorithm SHA1 | ForEach-Object { "$($_.Hash) $($_.Path)" }
"files the audit changed: $(if (Compare-Object $before $after) { 'SOME (see Compare-Object)' } else { 'none' })" | Out-File -Encoding utf8 "$out\audit-readonly.txt"
Get-Content "$out\auditor-commit.txt", "$out\audit.txt", "$out\audit-readonly.txt"
```

The auditor counts only from a checkout at the rc.8 release commit with `scripts/` unchanged since (`git -C
C:\dev\rea-lab status --porcelain -- scripts tools` empty).

Then judge, from the files and not from the agent's summary:

1. **E1:** did `reads` complete? Are the "no load event" warnings only where a request really stopped?
2. **E2:** do the routes, the not-captured list, REPORT and the mirror line agree?
3. **Terminal outcome:** pending 0 at a terminal outcome, and an audit exit of 0.
4. **The app:** built and verified.
5. **Your by-eye score,** wide and phone, kept apart from the automated scores.

Do not start another site from this result alone: bring the report back for evaluation first.
