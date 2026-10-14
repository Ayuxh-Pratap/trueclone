---
name: trueclone
description: Build the exact same website from its URL - HTML/CSS/JS clone and Next.js + Tailwind + shadcn app, identical at every screen size, plus DESIGN.md and a shadcn globals.css - and prove it with layout, scroll, canvas, motion, hover, interaction, style and load checks at seed and held-out screen sizes, and a frame-by-frame visual review. Use when the user gives a URL and asks to clone, replicate, rebuild or migrate a site or page, or to extract its design system.
---

# Build the same website, at every screen size

The goal: the user opens the clone on localhost on any device, at any window size, and it looks and behaves exactly
like the original. Not at three widths: at every width. Accuracy comes first, time second, scores third: a score is
an instrument; when it and your eyes disagree, your eyes win and you say so in `notes.md` (Findings).

Everything for a site lives in `sites/<name>/` (gitignored, local): `clone/` (the source of truth), `next/` (the
Next.js app generated from it), `notes.md` (your record, a contract), `REPORT.md` (the deliverable). Run every step as
`npx trueclone <step> <name>` from the project folder (`npx trueclone help` lists them).

## The rules

1. **Structure comes from the seed; behaviour is code.** The seed gives the site's markup, stylesheets, media and
   every value that is the same at every size or a plain function of the screen size. Everything a script does
   (layout it computes, scenes it builds, motion, hover, state, canvases) you re-implement in `clone/script.js`,
   **porting the site's own rule** from `reference/scripts/` (`INDEX.md` ranks the scripts by what actually ran and
   points every event listener at file:line). Read the algorithm; write your own code; never paste the site's code.
2. **Every screen size.** Your code computes from the live viewport, the way the site's does (`innerWidth`,
   `innerHeight`, element boxes, `resize`, the site's own breakpoints). Never put a pixel value you measured or
   recorded at one size into the clone. Elements marked `data-tc-script-owned` (and `reference/script-owned.json`) hold
   values the site computes that no simple function of the screen size explains: they are yours to compute.
3. **Never edit generated files.** `clone/index.html` is seed output. What a clone needs on top goes in
   `clone/patches/` (see Build). A fix that needs the generated markup changed is a tool defect: write it in Findings.
4. **Look, don't just score.** `npx trueclone review <name>` shows reference and clone side by side at a size the
   clone was never built from, at load, at every section, with the pointer on a control. You give every frame a
   verdict in `notes.md`. A frame that differs is open, whatever the numbers say.
5. **Done means done.** Every check passes at every scored size, the held-out sizes included; every review frame is
   "same"; an accepted difference is only for the last points of a check already ≥ 95 and names an evidence file.
   There is no pass limit: keep fixing until that holds or every remaining gap is proven a tool defect in Findings.
6. **Exact mode only with permission.** `template` (default) is for anyone's site: placeholder text and media, the
   original's structure and behaviour. `exact` copies the site's own text and media and refuses to run without
   `--permission "<who authorised it>"`; never use it on a site the user doesn't own or have permission for. Never get
   past bot checks, logins or paywalls. No tracking scripts; forms submit nowhere; `noindex`.

## 1. Capture

```powershell
npx trueclone capture <url> [name] [--hide "<cookie banner / popup selectors>"] [--mode exact --permission "<owner>"] [--locale en-US]
npx trueclone states <name>    # scroll states at every scored size (reference/states/)
npx trueclone motion <name>    # the animation runtime: ScrollTriggers, timelines, tweens, loops, Lenis/Swiper, CSS
npx trueclone spec <name>      # measured boxes and styles per size
```

`states`, `motion` and `spec` only read the reference: run them one after another in the background while you read.
Capture shoots five sizes: the seed sizes 390×844, 768×1024, 1440×900 (the clone is built from these) and the
held-out 1280×720 and 1920×1080 (scored, never used to build). It also reads inline styles at extra sizes inside each
of the site's breakpoint ranges, and saves every script that ran (`reference/scripts/`). If the page is blank or
blocked, capture through your own Chrome over CDP (`--cdp`); never get around a bot check. If capture warns that the
page redirected (a region or language variant), tell the user which page was captured, or capture again with
`--locale` or the final URL.

## 2. Understand

Write `notes.md` (the seed creates it; its sections are a contract): **Stack**, **Behaviours** (one line each:
element, trigger, property, range, timing, *and the file:line of the rule in reference/scripts/*), **Own-code map**,
**Findings**, **Accepted differences**, **Unknowns**, **Review**.

- `reference/scripts/INDEX.md`: the scripts by what ran, readable copies of minified ones, every listener's handler.
  This is where a scene's algorithm is: a grid computed from the viewport, a spring, a pin length, a hover panel.
- `reference/script-owned.json`: every value the site's scripts set that no function of the screen size explains,
  with its samples at many sizes (random, content-fitted, state- or scroll-driven); `reference/inline-styles.json`
  `scriptQueries`: the widths the scripts themselves switch at (`matchMedia`).
- `reference/motion.<size>.md`: ScrollTriggers, tweens, easings, pins, as the runtime reports them.
- `reference/states/<size>.summary.json`: reveals, parallax, pinned and fixed elements; `npx trueclone tiles <name>`
  cuts the full-page shots into readable screens.
- For a part no script reading explains (a bundled physics rule, a shader, WASM), REA is bundled:
  `npx trueclone rea --help`. Rarely needed.

## 3. Design system

```powershell
npx trueclone design <name>   # design-tokens.json -> DESIGN.md (must lint with 0 errors), globals.css, clone/tokens.css
```

Review the draft (role names, notes, anything `origin: generated`) and re-run after every edit.

## 4. Build

```powershell
npx trueclone reveals <name>   # one-shot scroll reveals and scroll class changes, recorded at the seed sizes
npx trueclone widgets <name>   # every tab and menu state (template mode replays them)
npx trueclone seed <name>      # clone/ from the script-free mirror
```

What the seed gives you, and what it leaves to you:
- the original's markup, stylesheets and media (template mode: lorem text of the same laid-out width, same-size
  placeholders), open shadow roots as declarative shadow DOM, missing media fetched;
- **inline values a script set, as functions of the screen size** (`calc()` in `--tc-vw`/`vh`, or `max()`/`min()` for
  cover/contain, per range of the site's and its scripts' breakpoints) when one fits every captured size; a property
  that fits at no size or only at some is removed everywhere and marked `data-tc-script-owned`;
- **pins** as a sticky element in a spacer whose tail is the pin length (`--tc-pin`, a function of the viewport when
  the site's is);
- one-shot reveals and scroll class changes replayed by `trueclone-reveals.js` at the visitor's size; **scroll-linked
  curves (parallax, scrubbed fades) are not replayed**: their samples are evidence in `reference/reveals.<size>.json`,
  and you write the rule;
- the boot contract: `<html class="tc-boot">` until your scripts have run; `--hide-until-boot "<selectors>"` keeps
  regions your script builds invisible meanwhile; `tcBoot.hold()` / `tcBoot.release()` for an intro that waits.

Then `clone/script.js`, scene by scene from `notes.md` Behaviours: find the rule in `reference/scripts/`, port it,
compute everything from the viewport. When your script drives an element (or a whole section), take it first:
`tcOwn('<selector>')` at the top of `script.js`. The recorded players then never touch it or anything inside it again,
and the transforms GSAP had written on it (`data-tc-gsap`) are cleared, so your animation starts from the page as it
was before any script ran, as the site's did. After each build round,
`npx trueclone owned <name>` lists the sections your script rebuilds (hide those until boot if the original hides them).

`clone/patches/` (applied on every seed, or alone in a second with `npx trueclone seed <name> --patches`):
`head-*.html` before `</head>`, `*.css` linked after the site's stylesheets, `body-*.html` before `script.js`
(vendored libraries), `*.js` deferred before `script.js`. Vendor libraries at the site's versions.

Copy the reference's CSS mechanism, not its look: `npx trueclone rules <name> "<selector>"` (add `--clone` for yours).
Canvases are scored: rebuild the drawing from the site's scene code with its parameters (exact mode) or as your own
scene with the same composition (template mode); never drop one.

## 5. Verify

```powershell
npx trueclone score <name>                                    # every check at every scored size, then REPORT.md
npx trueclone score <name> --only layout,states --viewport wide # after a fix: the checks it can move, where
npx trueclone explain <name> <y | "section label"> --viewport wide  # one place: what every check saw + a crop
npx trueclone review <name> --size wide                       # side by side by eye; then laptop, tablet, mobile
```

The checks: layout (full page, structure), scroll states (every half screen, scrolled with the wheel), canvases (what
each scene draws), motion curves, detail (styles at matching points), hovers (every control and every element with a
hover listener: the region after the hover must match), interactions (the change must happen on both sides and end in
the same state), load (0.25-4 s after navigation, cold cache, same network). Interactions come from two places: the
capture finds every scroller, carousel, tab set, accordion, header menu and dialog at each size
(`reference/interactions.auto.json`, scored by default, so a carousel that does not swipe fails), and your own
`interactions.json` adds scenarios, overrides one by name, or retires one with `{ "name": "…", "skip": "<why>" }`
(the reason is reported). One the reference itself does not react to is set aside, not failed. Unstable probes
(random motion, timing) are measured twice on the reference and excluded; do not chase a number inside the noise.
Unchanged checks are not re-measured (`--fresh` forces it). `drift` opens every full score: if the live site changed
since the capture, the live-measured checks are marked stale; re-capture before trusting them.

Fix in this order: anything the review shows, the held-out sizes, page height drift, the worst layout section, the
worst state step, canvases, interactions, load, then detail and hovers. Fix the cause; never tune a number to a score.

**Review verdicts** in `notes.md` under `## Review`, one per frame of `compare/review/<size>/index.md`:
`- 03-section-2 wide: same` or `- 07-section-4-hover wide: differs: the panel opens on the wrong card`.
**Accepted differences**: `- <check> <size> <where>: <why>; evidence: compare/explain/wide-5200.png`, only for a check
already ≥ 95.

## 6. Next.js (after the HTML clone passes)

```powershell
npx trueclone next <name> --verify   # generates next/, builds, serves and scores it into REPORT.next.md
```

The HTML clone stays the source of truth: change `clone/`, then regenerate. One component per section, the clone's
scripts preloaded and run at hydration, the site's stylesheets after the shadcn theme in the site's cascade-layer order,
`components.json` for `npx shadcn add`. Done when its report matches the HTML clone's within a point everywhere.

## 7. Report

`REPORT.md` (and `REPORT.next.md`) is the deliverable: mode and permission, every check at every size, the review,
open frames, accepted differences with evidence, Findings, what to fix first, and what was not copied (server
behaviour, tracking, each data/API call). Hand it over with the clone.

## Honest limits

- Server-side behaviour is never visible from outside: databases, accounts, payments, search. The clone reproduces
  the client; data calls are listed in the report.
- A live site is never pixel-identical twice: rotating content, A/B tests and font hinting vary; that is what the
  unstable-probe and noise handling is for, not a licence to stop.
