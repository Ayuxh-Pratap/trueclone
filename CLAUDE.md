# trueclone (repo guide for coding agents)

trueclone builds the exact same website from its URL, at every screen size (HTML/CSS/JS clone, Next.js + Tailwind + shadcn app, DESIGN.md, shadcn globals.css), and proves it with checks at the sizes it builds from and at held-out sizes, plus a visual review. Users install it with `npx @trueclone/cli init` in their own project (published as `@trueclone/cli`; the command is `trueclone`); this repo is the tool itself. The current plan is `docs/plan-0.4.md`; why it exists is `docs/analysis-0.3-runs.md`.

## Principles (from the plan; they decide every change)

1. Accuracy and exactness first, speed second, scores third. When a score and the eye disagree, fix the instrument.
2. Any screen size: nothing may be right only at the captured sizes. A value a script computed from the viewport is a function, never a constant.
3. Structure comes from the seed; behaviour is code the agent ports from the site's own scripts. Recordings are evidence, not the clone.
4. Global: a fix that names a site, a selector or a number is a bug.
5. Verify where a visitor looks: held-out sizes, hovers, canvases, the load, by pixels and by eye.

## Layout

| Path | What |
|---|---|
| `bin/trueclone.mjs` | The CLI: `init` (`--with-rea` for REA as MCP), `doctor`, `<url>` shortcut, `rea` passthrough, one command per step script |
| `skill/SKILL.md` | The agent workflow `init` installs: capture, then the `status` loop, the rules, notes.md, reference. **Keep it in step with the scripts** |
| `scripts/status.mjs` | Where a clone stands and the one next step, from the files alone (the process lives here, not in the model): reads, design, seed, briefs, Behaviours with file:line, script.js, fresh scores, failing checks in fix order, review, Next app; exit 0 only when every gate passes |
| `scripts/brief.mjs` | One section's evidence in one page: the site's handlers there (file:line + code), recorded motion, script-owned values, what a visitor operates, canvases, scores |
| `scripts/vendor.mjs` | The site's libraries at its versions (the busiest GSAP + plugins, Lenis, three.js, Swiper) into clone/patches/ |
| `scripts/serve.mjs` | The clone or the built Next app on a free port |
| `scripts/lib.mjs` | Shared: `unrollInPage` (an app shell's scrolling pane let grow, so whole-page measures see the whole page; in settle(), and states/review/interact), `siteDir`, `COMPARE`/`REPORT_FILE`, route-aware serve(), `VIEWPORTS` (build sizes), `HELD_OUT` and `SCORED`, browser/page setup with timeouts, settle/freeze, scroll (`wheelTo`), masks (re-marked by an observer), pixel match, `canvasSimilarity`, compressed `serve()`, reference cache |
| `scripts/capture.mjs` | Full-page screenshots (shot until stable) at the 5 scored sizes, sections, tokens, rendered HTML (view-mounted content, declarative shadow DOM), assets, HAR, script evidence (`scripts-evidence.mjs`), inline styles at extra sizes inside the breakpoint ranges of the site's stylesheets and scripts (`matchMedia`), read settled before any screenshot (`inline-styles.json`), script-free mirror (SRI dropped, missing media fetched) |
| Routes | capture finds the routes (links on the page, every view's, and sitemap.xml), tells a single-page app from separate pages (`meta.app`, `meta.routes`) and captures each route at 5 sizes in `reference/routes/<slug>/`; layout and states score each route; serve() answers a route address like a host; interactions draft navigation (address compared at every shot, Back); brief, review and status take `--route`; Next gets a catch-all for a single-page app; separate pages are mirrored (`reference/mirror/routes/<slug>.html`) and seeded per page (`seed --route-page`, run by the main seed) into `clone/<route>/index.html`. Open: the Next app for separate pages |
| `scripts/scripts-evidence.mjs` | Every script the page ran, saved and beautified, ranked by V8 coverage, every listener located (CDP) past error-tracking and framework wrappers, React props handlers included → `reference/scripts/INDEX.md` |
| `scripts/viewport-fit.mjs` | Inline values read at many sizes → constant, a `calc()` of the viewport or a cover/contain `max()`/`min()` (globally, or per group of breakpoint ranges one function fits), or script-owned at every size |
| `scripts/seed.mjs` | `clone/` from the mirror: template placeholders; the viewport-fit plan applied (`--tc-vw`, `data-tc-w`, `data-tc-script-owned`); pins as sticky + a tail sized by `--tc-pin`; one-shot reveals and scroll class changes replayed (class tokens, never the whole attribute; scroll curves not); GSAP-written transforms marked `data-tc-gsap`; `tcOwn(selector)` hands elements to script.js; boot contract; `clone/patches/` (`--patches` re-applies them on `.seed-base.html`) |
| `scripts/reveals.mjs` | At every build size: one-shot reveals frame by frame, scroll-linked curves (evidence), pins, scroll-caused class changes; pointer events off while recording |
| `scripts/widgets.mjs` | Every tab, menu and dialog state by clicking it (dialogs and listboxes as the element they open, shown in a portal host) |
| `scripts/design.mjs` | `design-tokens.json` → `DESIGN.md` (linted), shadcn `globals.css`, `clone/tokens.css` |
| `scripts/motion.mjs` | Motion inventory from the live runtime, found wherever the site keeps it (a bundled GSAP, an unexposed Lenis, three.js by `__THREE__` or `data-engine`). Parameters only |
| `scripts/understand.mjs` | Optional REA code evidence → `reference/code.md`; not in the standard flow |
| `scripts/drift.mjs` | Live page vs capture (two loads before calling it changed); first step of every full score |
| `scripts/owned.mjs` | Sections `script.js` rebuilds at boot (scripts blocked vs running) |
| `scripts/states.mjs` | Scroll states at every scored size; `--clone` scores each step and the canvases in it |
| `scripts/curves.mjs` | Motion score: sampled property curves |
| `scripts/interact.mjs` | Scenarios on both sides, three at a time; pass = change on both sides and the same end state (≥ 95); the agent's `interactions.json` plus `reference/interactions.auto.json` (`--auto` re-detects) |
| `scripts/interactions-auto.mjs` | What a visitor can operate (scrollers, carousels, tabs, accordions, menus, dialogs), found on the reference at each build size and written as scenarios |
| `scripts/detail.mjs` | Style diff of the same elements (paired by document path, page point where the clone rebuilt it); reference read twice, unstable probes excluded |
| `scripts/hovers.mjs` | Every control and every element with a hover listener (CDP); outcome compared as pixels |
| `scripts/load.mjs` | Load sequence at every scored size, each side twice, noise reported |
| `scripts/review.mjs` | Reference and clone side by side at any size: load frames from each side's load event, lazy media loaded first, every scroll position verified and recorded, contact sheets; verdicts same / differs / tool (with evidence) in notes.md |
| `scripts/rules.mjs` | Every CSS rule matching an element (+ pseudo-elements, `@media`), cross-origin sheets included |
| `scripts/textshape.mjs` | Template mode: placeholder words with the reference's rendered word widths, inside horizontal scrollers too |
| `scripts/next.mjs` | Next.js app from the clone: site layer order first in globals, head links and seed head scripts carried, relative `@import`s carried, declarations the Next CSS parser rejects removed as the browser ignores them (Lightning CSS, the version Next ships), namespaced attributes dropped, numeric and boolean attributes typed, inline whitespace kept, scripts preloaded and run at hydration; `--verify` serves on a port free on every interface, checks the app identifies itself, and scores into `REPORT.next.md` / `compare-next/` (`TC_COMPARE`/`TC_REPORT`) |
| `scripts/score.mjs`, `scripts/report.mjs` | All checks in groups with time limits (`--only`, `--viewport`, unchanged checks kept, `--fresh`); `REPORT.md` with build and held-out columns, review, accepted differences (≥ 95 and evidence only), findings |
| `scripts/explain.mjs`, `diff.mjs`, `spec.mjs`, `tiles.mjs` | One place on the page; layout diff; measured boxes; screenshot tiles |
| `tools/` | Development helpers, not published: `compare-runs.mjs` (montages), `eval-clones.mjs` (score finished clones against one capture) |
| `sites/<name>/` | Test sites. **Gitignored, never committed** |

## Working in this repo

Run the CLI from source: `node bin/trueclone.mjs <command>`. To clone a site while developing, follow `skill/SKILL.md` with that substitution. Probes: `sites/rea-tools` (static docs + canvas game, exact), `sites/resend` (Tailwind/Next.js, template), `sites/nickho` (Webflow + GSAP, hand-built), `sites/varsity-eval` (Webflow + GSAP + three.js, exact, with the v1/v2/v3 clones' reports).

After changing a scoring or seeding script, re-run the probes and compare with their last reports: a change that moves a score must be explained (a tool bug fixed, or a real difference found), never tuned. Look at the result too (`review`), not only the numbers. Run one benchmark at a time.

## Rules

- Scripts must work from any folder: resolve siblings with `import.meta.url`, packages with `import.meta.resolve`, a site with `siteDir(name)` (lib.mjs: the nearest `sites/<name>` up from the current folder).
- Rendering must stay identical between capture and scoring: same sizes, frozen animations, deviceScaleFactor 1. Change both sides together (`scripts/lib.mjs`).
- Measure both sides the same way. Any asymmetry shows up as fake gaps.
- Nothing that builds the clone may read the held-out sizes.
- Write code containing backslashes or template literals with the Edit/Write tools, never through shell heredocs or `sed`.
- Captures run in installed Google Chrome; `LAB_BROWSER=chromium` forces Playwright's browser. Every page call has a timeout; never leave a server running.
- Reference measurements are cached per capture (`reference/cache/`); bump the cache key's `v` when a measuring method changes.
- Never get around bot checks, CAPTCHAs, logins or paywalls. Exact mode only with recorded permission. Clones stay local.
- Commit only when the user asks: one-line messages, no co-author trailers.
