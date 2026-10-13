---
name: trueclone
description: Build a working twin of a website from its URL - HTML/CSS/JS clone, Next.js + Tailwind + shadcn app, DESIGN.md and shadcn globals.css - and prove the match with layout, scroll-state, motion, interaction, hover and style scores at mobile, tablet and desktop widths. Use when the user gives a URL and asks to clone, replicate, rebuild or migrate a site or page, or to extract its design system.
---

# Build a true clone of a website

Everything for a site lives in `sites/<name>/` (gitignored, stays local):
- `clone/`: plain HTML/CSS/JS, the source of truth.
- `next/`: the same site as a Next.js + Tailwind v4 + shadcn app, generated from `clone/`.
- `design-tokens.json`: the **one canonical source** of the design system, rendered to `DESIGN.md` (Google design.md format, linted), `globals.css` (shadcn theme) and `clone/tokens.css`.
- `REPORT.md`: every score against its target, what to fix first, what was not copied. This is the deliverable.
- `notes.md`: your record, written by the seed with fixed sections; `REPORT.md` reads Findings and Accepted differences from it (see 2).

Run every step as `npx trueclone <step> <name>` from the project folder (`npx trueclone help` lists them).

## 0. Pick the mode

| Mode | Use it when | Content in the clone |
|---|---|---|
| `template` (default) | Anyone else's site: learning, layout study, a starting template | Placeholder brand, text, images and logos; scored with `--structure` |
| `exact` | The user owns the site or is authorised to copy it (a client migration, their own Webflow/Framer/WordPress site) | The site's own text and media |

Exact mode refuses to run without `--permission "<who authorised it>"`, and the value is recorded in `meta.json` and in `REPORT.md`. Never use exact mode on a site the user doesn't own or have permission for. If permission is unclear, ask.

## 1. Capture

```powershell
npx trueclone capture <url> [name] [--hide "<cookie banner / popup selectors>"] [--mode exact --permission "<owner>"]
npx trueclone states <name>      # live scroll states + motion inventory (animations running)
npx trueclone motion <name>      # animation runtime: ScrollTriggers, timelines, reveals, cursor tweens, loops, Lenis/Swiper, CSS
npx trueclone spec <name>        # measured boxes and styles per viewport
npx trueclone understand <name>  # code evidence with REA: which scripts ran, each control's handler with its source -> code.md
```

`states`, `motion`, `spec` and `understand` only read the reference: run them together in the background while you read the capture.

`npx trueclone <url> [name]` is a shortcut for capture + design-system draft.

`reference/` then holds:
- full-page PNGs and their `*.mask.png` structure versions, `sections.json` and `rendered.html`;
- `tokens.json` (colours, type, radii, CSS variables), `assets/` with `manifest.json`, and `desktop.har` (every request, including the data/API calls);
- **`states/<vp>/NN.png`**: what a visitor sees at every half-viewport scroll step, after motion settles;
- **`states/<vp>.summary.json`** (the motion inventory): `reveals`, `animated`, `parallax`, `pinned` and `fixed` elements;
- **`motion.<vp>.md`**: the exact animation recipe when the site uses GSAP/ScrollTrigger, Lenis, Swiper or CSS animations: trigger, start/end, scrub, pin, properties and ranges, duration, easing, stagger. Rebuild these with the same public libraries and these numbers, in your own code;
- in exact mode, `mirror/index.html`: a script-free local snapshot with assets rewritten to local copies.

Read the motion inventory before building. Each entry is a behaviour the clone must have.

If the page is blank or blocked, capture through your own Chrome over CDP (`chrome --remote-debugging-port=9222 --user-data-dir=.chrome-profile`, then `--cdp`). Never try to get past bot checks, logins or paywalls.

## 2. Understand it

```powershell
npx trueclone understand <name>   # code evidence with REA -> reference/code.md (2-4 min; run it with states/motion/spec)
```

The capture says what the page looks like and does; `code.md` says **which code does it**. trueclone owns the browser and drives REA (Reverse Engineer Anything, bundled) for you; you never call REA directly for this. `code.md` has:
- the scripts ranked by how much of them ran while scrolling the page and hovering its controls: a script with nothing that ran is not needed for what you are rebuilding;
- every interactive element's handler, with the original code around it (`click → engine.js:412` and the twenty lines there), plus the delegated handlers on `body`/`html`: **read the rule, write your own**. When `code.md` has the handler, copy the rule (its constants, its conditions), never guess it from recorded effects;
- the endpoints that exist in the code, fired during the capture or not (a form's POST, a filter's fetch): they go into the report's "Not copied";
- original sources when the site publishes source maps (most don't);
- what REA could not see (delegated handlers through a framework, minified names) under Unknowns.

For the part no capture or listener reaches (a bundled physics rule, a shader, a module's data flow), REA's own CLI is one command away: `npx trueclone rea --help`. Record what you learn in `notes.md` under Behaviours and Unknowns.

**`notes.md` is a contract**, not a diary. The seed writes it with six sections, and `REPORT.md` reads two of them back:
- Stack, Behaviours (one line per motion entry and interaction: element, trigger, property, range, timing), Own-code map (file → behaviours → where each parameter came from), Unknowns;
- **Findings**: defects in the tool you met (symptom, cause, workaround). They appear in `REPORT.md` and are how the tool gets fixed;
- **Accepted differences**: what cannot or should not match, one per line with the why (`detail desktop hero chips: random walk on both sides`). A check below target that is covered by an entry naming it (and its width) is marked "accepted" in `REPORT.md` instead of "below target". Every entry needs a reason that would convince the site's owner; an entry without one is a gap you are hiding.

## 3. Design system

```powershell
npx trueclone design <name>              # drafts design-tokens.json if missing, renders DESIGN.md, globals.css, clone/tokens.css + lints
npx trueclone design <name> --redraft    # fresh draft in design-tokens.draft.json (never overwrites your edits)
```

Review the draft: role names, the `notes` prose (overview, do's and don'ts), anything marked `origin: generated`. Re-run after every edit. `DESIGN.md` must lint with **0 errors**.

## 4. Build (`clone/`)

**Start every clone from the mirror** (both modes):

```powershell
npx trueclone reveals <name>   # records, at all three widths: scroll reveals frame by frame, scroll-linked curves (parallax), pins, class changes
npx trueclone widgets <name>   # clicks every tab and menu and records each state (they often aren't in the page until clicked)
npx trueclone seed <name>      # clone/ from the script-free mirror; replays what reveals and widgets recorded
```

- **Exact mode:** the site's own markup, text, stylesheets and media at local paths. The mirror fetches media the capture never saw (lazy images, hover and state images, fonts behind `@import`), so nothing points at the site.
- **Template mode:** the same markup and stylesheets, but every text becomes lorem words of the same laid-out width (lines break where the reference's break), every image, video, large SVG and iframe a same-size placeholder, CSS backgrounds a transparent one, every link `#`, brand metadata and tracking hints dropped. No text or media of the site ends up in `clone/`; fonts stay for local study (swap licensed fonts before reusing the result).
- **Recorded behaviour comes with it:** one-shot scroll reveals replay their measured curve (delay, duration, easing, spring overshoot) with the Web Animations API; scroll-linked curves (parallax, a scrubbed fade) follow the scroll position through the recorded samples; scroll class changes (a header that gets its backdrop past 12px) toggle the same classes at the same point. Every record exists per width, and the player uses the visitor's width, so phone offsets are never desktop pixels. All of it lives in `clone/trueclone-reveals.js`; don't rewrite it by hand. When your own script must drive an element the player also drives (a hero scene you rebuild whole), hand it over: `el.removeAttribute('data-tc-reveal')` / `'data-tc-scrub'` / `'data-tc-class'` at the start of `script.js`; the player leaves it alone and its recorded starting state (a stylesheet rule on the mark) goes with the mark. Never let both run on one element.
- **Runtime artefacts are cleaned:** the mirror is a snapshot taken after the site's scripts ran. The seed turns every GSAP pin into its CSS equivalent, a `position: sticky; top: 0` element inside a spacer whose padding is the pin distance (`[data-tc-pin-spacer]` around `[data-tc-runtime="pin"][data-tc-pin="<px>"]`), so layout and scroll states hold with no script. Animate inside it as it is; if you must recreate the pin with ScrollTrigger (`pin: true`), unwrap the spacer and clear the sticky style first, or the page gets both. `reveals` lists transform-driven pins with their start and end positions. Every `<canvas>` is marked `data-tc-runtime="canvas"` (its buffer size is dropped when CSS sizes it; your scene sets it). Regions a script builds at runtime (a grid a hero script assembles) are captured in their built state: your script owns them, so rebuild them from the captured markup rather than beside it.
- **Per-width values come with it:** the capture reads every inline style at all three widths. What a script set differently per width (a container's computed height, a card's offset, a custom property, a pin distance) becomes a media-query rule on `[data-tc-w]` elements (`<style id="tc-width-styles">`), and a pin whose distance changes per width carries `data-tc-pin-desktop/tablet/mobile`. Open shadow roots (web components, a Webflow code island) are carried as declarative shadow DOM (`<template shadowrootmode="open">` inside the host), so they render with no script.
- **Recorded widgets come with it too** (template mode): every tab set and expandable menu, with each state the original showed after a click, placeholdered like the page. `clone/trueclone-widgets.js` swaps the region on click (menus in a header or nav also on hover). Popovers rendered in a portal (comboboxes, tooltips) are listed as not replayed: build those in `script.js`. In interaction scenarios, `selector@n` picks the n-th match in `at`, `click` and `expectChange`; mind hidden duplicates (a mobile menu button is often the first match).

**Never edit `clone/index.html` by hand.** It is seed output and every re-seed rewrites it. Anything a clone needs on top of the seed goes in `clone/patches/`, applied by the seed in name order: `head-*.html` before `</head>`, `*.css` linked before `</head>` (after the site's stylesheets), `body-*.html` before the clone's own `<script src="script.js">` (vendored libraries, a hand-over prelude), `*.js` as a deferred script before `script.js`. A fix that needs the generated markup to change is a missing seed feature: report it in `notes.md` under Findings.

Then write `clone/script.js`: every remaining interaction in your own code, using the parameters you read from the reference (timings, physics constants, offsets, breakpoints). Never copy the site's scripts. JS-set initial states, such as a `<details>` closed on phones, are part of the layout, so check every viewport. Data the page fetches live (a star count, a feed) stays as captured; no requests to third parties.

A seed is where layout ends up at 99%+ with zero hand-written CSS; your work is behaviour. Build by hand (below) only what the mirror can't carry.

After each build round, `npx trueclone owned <name>` lists the sections your script rebuilds at boot (the clone loaded with scripts blocked vs running). Those are yours: hand their marks over to `script.js` and hide them until boot if the original hides them too. Everything else stays with the seed's players.

**Building parts by hand:**

- `styles.css` starts with `@import url("tokens.css");` and uses its variables. Never hard-code a token value.
- Use the site's breakpoints and root font-size behaviour (in `design-tokens.json`, under `layout`).
- Match `sections.json` heights. In template mode write your own placeholder words, then run `npx trueclone textshape <name> --write` (desktop, then `--viewport tablet` and `mobile`) so lines break where the reference's break. Use `--list "<ref row>" "<clone row>"` for repeated lists (calendar rows, cards), and give every data row its own placeholder text.

**Both modes:**

- **Copy the reference's CSS mechanism, not its look.** Before writing CSS for an element, run `npx trueclone rules <name> "<selector>"` and port the matching rules (with their `@media`). Look-alikes drift in flex/grid: a "capsize" `::before/::after` text trim is not `text-box-trim`, `height: 14.5rem` is not `flex: 1`, and `width: 100%; max-width: 40rem` with default flex shrink is not `flex: 0 10 auto` or `width: min-content`.
- **Positional selectors:** `:nth-of-type` counts siblings of the same tag only. A logo `<a>` before the column `<div>`s shifts every column by one, so use `:nth-child` or a class.
- **Stacked media:** keep every layer (colour, grayscale or depth-map images, overlays). Never flatten them into one image.
- **Canvas/WebGL:** a site can draw its hero or a game on a `<canvas>`. Rebuild the drawing in your own code with the reference's parameters (exact mode) or a placeholder scene. Never drop it silently.
- **Motion:** implement every inventory entry: reveals, parallax speeds, pinned sections, fixed elements.
- **Interactions:** sliders, tabs, hover states, cursor followers, menus, counters, demos. Scope query selectors to their own component: a hidden duplicate (a mobile-only list) must never feed a desktop counter.
- **Sliders in flex/grid:** give the slider and every flex/grid ancestor `min-width: 0`, or Swiper and similar grow to fit their slides and run away. `states --clone` warns when the page height drifts more than 20%.
- `<meta name="robots" content="noindex">`, forms submit nowhere, no tracking scripts.

## 5. Verify

```powershell
npx trueclone score <name> --quick   # layout, desktop states, interactions: the loop while building (about a minute)
npx trueclone score <name>           # everything, in parallel groups, then REPORT.md
npx trueclone score <name> --only detail,load --viewport desktop   # after a fix: just the checks it can move, at that width
npx trueclone explain <name> <y>     # one place on the page: what every check saw there + a reference|clone|diff crop
```

The steps, if you need one alone:

```powershell
npx trueclone diff <name> [--structure]            # layout: full page, frozen (structure = text and media masked)
npx trueclone states <name> --clone [--structure]  # scroll states: the reference's scroll positions replayed on the clone
npx trueclone curves <name> --draft                # motion-map.draft.json from the inventory: fill in clone selectors, save as motion-map.json
npx trueclone curves <name> [--viewport tablet]    # motion: property curves (scroll- and time-driven), reference vs clone
npx trueclone interact <name> --draft              # interactions.draft.json: fill in TODOs, save as interactions.json
npx trueclone interact <name>                      # interactions: click/hover/drag/key scenarios + expectChange (geometry, text, state attributes, canvas pixels)
npx trueclone detail <name> --viewport all         # styles at matching points: font, size, weight, line height, colour, boxes
npx trueclone hovers <name>                        # hover effects present on the reference but missing on the clone
npx trueclone load <name>                          # load sequence: how settled each side is 0.25-4 s after navigation (cold cache, same network)
```

Reference measurements are cached until the next capture, so only the clone is re-measured. Sites without scroll/time motion or without interactions simply skip those steps.

**Spend scoring time only on what changed.** The first run is a full `score`. After a fix, re-run only the checks it can move, at the width it concerns: `npx trueclone score <name> --only layout,detail --viewport tablet`. A check whose inputs (the clone's files, the capture) have not changed since its last run is reported from that run and not re-measured (`--fresh` forces it). `REPORT.md` shows where the scoring time went. To understand one gap, run `npx trueclone explain <name> <y or "section label"> --viewport <vp>`: it prints what layout, states, detail and hovers saw there and writes a reference | clone | diff crop, so you read the tool's data instead of re-measuring with a browser.

**Unstable probes are not your gaps.** Detail probes and hover effects are read twice on the reference; what does not agree with itself (random motion, a hover that lands by timing, a rotating word) is listed as unstable and excluded from the score. The load check reports its own noise (±). Do not chase a number inside the noise: a gap of 0.3 on a check with ±1 noise is not a gap.

Fix in this order: page height drift, the worst layout section, the worst state step, the lowest motion curve, any interaction marked FAIL, the load sequence, then detail and hovers. `REPORT.md` lists them under "Fix first". For a drift, compare the element's ancestor boxes on both sides until one differs, then `rules` that ancestor: the cause is usually one declaration. Fix the cause; never tune numbers to the score.

**Done when:** layout ≥ 98% at every viewport, states within 5 points of layout, motion ≥ 95%, detail ≥ 95%, hovers ≥ 90%, load ≥ 95%, and every interaction passes. Otherwise stop after 8 passes and report what's left and why.

**The load sequence is scored too.** A visitor's first impression is the load, so both pages are photographed 0.25 to 4 s after navigation and compared with their own settled frame. A clone that paints a captured, pre-script state (a hero grid a script builds, a card layout a script places) until its scripts run shows a gap here that no other check sees. The seed's boot contract handles it: `<html class="tc-boot">` from the first byte until the clone's scripts have run and every hold is released; elements marked `data-tc-boot-hide` stay invisible meanwhile (3 s failsafe). Pass the regions your script builds at boot to the seed: `npx trueclone seed <name> --hide-until-boot "<selectors>"`. If your script needs more than "has run" (an intro that waits for its image), call `tcBoot.hold()` at the top of `script.js` and `tcBoot.release()` when the first frame is ready. Hide only what the original also does not show before its scripts run (its first frames are in `reference/load/`); hiding more than the original hides is a gap of its own.

How detail measures, so you can trust it:
- motion on (many originals ignore `prefers-reduced-motion`, and a clone that honours it lays out differently);
- both sides measured the same way: a hit test at the same point and scroll position, so sticky and pinned content is compared in place and an identical page scores 100%;
- through `pointer-events: none` overlays, and never on content the browser doesn't paint (closed `<details>`);
- colours written by scroll-scrubbed JS show up as in-between values: that is a motion difference, so check the motion inventory.

How layout and states measure:
- the structure mask hides text everywhere, gradient text (`background-clip: text`) and `::before/::after` photo backgrounds included;
- content that a component mounts only while in view (marked `data-tc-viewmount` by capture) can't appear in a full-page still on either side: layout paints its box the same on both and reports the count; the scroll-state check, with a real viewport, scores it;
- endless animations (marquees, rotating borders) are frozen on their first frame on both sides before every state screenshot: their phase depends on load time, not on the clone.

The live site can change after capture (a redeploy, a new nav item, a rotating headline). Every full score starts with `drift`: the live page's height and sections against the capture's. When it reports a change, `REPORT.md` marks detail, hovers, motion, interactions and load **stale capture**: they now measure a page the clone was never a copy of. Re-capture (`capture`, then `states`, `reveals`, `seed --force`) before reading them; never fix the clone against a stale reference.

## 6. Next.js (after the HTML clone passes)

```powershell
npx trueclone next <name> --verify   # generates sites/<name>/next, installs, builds, serves, and runs every score on it
```

The HTML clone stays the source of truth: change `clone/`, then regenerate. The app has one component per section, the motion script as a client component (GSAP, Lenis, Swiper and three from npm at the clone's versions), `app/globals.css` = shadcn theme + tokens + the clone's stylesheet + preflight parity, and `components.json` so `npx shadcn add <component>` works. It is done when its scores match the HTML clone's within a point.

## 7. Report

`npx trueclone score <name>` writes `REPORT.md` (or run `npx trueclone report <name>`): mode and permission, every score against its target, "Fix first", the motion found on the reference, and what was not copied (server behaviour, tracking, and each data/API call the reference makes). Hand it over with the clone.

## Honest limits

- Server-side behaviour is never visible from outside: databases, accounts, payments, search. The clone reproduces the client; data calls are listed in the report.
- A live site is never pixel-identical twice: rotating content, A/B tests and font hinting vary.
- Template clones of other people's sites stay local. Exact clones need recorded permission and also stay local unless the owner deploys them.
