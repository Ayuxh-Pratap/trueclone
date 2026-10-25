# rc.11: two workflows, scope, embedded documents, the generator retired

The product decisions of 2026-10-25 and how rc.11 implements them. `docs/policy.md` is canonical; this page is the
record of the change, its evidence, its verification and what is left.

## The decisions

1. **Two separate workflows, not an output option.** Cloning delivers an HTML/CSS/JS clone (its scripts,
   interactions, animation and canvases); converting a finished clone into a Next.js application is a separate, later
   request with its own implementation, validation and outcome. No combined "clone straight to Next.js" workflow; a
   request for both is two stages, the conversion only when asked for.
2. **No combined-output design**: no `--deliver` flag, no switching command, no capture identity change when a
   conversion is asked for later.
3. **No migration for development-era runs.** Historical folders and reports stay untouched as evidence; the product
   does not support their old workflow. Obsolete input gets a clear message (status notes `next/` and `compare-next/` as
   ignored; `trueclone next` says it is retired and names `convert`).
4. **The generator is retired completely** (`scripts/next.mjs`, its test and fixture removed): not a deliverable, a
   quick export, a fallback or a scaffold. The conversion's scaffold is a conventional empty project and inherits none of
   its architecture.
5. **A useful conversion**: maintainable source (App Router routes and layouts, meaningful components, strict
   TypeScript, Tailwind first, organised content, appropriate client boundaries, lifecycle-safe behaviour, semantic
   accessible markup, working builds, a README), checked automatically where a rule can establish it and by explicit
   criteria where it cannot; user-authored work never overwritten.
6. **Scope**: the whole site bounded at 12 routes and always disclosed; one page and a list supported directly; links
   outside the scope to their live absolute addresses (query and fragment kept), consistently in seeding, the own
   bundle's navigation and its service worker; missing subresources never fetched live. First-party embedded documents
   captured as rendering dependencies, not routes, measured with their page, bounded.
7. **Truthful, independent outcomes**: every fidelity check kept; the clone's outcome depends on the clone alone; a
   conversion has its own accounting, measured against the original reference (never only against the clone).
8. **Speed without weakening measurement**: an earlier provisional preview, reuse of valid work, incremental
   re-measurement only with sufficient provenance, no mandatory Next.js work in cloning, bounded repetition; no
   concurrency without evidence that it keeps measurements valid.

## The interface

| Command | Workflow | Status |
|---|---|---|
| `capture <url> [name] [--routes 1 \| "/,/a" \| N]` | cloning | existing; now records `meta.scope` and first-party embedded documents (`meta.dependencies`) |
| `status <name>` | cloning | existing; HTML only, exit 0/1/2/3 |
| `serve <name>` | cloning | existing; the clone only (`--next` removed, with a message) |
| `convert <name> [--from-incomplete "<words>"]` | converting | new: the request, then the conversion's status, exit 0/1/2/3 |
| `convert <name> --verify` | converting | new: install, typecheck, lint, build, serve, measure, review |
| `next` | (retired) | prints that it is retired and names `convert`; exit 1 |

## What changed, by area

- **Cloning completes on the HTML clone** (`scripts/status.mjs`): the Next.js stage is gone; accounting, the Blocked
  accounting, the input digest and the outcome cover the clone alone; Verified and Incomplete say what was delivered
  ("HTML/CSS/JS clone (<mode> mode), scope: …") and record `deliverable: "html"` and the scope in `compare/outcome.json`.
  `scripts/report.mjs` and `tools/audit-run.mjs` read one workflow at a time (`--conversion` audits a conversion).
- **Scope** (`scripts/scope.mjs`, `capture.mjs`, `seed.mjs`, `bundle.mjs`, `report.mjs`): the scope recorded and kept by
  every re-capture status names (rc.10 dropped `--routes 1`); for one page or a list nothing is asked about pages left
  out; a seeded page's links decided against its live address (`siteLinks`); template mode keeps live links to the site
  (never `#`); the own bundle writes them live in the markup (a marker survives the origin rewrite), its guard sends a
  click to the live page and its worker redirects a top-level navigation, while an unrecorded file stays a 404; REPORT's
  Scope section lists what was asked for, captured and verified, every page found and not captured, the cap and
  discovery limits, and every link sent to the live site.
- **Embedded documents** (`capture.mjs`, `bundle.mjs placeDependencies`, `seed.mjs`, `verdict.mjs`): first-party frames
  (registrable domain, hosting platforms' tenants apart) found on each captured page at desktop, at most 10 a page,
  recorded once more after the capture (exact mode), copied into `clone/_dep/<host>/` with their recorded addresses and
  root-relative markup pointed at the copy and a guard for run-time requests; the page's frame points at the copy; one
  not recorded is a required unit, not verifiable.
- **The conversion** (`scripts/convert.mjs`, `scripts/conversion.mjs`): request and baseline; scaffold (missing files
  only); automated source checks (21 rules with file and line; the negative fixtures are the retired generator's own
  shapes); build, serve, every route 200; every check against the original reference into `compare-nextjs/`; the app's
  review; objectives in its own loop; criteria C1 to C10 answered with evidence under a token of the app's content; its
  own outcome and `REPORT.nextjs.md`.
- **Interaction scenarios across markup** (`interactions-auto.mjs`, `interact.mjs`): every drafted click and expected
  change records what its element is (tag, text or label, a link's destination); on a side where the selector finds
  nothing (a conversion's own markup), that finds the same control. Found by the first e2e run: the app's brand link
  had no `.brand` class, so "go to /" could not be clicked on it.
- **Reads that finished** (`scripts/reads.mjs`, `status.mjs`): `reference/reads.json`, each read marked unfinished
  before it starts and finished only on exit 0.
- **Seed before calibration** (`status.mjs`): see Time below.

## Time: measured and projected

The only journaled runs are Elise's (rc.8 retry1, rc.9 resume; `logs/commands.jsonl`). What they measured:

| Phase | Step | Minutes |
|---|---|---|
| rc.8 | capture | 8.9 |
| rc.8 | reads | 8.6 |
| rc.8 | calibrate | 71.5 (the seed ran at minute 89.9: the first look at the clone) |
| rc.8 | score (failed), rescore (failed) | 48.4, 14.6 |
| rc.9 resume | `next --verify` (2 runs) | 119.0 of 219 step-minutes; the first run failed after 51 minutes on a 20-minute check limit |
| rc.9 resume | review (375 runs), score, status (2,184 runs) | 49.3, 44.3 + 5.5, 22.2 |
| rc.9 resume | no step running (the agent writing 711 verdicts and declarations) | 123 (2.05 h of 5.70 h) |

What rc.11 changes, and which numbers are measured and which projected:

- **No Next.js work in cloning** (measured removal): the 119 step-minutes of the rc.9 resume, and the app review frames
  (not separated in the journal), are no longer part of a cloning run.
- **First preview** (projected from measured parts): the seed now follows the reads, before calibrate: on Elise the
  clone would have been there at about minute 18 instead of 90. The total time to Verified is unchanged by the order:
  calibrate still runs, alone, before anything is measured (`status` asks for no other trueclone step while it runs,
  and the agent can look at the preview and read the site's scripts).
- **Not changed, on purpose**: no step runs beside calibrate (no evidence yet that a browser check beside it keeps its
  timing frames valid), and re-measurement keeps the whole-clone content hash as its provenance: a change anywhere
  stales every result (status re-measures stale failing results at once and stale passing ones in one final sweep, as
  before). Narrower provenance (the files each page loads) would let an edit to one route keep another route's results,
  but a shared script or stylesheet affects every page; it needs a record of what each page loaded, not added here.
- **Bounded repetition** (existing, now tested further): a step that fails twice, runs twice without effect, or is named
  eight times with nothing changing ends Blocked or concluded, never named for ever; a read that did not finish is read
  again instead of being taken as done.

## jam.dev, landing page only, exact mode, HTML clone (an estimate, not a promise)

From the live probes (2026-10-25: Framer, desktop 12,192 px and mobile 16,214 px tall, 11 sections, 40 images, 10 2D
canvases of which one animates (the hero, y 356, 1440x848), 104 requests from 20 hosts, Cookiebot, Intercom, Hotjar and
GTM, a `recorder.jam.dev/capture` frame, 20 links to other pages of the site) and the Elise timings:

| Milestone | Optimistic | Likely | Pessimistic |
|---|---|---|---|
| First provisional preview (capture with the embedded document, reads, design, seed) | 10 min | 15-20 min | 35 min |
| Calibration (1 route x 5 sizes, exact: status's own estimate for these page heights is about 55 min, range 6-110) | 15 min | 25-55 min | 110 min |
| Verified HTML clone (build work, 2-5 scoring passes of 15-30 min, ~100 review frames) | 2 h | 3.5-6 h | 8-10 h, or Incomplete on the animated hero canvas or Framer's appear timing |
| A later Next.js conversion (a separate request) | 4 h | 6-12 h | 2 days |

Assumptions: no Cloudflare challenge (one is Blocked, never bypassed); the Cookiebot banner hidden with `--hide`; the
trackers excluded on both sides; the recorder frame recorded as a first-party embedded document; the 20 other pages
outside the scope, linked live. Confidence: low to medium (one journaled site, none of them Framer).

## Verification

- `npm test`: unit and contract suites (status, verdict, accounting, contracts, scope, conversion, skill), including the
  independence tests (a failing, edited or obsolete conversion folder leaves the clone Verified with the same required
  items), the incomplete-reads and order tests, the scope and link tests, the embedded-document placement tests, and the
  conversion's request, scaffold, source-check, criteria and outcome tests (21 negative fixtures).
- `test/e2e/two-workflows.test.mjs`: both workflows on a fixture (see its header); the conversion half needs the npm
  registry. Passed on 2026-10-25 (third run): cloning to Verified in 11.8 minutes (capture with the embedded document,
  reads, seed, calibrate, briefs, scores, review), then the conversion to Verified in 6.5 minutes (npm install 103 s,
  typecheck 3 s, lint 5 s, build 6 s, every check against the reference, the app's review, the criteria), the clone's
  `compare/outcome.json` and `REPORT.md` byte for byte unchanged and both audits clean. The first two runs found real
  gaps, both fixed: a drafted interaction clicked the reference's `.brand` class, which a conversion does not have (the
  tool: scenarios now record what their element is), and the detail check found the fixture's conversion declared
  Tailwind's default font stack instead of the site's (the fixture: the theme now sets the site's stack). The check
  was right both times; no bar was moved.
- Totals on 2026-10-25: `npm test` 169 of 169, `npm run test:browser` 18 of 18, every e2e test 12 of 12 (the nine
  earlier ones unchanged: own bundle, canvas app, failed route, doc site, fidelity capture, journey gate, reference
  integrity, resume, routes site).
- Passing fixtures shows the contracts hold; it does not show a real site will verify. The manual site test (jam.dev,
  landing page, exact mode) is a separate stage.

## The next manual test (a separate stage)

One site, one fresh workspace, one agent session, the cloning request only:

1. `npx @trueclone/cli@<rc.11> init` in a new folder; `npx trueclone doctor` ok on every line.
2. The request, as a user words it: "clone only the landing page of https://jam.dev in exact mode; I have the owner's
   permission". Expected capture: `--routes 1 --mode exact --permission "<owner>"`, with `--hide` for the Cookiebot
   banner when capture warns about it.
3. Check at capture: `meta.scope.kind` is `page`; `recorder.jam.dev/capture` is in `meta.dependencies`, recorded; the
   20 other pages are in `routesNotCaptured` as outside the requested scope; status never asks to capture them.
4. Check at the seed (the provisional preview, before calibrate): the clone's links to other pages open jam.dev's live
   pages with their query and fragment; the recorder frame loads from `clone/_dep/`; no Next.js folder appears.
5. Let the run end by status's exit code; measure time to the first preview and to the outcome from
   `logs/commands.jsonl` (the same table as above), and audit it: `node tools/audit-run.mjs sites/<name>`.
6. Only if that is done and the user then asks: the conversion, in the same workspace, as its own request.

## Left

- Narrower re-measurement provenance (above).
- The conversion is written by the agent: trueclone checks and measures it, it does not convert by itself.
- Discovery beyond links and sitemap.xml for whole sites.
