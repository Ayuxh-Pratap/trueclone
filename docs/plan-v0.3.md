# trueclone 0.3: from "passes the scores" to "true clone, no noise"

Written 2026-10-13 after the first cold end-user run (varsity.vc, Webflow + GSAP + three.js, exact mode, 1h50m, every
target met, 12 package defects, a visible flash on load in the Next app). Source of truth for the next release.

## Principles (read before every change)

1. **Accuracy first, speed second.** A change that moves a score must be explained by a tool bug fixed or a real
   difference found, never tuned. Speed work removes only dead time (waiting, re-measuring the unchanged, chasing
   measurement noise); it never trades a point of accuracy for a minute.
2. **Every kind of site, not the one in front of us.** varsity, resend, rea.tools and nickho are probes, not targets.
   A fix is only right when it holds for a static brochure, a Tailwind marketing page, a Webflow/Framer site, a
   GSAP/three.js showcase, a content-heavy docs site and an app landing page alike. A fix that mentions a site's
   class names, selectors or numbers is a bug. When a probe site exposes a defect, fix the mechanism (the mirror is a
   post-script snapshot; inline styles differ per width; a pin is a sticky element) and prove it on the other probes.
3. **Regression before done.** After any change to capture, seed, reveals or a scorer, re-run every benchmark and
   compare with its last REPORT.md. The Phase 1 re-run caught two bugs this way (`getHTML()` dropping `<html>`, a
   canvas losing its aspect ratio) that one site alone would not have shown.
4. **Never edit generated output by hand.** If a site needs it, the tool is missing a feature; add the feature.

## Part 1. REA: what it really gives a cloner

### What REA's web layer is (rea-agents 6.4.0, read from the package)

Passive CDP observation of a Chrome you start yourself on a loopback port, plus AST analysis of the scripts it sees.

| REA tool | What it returns | Does our capture already have it? |
|---|---|---|
| `inspect_web_page` | DOM **structure only** (tag names, attribute names, no values, no text, no styles, no geometry), scripts (sources on request), resources, console/network during a 500 ms window, storage key names | We have far more: rendered DOM with values and text, computed styles, geometry, full HAR |
| `analyze_web_bundle` | chunk graph (import/require edges), **route and endpoint candidates from the AST** (fetch/XHR/WebSocket/axios-style calls, router calls), vendor fingerprints (substring checks), **source maps → original sources** when `fetch_source_maps: true` and the site publishes them | Partly: we list API calls that *fired* (HAR). REA finds endpoints that *exist in code* but did not fire (form posts, filters, pagination) |
| `observe_web_execution` | **V8 precise coverage**: which functions ran, how often, during a window | No. Our motion inventory lists GSAP objects, not the code that made them |
| `inspect_web_event_listeners` | **the handler's script location and text** for one element's listeners (direct listeners only; delegated/framework listeners "unknown") | No. Our hovers/widgets tools record *effects*, never *causes* |
| `export_web_scripts` → `analyze_javascript_application` → `trace_javascript_semantics` / `trace_application_feature` | static module graph and data-flow over the captured bundle: follow one seed (a string, a selector, a config key) to the code that uses it | No. The varsity agent read a 147 KB and a 480 KB minified file by eye |
| `inspect_web_network_capture` | re-reads a HAR offline | We already parse the HAR |
| `capture_web_screenshot`, `compare_web_screenshots` | viewport PNG, pixel diff (equal sizes only) | Ours is stronger: full page, 3 widths, masks, sections |
| `capture_browser_scenario` | Playwright steps with per-step artifacts, **reduced motion on by default** | Ours is stronger and keeps motion |
| Evidence ledger: `record_unknown`, `verify_reconstruction`, evidence IDs | a discipline: observed vs inferred vs unknown | No tool, but the *pattern* is exactly what "accepted differences" needs |

What REA cannot see on the web: computed styles, boxes, animations, GSAP/Lenis state, shadow roots, shaders, React trees,
full-page pixels. It never clicks, navigates or evaluates. Un-minify (Wakaru) is Linux-only.

### What it would have changed on varsity

- **Parameters.** The agent spent ~20 minutes reading `engine-3.13.0-b3.js` and `scenes.js` with curl and grep to find pin
  distances, slider maths, helix constants. `trace_javascript_semantics` with seeds like `"+=2200"`, `pin:`,
  `ScrollTrigger.create` returns the config objects and the functions that build them. Saves time, not accuracy: a strong
  agent reads minified GSAP code; a weaker one gives up.
- **Which script matters.** `observe_web_execution` during one scroll-through ranks scripts by executed functions: hero.js,
  manifesto.js, portfolio.js run; webflow.js and jQuery barely do. The agent would skip 60% of the code on day one.
- **Interactions.** `inspect_web_event_listeners` on `.portfolio_row`, `[data-portfolio-toggle]`, `.team_card` returns the
  handler source. Today the agent infers the hover cord from recorded effects; with the handler it copies the *rule*.
  This is the one place REA raises accuracy, not only speed.
- **Endpoints.** The form's submit URL and the Turnstile call exist in code but never fired during capture. REA lists them;
  the report's "Not copied" becomes complete.
- **Source maps: zero.** None of our three benchmarks (varsity, resend, nickho) publish maps. Webflow, Framer and most
  production Next/Vite builds don't. Original sources are a bonus on some sites, never the core.

### Verdict and rule

REA is worth keeping **only as plumbing behind one trueclone step with one deliverable**, never as a tool the agent
"may use". The run proved that an optional REA is an unused REA (0 calls in 296). Its web value is real but narrow:
code-level evidence (which code ran, which handler owns which element, which endpoints exist, original sources when
published). Everything visual and stateful we already do better.

Honest position for the README: *trueclone proves the visual and behavioural match on its own; REA adds the code-level
evidence (handlers, executed code, endpoints, original sources). Without it you still get the full proof; with it the
agent copies rules instead of inferring them.* Gate: after Phase 5's ablation, if `understand` saves no time and changes no
score on three sites, REA goes.

### The `understand` step (new)

`npx trueclone understand <name>`: trueclone launches Chrome with `--remote-debugging-port` (we own the browser, as in
every other step), loads the reference, and drives REA for the agent:

1. `list_browser_targets` → `analyze_web_bundle { fetch_source_maps: true }`: vendors, routes, endpoints, maps.
2. `observe_web_execution` while trueclone performs its standard scroll-through and hovers: coverage per script.
3. `inspect_web_event_listeners` for every element the hovers and widgets inventories found interactive.
4. `export_web_scripts` → `analyze_javascript_application` → `trace_javascript_semantics` seeded with every ScrollTrigger
   start/end string, pin distance and easing name from `motion.<vp>.json`.
5. Writes `reference/code.md`: scripts ranked by executed functions; element → handler location + 40-line excerpt;
   config objects found per motion entry; endpoints and routes with "fired / not fired"; source maps found; unknowns.

The skill's Build step reads `code.md` per behaviour. REPORT.md gets a "Code evidence" section. Cost: ~1.5 days.
Per-site cost: 2–4 minutes, run in the background with states/motion/spec. Drawback: REA's listener tool misses delegated
and framework listeners (React/Webflow IX): `code.md` must mark those "unknown" rather than silent.

## Part 2. The plan

Every item: what, why (from the varsity run), cost in my working days, drawback, effect on time per clone.
Targets for the cold re-run at the end: **0 hand edits to seed output, varsity in ≤ 45 minutes, same or better scores.**

### Where the 1h50m went (so we cut the right things)

| Bucket | Minutes | Noise? |
|---|---|---|
| setup, capture, design, seed | 14 | no |
| waiting for 10 score runs | 25 | mostly: 6 of 10 runs re-measured everything to check one number |
| seed defects (integrity, url(), remote images, pin-spacers, parallax) | 15 | yes: tool bugs |
| chasing 94.8 vs 95 (measurement noise) | 30 | yes: tool should have said "unstable" |
| Next defects (types, module script, body styles) | 16 | yes: tool bugs |
| real build work (hero, manifesto, cords, stories, Lenis, nav) | ~40 | no |

Valuable: ~54 minutes. Noise: ~86 minutes. Goal: remove the 86, keep the 54, shorten it with `code.md`.

### Phase 1. Zero hand-edits (A: the 12 package defects). ~2 days

| # | Fix | Why | Cost | Drawback / risk | Time per clone |
|---|---|---|---|---|---|
| 1 | Drop `integrity` and `crossorigin` on any `<link>`/`<script>` whose URL seed rewrote | blocked the stylesheet: layout 81%, page 43,859px; cost 4 min and would stop a weak agent | 0.1 d | none | −4 min |
| 2 | Exact mode: rewrite `url()` in style attributes and custom properties to the local asset; template mode keeps placeholders | `--hero-img` was mangled into broken attributes | 0.2 d | custom-property URLs in CSS resolve per browser; test in Chrome only | −3 min |
| 3 | After capture, walk the mirror for every `src`, `srcset`, `poster`, CSS/inline `url()` and fetch what the HAR missed | lazy, below-fold and conditional images stayed remote (stories, logos, icons) | 0.4 d | more capture time (+10–30 s); srcset picks one candidate per width | −5 min |
| 4 | Strip runtime artefacts from the mirror: unwrap `.pin-spacer`, drop empty `<canvas>`, remove inline `transform/opacity/visibility/will-change` written by animation libraries; mark the rest `data-tc-runtime` | fixed desktop pixel sizes broke phone and tablet; the agent removed them by hand | 0.5 d | heuristic: may strip an inline style the site set itself. Keep a list in `seed.log` so the agent can restore one | −8 min |
| 5 | Reveals recorder: record scrollY per frame; a property that tracks scroll becomes a scrub curve (`reveals` → `scrubs`), replayed by scroll position | parallax replayed as one-shot reveals pulled story cards over the team grid on phones | 0.6 d | curve sampling at ⅓-viewport steps is coarse; interpolate linearly, cap at 20 points | −6 min |
| 6 | Mask via injected stylesheet with `!important` and a frozen animation ticker (GSAP `ticker.sleep`, `cancelAnimationFrame`) instead of inline styles | the hero rewrote inline backgrounds every frame and undid the mask on the reference only | 0.3 d | freezing the ticker changes what "settled" means for sites that keep painting; apply only during the shot | 0 (accuracy) |
| 7 | `next`: emit `custom-elements.d.ts` for every hyphenated tag | `next build` failed on `<code-island>` | 0.1 d | none | −3 min |
| 8 | `next`: copy `type="module"` scripts as modules, resolve their static imports relative to the clone and copy those too | ES-module `cords.js` failed, three.js not copied | 0.3 d | dynamic `import()` with computed paths still needs the agent | −5 min |
| 9 | `next`: collect `<style>` blocks from `<body>` in document order | five blocks dropped; hero 84 px off | 0.1 d | none | −5 min |
| 10 | `next`: omit empty `src`/`href`/`srcset` | 7 console errors on every load | 0.1 d | none | −2 min |
| 11 | `next`: rewrite `url(assets/…)` inside style attributes and custom properties to `/assets/` | 404 on the hero image through the CSS chunk | 0.1 d | none | −1 min |
| 12 | `next`: seeded apps get no gsap/three/lenis/swiper deps; the site's own libraries are already in `public/` | wrong versions installed and unused (3.13 vs 3.15, three 0.128 vs 0.160) | 0.1 d | hand-built path keeps its deps; two dependency lists to maintain | −1 min install |

Phase 1 exit: re-seed varsity from the existing capture; `index.html` needs no edit; the Next app builds first time.

**Phase 1 status (2026-10-13): done**, plus five fixes the varsity re-run forced (all in `seed`/`capture`/`reveals`):
GSAP pins become CSS sticky pins with per-width distances (`data-tc-pin-<width>`), open shadow roots are carried as
declarative shadow DOM, inline styles are captured at all three widths and the differences become media rules
(`data-tc-w`, stacked specificity, no `!important`), the reveals recorder tells curves from reveals by whether motion
happened while the page stood still (and keys curves on the element's viewport position), and a reveal's starting
state is a rule on its mark, so handing an element to `script.js` releases it. Measured on varsity (re-seeded from the
same capture, zero hand edits to seed output): seed alone 98.3 / 91.1 / 89.5 layout (was 66 / 63 / 64); with the
agent's scripts 98.4 / 100 / 97.9 layout, 98.5 / 99.3 / 99.5 states, 100 / 99.2 / 97 detail, 3/3 interactions; the
Next app within half a point of the HTML clone on every check except the two unstable desktop probe groups. resend
and rea-tools re-seeded with the new seed: unchanged at 99.9+ and 100. Two defects found on the way and fixed:
`getHTML()` drops the `<html>` tag (every re-seeded clone lost its font classes) and dropping a canvas buffer size
changes its aspect ratio.

### Phase 2. Boot parity and the load axis (B). ~3 days

| # | Fix | Why | Cost | Drawback / risk | Time per clone |
|---|---|---|---|---|---|
| 13 | `next`: scripts as `<script defer src>` tags in the SSR output, in the clone's order; data blocks inline; no `SiteScripts` loader | ten scripts loaded one after another *after hydration* turned a 50 ms gap into 1–3 s of empty grid cells | 0.5 d | React warns on raw script tags in some setups; use `next/script` `beforeInteractive` for vendors if needed. Hydration must not re-render what the scripts changed (`suppressHydrationWarning` already set) | 0; fixes the flash |
| 14 | **Load check** (`trueclone load`, part of `score`): both pages screenshotted at 0, 250, 500, 1000, 2000 ms after navigation (cold cache, same throttling), compared like layout; also time to first paint and to settled. Target: each frame ≥ layout target −2. REPORT.md gets a "Load" row | the flash is invisible to every current check; a user sees it first | 1 d | needs a deterministic clock: both runs on a fresh context with cache disabled and network throttled to the same profile; sites with random intros will need an "accepted" flag | +40 s per score |
| 15 | Anti-flash contract in seed: the clone gets `html.tc-boot` at parse and `trueclone-reveals.js` removes it when every player has started; seed emits `[data-tc-runtime]` regions hidden until boot when the agent asks (`--hide-until-boot`) | the captured hero skeleton showed because the site's own anti-flash keyed on a state the mirror had already passed | 0.3 d | a wrong selector hides content for good; failsafe reveal at 3 s like the site does | 0 |
| 16 | **Pre-script mirror**: capture the first HTML response and the DOM *before* any script runs (`page.route` blocking scripts, or `document_start` snapshot) alongside the post-script mirror. Seed takes structure from pre-script, content and rich/view-mounted regions from post-script | the root of 4, 5 and the flash: the mirror is a snapshot after scripts and we treat it as source. A Webflow/Framer migration *needs* the pre-script markup | 1.5 d | two mirrors to reconcile; sites that render everything client-side (SPA) have an empty pre-script DOM, so seed must fall back to post-script per region | −10 min on script-heavy sites |

**Phase 2 status (2026-10-13): items 13–15 done; item 16 (pre-script mirror) deferred to last, as planned.**
Boot parity: the Next app preloads every clone script from the first byte and runs them in order the moment hydration
completes (ordered insertion, parallel fetch), instead of one fetch after another after hydration. Boot contract in
the seed: `<html class="tc-boot">` until every script has run and every `tcBoot.hold()` is released; regions named
with `seed --hide-until-boot` stay invisible meanwhile (3 s failsafe). Load check: `trueclone load`, part of the full
score and REPORT.md, settledness curves at 0.25/0.5/1/2/4 s on both sides under the same emulated network with a cold
cache. Measured: rea.tools 99.4–100, resend 98.5–99; varsity HTML clone 56–60 before the contract (the reference stays
blank until its hero image has loaded; the clone showed the captured grid), 97.5 / 84 / 99.8 after it with the
agent's hero holding the boot until its image is ready; the Next app 96 / 99.8 / 96.8, its first frame identical to the
HTML clone's. The tablet 84 is a single late intro start: load curves need the stability pass of Phase 3 (item 17).

### Phase 3. No noise (C: time). ~2.5 days

| # | Fix | Why | Cost | Drawback / risk | Time per clone |
|---|---|---|---|---|---|
| 17 | **Unstable-probe detection**: detail and hovers run every flagged probe twice on the reference; a probe that disagrees with itself is excluded and listed as "unstable (random motion / hover timing)" | 30 minutes on 94.8 vs 95 that was chip drift and a hover race | 0.5 d | doubles reference time for flagged probes only (cached afterwards); a genuinely flaky clone bug could hide behind "unstable" — list them, never silently drop | −30 min on sites with random motion |
| 18 | **Incremental scoring**: `score` hashes `clone/` per check's inputs and skips checks whose inputs and reference cache are unchanged; `--only detail --viewport desktop` and `--section <y>` | 6 of 10 score runs re-measured everything to check one number: ~15 min | 0.6 d | wrong invalidation = stale score; hash all of `clone/` for safety, skip only when nothing changed since that check's last run | −15 min |
| 19 | `trueclone explain <name> <check> [<y>|<selector>]`: side-by-side crops of reference and clone at that point, the probe values, and the reference's matching CSS rules in one output | the agent used 80 browser calls and 76 JS evaluations to look at things the tool already knew | 0.5 d | more output to maintain | −10 min |
| 20 | Score runs show a budget line (`detail 37 s, hovers 55 s …`) and `REPORT.md` records total scoring time; the skill tells the agent to use `--only` after the first full run | time is invisible today, so nobody optimises it | 0.2 d | none | −5 min |
| 21 | `clone/patches/*.{html,css,js}` applied by seed after generation (string or selector patches), so re-seeding never loses a fix and `index.html` is never edited by hand | 14 hand edits to a generated file; a re-seed would have erased all of them | 0.4 d | one more concept in the skill; patches can go stale after a recapture: seed reports which patch did not apply | −5 min, and makes re-seed safe |
| 22 | `rules` and `textshape` accept `--clone`; `rules` prints the clone's rule too, with the diff highlighted | the agent compared rules by eye across two runs | 0.3 d | none | −3 min |

### Phase 4. The skill as a contract (C/D). ~1.5 days

| # | Fix | Why | Cost | Drawback / risk |
|---|---|---|---|---|
| 23 | Required `notes.md` sections with a template seed writes: Stack, Behaviours, Own-code map (file → behaviours → parameters source), Findings (tool defects: symptom, cause, workaround), **Accepted differences** (what, why it cannot or should not match, evidence), Unknowns | the varsity agent produced all of this unprompted; a weaker one won't. Accepted differences turn "gaps" into decisions (D) | 0.3 d | more to read; keep each section ≤ 15 lines |
| 24 | `report` reads `notes.md`: Accepted differences and Findings appear in REPORT.md; a score below target with an accepted entry is marked "accepted", not "below" | the final verdict should reflect decisions, not only numbers | 0.3 d | an agent could "accept" its way to a pass: accepted entries need a reason and are listed first in the report |
| 25 | Skill rules: never edit seed output (use `patches/`); first full score then `--only`; stop chasing a check marked unstable; when `code.md` has the handler, copy the rule, not the effect; REA is never called directly (the `understand` step does it) | each rule removes one noise bucket from the run | 0.3 d | the skill grows; keep the step list on one screen, details in sections |
| 26 | `understand` step wired in (Part 1), `code.md` consumed in Build, "Code evidence" in the report | 0 REA calls in 296; the understand phase was curl and grep | 1.5 d (in Part 1) | REA version churn: pin `rea-agents` exactly, test `understand` in CI against rea.tools |
| 27 | Exact mode: a "post-boot" pass after seed compares the clone's DOM after its own scripts ran with the post-script mirror and lists regions that differ (the hero grid, the stories island) so the agent knows which runtime-built regions it still owns | the agent discovered the shadow-root stories and the rebuilt hero by scoring, not by being told | 0.5 d | needs the clone's scripts to exist; runs again after each build round |

### Phase 5. Prove it and ship 0.3.0. ~1 day plus the cold runs

1. **Cold re-run of varsity**: fresh folder, `npx @trueclone/cli@0.3.0 init`, a fresh agent, the same one-line prompt.
   Measure: hand edits to seed output (target 0), wall-clock (target ≤ 45 min), scores (≥ 0.2's), load check pass,
   zero console errors in the Next app.
2. **Ablation**: the same run with `understand` disabled (`--no-rea`). Report time and score deltas in the README's REA
   section. This is the "stand-alone stats" you asked for, and the gate on keeping REA.
3. **A Framer site** as the fourth benchmark (the biggest "move my site to Next.js" audience), template mode, cold.
4. README Proof tables updated with varsity (exact, Webflow + GSAP + three.js) and the Framer site; a "Load" row.
5. `npm version minor`, tag, publish, release notes = this document's item list.

### Phase 6. The site-kind benchmark matrix (after every other phase). ~5 days plus runs

The product claims "any website". The proof is a table, by kind of site, with real scores, in the README. Kinds are
defined by what makes a site hard to clone, not by industry. Starting taxonomy (to be researched and refined before the
runs; two public sites per kind, template mode unless owned, cold runs with a fresh agent and the published package):

| Kind | What makes it hard | Probe we have |
|---|---|---|
| Static brochure (plain HTML/CSS, a few images) | nothing: the floor; must be 100 | – |
| Tailwind / Next.js marketing page | compiled utility CSS, view-mounted components, tabs, code samples | resend |
| Webflow (IX2 interactions) | Webflow's own animation runtime, CMS lists, lightboxes | – |
| Webflow + custom GSAP engine | pins, scrubs, smooth scroll, three.js, code islands | varsity |
| Framer | React runtime, variants, scroll effects, breakpoints as components | – |
| Wix / Squarespace / WordPress + Elementor | heavy generated markup, lazy everything, sliders | – |
| GSAP + ScrollTrigger + Lenis agency showcase | 50+ scroll triggers, SplitText, Swiper, cursor followers | nickho |
| WebGL / three.js / shader hero | canvas drawing, shaders, pointer-driven scenes | varsity (cords), rea.tools (game) |
| Lottie / Rive / video-background hero | animation files, HLS/H.264, autoplay rules | – |
| Content-heavy docs / blog | long pages, code blocks, tables of contents, search, sticky sidebars | rea.tools |
| E-commerce product page (Shopify and alike) | variants, galleries, carts (server), reviews widgets | – |
| App landing with client-side routing (SPA) | empty first HTML, hydration, routes, API-driven content | – |
| Horizontal-scroll / scroll-jacking (Locomotive, fullPage) | transform-based scrolling, sections as slides | – |
| Page-transition portfolios (Barba, Swup, view transitions) | multi-page, shared layout, transitions | – |
| Dark/light theme switchers and i18n/RTL | theme state, `dir=rtl`, font fallbacks | – |
| Embed-heavy pages (YouTube, maps, forms, iframes) | third-party iframes, consent, lazy embeds | – |
| Marquee / loop / particle heavy | continuous motion that never settles | – |
| Cookie-banner and popup-first pages | overlays at load, `--hide`, scroll locks | – |

For each kind: run, record every score and the time, fix what fails **generally** (never for the one site), re-run
every probe, then publish the kind's row in the README with the scores and the known limits. A kind the tool can't do
yet is listed as such with the reason, not hidden.

### Order and total

Phase 1 (2 d) → Phase 2 items 13–15 (1.8 d) → Phase 3 (2.5 d) → Phase 4 incl. `understand` (3 d) → Phase 2 item 16,
pre-script mirror (1.5 d) → Phase 5. About 11 working days. Item 16 is last on purpose: it is the biggest change and
every earlier item is still right without it.

### What this buys, in one line each

- A stranger's run with zero hand edits to generated files and no 2-hour detours.
- The Next app boots like the HTML clone; the load sequence is a scored axis, so "it flashes" becomes a number.
- Scores that distinguish a gap from noise, and tell you which it is.
- REA with a deliverable and a kill switch, measured by ablation instead of kept for the name.
- A report that records decisions (accepted differences, findings), not only numbers.
