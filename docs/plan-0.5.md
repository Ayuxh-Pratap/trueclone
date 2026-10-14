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
2. The same three runs, one at a time, the same prompts.
3. **Model matrix:** varsity and stripe each with Sonnet 5.5 and Opus 5.5. Bar: the Sonnet result is within a point of
   Opus on every check, with no check-in.
4. Then the site-kind matrix.

## Release gate for 0.5.0

- All three runs finish with no intervention after the prompt, on either model.
- Every check passes at every size, behaviour scenarios included; review closed.
- The Next app builds and equals the HTML clone with no hand fix.
- No tool defect from the rc.1 analysis left open.

## Status

| Phase | State |
|---|---|
| 1 | done: airpods Next app builds with no hand fix (the one invalid Apple declaration removed, namespaced/numeric/boolean attributes typed); varsity hero keeps "WE INVEST"; next --verify skips a port held on 0.0.0.0, checks the app identifies itself and leaves compare/ and REPORT.md untouched; class replay by tokens and tcOwn() verified in a browser; GSAP-written transforms marked and cleared on tcOwn; airpods fonts sheet served as CSS; capture warns on redirects and pins the locale; design refuses to draft typography without spec. Regression: resend 99.7-100 layout/states/interactions; rea-tools interactions fail because rea.tools itself changed since its capture (drift: desktop 6352 -> 4870px) |
| 2 | in progress |
| 3–5 | waiting |
