# trueclone pipeline: measurement → verdict → exit code (RC4 source, 17cd6cf)

Scope: `scripts/*.mjs` as tested in RC4. Every claim cites `file:line`. Repro scripts and their raw output live in
`sites/rc5-repro-tools/` (gitignored); fixture folders are `sites/rc5-repro-*`. No file under `scripts/`, `skill/`,
`bin/` or `C:\dev\tc-tests\` was touched.

Classes used in section 6: **(1)** observed in RC4 (finding id), **(2)** reproduced now (script + output),
**(3)** supported by source, not reproduced. Speculative paths were dropped.

---

## 1. Result data model today

`COMPARE` = `process.env.TC_COMPARE || 'compare'` (`lib.mjs:40`); `next --verify` runs the same steps with
`TC_COMPARE=compare-next`, `TC_REPORT=REPORT.next.md` (`next.mjs:840,844`). Every file below therefore exists twice:
`compare/…` (HTML clone) and `compare-next/…` (app).

"Start" / "end" = whether `at` is taken before or after the measurement. That matters for section 6 (A7).

| Check | Script, writer | File(s) | Keys | Partial run (`--viewport`, `--only`, `--route`) | Identity recorded | Script failure looks like |
|---|---|---|---|---|---|---|
| layout | `diff.mjs` `scoreRoute()` `:30-91`, write `:103` | `report.mask.json` (score always passes `--structure`, `score.mjs:51`); `report.json` only from a manual `diff` without `--structure`; `routes/<slug>/*.png` | `viewports[]` per size (`match`, `worstSections`, `sections`); `routes[].viewports[]` per route × size (`:96`) | No viewport filter: always every size in `SCORED` that has a reference PNG (`:36-38`; VAR-11). A size with no reference PNG is **skipped silently** (`:38`) | `at` (start, `:26`), `clone` url. No capture time, clone hash or tool version | Crash before `:103`: old file kept. A missing reference size: file written without that size |
| states + canvases | `states.mjs` `runRoute()` `:35-139`, aggregate `:153-155`, per route `:137` | `states/report.mask.json`; `routes/<slug>/states/report.mask.json`; frames `states/<vp>/` (wiped first, `:48`) | `viewports[]`: `match`, `worst[5]`, `steps[]`, `canvas`, `canvasWorst[5]`; `routes[]` | **REPLACES**. `--viewports` filters sizes (`:24-25`), `--route` filters routes (`:29`); the aggregate is rewritten with only what ran (`:155`). With `--route /x` the main page's `viewports` stays `[]` (`:144`). A size with no reference states is skipped silently (`:42`) | `at` (start, `:33`), `target` | Crash: aggregate not written (old kept), some `states/<vp>/` dirs already wiped |
| curves (motion) | `curves.mjs` main, `:274-291` | `curves.<vp>.json`, one per size | `entries[]` per map entry, `score` | Per-size files, so `--viewport` touches one file. Map filtered by `--only` (`:112`) and `e.viewports` (`:113`). An empty filtered map scores **0** (`:288`, `Math.max(1, 0)`) | `at` (end: after sampling, `:274`), `viewport`. No map hash | No `motion-map.json`: **exit 0, no file written** (`:107-110`), old `curves.*.json` keep counting. Crash: old file kept |
| detail | `detail.mjs` `:203-258` | `detail.json` | `viewports[]`: `score`, `issues`, `unstableProbes` | **REPLACES**. `--viewport` (`:22`) limits sizes; score passes `--viewport ${vpOnly||'all'}` (`score.mjs:57`); `all` = the 3 seed sizes only (`lib.mjs:15-19`) | `at` (start, `:204`) | Crash: old kept |
| hovers | `hovers.mjs` `:232-235` | `hovers.<vp>.json`; report reads `hovers.desktop.json` only (`report.mjs:48`) | `score` (null when nothing to compare), `blocked`, `rows` | Desktop by default (`:23`); score never passes a size | `at` (end, `:232`) | `score: null` (blocked page or no effects) → check disappears (`report.mjs:152`). Crash: old kept |
| load | `load.mjs` `:69-119` | `load.json` | `viewports[]`: `score`, `unstable`, `cloneUnstable`, `noise`, `gap`, `ref`, `clone` | **MERGES** when a subset ran (`:117-118`), but writes a new top-level `at` (`:119`) over the old sizes' values | `at` (end, `:119`), `clone` url, `times`, `network` | Crash: old kept. Unreachable reference: **not a failure**, the error page is measured and cached as the reference (A15) |
| interact | `interact.mjs` `:84-320` | `interact/report.json`, shots | `scenarios[]` (`score`, `expect.pass`, `notBehaviour`, `unstable`, `broken`, `errors`), `skipped` | **REPLACES**. `--only <substring>` filters scenarios (`:96`) and the report is written with that subset (`:320`) | `at` (end, `:262`) | No scenarios: **exit 0, no file** (`:91-93`), old report kept. Crash: old kept |
| journey (app mode) | `journey.mjs --clone` `:383-468`, review frames `:470-496` | `journey/journey.json` (raw run), `journey/report.json`, `review/journey-<vp>/` | `viewports[]`: `match`, `worst`, `checkpoints[]` | Always the sizes in `journey.json` (`:389`); a size with no reference run is skipped silently (`:449`) | `at` (end, `:445`); raw run `at` start (`:385`) | Reference not reached at a checkpoint → `match: 0` (`:453`). Crash: old kept, `journey/<vp>/` wiped (`:392`) |
| review | `review.mjs` `:38-229` | `review/<vp>/frames.json`, `review/routes/<slug>/<vp>/`, sheets, `index.md` | `frames[]`: `id`, `pct`, `token` | One size per run (`--size`). Re-shot only if `clone/` or `capturedAt` is newer than `frames.json.at` (`:41-49`); `--url` (the app) always re-shot | `at` (`:229`), per-frame `token` (the verdict key) | Crash after `rm` (`:52`): `frames.json` missing → status re-issues review |
| notes | `report.mjs:161-168` (computed, no script) | `notes.md` `## Behaviours` | — | — | — | — |
| coverage | `report.mjs:172-188` (computed) | `reference/scripts/scripts.json`, `reference/reveals.desktop.json`, `notes.md`, `clone/script.js` | failing scripts/curves | — | — | Missing inputs → row not emitted (`:184`) |
| routes | `report.mjs:204-227` (computed from layout and states aggregates) | — | per route × size × check | Inherits the REPLACE behaviour of the states aggregate | — | Route with no layout row → failing "not scored" (`:219`). Route with no states values → **no requirement** (`:216` tests numbers only) |
| drift | `drift.mjs` `:21-53` | `drift.json` | `stale`, `viewports[]` | **REPLACES** with the `--viewport` size only (`:19`, `:53`) | `at` (end), `capturedAt` (never compared by report) | Crash (e.g. live page unreachable): old file kept (A14, reproduced) |
| aggregate | `report.mjs:229-232` | `verdict.json`, `REPORT.md` | `at`, `drift`, `checks[]` (`check`, `key`, `pass`, `accepted`, `stale`, `failing[]`) | Rebuilt from whatever files exist | `at` = **time the report ran** (`:232`), or the previous `at` with `TC_KEEP_AT` (`:231`) | — |
| score bookkeeping | `score.mjs:134,155,157` | `.stamps.json`, `score-times.json` | per step label: key, status, values, `at` | Stamps overwritten per label | key = clone hash + `capturedAt` + args + code hash (`:103`) | Step status (EXIT/TIMEOUT) is only in `score-times.json`; report uses it for display (`report.mjs:281`), never for the verdict |

Nothing in `compare/` records the tool version, the capture time (except `drift.json`), a clone hash, or
`NODE_OPTIONS`. `.stamps.json` is the only place a clone hash and code hash live, and only `score.mjs` reads it.

---

## 2. Aggregation (`report.mjs`, `score.mjs`)

### report.mjs

| Step | Lines | Behaviour |
|---|---|---|
| Inputs | `:43-53` | One read per file, `null` if missing or unparsable. `VPS` = 3 seed + 2 held-out (`:40-41`) |
| Per-size values | `:94-96` | `byVp()` maps the sizes that are in the file. A size absent from the file is `undefined` |
| `present()` / `all()` | `:128-129` | `present` = sizes with a non-null value. `all` = every present size passes; **`null` when none is present** |
| Row → check | `:113-126` | `ok = isStale ? false : all(values, test)`. A check is pushed to `verdict.json` **only if `ok` is not null** (`:125`). Missing file, all sizes missing, `hovers.score === null`, no scenarios, no curves → **no check at all** |
| Staleness | `:102-112` | `cloneChanged` = newest mtime under `clone/` (or `next/` for compare-next). `measuredAt` covers layout, scroll, canvases, detail, hovers, load, interactions, motion (earliest curve). **Journey, routes, review, notes, coverage have no entry → never stale**. A file without `at` is never stale |
| Accepted | `:91`, `:121` | Needs `evidence: <existing file>` in `## Accepted differences`; value ≥ 95; scroll worst frame ≥ 80. **Not gated on staleness**: a stale check whose failing sizes are accepted gets `pass: true` (A8) |
| Held-out | `:40-41` | Treated like any size **when present**. Never required: a missing laptop/wide value is not a failure |
| Unstable routes | `:213` | Bar = `min(target, unstable.match - 1)`, applied to layout **and** states at every size (BHASKAR) |
| Unstable scenarios | `:191-192` | Excluded from the share; `interact.mjs:314` already set `pass: true` |
| Unstable load sizes | `:153`, `load.mjs:102` | `score: null` → dropped by `present()` |
| Drift | `:122`, `:232` | Annotates rows "stale capture" and sets `verdict.drift`. **Does not change any `pass`** |
| Review | `:62-84`, `:228` | Frames from `compare/review/**/frames.json` (hard-coded `compare/`, also for the app report). Closed = `same` (with reason below 85%) or `tool; evidence:` file, token must match |
| Verdict line | `:233-235` | Counts rows containing "below target". REPORT.md and `verdict.json` are written together |
| Next report | `:311-313` | After the HTML report, re-runs itself for `compare-next` with `TC_KEEP_AT=1` (old `at` kept) |

### score.mjs

| Topic | Lines | Behaviour |
|---|---|---|
| Steps | `:43-61` | Doc mode: drift (g0), layout + states (g1), curves × 3 seed sizes (g2), interact + hovers + detail (g3), load (g4). App mode: journey, interact, load. `--quick` drops drift, curves, hovers, detail, load and narrows states to desktop (`:52`) |
| `--only` / `--viewport` | `:36-38`, `:63` | Filters steps by label; passes the size to drift, states, curves, detail, load. Layout ignores it (VAR-11) |
| Staleness (stamps) | `:77-104` | Key = sha1 of `clone/**` (name, size, mtime) + `interactions.json`, `motion-map.json`, `journey.json` contents + `reference/*` mtimes except `assets, mirror, load, tiles, bundle` (`:91`; **`cache` is included**) + `capturedAt` + step args + code hash of the step file and `lib.mjs` (`:101`). `drift` (`live: true`) and `--url` runs are never reused (`:104`). Reuse checks the stamp only, **not that the output file still holds that result** |
| Children | `:106-119` | `spawn(node, step)` with `env: stepEnv` = `process.env` + `TC_LOCALE` (`:76`): **`NODE_OPTIONS` is inherited**. Timeout = `--step-minutes` (20 min default, `:32`), then `taskkill /T /F` (`:115`) |
| Child exit | `:123-135` | Status `TIMEOUT`, `EXIT n`, `n FAIL` or `ok`. Stamp written only for `ok`/`FAIL` (`:134`). Nothing else: no file is invalidated, nothing reaches the verdict |
| Exit code | `:150-160` | **Never set.** score exits 0 whatever its children did, then runs report (`:159`). Reproduced (A14) |

---

## 3. Status consumption (`status.mjs`)

| Topic | Lines | Behaviour |
|---|---|---|
| Inputs | `:128-129` | `compare/verdict.json` (always `compare/`); `changed` = max(newest mtime under `clone/` except `node_modules`, `patches-cache`; `interactions.json` mtime) |
| Not watched | `:129` | `motion-map.json`, `journey.json` (only vs the reference read, `:80`), `reference/*`, `next/`, `NODE_OPTIONS`, tool version |
| Stale vs failing | `:132-149` | (a) `verdict.at < changed - 1s` → re-score (only what was failing, or everything). `verdict.at` is **report time**, so `trueclone report` alone makes everything "fresh". (b) then failing checks with `stale: true` → `score --only`. A **passing** stale check is never looked at |
| Candidates | `:157-255` | Only checks present **and failing** in `verdict.json`, plus review sizes without `frames.json` (`:192`), route reviews wide/mobile (`:194`), a missing motion map (`:251`) and open review verdicts (`:252-255`). No list of checks that must exist |
| Try memory | `:259-278` | `compare/status-steps.json`. `__last` is saved before the step is printed (`:273-275`). A try counts when `verdict.at` changed and the clone changed since the step was issued (`:260`). A key no longer among candidates is deleted as "fixed" (`:262`) |
| Next.js | `:282-329` | Reads `compare-next/verdict.json` **only for `.at`** (`:284`). Parity pairs: layout, states mean (+ routes), detail, hovers, load (slack 2), interactions, review frames wide/mobile (slack 2). `pair()` skips unless both sides are numbers (`:288`). No canvases, curves or journey (VAR-1) |
| Exit 1 | `:34-42` | Any `next()`; also any uncaught error |
| Exit 3 | `:332-335` | Something set aside (3 tries without gain) and nothing else open |
| Exit 0 | `:336` | Everything above passed |

### Every way a missing, failed or partial result reads as passing

| # | Path | Where | Class |
|---|---|---|---|
| P1 | A check whose file is missing (script crashed on its first run, never ran, wrote nothing) is not in `verdict.json`, and status has no list of required checks | `report.mjs:125,129`; `status.mjs:130` | (1) VAR-4 app side; **(2)** HTML side, `missing-files` |
| P2 | A partial aggregate (fewer sizes or routes) is judged on what is present | `report.mjs:128-129`; writers `states.mjs:155`, `detail.mjs:258`, `drift.mjs:53`, `interact.mjs:320` | (1) VAR-3; **(2)** `partial-widths`, `cmd` |
| P3 | Held-out sizes are never required | `report.mjs:128`; `diff.mjs:38`, `states.mjs:42` skip silently | **(2)** `partial-widths` |
| P4 | `verdict.drift` is never read by status | `status.mjs` (no reference to `drift`) | **(2)** `drift-stale` |
| P5 | Stale + accepted = pass | `report.mjs:121,125`; `status.mjs:145` filters failing only | **(2)** `stale-accepted` |
| P6 | Journey (and routes, review) are never stale; `trueclone report` refreshes `verdict.at` | `report.mjs:109,232`; `status.mjs:132` | **(2)** `journey-stale` |
| P7 | Review frames shot of an older clone keep closing the review | `status.mjs:192` (presence only); `report.mjs:62-84` (token only) | **(2)** `review-old-clone` |
| P8 | Edits to `motion-map.json` (or `journey.json`) after scoring do not reopen anything | `status.mjs:129`; `curves.mjs:107-110` | **(2)** `motion-map-edit` |
| P9 | A failed child: score exits 0, the old file stands | `score.mjs:123-160` | (1) VAR-4; **(2)** A14 |
| P10 | Old sizes inside a merged `load.json` get the new `at` | `load.mjs:117-119` | **(2)** A6 |
| P11 | End-stamped checks (load, interact, hovers, curves, journey) hide a clone edit made while they ran | `load.mjs:119`, `interact.mjs:262`, `hovers.mjs:232`, `curves.mjs:274`, `journey.mjs:445` | **(2)** A7 |
| P12 | The app: a failing `compare-next` check, a missing app value, no canvases, curves or journey pairs, `next/` never examined | `status.mjs:284,288,290-314` | (1) VAR-1, VAR-4; **(2)** `next-unseen` |
| P13 | `hovers.score === null` (page blocked by an overlay) removes the hover check | `hovers.mjs:232`; `report.mjs:152` | (3) |
| P14 | Exact mode "Layout (real pixels)" is never measured by score: omitted, or an old manual `report.json` judged by the mask report's `at` | `score.mjs:51`; `report.mjs:44,109,131` | (3) |
| P15 | A route whose states were never measured has no states requirement | `report.mjs:216` | (3) |
| P16 | A step key that disappears is deleted as "fixed", including when its check vanished (P1) | `status.mjs:262` | (3) |
| P17 | An unreachable reference is measured (error page) and cached as the load reference | `load.mjs:40,91` | **(2)** A15 |

---

## 4. Next.js verification (`next.mjs --verify`)

| Stage | Lines | What happens |
|---|---|---|
| Generate | top level, up to `:788` (e.g. `:273-275` wipe `app/`, `components/site`, `styles/site`) | `next/` is regenerated from the **current** `clone/` on every run, with or without `--verify` |
| Build | `:800-801` | `npm install`, `next build`; failure rejects → process exits non-zero, **`compare-next/` untouched** |
| Serve | `:812-835` | Free port; `public/trueclone-app.txt` token proves the server is this build (good) |
| Score | `:840` | `score.mjs --url` with `TC_COMPARE=compare-next`: no stamps, every step re-measured, report → `compare-next/verdict.json`, `REPORT.next.md`. `--quick` allowed (`:840`), which skips drift, curves, hovers, detail, load |
| Review | `:842-845` | `review --size wide|mobile --url`; a failure is a WARNING only (`:844`) |
| Status | `status.mjs:282-329` | Freshness = `nextVerdict.at` vs **`clone/`** mtime; then parity |

**Is the validated app guaranteed to be the delivered `next/`?** No.

| Gap | Source | Class |
|---|---|---|
| `next/` is never hashed or timed by status; any edit after the verify goes unseen | `status.mjs:284` compares with `changed` (clone only) | **(2)** `next-unseen` |
| A regeneration whose build then fails leaves the previous `compare-next/verdict.json`; if `clone/` is unchanged (e.g. a generator change in a new tool version), status passes on a `next/` that does not build | `next.mjs:273-275,801`; `status.mjs:284` | (3) |
| `--quick` verify leaves drift, curves, hovers, detail and load files from an older verify; status pairs them as current | `score.mjs:46,50-60`; `status.mjs:296-301` | (3) |
| A child that fails inside the verify: score still exits 0, so the verify "succeeds"; the old `compare-next` file is paired | `score.mjs:123-160`; `status.mjs:288` | (1) VAR-4 |
| `compare-next/verdict.json` checks (incl. `stale`) are never read | `status.mjs:282-284` | (1) VAR-1 |
| A clone edit during the verify: `next/` was generated from the earlier clone, but `nextVerdict.at` (end of score) is newer than the edit | `next.mjs` generation first, `report.mjs:232` | (3) |
| App mode: the journey is not paired at all | `status.mjs:290-314` | (3) |

---

## 5. Identity and invalidation

| Event | Invalidated today | Silently survives |
|---|---|---|
| Re-capture | Reference caches (key holds `capturedAt`, `lib.mjs:250`); stamps (`score.mjs:103`); reads older than `capturedAt` (`status.mjs:77`); `inline-styles.json` (`capture.mjs:474`) newer than `clone/index.html` → `seed --force` (`status.mjs:100`) → clone changes → re-score | Every `compare/` file until re-scored (report never compares `at` with `capturedAt`); `drift.json` of the old capture (its `capturedAt` is never checked, `report.mjs:52,122`); review frames and verdicts (P7). **Crash mid-capture**: per-size PNGs are written (`capture.mjs:272,361`) before `meta.json` (`:481`), so new screenshots sit under the old `capturedAt`; caches and stamps keyed to it stay valid; `assets/` and `mirror/` are already deleted (`:71-72`) |
| `--hide` change | Needs a re-capture (status prints it, `status.mjs:58`); cache key holds `hide` (`lib.mjs:250`) | As above. Reference caches written under the ALLBIRDS-2 race survive a fix (key has no tool version) (1) |
| Motion map edited | Stamps (`score.mjs:88`): the next `score` re-measures curves | Status never asks for that score (`status.mjs:129`); deleting the map leaves the old `curves.*.json` counting (`curves.mjs:107-110`). **(2)** `motion-map-edit` |
| `journey.json` edited | Reference journey re-read requested (`status.mjs:80`); stamps | `compare/journey/report.json` scored against the old checkpoints; never stale (`report.mjs:109`) |
| Tool version | Stamps for a step whose own file or `lib.mjs` changed (`score.mjs:101`); manual `v:` in cache keys (`detail v:10`, `hovers v:10`, `load v:3`, `interact v:4`) | `verdict.json` from the older `report.mjs` is trusted by status until the next score; reference caches unless their `v:` was bumped; a step that imports nothing else is covered, but a change to `report.mjs` or `status.mjs` gates is not applied to an existing verdict |
| `NODE_OPTIONS=--import …` | Nothing | Inherited by every child (`score.mjs:76,109`; `next.mjs:840`); not in the stamp key, so values measured with the import are reused after it is removed, and vice versa; reference caches written under it persist. (1) ALLBIRDS-3 |
| Clone edit while a check runs | Start-stamped checks (layout, states, detail) become stale | End-stamped checks (load, interact, hovers, curves, journey) look fresh. **(2)** A7 |

---

## 6. Adjacent failure paths

### Reproductions run now

All fixtures are built by `sites/rc5-repro-tools/mk.mjs` (a complete, passing document-mode or app-mode site), mutated,
then `node scripts/report.mjs <name>` and `node scripts/status.mjs <name>` are run from `C:\dev\rea-lab`. The baseline
(`rc5-repro-base`) exits 0, as it should.

`node sites/rc5-repro-tools/repro.mjs` (output: `sites/rc5-repro-tools/repro-out.txt`):

| Variant | Mutation | verdict.json | status |
|---|---|---|---|
| `missing-files` | delete `compare/detail.json`, `compare/load.json` | `layout, scroll, hovers, notes, review` (detail and load absent) | **exit 0** |
| `partial-widths` | states: desktop only; layout: no laptop/wide | all pass | **exit 0** |
| `drift-stale` | `drift.json` `stale: true` | all pass, `drift true`; REPORT says "re-capture before trusting" | **exit 0** |
| `stale-accepted` | layout desktop 96, accepted with evidence; clone edited after layout was measured | `layout stale accepted` (pass) | **exit 0** |
| `review-old-clone` | clone edited after the review frames; every score re-measured after the edit | all pass | **exit 0** |
| `next-unseen` | `compare-next/verdict.json` has `Canvases pass:false` and `Load pass:false`; no `compare-next/load.json`; `next/app/page.tsx` edited after the verify | HTML all pass | **exit 0** |
| `motion-map-edit` | `motion-map.json` loses an entry after curves and the report ran | `motion` pass (old values) | **exit 0** |
| `journey-stale` (app) | `clone/script.js` edited after `compare/journey/report.json`, then `report` and a simulated verify | `journey` pass, `stale` false | **exit 0** |

Status's own command produces P2 (`rc5-repro-cmd`): with scroll mobile 93 and detail desktop 80 failing and the clone
edited, status prints `next: npx trueclone score rc5-repro-cmd --only states,detail --viewport mobile`. That command
rewrites `states/report.mask.json` (`states.mjs:155`) and `detail.json` (`detail.mjs:22,258`) with mobile only. With
those writes simulated per source and a passing mobile, report says "every scored check meets its target" and
**status exits 0; detail desktop 80 was never re-measured**. (The status/report half ran live; the two child writes
were written by hand to the shape the source produces.)

A14 + A6 + A15, live (`node scripts/score.mjs rc5-repro-score --only drift,load --viewport desktop`, meta.url
`http://127.0.0.1:9/` = closed port; `score-out.txt`):

```
  drift            EXIT 1 in 1s
  load             ok in 24s   desktop 100
every scored check meets its target -> sites\rc5-repro-score\REPORT.md
SCORE EXIT 0
drift.json md5 before = after = 27b5508c…            (old "not stale" drift kept)
load.json at 2026-10-22T06:10:08Z: tablet/mobile/laptop/wide 99 (written by the fixture at T0+3h, now under the new at)
reference/cache/99b20d35….json  curve {"250":100,…,"4000":100} incomplete: undefined   (error page cached as the reference)
```

A7, live (`node sites/rc5-repro-tools/midrun.mjs rc5-repro-score`, `midrun-out.txt`): clone edited 4 s into
`load --viewport mobile`:

```
load.json at 06:10:53Z; clone/index.html mtime 06:10:33Z; at > mtime: true
load check in verdict.json: {"pass":true,"stale":false}     (layout/states/detail turned stale; load did not)
```

A16, live (`node sites/rc5-repro-tools/tries.mjs`, `tries-out.txt`): app fixture, journey failing; each round edits
`clone/script.js` and runs only `trueclone report` (no score):

```
round 1: memory {"journey:desktop:hired":{"count":1,"value":85}}
round 2: memory {"journey:desktop:hired":{"count":2,"value":85}}
compare/journey/report.json unchanged throughout: true
```

Two "tries" were counted with no measurement (later rounds ran within the 1 s margin of `status.mjs:260`; with real
editing gaps every round counts), so a third report-only cycle sets the step aside → exit 3.

### All adjacent paths

| # | Failure path | Mechanism (file:line) | Class | Targeted reproduction (for those not yet run) |
|---|---|---|---|---|
| A1 | Missing check file → check absent → pass | `report.mjs:125,129`; no required-check list in `status.mjs:130` | (1) VAR-4; (2) `missing-files` | — |
| A2 | Status's own `--only a,b --viewport v` replaces whole-size aggregates of the other checks it names | `status.mjs:140`; `detail.mjs:22,258`; `states.mjs:155` | (2) `rc5-repro-cmd` (children simulated) | Live: on a passing seeded site set detail desktop failing by editing a font in `clone/`, follow status verbatim, confirm `detail.json` holds mobile only |
| A3 | `states --route /x` rewrites the aggregate without the main page and other routes → Scroll states check vanishes | `states.mjs:29,144,155`; `report.mjs:125` | (3) | Run `trueclone states <site> --clone --structure --route /about` on an astro copy; `report`; Scroll states row "–", status exit 0 |
| A4 | `interact --only x` rewrites the report with a subset of scenarios | `interact.mjs:96,320` | (3) | On varsity copy: `interact varsity --only legal`; `report`; Interactions = 1/1 |
| A5 | `drift --viewport v` replaces drift.json; status ignores drift anyway | `drift.mjs:19,53`; `status.mjs` | (2) `drift-stale` | — |
| A6 | Merged `load.json` relabels old sizes with the new `at` | `load.mjs:117-119` | (2) score repro | — |
| A7 | End-stamped `at` hides an edit made during the measurement | see P11 | (2) `midrun.mjs` | — |
| A8 | Stale + accepted passes | `report.mjs:116,121,125` | (2) `stale-accepted` | — |
| A9 | Journey never stale; a report-only refresh makes it current | `report.mjs:109`; `status.mjs:132` | (2) `journey-stale` | — |
| A10 | Review verdicts on frames of an older clone close the review | `status.mjs:192`; `review.mjs:41-49` (only re-shoots when run) | (2) `review-old-clone` | — |
| A11 | App: failing app check, missing app value, unpaired canvases/curves/journey, `next/` edited after verify | `status.mjs:284,288,290-314` | (1) VAR-1, VAR-4; (2) `next-unseen` | — |
| A12 | Regenerated `next/` that fails to build keeps the older passing app verdict | `next.mjs:273-275,801`; `status.mjs:284` | (3) | Passing fixture site with `compare-next`; inject a TSX syntax error through a generator-only change (temp copy of `scripts/` outside the repo), run `next --verify` (fails), status exit 0 |
| A13 | `next --verify --quick` leaves older app files that parity reads as current | `score.mjs:46,50-60`; `status.mjs:296-301` | (3) | Full verify, then change the clone to break hovers, `next --verify --quick`, status: no hovers gap |
| A14 | Child fails, score exits 0, old file kept | `score.mjs:123-160` | (1) VAR-4; (2) | — |
| A15 | Unreachable reference measured as a reference and cached | `load.mjs:40` (`goto().catch(() => null)`), `:91` | (2) | Same for detail/hovers (they throw instead: check) |
| A16 | Tries counted without a re-measure (`verdict.at` changes on `report` alone) | `status.mjs:260`; `report.mjs:232` | (2) `tries.mjs` | — |
| A17 | Retry history deleted when a check vanishes from the verdict (treated as fixed) | `status.mjs:262` | (3) | `tries.mjs` after 2 counted tries: delete `compare/journey/report.json`, `report`, status: memory entry gone; restore the file: count restarts at 0 |
| A18 | Partial capture under the old identity | `capture.mjs:71-72,272,361,481` | (3) | Start `capture` on a 5-size site, kill it once `reference/tablet.png` is rewritten; `meta.capturedAt` unchanged, status reports reads/seed done, `score` reuses stamps |
| A19 | Stamp reuse ignores the output file: a direct partial tool run between two scores is kept ("unchanged, not re-measured") | `score.mjs:104,141-145` | (3) | Full `score`; `trueclone detail <site> --viewport desktop`; `score` again: detail "kept", REPORT detail shows desktop only |
| A20 | `reference/cache` in the stamp hash: a run that writes a new cache entry forces a full re-measure next run (time, cf. BHASKAR-10) | `score.mjs:90-94` | (3) | `score` twice on an unchanged clone after `--refresh-ref`: second run re-measures every step |
| A21 | An empty filtered motion map scores 0 at that size (false fail) | `curves.mjs:113,288` | (3) | Map whose entries all have `viewports:["desktop"]`; `curves --viewport tablet` → 0% |
| A22 | Exact-mode "Layout (real pixels)" is never re-measured by score | `score.mjs:51`; `report.mjs:109,131` | (3) | Exact site: old `compare/report.json` at 99, break the clone's text, `score`: row still 99 and not stale |
| A23 | `hovers.score === null` removes the check | `hovers.mjs:232`; `report.mjs:152` | (3) | Site with a full-page overlay, no `--hide`: Hovers row "not measurable", no check in verdict |
| A24 | `review` failure in verify is a warning; missing app frames mean no review gap | `next.mjs:844`; `status.mjs:311-314` | (3) | Make `review --url` fail (wrong size list) during verify; status: no review gaps |

Checked and dropped (no same-file writers): within a score run, the parallel groups write distinct files
(`diff` → `report.mask.json`, `states` → `states/`, curves per size, interact/hovers/detail separate; reference caches
keyed per tool and size). The only shared-file hazards are the cache collisions from duplicate motion-map names
(VAR-5) and the profile race (ALLBIRDS-2), both already observed.

---

## 7. What this means for the RC5 plan (one line each)

- The verdict must be built from a **declared list of checks × sizes × routes**, each `measured`, `missing`, `failed`
  (child exit/timeout from `score-times.json`) or `stale`; only `measured` and fresh can pass (fixes P1-P3, P9, P13-P15).
- Every result file needs an **identity block**: start and end time, clone hash, capture time, tool version, step args,
  `NODE_OPTIONS` flag; staleness = identity mismatch, not mtime vs a report time (P6-P8, P10-P11, section 5).
- Partial runs must **merge per size/route with per-entry identity** (states, detail, drift, interact), as load half
  does today but with per-entry `at` (A2-A6).
- Accepted differences never cover a stale value (A8); status reads `verdict.drift` (P4).
- Next: status reads every `compare-next` check, pairs canvases, curves and journey, treats a missing app value as a gap,
  and hashes `next/` (excluding `.next`, the token) into the app's identity (section 4).
- `score` exits non-zero when any child fails; a try counts only when the step's own check was re-measured (A14, A16).
