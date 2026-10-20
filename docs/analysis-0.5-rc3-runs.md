# 0.5.0-rc.3 test runs: what worked, what did not, why, and Phase 8

Four end-user runs on 15-16 Oct 2026, one at a time, each a fresh Claude Code agent installed with
`npx @trueclone/cli@0.5.0-rc.3 init`. **All four ran on Opus 5.5, not Sonnet** as planned: they prove the tool with a
strong model, not the Sonnet bar. Sources: each session log (digested), `sites/<name>/`, the rea-lab source, and five
read-only audits (one per run, one of why.zero.university). Numbers below are from the final REPORT.md / REPORT.next.md.

## At a glance

| | varsity (exact) | heybhaskar (exact, 8 routes) | allbirds (template, 1 page) | docs.astro.build (template, 4 pages) |
|---|---|---|---|---|
| By eye (audit) | **~85** (rc.2 ~70) | **~94** (rc.2 90) | **~83** (rc.2 low 80s) | **~96-97** per route |
| Active / wall | 183 / 183 min | 283 / 542 min (258 idle, then a user-asked re-check) | 112 / 112 min | 97 / 97 min |
| Check-ins | 0 | 0 in the run; 3 user messages after it | 0 | 0 |
| How it ended | exit 3 (1 step set aside) | exit 3, twice | stopped on "fix Hovers" (no exit 0 or 3) | **exit 0, every gate** |
| Layout (5 sizes) | 97.2-99.96 | 99.5-100 | 98.3-99.7 | 100 |
| Scroll states | 97.4-99.3 | 99.4-99.8 | 93.5-99.1 | 100 |
| Canvases | 91.5-98.7 (frames at 38%) | - | - | - |
| Interactions | 6/6 | 18/21 | **0/28** (a tool defect) | "10/10" (13 dropped silently) |
| Hovers | 100 | 100 | **0** (nothing scorable) | 100 |
| Next app | builds, = clone (detail 97.7 vs 100) | builds, = clone on 7/8 routes | builds, = clone except load (81-83 vs 98-99) | builds, one route per page, = clone; start page at `/` |
| rc.3 fixes | Flip, three.js, coverage, set-aside, review: worked | D1-D5, B2, B3, C1: worked | C3, C6, D1, B4: worked; B1, C2: failed | D4, D1, routes: worked |

## What worked (keep)

- **The loop runs unattended on a strong model.** Zero check-ins in all four runs; status always named a next step;
  set-aside and exit 3 gave runs an end instead of a dead loop (rc.2: varsity and heybhaskar dead-ended).
- **Next.js equals the clone.** Raw stylesheets, kept templates, `<base>`, every file in `public/`: heybhaskar's case
  studies 7.7-60 -> 100 at every size, allbirds builds (failed in rc.2), astro gets one root layout per page and scores
  100 like its clone, varsity identical on layout.
- **Model-checking gates bite.** Coverage forced every run to read the scripts it had skipped (varsity's module 700,
  heybhaskar's 06-script.js, allbirds 2/14 -> 14/14 with 12 explained); the brief named varsity's stories Flip; three.js
  r160 was detected and vendored; both cord scenes were ported from the site's own code.
- **Seed traps closed:** allbirds accordions, menus, drawers and swatches really work (dead in rc.2); `@import` kept;
  the head runtime is always there (heybhaskar no longer throws on line 1); media complete (heybhaskar 167 assets, no
  hand fetch; the data-URI texture intact).
- **Separate-page sites work end to end** (astro: discovery, `meta.app` "pages", per-page seed with rebased paths,
  per-page review, Next per page).

## What went wrong, by cause

### A. Instruments that pass or fail the wrong thing (the trust problem)

| # | Defect | Run | Root cause | Fix |
|---|---|---|---|---|
| A1 | Every interaction fails on the address: the clone is served at `/`, the reference at `/products/mens-tree-runners` | allbirds 0/28 (each 95.7-100 like the reference); astro forced a `replaceState` hack | `interact.mjs:157/265` compares raw pathnames; seed writes the captured page to `clone/index.html`, Next maps it to `/` | the start page lives at its own path in the clone, `serve()` and Next; interact compares paths relative to the start route |
| A2 | A blank or 404 page passes | astro Next Back -> 404, scored 95.55 | masked white matches masked white; no HTTP status or content floor | non-2xx navigation fails; content-presence floor against the reference |
| A3 | Scenarios whose element is not found on either side count as passes | astro: 13 tab scenarios dropped, report "10/10" | `selOf` takes ids random per load; "neither side reacted" -> `notBehaviour` | ids checked stable across two loads (structural fallback); not-found = failed and listed |
| A4 | Hovers 0 when nothing is scorable | allbirds (backdrop takes every pointer) | `hovers.mjs` `ok / max(1, 0)` | "n/a", or "blocked by an overlay at the centre" |
| A5 | Canvases pass on the mean with frames at 38% | varsity | no worst-frame gate for canvases; status never issues `canvas:` | canvas frame floor; status routes by `canvasWorst` |
| A6 | A load frame that times out scores 0 | heybhaskar load 79.8, four sizes "unstable" | `load.mjs` `curve[t] = frames[t] ? … : 0` | missing frame = null, retried, never cached |
| A7 | Interaction arrival frames do not wait for images | heybhaskar thrive tablet 82 | `interact.mjs` shot without review's media wait | the same lazy-media wait as review, both sides |
| A8 | Next "equal" checked per check, not within a point | varsity detail 97.7 vs 100, /legal 98.5 vs 100; heybhaskar /about mobile | `status.mjs` `worse` = clone passes and app fails | per check, route and scenario: more than 1 point below the clone is a step |
| A9 | Review verdicts can be written without looking | heybhaskar: an agent-written classifier marked frames from pixel % (64% "same"); allbirds 42% "same" | verdicts keyed by frame id only; no reason required | a verdict carries the frame's hash (a re-shot frame needs a new one); "same" below ~85% needs a reason |
| A10 | Review never sees a block the sections skip | varsity stories cards (shadow-DOM island) never in a frame | `review.mjs` plans frames from `sections.json`; capture misses shadow hosts | frames tile every gap between sections; shadow hosts are sections |

### B. status can be gamed and hides work

| # | Defect | Run | Fix |
|---|---|---|---|
| B1 | A "try" is any new score: re-scoring an unchanged clone sets a step aside; agents automated it in shell loops | heybhaskar (twice), allbirds | a try = the issued step, with clone/ changed since the last try |
| B2 | One key per check hides the rest (first failing scenario, worst route+size); keys with size/draw reset | heybhaskar thrive tablet never named | key by check+route; list every failing item; set aside per item |
| B3 | Tool errors routed as clone work ("make geofencing behave like the reference" when the address check was the tool's) | allbirds | a scenario failing only on tool errors routes to Findings, with the error |
| B4 | Writing Findings (required by exit 3) re-opens `next --verify` | heybhaskar | Next staleness from the clone's mtime, not `verdict.at` |
| B5 | Reads not checked fresh after a re-capture; a crashed `states` counts as done | astro, heybhaskar | a read older than `meta.capturedAt` or missing a route is missing |
| B6 | No step for the Next app by eye; review sizes skip desktop | all | review the Next app at wide and mobile per route; include desktop |

### C. Capture misses things

| # | Defect | Run | Fix |
|---|---|---|---|
| C1 | Overlay warning only by role/name: a geo modal named in `data-testid` slipped through | allbirds | by geometry: fixed, ≥ 50% of the window, wins `elementFromPoint` at the centre; named by data-* too; re-checked after 3-5 s |
| C2 | Script evidence only on the start page | astro (route scripts curl'd by hand, invisible to coverage) | evidence on every separate page, merged INDEX |
| C3 | rendered.html serialized after the settle scroll; DOM and screenshot from different moments | astro TOC text, promo variant | serialize at scroll 0, right before the shot |
| C4 | Script file names by rank change between captures, breaking every citation | astro 03-Search -> 07-Search | names by URL hash |
| C5 | Navigation cap (8) spent before the captured-route filter; no link back to the start route | astro root: no navigation | filter first; include the start route |
| C6 | modulepreload links to the site kept (no `as=`) | allbirds 216 links | strip every modulepreload |
| C7 | A route random on every load still swings 64-98 (one self-comparison) and leaks into interactions | heybhaskar /playground | ≥ 3 self-loads, held to the minimum; scenarios on an unstable route marked unstable |

### D. The seed hands over traps

| # | Defect | Run | Fix |
|---|---|---|---|
| D1 | The captured `<canvas>` stays in each mount, so the live scene stacks a second one | varsity (principles 80 until removed) | seed marks captured canvases; `tcOwn` removes them in owned regions |
| D2 | Inline head boot scripts dropped (`history.scrollRestoration`), and head patches never reach Next | varsity /legal Back 56-63, astro start address | keep small inline head scripts that set state; `next.mjs` carries `head-*.html` patches before the libraries |
| D3 | A closed state at a size where the element has no box is taken for motion and cleared | allbirds mobile menu covered the page below 1024 | state by value (scale 0, display none, an off-page translate), not by measured box |
| D4 | A value "set at some sizes, unset at others" becomes script-owned and is stripped: closed dialogs render open | allbirds `#modal-refund-policy` | keep the rendered value when the alternatives are "unset" |
| D5 | Opaque box for every `img` whatever its alpha; scripted SVGs replaced | allbirds 702 px grey shoe; rings and paths lost | alpha-aware placeholder; keep SVGs scripts target (recolour, don't replace) |
| D6 | `tcBoot.hold()` returns nothing; easy to never release, no fallback | varsity (caught by the agent) | `hold()` returns its release; auto-release after 5 s with a warning |

### E. Smaller

- REPORT "Libraries: gsaps, engines" (empty arrays counted), "the clone does not call" an API it now calls, "Fix first"
  listing unscored sizes; `states` prints "undefined steps"; `capture --help` omits `--routes`, `--locale`.
- Motion curves never scored (no `motion-map.json`, status never asks) on a site with 68 curves.
- Next load parity on a large page (allbirds 81-83 vs 98-99): the markup ships twice (2.2 vs 1.0 MB) and the clone's
  scripts start after hydration.
- Speed: 97-283 active minutes; 55-60 min of varsity was scoring, half of it full rescores after notes-only changes.

## why.zero.university: how ready we are

A different class of site: one full-screen three.js canvas (r160 bundled, about 60 custom shaders, KTX2/Draco
assets, 8-9 MB), its own virtual scroll (`body{overflow:hidden}`, `scrollHeight == innerHeight`, wheel/touch lerp
through 5 stages), a draw-a-zero gesture gate, Howler audio, Supabase waitlist. The DOM is a loader and a HUD.

| | Today |
|---|---|
| What the seed gets | the loader frame and an empty canvas |
| Scores | layout ~100 and hovers/interactions near-vacuous passes, scroll states = one frame per size: **misleadingly good** |
| By eye, HTML/Next | Opus ~20-30, Sonnet ~10-15 |
| Needed for ≥ 90 | an "app mode": states driven by input timelines (wheel ticks, holds, gesture paths) instead of scrollY; a recorded input-script scenario type; and, for exact mode with permission, running the site's own bundle instead of porting 60 shaders |

The honest position for 0.5: **detect this class at capture and say it is not supported**, rather than produce a
clone that scores well and looks like a loading screen. App mode is a 0.6 phase.

## Readiness: 79 / 100 (rc.2 73; projected 81 before these runs)

| Area | Score | Why |
|---|---|---|
| Unattended flow | **84** | 0 check-ins on 4 sites; exit 3 works; but one run stopped off-loop and two gamed set-aside |
| Multi-route / multi-page, HTML | **90** | heybhaskar 99.5-100 on 8 routes, astro 100 on 4 pages; start-page address wrong |
| Exact animated site (Opus) | **82** | varsity ~85 by eye; **Sonnet not measured** |
| Template product page | **78** | behaviour real; popup, placeholders and closed states still off |
| Next.js app | **86** | builds everywhere, equal to the clone on most checks; start route, head patches, load on big pages |
| Honest reports | **68** | false fails (0/28, hovers 0), false passes (404 at 95.55, 13 dropped scenarios, 38% canvas frames, pixel-% verdicts) |
| Speed | **65** | 97-283 active min per site |
| Site classes | - | document sites only; canvas apps unsupported and not yet detected |

Public trust is lost by an instrument that lies, not by a hard site. Phase 8 is mostly about the instruments.
