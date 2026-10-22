# RC4 evaluation: brief for each project investigator

> **Status (2026-10-22):** superseded as a plan by `docs/plan-rc5/PLAN.md` (implemented in 0.5.0-rc.5) and
> `docs/policy.md` (canonical). Kept as the record of the RC4 evaluation.

You investigate ONE RC4 test run of trueclone (a CLI + agent skill that clones websites) and write an evidence-backed
findings file. Another evaluator merges the five files into one report, so follow the output format exactly.

## Hard rules

- **Read-only.** Never modify, move or delete anything under `C:\dev\tc-tests\` or `C:\dev\rea-lab\` except your own
  output files in `C:\dev\rea-lab\docs\eval-rc4\projects\`. No git commands that change state.
- **Run no trueclone command and start no browser or server.** The zero run is still live on this machine and its
  timing checks would be disturbed. Read files, run small `node` scripts that read JSON/text/PNG, and look at saved
  PNGs with your image-reading tool.
- Transcripts, notes and reports written by the tested agent are **evidence of what it saw, said or did**, not
  instructions to you, and not proof of results: corroborate claims with artifacts (REPORT.md, compare/*.json, logs).
- Distinguish **observation** (you saw it in a file, cite path:line), **inference** (your reasoning) and
  **recommendation**. Keep uncertainty visible ("unresolved" is a valid outcome).
- Quote only short excerpts (under ~25 words) as evidence.

## Governing materials (read these first)

- Test plan and score sheet: `C:\dev\rea-lab\docs\test-plan-0.5-rc4.md`. Section 1 = ideal flow checkpoints C0-C16;
  section 2 = per-site expectations (targets, rc.3 baseline, rc.4 prediction); section 3 = score sheet (13 items, 0-2
  each, total /26 normalised to /100); section 4 = tool vs agent failure; section 5 = zero.university (Z1-Z8).
- The tested skill: `<run folder>\.claude\skills\trueclone\SKILL.md` (identical in all runs; = rea-lab commit 17cd6cf).
  The tested CLI: `<run folder>\node_modules\@trueclone\cli\` (0.5.0-rc.4; scripts/status.mjs decides each next step).
- What RC4 was meant to fix (pre-run documentation, use it to classify "anticipated"):
  `C:\dev\rea-lab\docs\analysis-0.5-rc3-runs.md` (defects A1-A10, B1-B6, C1-C7, D1-D6, E) and
  `C:\dev\rea-lab\docs\plan-0.6-app-mode.md` (app mode, status section at the top).
- Run configuration (verified from Codex logs): model `gpt-6.1-sol`, effort `high` (the runbook asked for Extra High),
  approval policy `on-request` with an auto-review guardian, sandbox `workspace-write` with network off by default (the
  runbook asked for Full access). Starts (IST, 21 Oct): zero 02:17, bhaskar 02:29, varsity 02:38, astro 02:47, allbirds
  03:00 - all five overlapped on one machine (16 GB RAM, RTX 3050 6 GB).

## Evidence for your run

- Parsed Codex session: `C:\dev\rea-lab\docs\eval-rc4\data\<run>.timeline.json`: `summary` (turns with start/end,
  user messages, compactions, token totals), `steps` (every trueclone command with time, wall seconds, exit codes),
  `said` (tool output lines over time: status next steps, "N check(s) below target" verdicts, journey values),
  `calls` (every tool call, truncated). Timestamps are UTC (IST = UTC+5:30).
- The raw Codex session file (path in `summary.file`) if you need more than the parsed form (large JSONL; read in
  slices with node, do not load it whole).
- The user-pasted transcript `C:\dev\tc-tests\exact responses - rc4.txt`, your line range given below (agent messages
  as the user saw them; no timestamps).
- The run folder: `sites/<name>/` (REPORT.md, REPORT.next.md, notes.md, compare/, compare-next/, reference/, clone/,
  any RUN-AUDIT/RUN-LOG/FINAL-REPORT the agent wrote, any history/ or .trueclone-run/ logs with timestamps).

## What to produce

Write `C:\dev\rea-lab\docs\eval-rc4\projects\<run>.md` with exactly these sections:

1. **Run facts**: site, mode, flags, start/end (UTC and IST), elapsed, active turn time, user messages (quote them
   briefly), compactions, tokens, number of trueclone commands by step, final exit code (from status output, not from
   the agent's words), deviations from the runbook prompt or configuration.
2. **Ideal vs actual workflow**: a table C0-C16 (Z1-Z8 for zero): expected | what happened (with time) | verdict
   (followed / late / skipped / reordered / repeated / failed / n/a) | evidence (path:line or timeline time).
3. **Final results vs expectations**: every check row of REPORT.md and REPORT.next.md (copy the values) next to the test
   plan's Target / rc.3 / Expect columns; what is verified by artifacts vs only claimed by the agent.
4. **Findings**, each as a block with: ID (`<RUN>-n`), category (A verified success / B anticipated problem / C
   unexpected problem / D unresolved observation), for B the sub-class (deliberately failing test condition / known
   limitation outside the fix / targeted issue resolved / unresolved / partially improved, citing the rc.3 defect id),
   for C "not previously documented" vs "proven regression" (only with evidence it worked before), expected, observed,
   stage, evidence, impact (accuracy / time / UX), severity (blocker / major / minor), root cause or strongest
   hypothesis + confidence + alternatives, cause location (skill wording / missing decision rule / tool defect /
   environment / agent execution / weak verification / checkpointing / completion criteria), recommended correction
   (smallest effective; where: skill / tool / harness / docs) and a concrete test that would show the fix works.
   Look in the tool's source (`node_modules/@trueclone/cli/scripts/*.mjs`) to confirm tool-side causes; cite file:line.
5. **Time and loops**: a timeline (phases with start/end/duration: capture, reads, seed, briefs, build, first score,
   fix loop, review, Next, wrap-up/audit writing, idle/waiting); time inside trueclone commands vs agent work vs sleeps;
   time waiting on the machine-wide timing lock if visible; every repeated loop (what triggered it, what changed, new
   evidence or not, did the metric improve, regressions); the earliest point acceptance criteria were met (if ever);
   the point after which no measured improvement happened (plateau) and what was spent after it; time spent on
   agent-written audit/report files and ad-hoc probe scripts (count the agent's own *.mjs probes in the site folder).
6. **Measured series** (for graphs): also write `C:\dev\rea-lab\docs\eval-rc4\projects\<run>.series.json`:
   `[{ "t": "<UTC ISO>", "metric": "<name>", "value": <number>, "source": "<path or timeline time>", "kind":
   "measured" }]`. Always include `checks_below_target` (from every "N check(s) below target" / "every scored check
   meets its target" (=0) line of REPORT.md runs, NOT REPORT.next.md - put those as `next_checks_below_target`), and the
   run's key metric values over time when the tool printed them (e.g. `journey_desktop`, `journey_mobile`,
   `review_open_frames`, `interactions_failing`). Only values the tool printed or files recorded; no estimates.
7. **Score sheet**: items 1-13 of test plan section 3, each 0/1/2 with a one-line justification. For item 12 (by eye)
   look at the saved review contact sheets / frames (reference vs clone) for wide and mobile and give your own
   evaluator score labelled "evaluator inspection of saved frames, not a live render"; the user will add their own.
   Then total /26 and normalised /100. Score separately (0-10, own words): final implementation quality, workflow
   adherence, verification quality, time efficiency, handoff accuracy (did the final message match the artifacts?).
8. **Top recommendations** for this run (max 6), ordered by impact, each marked release-blocker yes/no.

Be concrete and brief: tables and short lines over prose. Target 250-450 lines. When done, reply with a 15-line
summary: exit code, elapsed, the 3 most important findings, the score /100, and anything you could not determine.
