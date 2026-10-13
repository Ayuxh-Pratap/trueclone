# trueclone

**A working twin of any website, from one URL, with scores that prove it.**

Give your coding agent a URL. trueclone captures the site, extracts its design system, guides the rebuild and measures the result against the original until it matches: layout, scroll states, motion curves, interactions, hover effects and computed styles, at phone, tablet and desktop widths. You get the clone as HTML and as a Next.js app, plus the design system as `DESIGN.md` and a shadcn `globals.css`.

```bash
npx @trueclone/cli init            # once per project: installs trueclone, the skill for your agent, REA as an MCP server
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

Three benchmarks with very different stacks, scored by the tool itself:

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
URL ─► capture ─► understand ─► design system ─► build ─► score ─► report
        3 widths    motion         DESIGN.md        your      7 checks   REPORT.md
        HAR, HTML   inventory      globals.css      agent     in parallel
        assets      + REA          tokens.css                  ▲     │
                                                               └─────┘ until every target passes
```

1. **Capture** (`trueclone capture`): full-page screenshots at 390, 768 and 1440px, sections, rendered HTML, assets, every network request.
2. **Understand** (`trueclone motion`, REA): reads the live animation runtime (GSAP timelines, ScrollTriggers, Lenis and Swiper settings, CSS animations, cursor-driven tweens) and, through REA, bundles, source maps, event listeners and API endpoints.
3. **Design system** (`trueclone design`): one canonical `design-tokens.json`, rendered to DESIGN.md, globals.css and the clone's tokens.
4. **Build**: `trueclone reveals` records, at every width, the original's scroll reveals frame by frame, its scroll-linked curves (parallax) and its scroll-driven class changes; `trueclone widgets` clicks every tab and menu and records each state; `trueclone seed` turns the script-free mirror into the clone (template mode: layout-measured lorem text and same-size media placeholders), cleans what the original's scripts left in the DOM (pin-spacers, canvas buffer sizes) and replays what was recorded. Layout is at 99%+ before anyone writes CSS; your agent writes the remaining behaviour, guided by the skill. `trueclone rules` shows the original's CSS for any element (like DevTools).
5. **Score** (`trueclone score`): layout pixel diff per section, scroll states replayed, motion curves sampled, interaction scenarios with change assertions, every hover, computed styles at matching points. Reference measurements are cached, so only the clone is re-measured.
6. **Report**: `REPORT.md` with the verdict, what to fix first, and what was not copied.

## Why not just REA?

trueclone **bundles** [REA](https://github.com/morluto/rea) (Reverse Engineer Anything) and uses it, but works without it too.

| | REA on its own | trueclone |
|---|---|---|
| What it is | A microscope: typed tools that let your agent look inside apps, binaries and pages | A factory with quality control: capture, design system, build guide, scores, report |
| Capture | Your Chrome over CDP, one page state | 3 widths, every scroll state, motion runtime, assets, network |
| Knows when the clone is right | No: the agent judges by eye | Yes: 7 measured checks with targets |
| Tells you what's wrong | No | "Footer column 2 is at x 189, the original's at 732", plus the original's CSS rule |
| Outputs | Whatever the agent writes | HTML clone, Next.js app, DESIGN.md, globals.css, motion recipe, REPORT.md |

REA answers *how does this work?* trueclone answers *is my copy identical, and where isn't it?* For the hard parts (a bundled physics rule, a shader, the API a component calls) the skill sends your agent to REA.

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
npx trueclone doctor                    # check Node, Chrome and REA
npx trueclone <url> [name]              # capture + design-system draft
npx trueclone capture <url> [name] [--mode exact --permission "<owner>"]
npx trueclone motion <name>             # motion inventory
npx trueclone design <name>             # DESIGN.md + globals.css
npx trueclone reveals <name>            # record scroll reveals and scroll class changes
npx trueclone widgets <name>            # record every tab and menu state
npx trueclone seed <name>               # clone/ from the mirror (template: placeholder text and media)
npx trueclone rules <name> "<selector>" # the original's CSS rules for an element
npx trueclone textshape <name> --write  # template mode: placeholder text with the original's line breaks
npx trueclone score <name> [--quick]    # every check, then REPORT.md
npx trueclone next <name> --verify      # Next.js + Tailwind + shadcn app, scored
npx trueclone rea <args>                # bundled REA
npx trueclone help                      # every step
```

## What it can't do

- **Server-side behaviour** is invisible from outside: databases, accounts, payments, search. trueclone rebuilds the client and lists every API call the original makes in the report.
- A live site is never pixel-identical twice: rotating content, A/B tests and font hinting vary.
- One page at a time today. Multi-page crawling with shared components is next.
- Developed and tested on Windows 11 with Chrome. macOS and Linux should work but aren't tested yet.

## Requirements

Node 22.19+, 24.11+ or 26+ (the same as REA), and Google Chrome for captures (it plays the H.264/HLS video many sites use; Playwright's Chromium is the fallback). A coding agent: Claude Code, Codex, Cursor or any agent that reads `AGENTS.md`.

## Roadmap

- **Whole sites:** crawl every route, shared header and footer as components.
- **Data layer:** captured API responses turned into mock routes and fixtures, so the clone works offline.
- **Benchmarks:** React with Framer Motion, a Next.js site with source maps, a data-driven app; each scored with and without REA.
- **A free web page:** paste a URL, get its DESIGN.md and globals.css.

## Credits

[REA](https://github.com/morluto/rea) by morluto (MIT), [Playwright](https://playwright.dev), [pixelmatch](https://github.com/mapbox/pixelmatch), [@google/design.md](https://github.com/google-labs-code/design.md), [parse5](https://github.com/inikulin/parse5), and the [shadcn](https://ui.shadcn.com) theme format.

## License

MIT
