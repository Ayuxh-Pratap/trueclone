# trueclone 0.5: the same result with any model

Why: `docs/analysis-0.4-rc1-runs.md`. 0.4 proved the method on varsity (exact, Opus 5.5): indistinguishable at every
size. The two template runs (Sonnet 5.5) left behaviour half-done, stopped twice to ask, never used the evidence the
capture saved, and hit pipeline defects that cost hours. Released as 0.4.0; this is 0.5.0, shipped as `0.5.0-rc.1`
under the `next` tag until the proof runs pass.

## The principle this round adds

**The tool carries the process; the model only does the work.** A strong model reads the evidence, keeps notes,
reviews by eye and keeps going without being told. A weaker or different model (Sonnet, GPT, Cursor's) does what it is
pointed at and stops when the next step is unclear. So nothing that decides the result may depend on the model's
diligence:

- **What to do next** is computed by the tool from the site folder (`trueclone status`), never left to judgement.
- **Where to look** is handed over per section (`trueclone brief`): the site's own code at file:line, the recorded
  motion, the values its scripts own, the current scores. The model never has to discover the evidence.
- **What is checked** includes behaviour a visitor uses (swipes, tabs, menus, dialogs), drafted by the tool, not only
  scenarios the model thought to write.
- **When it is done** is a gate the tool enforces (`status` exits non-zero, the report says what is left), not a rule
  in prose the model may skip.

The earlier principles stand: accuracy first, then speed, then scores; every screen size; global fixes only; look, don't
just score.

## Phase 1. The pipeline is correct (every fault that produced a wrong result or a broken build)

| # | Item | Done when |
|---|---|---|
| 1.1 | Every stylesheet is saved as `.css` whatever its URL (`/wss/fonts?families=…`); `serve()` sends `text/css` for anything under `css/` | airpods' fonts load in the clone and in textshape |
| 1.2 | Next generator: namespaced attributes (`xmlns`, `xml:*`, `prefix`) never reach JSX; numeric ARIA typed as numbers; a site stylesheet the Next CSS parser rejects is served as a plain `<link>` from `public/` instead of imported; whitespace between inline elements kept | airpods' Next app builds with no hand fix; varsity's hero reads "WE INVEST" with no compensation |
| 1.3 | `next --verify`: a port free on every interface, the server's own output kept, the page identity-checked; results written straight to `compare-next/` and `REPORT.next.md` (no renaming `compare/`), so review verdicts and evidence files count in both reports | two apps on one machine never cross; REPORT.next.md shows the review |
| 1.4 | Class replay adds and removes the recorded class tokens (never sets the whole attribute); `data-tc-own` on an element (or `tcOwn(selector)`) hands it to `script.js`: the players leave it alone | no hand-over patch needed in any run |
| 1.5 | The seed drops transforms a script wrote for centring or motion when they are not a constant of the layout (a viewport-fit or script-owned value) | varsity's tablet headline centred once from the seed |
| 1.6 | Capture warns when the page redirected (geo, consent) and pins `Accept-Language`/locale to the user's (`--locale`); design never writes a null value | stripe captured as stripe.com, not /in |

## Phase 2. What a visitor does is scored

| # | Item | Done when |
|---|---|---|
| 2.1 | `interactions.json` drafted by the tool at capture: every horizontal scroller (and its prev/next buttons and dots), tab set, accordion, menu, dialog trigger and drag surface gets a scenario; scored by default; the agent edits or adds, never starts from nothing | stripe's carousels fail the score until they swipe |
| 2.2 | Motion detection finds animation runtimes wherever they live (any object with GSAP's `ticker`/`ScrollTrigger`, Lenis instances, `data-engine` / three.js scenes, any carousel by behaviour) | varsity's own GSAP engine and stripe's three.js and carousels reported |
| 2.3 | Listener locations unwrapped past error-tracking and framework wrappers (Sentry, zone.js, React's root listener) to the real handler | stripe's carousel handlers point at the carousel code |
| 2.4 | Dialogs, listboxes and comboboxes recorded like tabs and menus | stripe's product dialogs recorded |

## Phase 3. The process does not depend on the model

| # | Item | Done when |
|---|---|---|
| 3.1 | `trueclone status <name>`: reads the site folder (capture, notes, clone, scores, review) and prints the one next action as a command, plus what is left; exit 0 only when every gate passes | an agent that only follows `status` reaches the end |
| 3.2 | `trueclone brief <name> <section>`: a work packet per section (its scripts and listeners at file:line, recorded reveals, curves, pins and classes, script-owned values, drafted interactions, current scores per size, its review frames) | a section can be ported from the brief alone |
| 3.3 | Skill rewritten around those two: "run `status`, do what it says, repeat"; never end the turn while `status` says work is left unless blocked (then write the plan in notes.md and say what blocks); the inner loop on one size (`status` prints it with `--viewport`) | no check-ins in the proof runs |
| 3.4 | Gates the report enforces: notes.md sections filled (Behaviours cite file:line), interactions scored, review verdicts complete; a finding under any heading is picked up | an empty notes.md cannot read "done" |
| 3.5 | `trueclone vendor <name>`: the site's libraries at the site's versions into `clone/patches/` (from the capture's script evidence) | no hand `npm pack` |
| 3.6 | `trueclone serve <name> [--next]`: the clone or the Next app on a free port, for the user and the agent | no temp-file servers |

## Phase 4. Instruments that close

| # | Item | Done when |
|---|---|---|
| 4.1 | Review: the scroll is verified (`scrollY` within 2 px, lazy media loaded first) and recorded; load frames aligned on each side's intro start; contact sheets built in; a "tool" verdict with evidence counts as closed | varsity's 9 tool-caused frames close |
| 4.2 | Detail paired by structure (element path, nearest same-tag text), not page point | template detail reflects style, not wrap shifts |
| 4.3 | textshape shapes text inside horizontal scrollers | airpods' gallery text shaped |
| 4.4 | Report rows carry when they were measured; a row older than the clone's last change is marked stale and cannot pass | stripe's report cannot mix an empty seed's detail with a finished clone |
| 4.5 | `tiles`, `rules` and every step find `sites/` from any folder inside the project | no doubled paths |

## Phase 5. Prove it (one run at a time)

1. Regression on the probes (rea-tools, resend, nickho, varsity-b) after each phase.
2. New sites rather than the same three again (the user's call): first a multi-route portfolio (heybhaskar.com, Phase 6),
   then the site-kind matrix. Each judged by eye first, then review, then scores.
3. **Model matrix:** each new site on Sonnet 5.5 (the default for most users) and, where it matters, Opus 5.5. Bar: the
   Sonnet result within a point of Opus on every check, with no check-in.

## Phase 6. A website is more than one page (routes)

Until now a clone was one URL: capture, every check, the review and the Next app looked at one address. A real site
has routes (a portfolio's home, work, about, resume, case studies), linked to each other, either as one document an
app script switches between (a single-page app: heybhaskar.com serves the same HTML at every address and app.js shows
the view) or as separate documents (a multi-page site). Exact means every route, the links between them and the
navigation itself.

| # | Item | Done when |
|---|---|---|
| 6.1 | **Routes discovered at capture**: same-origin links on the rendered page (every view's, not only the visible one) and sitemap.xml, capped and listed (`--routes N`, or `--routes "/,/about"`); each route's raw HTML compared: one document for every address = a single-page app, different documents = separate pages; `meta.routes`, `meta.app` | heybhaskar: 8 routes, app "single-page" |
| 6.2 | **A reference per route**: every route shot, sectioned and masked at all five sizes (`reference/routes/<slug>/`); separate pages also get their own rendered HTML and mirror | each route has its five shots |
| 6.3 | **Serving like the host**: an address that is not a file is the route's page (`/about` → `about/index.html`) or, for a single-page app, the app's document; the same in the Next app (a catch-all route) | `/about` opens on the clone and in the Next app |
| 6.4 | **Every check per route**: layout, scroll states and load at every route and size; the report's route table, worst first; a failing route fails the verdict | heybhaskar's case studies scored |
| 6.5 | **Navigation is behaviour**: scenarios drafted for every internal link (from the home and from each route: the right address and the right view), Back and Forward, and overlays a route opens; the address is compared at every shot | a link that changes the view but not the address fails |
| 6.6 | **Separate pages seeded**: each route's mirror seeded into `clone/<route>/index.html`, internal links kept relative | a two-page site clones with both pages |
| 6.7 | **status, brief and review know routes**: the worst route first; a brief per route section; review frames per route | an agent walks every route without being told |

## Release gate for 0.5.0

- All three runs finish with no intervention after the prompt, on either model.
- Every check passes at every size, behaviour scenarios included; review closed.
- The Next app builds and equals the HTML clone with no hand fix.
- No tool defect from the rc.1 analysis left open.

## Status

| Phase | State |
|---|---|
| 1 | done: airpods Next app builds with no hand fix (the one invalid Apple declaration removed, namespaced/numeric/boolean attributes typed); varsity hero keeps "WE INVEST"; next --verify skips a port held on 0.0.0.0, checks the app identifies itself and leaves compare/ and REPORT.md untouched; class replay by tokens and tcOwn() verified in a browser; GSAP-written transforms marked and cleared on tcOwn; airpods fonts sheet served as CSS; capture warns on redirects and pins the locale; design refuses to draft typography without spec. Regression: resend 99.7-100 layout/states/interactions; rea-tools interactions fail because rea.tools itself changed since its capture (drift: desktop 6352 -> 4870px) |
| 2 | done: capture finds what a visitor operates (stripe: 25 scenarios; the case-study carousel, product dialogs and accordions now fail visibly instead of passing unseen; 7 the reference does not react to set aside), scenarios run three at a time (stripe first measurement 10.6 -> 4.0 min); motion finds varsity's GSAP at window.VARSITY.gsap (13 triggers, was 1), Lenis options, stripe's three.js r178; 68 stripe listeners traced past Sentry to the carousel's own code, React handlers located; dialogs recorded and replayed (stripe desktop dialogs 96-99, were failing). Open: dialogs are recorded at desktop only (mobile open frames 47-63) |
| 3 | done: status (one next command from the files, exit 0 only when every gate passes; stale scores re-measured first), brief (a section's handlers file:line + code, motion, script-owned values, scenarios, canvases, scores), vendor (the busiest GSAP: varsity runs Webflow's 3.15 and its own 3.13, the 3.13 drives 13 triggers), serve; skill rewritten around the status loop (12.5 -> 7.7 KB) with the no-check-in rule, also in AGENTS.md; report gates notes (Behaviours must cite file:line: varsity 32 cited passes, an empty one fails), findings read from any heading |
| 4 | done: review (load frames from each load event, lazy media first, scroll verified and recorded, contact sheets, tool verdicts with evidence close), detail paired by document path, textshape inside horizontal scrollers, stale rows marked and failing (resend: detail, hovers, load measured before its re-seed), siteDir from any folder |
| 5 | probe regression done: resend unchanged (layout/states 99.7-100, load 97.9-99.2, detail 99.5-99.7 -> 100 by structure; hovers 78.8 real; notes and review gates now open, correctly), nickho unchanged (hand-built: detail falls back to points, same numbers), stripe detail 92.3/70.2/69.2 -> 100/88.2/85.5 with 0 unpaired probes (the rest are real box-size gaps at tablet/mobile); varsity end to end in 13.5 min (capture + every read + seed), status walks it to the briefs, the team brief shows the hover handlers' code; review at 1920 takes every frame at the verified position (2 bottom frames flagged where the seed-only clone is 12px shorter). Next: publish 0.5.0-rc.1, the three test runs one at a time, then the model matrix (Sonnet vs Opus on varsity and stripe) |
| 6 | done: heybhaskar captured as a single-page app with 8 routes, each at 5 sizes (2.4 min); app shells (a fixed sidebar, a pane that scrolls on its own, a sheet over the page) unrolled the same way on both sides, so whole-page measures see the whole page (home 948 -> 2065 px, a case study 948 -> 9202 px) and sections follow the pane's blocks; serve() and the Next app answer every route; layout and states scored per route, a Routes check and table in the report (a seed-only clone fails all 7 other routes, correctly: no routing yet); navigation drafted and scored with the address at every shot (the original replaces its history entry, so Back leaves the site: the clone must do the same); same-site links kept as the clone's routes in both modes (template mode had turned them into #); brief, review and status take --route (Git Bash rewriting of /about undone). Separate pages (6.6): each mirrored at capture and seeded by the same pipeline into clone/<route>/index.html with references rebased (nickho: its privacy page scores 98.2-99.9 layout at all 5 sizes straight from the seed). Open: the Next app for a separate-page site is still one page (a catch-all is only right for a single-page app) |
