# Resuming the RC8 Elise run on 0.5.0-rc.9

The run in `C:\dev\tc-tests\rc8-elise-retry1` ended Blocked (owner tool) on rc.8 defects (`docs/rc7-ledger.md` §9).
It resumes in place on rc.9: no new folder, no new capture. This procedure was proven on an isolated copy of that
exact run before release.

## What the migration keeps, changes and invalidates

| Artifact | On resume | Why |
|---|---|---|
| `reference/` except `bundle/` (meta.json, the shots of 9 routes at 5 sizes, route captures, reads, `noise.json` calibration, the site's scripts, the mirror, the saved assets) | **kept as is** | Still valid: nothing about how they are measured changed, and the reference identity (`refId`) is unchanged. On the copy, all 6,416 files were byte-identical after the resume |
| `reference/bundle/` | **completed** by `record-bundle` (9 pages recorded again at desktop; 14 more files fetched whole) | The bundle is the clone, and it lacked 5 routes' pages and 76 saved files. This is the only reference material that needs new recording, and it is targeted: the pages and files themselves, not a full recapture |
| `clone/` | **regenerated** by `seed --force` (status names it: the clone was seeded by rc.8's seed) | An own-bundle clone is generated, not authored. `clone/patches/` is kept (this run has none) |
| `notes.md` (Findings, Review), `design-tokens.json`, `DESIGN.md`, `globals.css` | **kept** | Authored or still valid. On the copy, notes.md was byte-identical |
| `compare/` results | **invalidated**, never re-stamped: every clone result is stale (the clone changed), and the 70 old errors are measured again | Status re-measures them; nothing measured on the old clone counts for the new one |
| `compare/outcome.json`, `REPORT.md` | **replaced** at the next status outcome | They describe the run as it is |
| `logs/` | **appended** | The journal keeps the whole history |
| Repeated-failure counts (`compare/loop.json`) | **reset** under the new version | The installed version is one of their inputs (RC7-E5), so the old Blocked does not re-block |

**Before upgrading**, a full copy of the run is at `C:\dev\tc-tests\rc8-elise-retry1-evidence`, with
`ORIGINAL-MANIFEST.sha256.txt`. Keep it; the resume does not touch it.

## What the proof showed (an isolated copy, rc.9 code)

- **status:** names `record-bundle` (no page for 5 routes; 71 saved files not in the bundle), not Blocked.
- **record-bundle:** 9 of 9 pages recorded, 14 of 14 remaining files fetched whole, in 66 s; the bundle then covers
  everything.
- **seed --force:** 160 files, 9 documents (rc.8's seed wrote 1); the new route check passes.
- **The local clone:** all 9 routes answer HTTP 200. The About photos, the "My Friends" icon, the AISS logo and the
  videos are served whole (`cs-4.mp4`: 680,612 bytes).
- **Old results:** none counted; the evaluation is 118 stale, 70 erred, `verified: false`.
- **Status next:** names the score of everything stale.
- **The layout check:** every route at every size measured, no errors; before, 25 of 45 were HTTP errors. Scores:
  - start page 100; Landing Page 99.2-99.8;
  - Kruiz 95.9-98.9; NASA 96.3-98.8; NASA (Draft) 91.6-95.8;
  - AISS 84.4-93.8; Codazen 81.3-91.0; About 81.1-94.1; New Craft Society 83.0-92.9.
  - These are open clone differences, not passes.

## Setup (you, in Windows PowerShell)

```powershell
& {
  Set-Location -LiteralPath 'C:\dev\tc-tests\rc8-elise-retry1' -ErrorAction Stop
  npm install --save-dev --save-exact '@trueclone/cli@0.5.0-rc.9' --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw "npm install failed (exit $LASTEXITCODE)" }
  npx trueclone init --no-install
  if ($LASTEXITCODE -ne 0) { throw "trueclone init failed (exit $LASTEXITCODE)" }
  $got = "$(npx trueclone --version | Select-Object -Last 1)".Trim()
  if ($got -ne '0.5.0-rc.9') { throw "trueclone reports '$got', not 0.5.0-rc.9" }
  "UPGRADED: trueclone $got"
}
```

`init --no-install` refreshes the skill and the AGENTS.md block to rc.9's; it does not touch `sites/`.

## The prompt (the existing Codex session or a new one in that folder, Full access with network)

```text
Continue the Elise clone in C:\dev\tc-tests\rc8-elise-retry1 (site "elise-ux", exact mode, permission recorded at capture). It ended Blocked on trueclone 0.5.0-rc.8 defects; trueclone 0.5.0-rc.9 fixes them and is now installed here. Read AGENTS.md and .claude/skills/trueclone/SKILL.md again first: they were updated with the upgrade.

1. Run: npx trueclone --version   (it must print 0.5.0-rc.9) and npx trueclone doctor (exit 0, no FAIL line, run the way you run every trueclone command). Put both outputs in your report.
2. Resume with: npx trueclone status elise-ux   Do exactly the step it names, then run status again, until it exits 0, 2 or 3. Expect it to name record-bundle elise-ux first (it records the 5 project pages and the files the clone was missing into the bundle, without capturing again), then seed elise-ux --force, then the scores. Never capture again unless status names it.
3. Keep what is valid: never delete or edit reference/, notes.md history, logs/ or C:\dev\tc-tests\rc8-elise-retry1-evidence. Old results are re-measured by the steps status names; never edit results or write verdicts for frames you have not looked at.
4. This clone is the site's own bundle: never edit files under clone/ (the seed regenerates them) or reference/bundle/. Your work is in notes.md: look at every review sheet and write its verdicts (the HTML clone's under "## Review", the Next.js app's under "## Review: app", each with its frame's token), and under "## Findings" anything the bundle cannot carry, with evidence. Where status asks you to explain a difference, explain it from the files. The open differences to look at include the About page's photo galleries and scrollers, the nav links' hovers, and the project pages (AISS, Codazen, NASA (Draft), New Craft Society) below their layout bar.
5. Long steps keep running: no time limit shorter than status's estimate, run them in the background and run status if your tool cannot wait, never stop one because it is quiet. Never end your turn or ask anything while status exits 1.
6. When status exits 0, 2 or 3, report: the version and doctor outputs; every command with its exit code and time; the last status output and exit code; REPORT.md's and REPORT.next.md's Outcome sections, Not verified tables and Scores tables, with the accounting counts from compare/outcome.json; what you changed (patches, notes); each remaining difference with its unit or frame; any trueclone defect with its log.
```
