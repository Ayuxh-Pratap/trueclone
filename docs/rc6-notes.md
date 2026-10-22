# 0.5.0-rc.6: fixes from the RC5 zero pilot

Date: 2026-10-22. Previous: 0.5.0-rc.5. Evidence: `C:\dev\tc-tests\rc5-zero`, preserved as run (its REPORT.md,
`compare/asset-probe.json`, `compare/empty-assets*.txt`, `compare/status-error*.txt`). Rules: `docs/policy.md`.

## 1. Empty files in the own bundle (exact mode)

**Observed.** RC5 zero's bundle held nine 0-byte textures and videos (`frost.webp`, `frost_normal.webp`,
`matcap-hand.webp`, ...). The clone stopped at 99% with "ERROR LOADING ASSETS". Re-running the journey recorded them
empty again.

**Cause, confirmed.** Chrome's DevTools protocol (`Network.getResponseBody`, which Playwright's `response.body()` uses)
returns an empty body for a fetch the page consumes as a Blob, although the bytes arrived. Measured on a local page:

| Consumer | Body handed over | Bytes received |
|---|---|---|
| `.blob()` | 0 | 150 153 |
| `.arrayBuffer()` | 150 000 | 150 153 |

The same happens for a gzip response consumed as a Blob. On the live site, `frost.webp` had `content-length` 145 028
and an empty body. The recorder saved whatever it was handed, unchecked. Two neighbouring gaps:

- "done" did not wait for responses arriving while it finished;
- the seeder had no notion of a file that could not be recorded.

**Fix** (`scripts/lib.mjs` `recordBundle`, `bodyVerdict`, `recoverBody`, `bundleIntegrity`; `scripts/bundle.mjs`;
`scripts/status.mjs`):

- **Each body gets a verdict:** ok, empty (legitimately), lost, incomplete, or partial (206).
  - What the browser received only tells "nothing arrived" from "something arrived": that count includes chunked
    framing and any content encoding (a 33-byte chunked page arrives as 44).
  - A length check uses the server's declared length, and only for a body that is not content-encoded.
- **Bounded recovery.** Lost, incomplete and partial bodies are asked for again through the page's own browser
  context (its cookies and request headers, no Range), at most twice.
- **Impostors are refused.** An answer is kept only if it is status 200, the same address after redirects, the same
  media type, not an HTML page, and its own declared length. Two answers that agree a resource is empty make it
  legitimately empty. Anything else is recorded as failed, with why.
- **Provenance.** Each manifest entry says `via` (browser or recovered), the verdict, bytes and sha1, or its failure.
- **Recording finishes properly.** "Done" waits until no new response joins.
- **The seeder skips failed entries.** The clone answers them 404.
- **Status reads the manifest, not the folder.**
  - A bundle with files that are not whole (including rc.5's empty files) is recorded again once by `journey <name>`.
  - If files are still not whole after that, the run ends Blocked (exit 2) with the files named.

**Tests.** `test/browser/bundle.test.mjs`, a local page reproducing each case:

- `.blob()`: lost, recovered;
- `.arrayBuffer()`: kept as handed over;
- gzip with `.blob()`: recovered, without comparing lengths across encodings;
- a legitimately empty file;
- a 206 video: the whole file recovered;
- a chunked document: kept;
- recovery answering 500, an HTML login page, or a redirect: each a failure with why, after 2 attempts;
- a request made after "done" was called;
- integrity read from the manifest.

`test/status.test.mjs` covers re-recording once, then Blocked.

**Live.** A fresh exact capture of why.zero.university and its reference journey with rc.6: 66 bundle entries, 0
problems. 11 were recovered: the nine RC5 files (lost) and two range-requested videos (partial).

## 2. status crashed on a review frame marked "differs"

**Observed.** `TypeError: Cannot read properties of undefined (reading 'slice')` at `loop.mjs:141`, after the
reviewer marked frames "differs". It exited 1, which an agent reads as "work left".

**Cause, confirmed.** Review objectives were built without the `below` list every unit objective has. The other
producers and consumers of objectives were checked: unit objectives always carry it, and status and REPORT default it.

**Fix.**

- Review objectives carry `below: []`.
- A safety net in `scripts/status.mjs`: any failure of trueclone itself ends Blocked (exit 2), owner "tool", with the
  whole error and stack in `compare/outcome.json` and a resume line. It is never exit 1. The net catches; it does not
  replace fixing the cause, which is fixed.

**Tests** (`test/status.test.mjs`):

- a "differs" frame becomes a step naming the frame (rc.5: the TypeError);
- a malformed loop record ends Blocked, with the full error and stack kept.

**Related, found while checking the contract.** A "differs" review objective whose picture went stale (the clone
changed) was counted as passed: the loop's "no longer failing" check looked only at measured results. It now passes
only when its frame is shot again and closed by a verdict. A frame the new shots no longer have is retired, like any
result no longer required. Test: `test/loop.test.mjs`.

## 3. The reference journey drew the gate before the site showed it

**Observed.** In RC5 the scored reference journey stayed at "DRAW A ZERO" on mobile, while the draft had passed it.

**Cause, confirmed.** The replay drew the zero before the gate existed:

- the `load` checkpoint ends when two screenshots in a row look alike, and zero's counting loader looks alike within
  about 2 s (settle times recorded: 2121 ms and 1931 ms);
- the gate appears 3-6 s after load;
- the replay made the input once and went on, so every later checkpoint stayed at the gate.

| Gesture drawn after load (plain Playwright, the same input) | Result |
|---|---|
| 0.5 s, 1.5 s, 3 s (6 attempts) | 0 passed |
| 6 s (2 attempts) | 2 passed |

**A first attribution was wrong.** It blamed rc.5's page clock, from a comparison that turned the clock and the
seeded `Math.random` off together (`TC_STABILISE=0`), and an "input-driven pages without the clock" policy was
drafted on it. Tested separately, every combination of seed and clock passed the gate (8 of 8). The policy was
withdrawn before release: rc.6 changes nothing about the clock or the seed.

**Fix** (`scripts/journey.mjs` `gateStep`). A gate the page names in words (the draft passes "draw ..." with a gesture
and "hold ..." with a hold, and counts it passed when the words leave the screen) is replayed by the same rule, on
the reference and the clone alike:

- wait up to 15 s for the gate's words to appear;
- make the input, then check that the words left;
- try again at most twice;
- report a gate that never passes as a journey error quoting what the page still says.

Input with no such words on screen is made as written.

**Tests.** `test/e2e/journey-gate.test.mjs`: a canvas app whose gate appears 3 s after load, through the real
`journey.mjs`.

- On rc.5 code it reproduces zero's failure: the run finishes in 3.7 s before the gate appears.
- With the fix the gate passes.
- A gesture the gate never accepts is reported after 3 tries.

**Live.** rc.6's reference journey of why.zero.university passes the gate at both sizes and reaches "300 XP" (desktop
30 checkpoints, mobile 25), with no journey errors.

## 4. Re-capture steps dropped the site's flags

Found while preparing the continuation. status's "capture again" steps printed `capture <url> <name>` without
`--mode exact --permission`, so following one would turn an exact-mode site into template mode. One helper now builds
every re-capture with the site's own settings:

- mode and permission;
- hide, cookies, locale and routes;
- hand-made `--ignore` and `--include`;
- `--bundle`.

**Test** (`test/status.test.mjs`): an exact canvas app's re-capture keeps `--mode exact --permission`.

## 5. A re-read reference made its calibration and journey results look current

Found while defining the continuation. Re-recording the bundle runs the reference journey again, which replaces the
reference frames. Nothing marked as out of date:

- the calibration (keyed only by capture);
- the clone's journey results measured against the old frames (their identity covered `journey.json` only).

**Fix.**

- **Calibration.** status asks for `calibrate` again when the reference's reads (an app's reference journey, a
  document's states) are newer than the calibration.
- **Journey results.** The reference journey's own record is part of the journey check's configuration
  (`identity.mjs` `CONFIG_FILES`), so earlier journey results become invalid.

**Test** (`test/status.test.mjs`).

## 6. Continuing an RC5 run on rc.6

| What | After upgrading |
|---|---|
| The capture (reference id, mode, permission, shots, scripts) | **kept**: complete and valid; no re-capture needed |
| The own bundle | **recorded again** by `journey <name>`, which status names first (rc.5's empty files fail the integrity check) |
| The reference journey (frames, scenes, shaders) | **read again** by that same step, now passing its gates |
| The calibration (`reference/noise.json`) | **made again** (`calibrate`), since the reference journey is newer |
| The clone (own bundle) | **seeded again** (`seed`), since the recorded files are newer; `clone/patches/` is kept |
| Journey results | **invalid** (the reference journey changed); measured again |
| Load results | **stale** (the clone changed); measured again |
| Review frames and verdicts | **stale** (the clone changed); shot again, verdicts given again |
| notes.md (Behaviours, Findings, Attempts), journey.json | **kept** |
| The loop's history (`compare/loop.json`) | **kept** (same reference id); objectives whose results are invalid wait for new measurements; attempts count again only on new measurements |
| rc.5 evidence (REPORT, probes, stack traces) | **kept**: archive it before continuing (the copy is in the continuation prompt) |

Every step is one status names in turn, in this order: `journey`, `calibrate`, `seed`, the scores, the review. The
bundle is checked before the calibration because recording it again re-reads the reference journey, which the
calibration replays. Nothing is edited by hand.

**Dry run on a copy of the RC5 zero folder** (the preserved run untouched), with the rc.6 code:

| Step | Took | Result |
|---|---|---|
| `journey zero` | 7 min | bundle and reference journey read again, past the gate at both sizes |
| `calibrate zero` | 14 min | 57 keys |
| `seed zero` | 1 s | 68 files, all whole |
| `score zero --only journey,load` | 9 min | journey desktop 89.68, mobile 87.98 (RC5: 1.11, 20.27); load 99.5-99.9 (RC5: 44-48) |
| next | — | review verdicts for the 55 frames |

The continuation procedure and prompt are in `docs/pilot-rc6-zero.md`.

## 7. Verification

- **Automated:** `npm test`, `npm run test:browser` and `npm run test:e2e`; the counts are in the release handoff.
- **Package:** the tarball is inspected and installed in an isolated project. Through the installed CLI: version,
  doctor, recording a Blob-consumed asset, a "differs" step, and Blocked on an internal failure.
- **Live:** in an isolated workspace (not the preserved run), a fresh exact capture of why.zero.university and its
  reference journey on desktop and mobile.
- **Pending:** the zero continuation itself (the pilot) and the four document sites.

## 8. Open observations

- **A one-off unit-test failure.** One full `npm test` run failed one evaluator test ("interactions: every planned
  scenario is required") while a heavy Chrome capture ran beside it. It did not recur in later runs. The cause is
  unknown; a Windows file-rename race in `results.mjs` is possible, not shown. No change was made on speculation.
- **Settle and gates.** A loader that looks still is still taken as settled by a checkpoint. The gate rule covers
  gates named in words; an input-driven step that waits for something the page does not name could still run early.
