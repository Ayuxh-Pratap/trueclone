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
npx trueclone capture <url> [name] [--mode exact --permission "<owner>"] [--hide "<banner selectors>"] [--locale en-US]
npx trueclone status <name>
```

Then, until it says every gate passes: **do exactly what `status` says, then run `status` again.** It reads the site
folder and names the one next step as a command, with why and what follows: the reads, the design system, the seed, a
brief per section, your Behaviours, `script.js`, scores (re-measured whenever the clone changed, on one size while you
iterate), the failing checks in fix order (each with the command to look closer), the review at every size, the
Next.js app. It exits 0 only when everything passes.

**Never end your turn, ask "should I continue?", or hand over a progress summary while `status` says work is left.**
The user asked for the finished clone. The only reason to stop is a real blocker (a login wall, a bot check, a tool
defect you proved): write it under `## Findings` in notes.md with what you tried, then say so. A long loop is not a
blocker; a check that is hard is not a blocker.

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
3. **Take over before you drive.** `tcOwn('<selector>')` at the top of `script.js` for anything your script animates
   or rebuilds: the recorded players never touch it again and GSAP-written transforms (`data-tc-gsap`) are cleared, so
   your animation starts from the page as it was before any script ran, as the site's did.
4. **Never edit generated files** (`clone/index.html`, `next/`). Add what the clone needs in `clone/patches/`. A fix
   that needs generated markup changed is a tool defect: write it in Findings.
5. **Look, don't just score.** `review` shows reference and clone side by side at every size, sections and hovers; give
   every frame a verdict. A frame that differs is open, whatever the numbers say.
6. **Exact mode only with permission.** `template` (default) is for anyone's site: placeholder text and media, the
   original's structure and behaviour. `exact` copies the site's own text and media and needs
   `--permission "<who authorised it>"`. Never get past bot checks, logins or paywalls. No tracking scripts; forms
   submit nowhere; `noindex`.

## What you write in notes.md

- **Stack**: what the site is built with (`reference/motion.desktop.md` says where GSAP, Lenis, three.js live).
- **Behaviours**: one line per behaviour: element, trigger, property, range, timing, and the **file:line** of the rule
  from the brief, e.g. `- hero cells: scroll 0→5600 (pin), scale 1→0.58, scrub 0.3; 23-hero.pretty.js:1108`. The
  report fails while this is empty or cites nothing.
- **Review**: one line per frame of `compare/review/<size>/index.md`: `- 03-section-2 wide: same` or
  `- 07-section-4-hover wide: differs: the panel opens on the wrong card`.
- **Accepted differences**: `- <check> <size> <where>: <why>; evidence: compare/explain/wide-5200.png`, only for the
  last points of a check already ≥ 95.
- **Findings**: tool defects, with evidence.

## Reference

**What the seed gives**: the original's markup, stylesheets and media (template: lorem of the same laid-out width,
same-size placeholders); inline values a script set as functions of the screen size (`calc()` in `--tc-vw`/`vh`,
`max()`/`min()`, per range of the site's and its scripts' breakpoints); pins as sticky elements (`--tc-pin`); one-shot
reveals, scroll class changes, tabs, menus and dialogs replayed by its players; **scroll-linked curves are not
replayed** (yours, from the brief); the boot contract (`<html class="tc-boot">` until your scripts have run;
`seed --hide-until-boot "<selectors>"`; `tcBoot.hold()` / `tcBoot.release()` for an intro that waits).

**clone/patches/** (applied on every seed; `seed <name> --patches` re-applies them in a second): `head-*.html` before
`</head>`, `*.css` after the site's stylesheets, `body-*.html` and `*.js` (deferred) before `script.js`, in name order.
`npx trueclone vendor <name>` puts the site's libraries there at the site's versions.

**The checks**: layout, scroll states, canvases, motion curves, detail, hovers, interactions (the capture finds every
scroller, carousel, tab set, accordion, menu and dialog, `reference/interactions.auto.json`; your `interactions.json`
adds, overrides by name, or retires one with `{ "name": "…", "skip": "<why>" }`), load, notes and review. Sizes: built
from 390, 768, 1440; held out (scored, never built from) 1280 and 1920. Unstable probes are measured twice on the
reference and excluded; do not chase a number inside the noise. If `drift` says the live site changed, re-capture.

**Tools status points you to**: `brief <name> [<n>] [--viewport]`, `explain <name> <y> --viewport <size>`,
`score <name> [--only layout,states,interact,…] [--viewport <size>]`, `review <name> --size <size>`,
`rules <name> "<selector>" [--clone]`, `tiles <name>`, `owned <name>`, `serve <name> [--next]`,
`next <name> --verify`. REA is bundled for the rare part no script reading explains (`npx trueclone rea --help`).

**Next.js**: generated from the HTML clone (one component per section, the clone's scripts run at hydration, the
site's stylesheets in its cascade-layer order); done when `REPORT.next.md` matches `REPORT.md` within a point.

## Honest limits

- Server-side behaviour is never visible from outside (databases, accounts, payments, search): the clone reproduces
  the client, and each data call is listed in the report.
- A live site is never pixel-identical twice (rotating content, A/B tests, font hinting): that is what the noise
  handling is for, not a licence to stop.
- If capture warns that the page redirected (a region or language variant), tell the user which page was captured.
