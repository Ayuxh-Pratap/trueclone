# 0.5.0-rc.4 test plan: five sites, run in parallel in Codex

> **Status (2026-10-22): the RC4 runbook, kept as run.** The next test is `docs/test-plan-0.5-rc5.md`. Superseded
> here: exit 3 as "every step left is set aside" (rc.5: Incomplete, decided by the loop controller), set-asides and "three
> tries" in the score sheet, and `--quick`. The runs used effort `high` and the default sandbox (network off,
> escalations on request), not the Extra High / Full access this page recommends (docs/eval-rc4/data/run-facts.json).

What each run should do, stage by stage, so you can score it against this sheet. Four document sites from the rc.3
round (varsity, heybhaskar, allbirds, docs.astro.build) and one canvas app (why.zero.university). rc.3 numbers are the
baseline (docs/analysis-0.5-rc3-runs.md). Everything below is a prediction made before the runs. A run that differs is
a finding: note it in the Score sheet. Do not tune the tool toward this sheet.

## 0. Runbook: what you do, as a user would

### Model (all five runs): GPT-6.1 Sol, reasoning Extra High

OpenAI's Codex model page says: "For complex coding and agentic workflows, use GPT-6.1 Sol", for "repeated,
long-running work". It describes Sol as near-Astra performance at a lower cost; GPT-6 Astra is the top tier at about 5x
the price. Use the same model on all five so a low site says something about the tool, not the model mix. **Extra
High**, not Ultra: Ultra splits work across parallel subagents, and the trueclone loop is one step at a time (with five
runs on one machine, subagents would only add load). Not Luna: it is the model for focused, repeatable tasks. Keep
the older GPT-5.6 models (Sol, Terra, Luna) out. Later, if the hardest site (zero or varsity) ends low, re-run that one
site on GPT-6 Astra to see whether the model was the limit.

### 1. Publish rc.4 (once, from the repo)

```powershell
cd C:\dev\rea-lab; npm publish --tag next; npm view @trueclone/cli dist-tags
```

`next` must say `0.5.0-rc.4`.

### 2. Make the five folders and install (one command, about 5-10 minutes)

```powershell
foreach ($s in 'rc4-zero','rc4-varsity','rc4-bhaskar','rc4-allbirds','rc4-astro') { $d = "C:\dev\tc-tests\$s"; New-Item -ItemType Directory -Force $d | Out-Null; Push-Location $d; npx -y @trueclone/cli@0.5.0-rc.4 init; Pop-Location }
```

Each folder gets AGENTS.md (Codex reads it by itself), the skill in `.claude/skills/trueclone/`, `.gitignore`, and the
package pinned as a dev dependency. Then check the machine once:

```powershell
cd C:\dev\tc-tests\rc4-zero; npx trueclone doctor
```

It must print `ok` for Node, Chrome and Playwright Chromium.

### 3. Start each run in Codex

For each folder, in this order and **about 10 minutes apart**: rc4-zero, rc4-varsity, rc4-bhaskar, rc4-allbirds,
rc4-astro.

1. Open the folder in Codex.
2. Model **GPT-6.1 Sol**, reasoning **Extra High**.
3. Permissions **Full access** (network on): the steps start Chrome and load the live site.
4. Paste that site's prompt (below) and leave it alone until it reports.

Why stagger: 16 GB of RAM, and each run's memory peak is its capture (Chrome at 5 sizes and every route). Timing checks
(load, reveals, the journey) take turns across all runs through a lock in `%TEMP%`: a run waiting for its turn is quiet,
not hung.

### 4. The prompts

Same body for all five; only the first paragraph changes. Same flags as rc.3, so the numbers compare.
zero.university is template mode: nobody gave permission to copy it.

**rc4-zero**

```text
Clone https://why.zero.university/ with trueclone, in template mode (I do not have the owner's permission for an exact copy). Name the site "zero". Capture it with:
npx trueclone capture https://why.zero.university/ zero

Then follow AGENTS.md and .claude/skills/trueclone/SKILL.md exactly: loop on `npx trueclone status zero`, do exactly the step it names, and run it again, until it exits 0 or 3. Do not stop, summarise, or ask me anything before that. Give every trueclone command a timeout of at least 20 minutes; a quiet command is still working.

When it exits 0 or 3, report:
1. the exit code and the total time;
2. every step you ran, in order, each with one line on what status said and what you did;
3. every row of sites/zero/REPORT.md and sites/zero/REPORT.next.md;
4. what was set aside and why, and what is under Findings in notes.md;
5. anything in the tool you believe is a defect, with the evidence.
```

**rc4-varsity**

```text
Clone https://www.varsity.vc/ with trueclone, in exact mode: the site owner has given permission for an exact copy. Name the site "varsity". Capture it with:
npx trueclone capture https://www.varsity.vc/ varsity --mode exact --permission "site owner"

Then follow AGENTS.md and .claude/skills/trueclone/SKILL.md exactly: loop on `npx trueclone status varsity`, do exactly the step it names, and run it again, until it exits 0 or 3. Do not stop, summarise, or ask me anything before that. Give every trueclone command a timeout of at least 20 minutes; a quiet command is still working.

When it exits 0 or 3, report:
1. the exit code and the total time;
2. every step you ran, in order, each with one line on what status said and what you did;
3. every row of sites/varsity/REPORT.md and sites/varsity/REPORT.next.md;
4. what was set aside and why, and what is under Findings in notes.md;
5. anything in the tool you believe is a defect, with the evidence.
```

**rc4-bhaskar**

```text
Clone https://www.heybhaskar.com/ with trueclone, in exact mode: the site owner has given permission for an exact copy. The whole site, every page it links to. Name the site "heybhaskar". Capture it with:
npx trueclone capture https://www.heybhaskar.com/ heybhaskar --mode exact --permission "site owner"

Then follow AGENTS.md and .claude/skills/trueclone/SKILL.md exactly: loop on `npx trueclone status heybhaskar`, do exactly the step it names, and run it again, until it exits 0 or 3. Do not stop, summarise, or ask me anything before that. Give every trueclone command a timeout of at least 20 minutes; a quiet command is still working.

When it exits 0 or 3, report:
1. the exit code and the total time;
2. every step you ran, in order, each with one line on what status said and what you did;
3. every row of sites/heybhaskar/REPORT.md and sites/heybhaskar/REPORT.next.md;
4. what was set aside and why, and what is under Findings in notes.md;
5. anything in the tool you believe is a defect, with the evidence.
```

**rc4-allbirds**

```text
Clone this one product page with trueclone, in template mode, only this page and not the rest of the shop: https://www.allbirds.com/products/mens-tree-runners. Name the site "allbirds". Capture it with:
npx trueclone capture https://www.allbirds.com/products/mens-tree-runners allbirds --routes 1

Then follow AGENTS.md and .claude/skills/trueclone/SKILL.md exactly: loop on `npx trueclone status allbirds`, do exactly the step it names, and run it again, until it exits 0 or 3. Do not stop, summarise, or ask me anything before that. Give every trueclone command a timeout of at least 20 minutes; a quiet command is still working.

When it exits 0 or 3, report:
1. the exit code and the total time;
2. every step you ran, in order, each with one line on what status said and what you did;
3. every row of sites/allbirds/REPORT.md and sites/allbirds/REPORT.next.md;
4. what was set aside and why, and what is under Findings in notes.md;
5. anything in the tool you believe is a defect, with the evidence.
```

**rc4-astro**

```text
Clone the Astro docs "Getting started" page and the next pages it links to, 4 pages in all, with trueclone, in template mode: https://docs.astro.build/en/getting-started/. Name the site "astro". Capture it with:
npx trueclone capture https://docs.astro.build/en/getting-started/ astro --routes 4

Then follow AGENTS.md and .claude/skills/trueclone/SKILL.md exactly: loop on `npx trueclone status astro`, do exactly the step it names, and run it again, until it exits 0 or 3. Do not stop, summarise, or ask me anything before that. Give every trueclone command a timeout of at least 20 minutes; a quiet command is still working.

When it exits 0 or 3, report:
1. the exit code and the total time;
2. every step you ran, in order, each with one line on what status said and what you did;
3. every row of sites/astro/REPORT.md and sites/astro/REPORT.next.md;
4. what was set aside and why, and what is under Findings in notes.md;
5. anything in the tool you believe is a defect, with the evidence.
```

### 5. While they run and after

- Don't answer questions mid-run except "keep going" (a question is a red flag: section 1, C16).
- When each one reports, score it on the sheet (section 3), then look at it yourself: `npx trueclone serve <name>` in
  its folder, the original in another window, wide and phone size. Your by-eye score goes in row 12.

## 1. The common flow: checkpoints, decisions, actions

Every run passes these checkpoints in this order. Use the "Expect" column to score each one: pass, late, or wrong.

| # | Stage | Decision made (by `status` or the tool) | Action (by the agent) | Expect | Red flag |
|---|---|---|---|---|---|
| C0 | Install | - | `init`, `doctor` | all `ok` | agent edits AGENTS.md or the skill |
| C1 | Capture | the mode (exact only with permission); the route count; whether a dialog covers the page; whether it is a canvas app | `capture <url> <name> [flags]` | `reference/` with 5 sizes per route, `meta.json`; an overlay **warning** if a modal covers the page; `canvas app` line for zero | re-captures more than twice; invents `--cookie` values |
| C2 | Overlay | a fixed element ≥ 50% of the window that wins the centre → re-capture with `--hide "<selector>"` | the re-capture command `status` prints, verbatim | allbirds only (geo or region modal) | agent clicks the modal away by script instead |
| C3 | Journey (apps) | a canvas app has no scroll states: the states come from a journey | `journey <name> --draft`, then read `journey.json` | zero only: see section 5 | agent writes a debug URL or a stage parameter into the journey |
| C4 | Reads | every read missing or older than the capture | `reads <name>` (one call) | documents: states, motion, spec, widgets, then reveals; app: motion, then the reference journey | a read run twice without a re-capture |
| C5 | Design | documents only | `design <name>` | `DESIGN.md`, `globals.css`, `clone/tokens.css` | - |
| C6 | Seed | own bundle (exact canvas app or `--bundle`) or mirror seed | `seed <name>` | `clone/index.html`, the start page also at its own path, `notes.md` | agent edits `clone/index.html` by hand |
| C7 | Briefs | each section not yet read | `brief <name> <n>` for each section | one call per section, in order | briefs skipped |
| C8 | Behaviours + Stack | notes.md lacks them, or cites no file:line | agent writes `## Behaviours` lines with file:line | every behaviour cites the brief | Behaviours copied from the brief without porting |
| C9 | script.js | behaviour without code | agent writes `clone/script.js` (`tcOwn` first) | the site's rules ported, not pasted | the site's minified code pasted in |
| C10 | First score | never scored | `score <name>` (full) | every check at 5 sizes | - |
| C11 | Fix loop | failing checks in this order: journey, layout, coverage, scroll, canvases, routes, interactions, load, detail, hovers, motion. A frame you marked "differs" comes before everything | the step `status` names, then `score --only <check>` | each try changes `clone/`; three tries with no gain → **set aside** | re-scores an unchanged clone; a shell loop of re-scores (gaming) |
| C12 | Motion map | curves recorded, none mapped | `curves <name> --draft` | `motion-map.json`; motion check measured | - |
| C13 | Review | every size (documents), every route at wide + mobile, journey frames (apps) | `review <name> --size <s>`, then a verdict per frame with its token | verdicts by eye; "same" below 85% has a reason | verdicts written by a script or from pixel % |
| C14 | Findings | set-aside steps, tool-only scenario failures, code not ported | `## Findings` lines with evidence | each set-aside has a reason | empty Findings at exit 3 |
| C15 | Next | the clone passes, or everything left is set aside | `next <name> --verify` | `REPORT.next.md` within 1 point of `REPORT.md` everywhere, including review frames | a gap only the app has, left unreported |
| C16 | End | exit 0 (every gate) or exit 3 (all left set aside, each in Findings) | final report to you | as the prompt asks | stops anywhere else; claims a pass it did not re-measure |

## 2. Per site: what the tool should decide and what the numbers should be

Target = what the gate needs. Expect = my prediction for rc.4. rc.3 = last round.

### varsity.vc (exact, 2 pages, Webflow + GSAP + three.js r160)

- **Capture:** 2 routes (`/`, `/legal`), `meta.app = "pages"`, no overlay. Script evidence on both pages, files named by URL hash.
- **Seed:** inline head boot scripts kept (`scrollRestoration`); captured canvases marked, so the agent's scene replaces them (no stacked canvases); `/legal` answers at its own path.
- **Key decisions:** canvas frames now have a floor (every frame ≥ 60). The 38% frames that passed on the mean in rc.3 now become a `port the canvas scene at y …` step. Motion: 68 recorded curves, so `curves --draft` is issued (rc.3 never scored motion).
- **Likely set-asides:** motion curves below 95; perhaps one canvas frame.

| Check | Target | rc.3 | Expect rc.4 |
|---|---|---|---|
| Layout | ≥ 98 | 97.2-99.96 | 98-100 |
| Scroll states | ≥ 95, no frame < 80 | 97.4-99.3 | 96-99 |
| Canvases | ≥ 90, no frame < 60 | 91.5-98.7 (frames at 38) | 88-97, worst ≥ 60 or set aside |
| Interactions | all | 6/6 | 6-9 of 6-9 (more found) |
| Hovers | ≥ 90 | 100 | 95-100 |
| Load | ≥ 95 | ok | 95-99 |
| Detail | ≥ 95 | ok | 96-100 |
| Motion | ≥ 95 | not scored | 70-90, likely set aside |
| Next | = clone ± 1 | detail 97.7 vs 100 | within 1 everywhere |
| By eye | - | ~85 | **85-90** |
| Exit, time | - | 3, 183 min | **3**, 120-200 min |

Confidence: **75%** that it ends at exit 3 with everything above, apart from motion. Main risk: the canvas floor plus motion may be too much work for the model, which sets both aside early.

### heybhaskar.com (exact, single-page app, 8 routes)

- **Capture:** 8 routes, `meta.app = "single-page app"`. `/playground` is random on every load: held to its own worst of 3 loads, and its scenarios marked `unstable` (not scored).
- **Key decisions:** every failing scenario and route is its own step (rc.3 hid "thrive tablet"). Interaction shots wait for lazy media. A load frame that timed out is null, not 0.

| Check | Target | rc.3 | Expect rc.4 |
|---|---|---|---|
| Layout (8 routes) | ≥ 98 | 99.5-100 | 99.5-100 |
| Scroll states | ≥ 95 | 99.4-99.8 | 99-100 |
| Interactions | all | 18/21 | 20-21 of 21 (unstable ones not counted) |
| Load | ≥ 95 | 79.8 (timeouts as 0) | 95-99 |
| Hovers | ≥ 90 | 100 | 100 |
| Next | = clone ± 1 | 7/8 routes | 8/8 |
| By eye | - | ~94 | **93-96** |
| Exit, time | - | 3 (twice), 283 min | **0 or 3**, 150-240 min |

Confidence: **85%**. It has the most routes, so it is the longest run. Watch for the agent gaming set-asides (B1 is fixed: a try needs a changed clone).

### allbirds.com product page (template, 1 page, Shopify)

- **Capture:** a **geo/region modal covers the page**. The capture warns, and `status`'s first step is the re-capture with `--hide "<selector>"`. This is the biggest new decision point: score C2 strictly.
- **Seed:** placeholders keep the alpha silhouette (no 702 px grey box); scripted SVGs kept; closed states (the mobile menu at scale 0, the refund dialog) stay closed.
- **Key decisions:** interactions now compare addresses relative to the start page. rc.3 was 0/28 (a tool defect); now they should mostly pass, and a scenario failing only on a tool error goes to Findings. Hovers become measurable once the modal is hidden.

| Check | Target | rc.3 | Expect rc.4 |
|---|---|---|---|
| Layout | ≥ 98 | 98.3-99.7 | 98.5-99.8 |
| Scroll states | ≥ 95 | 93.5-99.1 | 95-99 |
| Interactions | all | 0/28 | 22-28 of 28 |
| Hovers | ≥ 90 | 0 (nothing scorable) | 85-100, or "not measurable" with the overlay named |
| Load (Next) | = clone ± 1 | 81-83 vs 98-99 | still at risk (the page ships twice in Next) |
| By eye | - | ~83 | **85-88** |
| Exit, time | - | none (stopped off-loop), 112 min | **3**, 90-150 min |

Confidence: **70%**. Risks: Next load parity on a large page (not fixed in Phase 8), and a modal that appears after 3-5 s and so escapes the capture-time check.

### docs.astro.build (template, 4 pages, Astro + Starlight)

- **Capture:** 4 pages, `meta.app = "pages"`. Script evidence for every page (rc.3: route scripts were fetched by hand). The navigation cap is spent after filtering to captured routes, and includes a link back to the start route.
- **Key decisions:** 13 tab scenarios that were silently dropped in rc.3 now run. Random ids are never used as selectors, so these are real scenarios that can fail and become steps. The start page answers at its own path, so no `replaceState` hack.

| Check | Target | rc.3 | Expect rc.4 |
|---|---|---|---|
| Layout / states | ≥ 98 / ≥ 95 | 100 / 100 | 100 / 100 |
| Interactions | all | "10/10" (13 dropped) | 20-23 of 23 |
| Hovers, load | ≥ 90, ≥ 95 | 100, ok | 100, 95-99 |
| Next | = clone ± 1 | = clone | = clone |
| By eye | - | ~96-97 | **96-97** |
| Exit, time | - | **0**, 97 min | **0**, 60-110 min |

Confidence: **90%**. It is the control: a clean exit 0 here shows the instruments did not get stricter in a way that breaks easy sites.

## 3. Score sheet (fill in per run)

Score each line 0-2 (0 wrong or missing, 1 late or with help, 2 as expected). The bottom line is the score out of 100.

| # | Item | varsity | bhaskar | allbirds | astro | zero |
|---|---|---|---|---|---|---|
| 1 | C0-C1: installed, captured with the right flags, once (or twice with `--hide`) | | | | | |
| 2 | C2/C3: the overlay re-capture (allbirds) / the journey draft read and fixed (zero) / n/a = 2 | | | | | |
| 3 | C4-C6: reads, design, seed in one go each | | | | | |
| 4 | C7-C9: every brief read; Behaviours with file:line; script.js ports the rules | | | | | |
| 5 | C11: every try changed the clone; no gaming; set-asides only after three real tries | | | | | |
| 6 | C13: verdicts by eye with tokens; reasons below 85% | | | | | |
| 7 | C14: Findings complete and true | | | | | |
| 8 | C15: Next within a point everywhere | | | | | |
| 9 | C16: ended at exit 0/3; the final report matches REPORT.md | | | | | |
| 10 | Zero check-ins, no questions mid-run | | | | | |
| 11 | Numbers within the "Expect" column (2), within 5 points (1), else 0 | | | | | |
| 12 | By eye (your look, wide + mobile, side by side): ≥ expect (2), within 5 (1) | | | | | |
| 13 | Time within the budget | | | | | |
| | **Total /26 → ×100/26** | | | | | |

Also note, per run: active minutes, the number of re-scores, the set-aside list, and any tool defect the agent proved.
A proven tool defect counts toward the tool's score, not against the agent.

## 4. What counts as a tool failure (vs an agent failure)

- **Tool:** `status` names a step that cannot be done; a check passes something you can see is wrong, or fails
  something identical; a crash; Next differs where the clone doesn't; the lock deadlocks (a run waits more than 30 min
  with no other run measuring).
- **Agent:** skips a step, games the loop, writes verdicts without looking, pastes the site's code, stops early.

## 5. why.zero.university (template, canvas app): the expected flow

What it is: one full-window three.js canvas (r160 bundled), a page that never scrolls, a loader, a **"draw a zero"
gesture gate**, about 5 stages moved by a lerped virtual scroll (wheel or touch), hold buttons, audio, and a Supabase
waitlist behind it.

| # | Stage | Decision | Action | Expect |
|---|---|---|---|---|
| Z1 | Capture | `meta.canvasApp` detected (canvas, engine `three.js r160`, `bodyOverflow: hidden`) | `capture https://why.zero.university/ zero` | the capture log names the canvas app; no own bundle (template) |
| Z2 | Journey draft | no `journey.json` → `journey zero --draft` | the draft runs at desktop and phone (up to 10 min and 80 turns per size) | measured on 21 Oct (rea-lab, live site): **desktop 26 checkpoints**: `gate-1` (the circle passes "draw a zero"), "You Believed", "College would… You land", "JOB", `hold-2` (the 3 s "tap hold"), the red stats stage (50% / 73% / 70%), "University sells Paper", "Companies want Someone who can do the Job", "and that's Why", `hold-3`, "Introducing zero", "Real tools", "Real skills", "Hired". **Phone: the same journey by half-window swipes**, through both holds (with the old 6-min limit it stopped at "Introducing") |
| Z3 | Agent reads the draft | each checkpoint must be a state seen on the live site | it opens `reference/journey-draft/<size>/` next to the live site and trims or edits `journey.json` | at most small edits (two near-identical frames in one stage merged); a limit warning means steps added by hand |
| Z4 | Reads | motion, then the reference journey | `reads zero` | `reference/journey/<vp>/NN-*.png` (measured: 26 desktop, 18+ phone), `reference/scene/*.json` (the scenes drawn at each checkpoint), `reference/shaders/` (measured: 47 programs) + INDEX.md |
| Z5 | Seed | template, no bundle → mirror seed (the loader and an empty canvas) | `seed zero` | a clone that shows the loader only |
| Z6 | Port | the journey check is first in the fix order | the agent writes `clone/script.js`: renderer, stage 1 scene from `reference/scene` and `shaders`, the gate, the virtual scroll with the site's lerp | stage by stage; `score zero --only journey` after each |
| Z7 | Set-aside | three tries without gain per checkpoint | Findings name the stages not ported | likely for stages 3-5 |
| Z8 | Review, Next | journey frames at desktop and mobile; Next serves the clone | verdicts per checkpoint; `next zero --verify` | Next = clone |

| Check | Target | Expect rc.4 (template port) |
|---|---|---|
| Journey (mean / worst) | ≥ 95 / ≥ 80 | 25-50 / 5-30: set aside after the first stages |
| Interactions, load | as documents | load 90-99 (a light clone loads fast; the frames differ) |
| By eye | - | **20-40** (the gate and stage 1 resemble the original; later stages are placeholders) |
| Exit, time | - | **3**, 120-240 min |

Confidence that the flow runs end to end (Z1-Z8, exit 3, honest Findings): **75%** (the draft is proven on the live
site; the port loop on a real app is not). Confidence that the clone looks
like zero.university: **low, by design**. A port of 60 shaders is weeks of work. What this run proves is that the tool
**handles** a canvas app honestly: no false highs, the states reached by input, and the work listed. It does not prove
the tool can **replicate** it.

### "Clone any website": what is and is not proven after rc.4

- **Proven (fixture):** the own-bundle exact path on a canvas app of our own (`tools/fixtures/canvas-app`): a gesture
  gate, 3 stages, a hold, a cross-origin CDN fetch, a backend POST and a beacon. Clone with the origin servers down:
  journey 100 at desktop and phone, a planted difference caught (26-27%), zero external requests, Next equal, load
  99.8+.
- **Proven if rc.4 goes as above:** documents of four makes (Webflow+GSAP+three.js, React SPA, Shopify, Astro) at
  85-97 by eye, unattended.
- **Not proven:** an exact replica of a third-party canvas app. That takes the owner's permission (own bundle), so it
  needs a site whose owner agrees, or a canvas site of your own. Until then, the honest claim is: **"any document site; canvas apps exactly when you own them or have
  permission, ported otherwise."**

## 6. The Codex model

**GPT-6.1 Sol (`gpt-6.1-sol`), reasoning Extra High, for all five** (checked 21 Oct 2026):

| Model | What OpenAI says it is for | For this test |
|---|---|---|
| GPT-6 Astra (`gpt-6-astra`) | the most capable, hardest multi-step work; about 5x Sol's price | the escalation: re-run one low site on it afterwards |
| **GPT-6.1 Sol** (`gpt-6.1-sol`) | "near-Astra performance at a lower cost"; recommended "for complex coding and agentic workflows" and "repeated, long-running work"; shipped 29 Sep 2026 (a third-party guide says it became the Codex CLI default in early October) | **use this** |
| GPT-6 Luna (`gpt-6-luna`) | focused, high-volume, repeatable tasks; Artificial Analysis measured its coding-agent score *down* against GPT-5.6 Luna | no: the loop is long and judgement-heavy |
| GPT-5.6 Sol / Terra / Luna | the previous generation, kept during the rollout | no |

Reasoning: **Extra High**. Max gives one agent more thinking time but is slower across hours of loop. Ultra splits work
across parallel subagents, which the one-step-at-a-time loop can't use, and five runs on one machine can't afford it.
If GPT-6.1 Sol is missing from the picker, update Codex: early builds hid it (openai/codex issue #49362, fixed in newer
versions).

After rc.4: re-run **astro** alone on GPT-6 Luna as the cheap-model bar. It is the easiest site, so if it reaches exit 0
there, the loop is model-robust.

Sources: [OpenAI: Models in Codex](https://learn.chatgpt.com/docs/models),
[Introducing GPT-6 Sol and Luna](https://openai.com/index/introducing-gpt-6-sol-and-luna/),
[openai/codex#49362](https://github.com/openai/codex/issues/49362),
[AIDEN: best Codex model](https://aidenapp.org/best-codex-model) (secondary).
