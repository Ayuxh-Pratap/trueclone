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
- `notes.md`: your notes: stack, motion inventory, decisions, known gaps.

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
```

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

## 2. Understand it with REA

trueclone bundles REA (Reverse Engineer Anything). `npx @trueclone/cli init` registers it as an MCP server; without MCP, run `npx trueclone rea <command>`. With the page open in your CDP Chrome:
- `inspect_web_page`: DOM, scripts, resources.
- `analyze_web_bundle` with source maps: framework, vendors (GSAP, ScrollTrigger, Lenis, Swiper, Webflow IX2, three.js), routes and API endpoints.
- `inspect_web_event_listeners`: hover, drag, wheel and click logic.

Use REA when the capture can't tell you how something works: a behaviour's exact rule, bundled shader or physics code, the API a component calls. Write `notes.md`: stack, breakpoints, and the motion inventory turned into a list of behaviours (trigger, property, range).

## 3. Design system

```powershell
npx trueclone design <name>              # drafts design-tokens.json if missing, renders DESIGN.md, globals.css, clone/tokens.css + lints
npx trueclone design <name> --redraft    # fresh draft in design-tokens.draft.json (never overwrites your edits)
```

Review the draft: role names, the `notes` prose (overview, do's and don'ts), anything marked `origin: generated`. Re-run after every edit. `DESIGN.md` must lint with **0 errors**.

## 4. Build (`clone/`)

**Start every clone from the mirror** (both modes):

```powershell
npx trueclone reveals <name>   # records scroll reveals frame by frame + class changes caused by scrolling (any library)
npx trueclone widgets <name>   # clicks every tab and menu and records each state (they often aren't in the page until clicked)
npx trueclone seed <name>      # clone/ from the script-free mirror; replays what reveals and widgets recorded
```

- **Exact mode:** the site's own markup, text, stylesheets and media at local paths.
- **Template mode:** the same markup and stylesheets, but every text becomes lorem words of the same laid-out width (lines break where the reference's break), every image, video, large SVG and iframe a same-size placeholder, CSS backgrounds a transparent one, every link `#`, brand metadata and tracking hints dropped. No text or media of the site ends up in `clone/`; fonts stay for local study (swap licensed fonts before reusing the result).
- **Recorded behaviour comes with it:** one-shot scroll reveals replay their measured curve (delay, duration, easing, spring overshoot) with the Web Animations API, and scroll class changes (a header that gets its backdrop past 12px) toggle the same classes at the same point. Both live in `clone/trueclone-reveals.js`; don't rewrite them by hand.
- **Recorded widgets come with it too** (template mode): every tab set and expandable menu, with each state the original showed after a click, placeholdered like the page. `clone/trueclone-widgets.js` swaps the region on click (menus in a header or nav also on hover). Popovers rendered in a portal (comboboxes, tooltips) are listed as not replayed: build those in `script.js`. In interaction scenarios, `selector@n` picks the n-th match in `at`, `click` and `expectChange`; mind hidden duplicates (a mobile menu button is often the first match).

Then write `clone/script.js`: every remaining interaction in your own code, using the parameters you read from the reference (timings, physics constants, offsets, breakpoints). Never copy the site's scripts. JS-set initial states, such as a `<details>` closed on phones, are part of the layout, so check every viewport. Data the page fetches live (a star count, a feed) stays as captured; no requests to third parties.

A seed is where layout ends up at 99%+ with zero hand-written CSS; your work is behaviour. Build by hand (below) only what the mirror can't carry.

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
```

Reference measurements are cached until the next capture, so only the clone is re-measured. Sites without scroll/time motion or without interactions simply skip those steps.

Fix in this order: page height drift, the worst layout section, the worst state step, the lowest motion curve, any interaction marked FAIL, then detail and hovers. `REPORT.md` lists them under "Fix first". For a drift, compare the element's ancestor boxes on both sides until one differs, then `rules` that ancestor: the cause is usually one declaration. Fix the cause; never tune numbers to the score.

**Done when:** layout ≥ 98% at every viewport, states within 5 points of layout, motion ≥ 95%, detail ≥ 95%, hovers ≥ 90%, and every interaction passes. Otherwise stop after 8 passes and report what's left and why.

How detail measures, so you can trust it:
- motion on (many originals ignore `prefers-reduced-motion`, and a clone that honours it lays out differently);
- both sides measured the same way: a hit test at the same point and scroll position, so sticky and pinned content is compared in place and an identical page scores 100%;
- through `pointer-events: none` overlays, and never on content the browser doesn't paint (closed `<details>`);
- colours written by scroll-scrubbed JS show up as in-between values: that is a motion difference, so check the motion inventory.

How layout and states measure:
- the structure mask hides text everywhere, gradient text (`background-clip: text`) and `::before/::after` photo backgrounds included;
- content that a component mounts only while in view (marked `data-tc-viewmount` by capture) can't appear in a full-page still on either side: layout paints its box the same on both and reports the count; the scroll-state check, with a real viewport, scores it;
- endless animations (marquees, rotating borders) are frozen on their first frame on both sides before every state screenshot: their phase depends on load time, not on the clone.

The live site can change after capture (a redeploy changes its CSS bundle name). When live-site tools (detail, rules) and screenshot scores (layout, states) disagree about a section, re-capture (`capture`, then `states <name>`); that also resets the cached reference measurements.

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
