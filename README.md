# trueclone

**The exact same website, from one URL, at every screen size, with the checks to prove it.**

Give your coding agent a URL. trueclone captures the site, extracts its design system, seeds the clone with the original's structure, hands the agent the original's own scripts to port every behaviour from, and measures the result against the original until it matches: layout, scroll states, canvases, motion, interactions, hovers, styles and the load sequence, at the sizes it was built from and at sizes it never saw, plus a frame-by-frame visual review. You get the clone as HTML and as a Next.js app, plus the design system as `DESIGN.md` and a shadcn `globals.css`.

```bash
npx @trueclone/cli init            # once per project: installs trueclone and the skill for your agent
# then tell Claude Code, Codex or Cursor:
#   "clone https://example.com with trueclone"
```

## What you get from one URL

| Output | What it is |
|---|---|
| `clone/` | The site in plain HTML, CSS and JS, interactions included (sliders, tabs, menus, canvas demos, scroll motion) |
| `next/` | The same site as a Next.js + Tailwind v4 + shadcn app, one component per section, scored against the original too |
| `DESIGN.md` | The design system in [Google's design.md format](https://github.com/google-labs-code/design.md), linted |
| `globals.css` | A shadcn theme (Tailwind v4, oklch) generated from the same tokens |
| `motion.md` | The motion recipe: every ScrollTrigger, tween, reveal and loop with its trigger, range, easing and timing |
| `REPORT.md` | Every score against its target, what to fix first, and what was not copied (server logic, tracking, each API call) |

## Proof

Three benchmarks with very different stacks, scored by the tool itself. These numbers were measured at the three build sizes only, before trueclone 0.4 added held-out sizes and the visual review; 0.4's benchmark runs replace them.

**[rea.tools](https://rea.tools/)**: static docs with a canvas game and interactive demos, exact mode (copied with the owner's permission).

| Check | Desktop | Tablet | Mobile |
|---|---|---|---|
| Layout, real pixels | 100% | 100% | 100% |
| Scroll states | 100% | 100% | 100% |
| Computed styles (≈280 points per width) | 100% | 100% | 100% |
| Hover effects | 100% | | |
| Interactions (copy, tabs, calculator, dinosaur game, language menu) | 5/5 | | |

**A Next.js + React + Framer Motion developer landing page** (12,000px, 11 scroll reveals with spring easing, a scroll-state header, marquees, view-mounted components), template mode, **seeded automatically**: no hand-written layout code, no original text or media in the clone.

| Check | Desktop | Tablet | Mobile |
|---|---|---|---|
| Layout, structure | 99.99% | 99.93% | 99.94% |
| Scroll states | 99.96% | 99.92% | 99.94% |
| Computed styles | 99.5% | 98.7% | 99.2% |
| Hover effects | 100% | | |

**A Webflow motorsport portfolio** built with GSAP, ScrollTrigger, SplitText, Lenis, Swiper and three.js (97 scroll triggers), template mode, built by hand before seeding existed:

| Check | Desktop | Tablet | Mobile |
|---|---|---|---|
| Layout, structure | 99.6% | 99.7% | 96.8% |
| Scroll states | 98.0% | 96.6% | 96.5% |
| Motion curves | 96.9% | 98.2% | 99.6% |
| Computed styles | 94% | 88.9% | 85.4% |
| Hover effects | 100% | | |
| Interactions (drag sliders, drag gallery, cursor follow, menu, skip) | 5/5 | | |

The hand-built portfolio isn't perfect yet, and its report says so: computed styles and mobile layout are below target (placeholder text in highlighted phrases, a scroll-linked colour fade, mobile spacing). The generated Next.js app scores within half a point of the HTML clone on every check. A full scoring run takes 1.5 to 9 minutes.

## How it works

```
URL ─► capture ─► understand ─► design system ─► seed ─► build ─► score + review ─► report
        5 sizes    the site's      DESIGN.md        structure  your    10 checks at       REPORT.md
        scripts    own scripts,    globals.css      + viewport agent   build and held-out
        HAR        motion runtime  tokens.css       functions          sizes, by eye too
                                                                  ▲            │
                                                                  └────────────┘ until every check passes
```

1. **Capture** (`trueclone capture`): full-page screenshots at five sizes (390, 768 and 1440 wide to build from; 1280 and 1920 held out, never used to build), sections, rendered HTML, assets, every network request, every script the page ran (with what ran and where each event listener lives), and the inline values scripts set, read at extra sizes inside each of the site's breakpoint ranges.
2. **Understand**: `reference/scripts/INDEX.md` (the site's own code, ranked by what ran), the live animation runtime (`trueclone motion`: GSAP timelines, ScrollTriggers, Lenis, Swiper, CSS animations) and the scroll states. The agent ports each behaviour's rule from the site's code instead of guessing it from effects.
3. **Design system** (`trueclone design`): one canonical `design-tokens.json`, rendered to DESIGN.md, globals.css and the clone's tokens.
4. **Seed** (`trueclone seed`): the script-free mirror becomes the clone (template mode: layout-measured lorem text and same-size media placeholders). A value a script computed from the screen size is carried as that function (`calc()`), never as one size's number; a value no such function explains is left to the agent and listed. Pins pin, one-shot reveals and scroll class changes replay, shadow roots render, the first paint is held until the clone's scripts have run.
5. **Build**: the agent writes `clone/script.js`, scene by scene, from the site's own rules; `clone/patches/` for anything on top of the seed; `trueclone rules` shows the original's CSS for any element.
6. **Score and review** (`trueclone score`, `trueclone review`): layout, scroll states, canvases, motion curves, details, hovers (outcome, not just "something changed"), interactions (same end state), load sequence, at the build sizes and the held-out sizes; then the reference and the clone side by side, frame by frame, with a verdict for each.
7. **Report**: `REPORT.md` with every check at every size, the review, what to fix first, and what was not copied.

**Canvas apps** (one full-window WebGL canvas, a page that never scrolls, states reached by wheel, touch, gestures and
holds, like why.zero.university) take an app path: `trueclone journey <name> --draft` finds the journey on the live
page (gates the page names, such as "draw a zero", included), the reference checkpoints come with the three.js scene
graph and every shader, and the clone is compared checkpoint by checkpoint at desktop and phone size. In exact mode,
with the owner's permission, the clone runs the site's own recorded bundle offline: backend writes answered locally,
tracking dropped, nothing fetched from the live site. Otherwise the agent ports the scenes.

## REA

trueclone bundles [REA](https://github.com/morluto/rea) (Reverse Engineer Anything) for the rare part no script reading explains (a bundled physics rule, a shader, WASM): `npx trueclone rea --help`. It is not part of the standard flow: the site's scripts, saved and ranked by the capture, carry what the agent needs.

## Modes and guardrails

| Mode | For | Content |
|---|---|---|
| `template` (default) | Any site: learning, layout study, a starting template | Structure, motion and behaviour of the original; your own text, images and brand |
| `exact` | Sites you own or are authorised to copy, such as a Webflow, Framer or WordPress site moving to Next.js | The site's own text and media |

- Exact mode refuses to run without `--permission "<who authorised it>"` and records it in the capture and the report.
- No bot-check, CAPTCHA, login or paywall bypass. Tracking and analytics are never copied.
- Clones are `noindex`, forms submit nowhere, and everything stays in your local `sites/` folder.

## Commands

```bash
npx @trueclone/cli init                 # set up a project for your agent (then `npx trueclone ...`)
npx trueclone doctor                    # check Node and Chrome
npx trueclone <url> [name]              # capture + design-system draft
npx trueclone capture <url> [name] [--mode exact --permission "<owner>"]
npx trueclone motion <name>             # motion inventory
npx trueclone design <name>             # DESIGN.md + globals.css
npx trueclone reveals <name>            # record scroll reveals and scroll class changes
npx trueclone widgets <name>            # record every tab and menu state
npx trueclone seed <name>               # clone/ from the mirror (template: placeholder text and media); --patches re-applies clone/patches/ in a second
npx trueclone rules <name> "<selector>" # the original's CSS rules for an element
npx trueclone textshape <name> --write  # template mode: placeholder text with the original's line breaks
npx trueclone load <name>               # load sequence on both sides: settledness 0.25-4 s after navigation, cold cache, same network
npx trueclone score <name> [--quick]    # every check, then REPORT.md (--only detail,load --viewport tablet after a fix; unchanged checks are kept)
npx trueclone explain <name> <y>        # one place on the page: what every check saw there, plus a reference|clone|diff crop
npx trueclone review <name> --size wide # reference and clone side by side at a held-out size: load, every section, hover
npx trueclone journey <name> --draft    # canvas apps: find the journey (gates, wheel, holds); then `journey <name>` shoots the reference
npx trueclone next <name> --verify      # Next.js + Tailwind + shadcn app, scored into REPORT.next.md
npx trueclone rea <args>                # bundled REA, for the rare deep case
npx trueclone help                      # every step
```

## What it can't do

- **Server-side behaviour** is invisible from outside: databases, accounts, payments, search. trueclone rebuilds the client and lists every API call the original makes in the report.
- A live site is never pixel-identical twice: rotating content, A/B tests and font hinting vary.
- A canvas app in template mode is ported by the agent, scene by scene: a large app (dozens of shaders) is long work, and the report says which stages are not there. An exact copy of one needs the owner's permission (its own bundle).
- Developed and tested on Windows 11 with Chrome. macOS and Linux should work but aren't tested yet.

## Requirements

Node 22.19+, 24.11+ or 26+ (the same as REA), and Google Chrome for captures (it plays the H.264/HLS video many sites use; Playwright's Chromium is the fallback). A coding agent: Claude Code, Codex, Cursor or any agent that reads `AGENTS.md`.

## Roadmap

- **Whole sites:** crawl every route, shared header and footer as components.
- **Data layer:** captured API responses turned into mock routes and fixtures, so the clone works offline.
- **Benchmarks by kind of site:** static, Tailwind/Next.js, Webflow, Webflow + GSAP, Framer, WordPress builders, WebGL showcases, docs, e-commerce, SPAs, scroll-jacking, embeds: each scored at build and held-out sizes, published here.
- **A free web page:** paste a URL, get its DESIGN.md and globals.css.

## Credits

[REA](https://github.com/morluto/rea) by morluto (MIT), [Playwright](https://playwright.dev), [pixelmatch](https://github.com/mapbox/pixelmatch), [@google/design.md](https://github.com/google-labs-code/design.md), [parse5](https://github.com/inikulin/parse5), and the [shadcn](https://ui.shadcn.com) theme format.

## License

MIT
