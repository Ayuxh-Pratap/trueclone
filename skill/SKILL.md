---
name: trueclone
description: Build the exact same website from its URL - HTML/CSS/JS clone and Next.js + Tailwind + shadcn app, identical at every screen size, plus DESIGN.md and a shadcn globals.css - and prove it with layout, scroll, canvas, motion, hover, interaction, style and load checks at seed and held-out screen sizes, and a frame-by-frame visual review. Use when the user gives a URL and asks to clone, replicate, rebuild or migrate a site or page, or to extract its design system.
---

# Build the same website, at every screen size

The goal: the user opens the clone on localhost on any device, at any window size, and it looks and behaves exactly
like the original. Accuracy comes first, time second, scores third: a score is an instrument; when it and your eyes
disagree, your eyes win and you say so in `notes.md` (Findings).

Everything for a site lives in `sites/<name>/` (local, gitignored): `clone/` (the source of truth), `next/` (the
Next.js app generated from it), `notes.md` (your record), `REPORT.md` (the deliverable).

## The loop

```powershell
npx trueclone capture <url> [name] [--mode exact --permission "<owner>"] [--hide "<banner selectors>"] [--cookie "consent=1"] [--locale en-US] [--routes 1]
npx trueclone status <name>
```

Capture the right page the first time, once: `--routes 1` when the user wants one page, not the whole site; `--hide`
for a banner or popup a visitor dismisses (capture warns when a dialog covers the page at load), or `--cookie` with
the cookie that dismissal sets (a consent or region choice, never a login). Every check after capture applies both.

Then, until it says every gate passes: **do exactly what `status` says, then run `status` again.** It reads the site
folder and names the one next step as a command, with why and what follows: the reads, the design system, the seed, a
brief per section, your Behaviours, `script.js`, scores (re-measured whenever the clone changed, on one size while you
iterate), the failing checks in fix order (each with the command to look closer), the review at every size, the
Next.js app. It exits 0 only when everything passes.

**Never end your turn, ask "should I continue?", or hand over a progress summary while `status` says work is left.**
The user asked for the finished clone. The only reason to stop is a real blocker (a login wall, a bot check, a tool
defect you proved): write it under `## Findings` in notes.md with what you tried, then say so. A long loop is not a
blocker; a check that is hard is not a blocker. "Large work" (a three.js scene, a carousel) is the work: see Recipes.
A step that does not improve after three real tries (you changed the clone, it was scored again, no gain) is set aside
by `status` (it says so) and the next one comes up; write what blocks the set-aside step under `## Findings`.
Re-scoring an unchanged clone is not a try, and scripting re-scores to reach a set-aside is gaming the loop: never.

**The loop ends only at exit 0 (every gate passes) or exit 3 (every step left is set aside: make sure each is in
Findings, then hand over).** Stopping anywhere else is an unfinished run, and your summary must say it is unfinished.
A canvas app (one full-window canvas, a page that never scrolls) takes the app path: see Apps below; `status` switches
by itself.

**Your summary to the user states what the checks and the review show, nothing more.** Not "the accordions work"
unless the interaction check passes for them; a number you have not re-measured since your last change is not a
result.

## The rules

1. **Structure comes from the seed; behaviour is code.** The seed gives the site's markup, stylesheets, media and
   every value that is the same at every size or a plain function of it. Everything a script does (layout it
   computes, scenes, motion, hover, state, canvases) you write in `clone/script.js`, **porting the site's own rule**:
   `npx trueclone brief <name> <n>` puts a section's handlers (file:line and the code there), its recorded motion, the
   values its scripts compute, what a visitor operates and its scores in one page. Read the algorithm, write your own
   code, never paste the site's.
2. **Every screen size.** Compute from the live viewport the way the site does (`innerWidth`, element boxes, `resize`,
   the site's breakpoints). Never put a pixel value measured at one size into the clone. `data-tc-script-owned`
   elements hold values the site computes that no function of the screen size explains: yours to compute.
3. **Take over before you drive.** `tcOwn('<selector>')` at the top of `script.js` for anything your script animates,
   rebuilds or listens to (it always exists, before any script): the recorded players never touch it, or the region
   around it, again; GSAP-written motion transforms (`data-tc-gsap=""`) are cleared, so your animation starts from the
   page as it was before any script ran, as the site's did, while closed states (`data-tc-gsap="state"`, a menu at
   `scale(1, 0)`) stay; its scroll reveals settle at their end state; a captured `<canvas>` in it gives way the moment
   your scene mounts its own (no two canvases stacked).
4. **Test what you built.** After each behaviour, operate it: `status` re-runs the interaction scenarios with every
   re-score. Your own controls also handle `pointercancel` and `lostpointercapture` (a drag that ends outside the
   window must not stick to the cursor).
5. **Never edit generated files** (`clone/index.html`, `next/`). Add what the clone needs in `clone/patches/`. A fix
   that needs generated markup changed is a tool defect: write it in Findings.
6. **Look, don't just score.** `review` shows reference and clone side by side at every size, sections and hovers; give
   every frame a verdict. A frame that differs is open, whatever the numbers say.
7. **Exact mode only with permission.** `template` (default) is for anyone's site: placeholder text and media, the
   original's structure and behaviour. `exact` copies the site's own text and media and needs
   `--permission "<who authorised it>"`. Never get past bot checks, logins or paywalls. No tracking scripts; forms
   submit nowhere; `noindex`.

## What you write in notes.md

- **Stack**: what the site is built with (`reference/motion.desktop.md` says where GSAP, Lenis, three.js live).
- **Behaviours**: one line per behaviour: element, trigger, property, range, timing, and the **file:line** of the rule
  from the brief, e.g. `- hero cells: scroll 0→5600 (pin), scale 1→0.58, scrub 0.3; 23-hero.pretty.js:1108`. The
  report fails while this is empty or cites nothing.
- **Review**: one line per frame of `compare/review/<size>/index.md`, with the frame's token from that table:
  `- 03-section-2 wide [k3x9a]: same` or `- 07-section-4-hover wide [p02ld]: differs: the panel opens on the wrong
  card`. A verdict holds for the picture you looked at: a frame shot again that looks different has a new token and
  needs a new look. Below 85% pixel match, "same" says why (`same: the reference's photo arrives later`); "tool" needs
  evidence you made (a crop, a measurement), not one of the site's files. Never write verdicts from pixel match or with
  a script: look at every sheet.
- **Accepted differences**: `- <check> <size> <where>: <why>; evidence: compare/explain/wide-5200.png`, only for the
  last points of a check already ≥ 95.
- **Findings**: tool defects, with evidence; a step `status` set aside, with what blocks it; and each of the site's
  scripts or scroll curves you do not port, by name, with why (an app, a polyfill, analytics). The report's Coverage
  check fails while one of the site's busiest scripts, or a recorded curve, is in neither Behaviours nor Findings.

## Reference

**What the seed gives**: the original's markup, stylesheets and media (template: lorem of the same laid-out width,
same-size placeholders); inline values a script set as functions of the screen size (`calc()` in `--tc-vw`/`vh`,
`max()`/`min()`, per range of the site's and its scripts' breakpoints); pins as sticky elements (`--tc-pin`); one-shot
reveals, scroll class changes, tabs, menus and dialogs replayed by its players; **scroll-linked curves are not
replayed** (yours, from the brief); the boot contract (`<html class="tc-boot">` until your scripts have run;
`seed --hide-until-boot "<selectors>"`; for an intro that waits, `const ready = tcBoot.hold()` at the top of
`script.js` and `ready()` when it is ready; a hold never released is released after 5 s with a warning); the site's
small inline boot scripts in `<head>` (scroll restoration, a theme class), and the captured page at its own address
too (`clone/<path>/index.html`, so links, Back and a reload there find it).

**clone/patches/** (applied on every seed; `seed <name> --patches` re-applies them in a second): `head-*.html` before
`</head>`, `*.css` after the site's stylesheets, `body-*.html` and `*.js` (deferred) before `script.js`, in name order.
`npx trueclone vendor <name>` puts the site's libraries there at the site's versions.

**Routes**: a site is all its pages. Capture follows the page's links and sitemap.xml (`--routes N`, or
`--routes "/,/about"`), captures every route at every size, and tells a single-page app (one document, a script shows
the view for the address: your `script.js` routes like the site's, `pushState`/`popstate`) from separate pages. Layout
and scroll states are scored per route; navigation is scored (each link: the right view at the right address, then
Back); `brief --route /about` and `review --route /about` work on one route. An app shell (a fixed sidebar and a pane
that scrolls on its own) is measured with the pane unrolled, the same way on both sides.

**The checks**: layout, scroll states (the mean and every frame: none below 80%), canvases (every frame ≥ 60%), motion
curves (`curves --draft` maps the recorded ones), detail, hovers ("not measurable" when the reference has none to
compare), interactions (the capture finds every scroller, carousel, tab set, accordion, menu and dialog,
`reference/interactions.auto.json`; your `interactions.json` adds, overrides by name, or retires one with
`{ "name": "…", "skip": "<why>" }`; a scenario passes on what the visitor sees: the end state, the address relative to
the start page, a real page there, not a 404 or an empty one; one that could not run on the reference is listed for
Findings, never counted as a pass), load, notes, coverage and review. Sizes: built from 390, 768, 1440; held out
(scored, never built from) 1280 and 1920. Unstable probes are measured twice on the reference and excluded, and a route
that differs from itself between loads (random order) is held to its own worst match, its scenarios not scored; do not
chase a number inside the noise. If `drift` says the live site changed, re-capture (status then asks for fresh reads).
The Next app is held to the clone within a point everywhere, including its own review frames.

**Recipes** (the work that looks large is ordinary work):
- *A canvas (three.js, WebGL, 2D)*: `motion` names the engine and its version, `vendor` puts it in `clone/patches/`.
  Find the scene in the site's script (the brief names the canvas and the scripts there; search the readable copy
  for `Scene`, `PerspectiveCamera`, `BufferGeometry`, shader strings) and port it: the same camera, geometry, material
  and colour values, the same animation driven by time and scroll the way the site's is, sized from the canvas box.
  Score with `--only states`: canvases are compared frame by frame.
- *A carousel or slider*: when the site uses a library, run it at the site's version (`vendor` does Swiper; another
  one, such as Splide, Embla or Flickity, goes into `clone/patches/` from the version in its script URL) and initialise
  it with the site's own options (in its script, at the brief's file:line); never write a drag by hand where the site
  uses a library. A hand-written one handles pointerdown/move/up, `pointercancel` and
  `lostpointercapture`, and snaps the way the site's does.
- *An accordion or disclosure*: `tcOwn` its region first, toggle the same attributes the site toggles (aria-expanded,
  `hidden`, a class, a height transition) and check it with the interaction score: open, closed, and the next one.
- *A class change the site animates with GSAP Flip* (the brief says so): port the Flip (record state, change the
  classes, `Flip.from` with the site's duration and ease), never leave the swap as a jump.

**Tools status points you to**: `reads <name>` (every read of the live page, side by side where that is safe),
`brief <name> [<n>] [--viewport]`, `explain <name> <y> --viewport <size>`,
`score <name> [--only layout,states,interact,…] [--viewport <size>]`, `review <name> --size <size>`,
`rules <name> "<selector>" [--clone]`, `tiles <name>`, `owned <name>`, `serve <name> [--next]`,
`next <name> --verify`. REA is bundled for the rare part no script reading explains (`npx trueclone rea --help`).

**Next.js**: generated from the HTML clone (one component per section, the clone's scripts run at hydration, the
site's stylesheets loaded as the browser loads them, `<template>`s and every file of the clone carried; a single-page
app is served at every address, a site of separate pages gets one route per page); done when `REPORT.next.md` matches
`REPORT.md` within a point. A difference only the app has is a tool defect: write it in Findings.

## Apps (canvas experiences)

Capture marks a site a canvas app (`meta.canvasApp`) when one canvas fills the window and the page never scrolls: a
visitor reaches its states by input (wheel or touch moving a virtual scroll, a gesture gate such as "draw a zero", a
hold button), not by scrolling. Its states are the **checkpoints of a journey**, and its checks are the journey (every
checkpoint, desktop and phone, worst one ≥ 80, mean ≥ 95), interactions and load; the document checks do not apply.
`status` walks it like any site: journey draft, reads, seed, the clone, scores, review, Next.

**The journey** (`sites/<name>/journey.json`): `journey <name> --draft` finds it on the live page at desktop and phone
size: it passes gates the page names in words (draw/trace → a circle, then an ellipse; hold → a press of 2.5 s;
start/enter → a click), then turns the wheel (a swipe on the phone) until three turns change nothing, and writes a
checkpoint at every new state. A scene that moves on its own is measured first, so only change beyond its own drift
counts. **Read the draft against the live site**: every checkpoint a state you saw; a gate it could not pass, write by
hand (steps: `checkpoint`, `wheel {dy}`, `gesture {shape|path, at, size}`, `hold {at, ms}`, `click`, `pointer`, `key`,
`wait`; points are fractions of the window; `stepsByViewport.mobile` for the phone). Passing a gate means making the
input it asks for, never a debug route or a URL parameter the site did not give visitors. Both sides run with the same
seeded `Math.random`.

`journey <name>` (part of `reads`) shoots the reference's checkpoints and records what the app is made of:
`reference/scene/*.json` (the three.js scene graph per checkpoint: objects, geometry, materials, cameras) and
`reference/shaders/` (every vertex and fragment shader, `INDEX.md`). `score <name> --only journey` compares the clone.

**Two ways to the clone** (decide with the user before the seed):
- **Own bundle** (exact mode only, and only when the owner allowed copying their site: `--mode exact --permission
  "<owner>"`; on by itself for a canvas app, `--bundle` for any other page). The clone runs the site's own code and
  files, recorded at capture and along the journey, offline: every recorded address points at the local copy, writes
  to a backend are answered without being sent, tracking is dropped, anything never recorded is a 404 (never the live
  site). Your work is the review: a checkpoint that differs is usually a file the journey never loaded (re-run
  `journey <name>` on the reference, then `seed`), or a call the site makes that needs a recorded answer (Findings).
- **Port** (template mode, or exact without the bundle): you write the app in `clone/script.js`, stage by stage, in
  journey order: the renderer and post chain, each stage's scene from `reference/scene/` and `reference/shaders/` (same
  camera, geometry, material values, shader code ported), the stage machine moved by the virtual scroll with the
  site's lerp constants (the brief and `reference/scripts/` give them, file:line), gates that pass with the same input.
  `vendor` gives three.js at the site's revision. A whole multi-stage app is long work: the first stages to their
  checkpoints, then the next; `status` set-asides apply.

**Review**: `compare/review/journey-desktop/` and `journey-mobile/`, one frame per checkpoint; verdict lines as for any
frame: `- journey/02-step-1 desktop [uvnuc]: same`.

## Honest limits

- Server-side behaviour is never visible from outside (databases, accounts, payments, search): the clone reproduces
  the client, and each data call is listed in the report.
- A live site is never pixel-identical twice (rotating content, A/B tests, font hinting): that is what the noise
  handling is for, not a licence to stop.
- If capture warns that the page redirected (a region or language variant), tell the user which page was captured.
