# REA lab

A playground for [REA](https://github.com/morluto/rea) (Reverse Engineer Anything). Its first experiment is **cloning website frontends from a URL, with the match proven by pixel diffs**. Notes on REA itself: `C:\dev\github-finds\repos\rea.md`.

## What's here

| Path | What |
|---|---|
| `.mcp.json` | Registers REA's MCP server (local `node_modules`, v6.4.0) for Claude Code in this folder |
| `.claude/skills/reverse-engineer-anything/` | REA's own investigation skill, copied from the npm package by `npm run setup` (gitignored) |
| `.claude/skills/clone-site/` | The URL → clone → diff workflow. Follow it whenever the user gives a URL to clone |
| `scripts/capture.mjs` | Playwright: full-page screenshots at 390/768/1440, sections, tokens, rendered HTML, assets, HAR |
| `scripts/diff.mjs` | Serves `clone/`, renders it the same way, and gives the pixel match % per viewport and per section |
| `scripts/states.mjs` | Live scroll states (animations running): viewport screenshot + element states per step, motion inventory (reveals, parallax, pinned, fixed); `--clone` scores the rebuild step by step |
| `scripts/motion.mjs` | Reads the site's animation runtime after the intro: every GSAP ScrollTrigger with its timeline, tweens created while scrolling (callback reveals, SplitText), cursor-driven tweens, endless loops, Lenis/Swiper settings, CSS animations, plus a cursor probe → `reference/motion.<vp>.json` + `.md`. Parameters only, never the site's code |
| `scripts/curves.mjs` | Motion score: samples opacity/translate/scale/rotation/size/saturation of matched elements across scroll ranges or over time after a trigger, reference vs clone; `--draft` builds `motion-map.draft.json` from the motion inventory |
| `scripts/interact.mjs` | Interaction tests: scripted hover, cursor paths, drag, click, keys on both sides; screenshots compared and an `expectChange` assertion that something really moved; `--draft` from the inventory |
| `scripts/detail.mjs` | Detail diff by page position (no mapping): every visible text element and styled box on the reference vs the clone at the same point; split text probed once per label |
| `scripts/hovers.mjs` | Hovers every interactive element on the reference and the same point on the clone; reports missing/different hover effects |
| `scripts/next.mjs` | Next.js mode: HTML → JSX per section (parse5), motion script as a client component with npm libraries, shadcn `globals.css` + preflight parity, `components.json`; `--verify` runs all scores against `next start` |
| `scripts/design.mjs` | Canonical `design-tokens.json` (drafted from the capture) → `DESIGN.md` (linted with `@google/design.md`), shadcn `globals.css`, `clone/tokens.css` |
| `scripts/spec.mjs`, `scripts/tiles.mjs` | Measured boxes and styles per viewport (`--clone` for the rebuild); cut tall screenshots into readable tiles |
| `scripts/chrome-debug.ps1` | Lab Chrome with CDP on port 9222 (separate profile) for REA's browser tools |
| `sites/<name>/` | One folder per experiment: `reference/` (captured), `clone/` (the rebuild), `compare/` (diffs), `notes.md`. **The whole `sites/` folder is gitignored and stays local** |

## Commands (PowerShell, from this folder)

```powershell
npm run setup                                     # first run: REA skill + Playwright Chromium
npm run capture -- <url> [name]                   # -> sites/<name>/reference
npm run score -- <name> [--quick] [--url <clone>] [--serial]  # ALL scores in parallel groups, time limit per step, summary + timings (--quick: layout, desktop states, interactions)
npm run capture -- <url> [name] --mode exact --permission "<owner>"   # exact mode: own/authorised sites only
npm run seed -- <name>                           # exact mode: clone/ from the script-free mirror (markup, text, styles, media); then write clone/script.js
npm run states -- <name> [--clone] [--structure]  # live scroll states + motion inventory; --clone scores the rebuild
npm run design -- <name>                          # design-tokens.json -> DESIGN.md (linted) + globals.css + clone/tokens.css
npm run motion -- <name> [--viewport desktop]     # motion inventory from the live runtime: ScrollTriggers + timelines, reveals, quickTo, loops, Lenis, Swiper
npm run curves -- <name> [--draft]                # motion score: sampled property curves, reference vs clone (map in sites/<name>/motion-map.json)
npm run interact -- <name> [--draft]              # interaction tests: hover/drag/click scenarios on both sides (sites/<name>/interactions.json)
npm run detail -- <name> [--viewport all]         # style diff by page position: font, size, weight, line-height, tracking, colour, background, radius
npm run hovers -- <name> [--viewport desktop]     # hover every interactive element on both sides, compare what changes
npm run rules -- <name> "<selector>" [--clone]    # every CSS rule matching an element (+ ::before/::after, @media), like DevTools Styles
npm run textshape -- <name> [--viewport v] [--write]  # template mode: placeholder text gets the reference's word widths, so lines break the same
npm run textshape -- <name> --list "<ref row>" "<clone row>" --write  # same, pairing a repeated list row by row
npm run next -- <name> [--build] [--verify]       # Next.js + Tailwind v4 + shadcn app from the verified clone -> sites/<name>/next; --verify scores it
npm run diff -- <name>                            # score sites/<name>/clone
npm run diff -- <name> --structure                # layout-only score (text + media masked)
npm run spec -- <name> [--clone]                  # measure boxes/styles of the live page (or the clone)
npm run tiles -- sites/<name>/reference/desktop.png  # cut tall screenshots into readable tiles
npm run chrome -- -Url <url>                      # lab Chrome for REA
npm run rea -- list-browser-targets http://127.0.0.1:9222 --json
npm run doctor                                    # REA readiness
```

## Rules

- Only lab code lives here. REA is used through npm, never cloned or edited.
- Captures run in the installed Google Chrome (codecs for HLS/MP4 intros); `LAB_BROWSER=chromium` forces Playwright's bundled browser.
- Reference measurements are cached in `reference/cache/` until the next capture; `--refresh-ref` re-measures. Every page call has a timeout, so a stuck step fails instead of hanging.
- Never leave a dev/prod server running between runs: a stale server on a scoring port serves an old build.
- Rendering must stay identical between capture and diff: same viewports, frozen animations, deviceScaleFactor 1. Change both scripts together (`scripts/lib.mjs`).
- Never get around bot checks, CAPTCHAs, logins or paywalls. If a site blocks capture, report it and move on.
- Clones of third-party sites stay on localhost, for learning. Swap the brand, copy, images and licensed fonts before reusing a design for real work.
- Never commit or push. End with a one-line commit plan.
