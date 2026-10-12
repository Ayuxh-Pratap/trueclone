---
name: clone-site
description: Rebuild a website's frontend from its URL in this lab (HTML/CSS/JS), derive its design system (DESIGN.md + shadcn globals.css), and prove the match with layout, state and visual scores at mobile, tablet and desktop widths. Use when the user gives a URL and asks to clone, replicate or rebuild a site or page.
---

# Clone a site from a URL

The output for `sites/<name>/` (everything here is gitignored and stays local):
- `clone/`: plain HTML/CSS/JS. A Next.js + Tailwind + shadcn build mode comes later, once the HTML is right.
- `design-tokens.json`: the **one canonical source** of the design system.
- `DESIGN.md` (Google design.md format, linted), `globals.css` (shadcn theme) and `clone/tokens.css`, all generated from the tokens file.
- `notes.md`: stack, motion inventory, known gaps.

## 0. Pick the mode

| Mode | Use it when | Content in the clone |
|---|---|---|
| `template` (default) | Anyone else's site: learning, layout study, a starting template | Placeholder brand, text, images and logos; score with `--structure` |
| `exact` | The user owns the site or is authorised to copy it (for example a client migration) | The site's own text and media |

Exact mode refuses to run without `--permission "<who authorised it>"`, and the value is recorded in `meta.json`. Never use exact mode on a site the user doesn't own or have permission for. If permission is unclear, ask.

## 1. Capture

```powershell
npm run capture -- <url> [name] [--hide "<cookie banner / popup selectors>"] [--mode exact --permission "<owner>"]
npm run states -- <name>      # live scroll states + motion inventory (animations running)
npm run spec -- <name>        # measured boxes and styles per viewport (text as length only)
npm run motion -- <name>      # animation runtime: ScrollTriggers, timelines, reveals, cursor tweens, loops, Lenis/Swiper
```

`reference/` then holds:
- full-page PNGs and their `*.mask.png` structure versions, `sections.json` and `rendered.html`;
- `tokens.json` (colours, type, radii, CSS variables), `assets/` with `manifest.json`, and `desktop.har`;
- **`states/<vp>/NN.png`**: what a visitor sees at every half-viewport scroll step, after motion settles;
- **`states/<vp>.summary.json`** (the motion inventory): `reveals` (hidden until scrolled to), `animated` (opacity, transform, clip-path or filter changes), `parallax` (speed ≠ 1), `pinned` (speed 0) and `fixed`;
- in exact mode, `mirror/index.html`: a static, script-free local snapshot with assets rewritten to local copies.

- **`motion.<vp>.md`** (from `npm run motion`): the exact animation recipe when the site uses GSAP/ScrollTrigger, Lenis, Swiper or CSS animations: trigger, start/end, scrub, pin, the properties and ranges, duration, easing, stagger, and the reveals created in scroll callbacks. Rebuild these with the same public libraries and these numbers, in your own code.

Read the motion inventory before building. Each entry is a behaviour the clone must have. A single top-of-page screenshot misses all of it: text hidden until scrolled to, fixed elements, pinned sections and parallax.

If the page is blank or blocked, re-capture through the lab Chrome (`npm run chrome`, then `--cdp`). Never try to get past bot checks, logins or paywalls.

## 2. Understand it with REA

Open the URL in the lab Chrome (`npm run chrome -- -Url <url>`) and use the REA MCP tools (or `npm run rea -- <command>`):
- `inspect_web_page`: DOM, scripts, resources.
- `analyze_web_bundle` with source maps: framework and vendors (GSAP, ScrollTrigger, Lenis, Swiper, Webflow IX2, three.js…).
- `inspect_web_event_listeners`: hover, drag, wheel and click logic.

Write `notes.md`: stack, breakpoints, and the motion inventory turned into a list of behaviours (what triggers it, which property, what range).

## 3. Design system

```powershell
npm run design -- <name>              # drafts design-tokens.json if missing, then renders DESIGN.md, globals.css, clone/tokens.css + lints
npm run design -- <name> --redraft    # fresh draft in design-tokens.draft.json (never overwrites your edits)
```

Review the draft: role names, the `notes` prose (overview, do's and don'ts) and anything marked `origin: generated`, meaning not in the source (for example `error` and the chart colours). Re-run after every edit. `DESIGN.md` must lint with **0 errors**.

## 4. Build (`clone/`)

**Exact mode starts from the mirror:** `npm run seed -- <name>` copies the script-free mirror into `clone/`, with the site's markup, text, stylesheets and media at local paths. Then write `clone/script.js`: every interaction in your own code, using the parameters you read from the reference scripts (timings, physics constants, offsets, breakpoints). Never copy the site's scripts. JS-set initial states, such as a `<details>` closed on phones, are part of the layout, so check every viewport. Media the page fetches live (a star count, a feed) stays as captured; no requests to third parties.

**Template mode builds from scratch:**

- `styles.css` starts with `@import url("tokens.css");` and uses its variables. Never hard-code a token value.
- Use the site's breakpoints and root font-size behaviour (in `design-tokens.json`, under `layout`).
- Build top to bottom, one section at a time, matching `sections.json` heights. Take structure and copy from `rendered.html`. In template mode write your own placeholder words, then run `npm run textshape -- <name> --write` (desktop, then `--viewport tablet` and `mobile`). It swaps each placeholder word for a lorem word of the reference word's rendered width, so lines break where the reference's break. Use `--list "<ref row>" "<clone row>"` for repeated lists (calendar rows, cards), and give every data row its own placeholder text.
- **Copy the reference's CSS mechanism, not its look.** Before writing CSS for an element, run `npm run rules -- <name> "<selector>"` and port the matching rules (with their `@media`). Look-alikes drift in flex/grid. For example, a "capsize" `::before/::after` text trim is not `text-box-trim`, `height: 14.5rem` is not `flex: 1`, and `width: 100%; max-width: 40rem` with default flex shrink is not `flex: 0 10 auto` or `width: min-content`.
- **Positional selectors:** `:nth-of-type` counts siblings of the same tag only. A logo `<a>` before the column `<div>`s shifts every column by one, so use `:nth-child` or a class.
- **Stacked media:** keep every layer (colour, grayscale or depth-map images, overlays). Never flatten them into one image.
- **Canvas/WebGL heroes:** a site can draw its hero on a `<canvas>` (three.js depth or colour shaders), with the DOM images used only as textures. The structure mask treats canvases as grey media boxes, like images.
- **Motion:** implement every inventory entry: reveals, parallax speeds, pinned sections, fixed elements. Canvas/WebGL: rebuild it with the captured models (exact mode) or a placeholder scene. Never drop it silently.
- **Interactions:** drag and swipe on sliders, hover states, cursor followers, menus, counters. Scope query selectors to their own component: a hidden duplicate (for example a mobile-only list) must never feed a desktop counter.
- **Sliders in flex/grid:** give the slider and every flex/grid ancestor `min-width: 0`. Otherwise the slider (Swiper and similar) grows to fit its slides, re-measures and runs away. It only shows after scrolling or resizing, so always run `states --clone`, which warns when the clone's page height drifts more than 20%.
- `<meta name="robots" content="noindex">`, forms submit nowhere, no tracking scripts.

## 5. Verify: four scores

```powershell
npm run diff -- <name> [--structure]            # 1 layout: full page, frozen (structure = text and media masked)
npm run states -- <name> --clone [--structure]  # 2 states: the reference's scroll positions replayed on the clone
npm run curves -- <name> --draft                # write motion-map.draft.json, fill in clone selectors, save as motion-map.json
npm run curves -- <name>                        # 3 motion: property curves (scroll-driven and time-driven), reference vs clone
npm run interact -- <name> --draft              # write interactions.draft.json, fill in TODOs, save as interactions.json
npm run interact -- <name>                      # 4 interaction: hover/drag/click scenarios, screenshots + expectChange
npm run spec -- <name> --clone                  # compare section heights when the layout drifts
```

Day to day, run them all with `npm run score -- <name> --quick` (layout, desktop states, interactions) while building, and `npm run score -- <name>` for a full checkpoint. Reference results are cached, so only the clone is re-measured. Steps run in parallel groups; add `--serial` if a score looks flaky under load.

Fix in this order: page height drift, then the worst layout section, the worst state step, the lowest motion curve, and any interaction marked FAIL. The curve output says what's wrong (for example "ref -19..19 vs clone -38..0" means a double offset). Fix the cause; never tune numbers to the score.

Done when layout ≥ 98% at every viewport, states are within 5 points of layout, motion ≥ 95%, and every interaction passes its expectChange. Otherwise stop after 8 passes and report what's left and why.

## 6. Detail pass

```powershell
npm run detail -- <name> --viewport all   # computed-style diff at matching page positions
npm run hovers -- <name>                  # hover effects present on the reference but missing on the clone
```

Fix every real finding (for example "buttons are 1.15rem on phones": a rule you won't see by eye). For each drift, compare the element's ancestor boxes on both sides until one differs, then `npm run rules` that ancestor. The cause is usually one declaration.

How detail measures:
- It runs with motion on. Many originals ignore `prefers-reduced-motion`, and a clone that honours it lays out differently.
- It measures both sides the same way: a hit test at the same point and scroll position. Sticky and pinned content is compared in place, inline `<strong>`/`<mark>` spans count on both sides, and an identical page scores 100%.
- It hit-tests through `pointer-events: none` overlays.
- It skips content the browser doesn't paint, such as closed `<details>` (`checkVisibility()`). Colours written by scroll-scrubbed JS show up as in-between values; that is a motion difference, so check the motion inventory rather than the CSS.

The live site can change after capture (a redeploy changes its CSS bundle name). When live-site tools (detail, rules) and screenshot-based scores (layout, states) disagree about a section, re-capture (`npm run capture`, then `npm run states -- <name>`), which also resets every cached reference measurement.

## 7. Next.js mode (after the HTML clone passes)

```powershell
npm run next -- <name> --verify   # generates sites/<name>/next, installs, builds, serves, and runs layout/states/curves/interact on it
```

The HTML clone stays the source of truth: change `clone/`, then regenerate. The generated app has one component per section, the motion script as a client component (GSAP, Lenis, Swiper and three from npm at the clone's versions), `app/globals.css` = the shadcn theme from `design-tokens.json` + tokens + the clone's stylesheet + preflight parity, and `components.json` so `npx shadcn add <component>` works. It is done when its scores match the HTML clone's within a point.

## 8. Report

A table per viewport (layout %, state %, plus visual % in exact mode), the motion score with the weakest curves, the interaction results, the motion inventory with each entry marked done or missing, the interactions implemented, and the known gaps.

## Honest limits

- A live site is never pixel-identical twice: rotating content, A/B tests and font hinting all vary.
- Motion is scored by state screenshots today. Curve-level motion scoring, interaction tests and WebGL capture come next.
- Backends are out of scope: login, search, checkout and CMS data are mocked.
- Template clones of other people's sites stay local. Exact clones need recorded permission and also stay local unless the owner deploys them.
