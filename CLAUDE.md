# trueclone (repo guide for coding agents)

trueclone builds a working twin of a website from its URL (HTML/CSS/JS clone, Next.js + Tailwind + shadcn app, DESIGN.md, shadcn globals.css) and proves the match with scores. It bundles [REA](https://github.com/morluto/rea) (Reverse Engineer Anything) for the parts a capture can't explain. Users install it with `npx @trueclone/cli init` in their own project (published as `@trueclone/cli`; the command is `trueclone`); this repo is the tool itself.

## Layout

| Path | What |
|---|---|
| `bin/trueclone.mjs` | The CLI: `init`, `doctor`, `<url>` shortcut, `rea` passthrough, and one command per step script |
| `skill/SKILL.md` | The agent workflow `init` installs (Claude Code skill; `AGENTS.md` points other agents at it). **The product's brain: keep it in step with the scripts** |
| `scripts/lib.mjs` | Shared: viewports, browser/page setup with timeouts, settle/freeze, scroll (`wheelTo` learns the page's wheel gain), masks, pixel match, reference cache |
| `scripts/capture.mjs` | Playwright: full-page screenshots at 390/768/1440, sections, tokens, rendered HTML, assets, HAR; `--mode exact --permission` adds a script-free mirror |
| `scripts/seed.mjs` | Exact mode: `clone/` from the mirror |
| `scripts/design.mjs` | `design-tokens.json` → `DESIGN.md` (linted with `@google/design.md`), shadcn `globals.css`, `clone/tokens.css` |
| `scripts/motion.mjs` | Motion inventory from the live runtime (GSAP/ScrollTrigger, Lenis, Swiper, CSS animations, cursor probe). Parameters only, never the site's code |
| `scripts/states.mjs` | Live scroll states + inventory; `--clone` scores each step |
| `scripts/curves.mjs` | Motion score: sampled property curves (scroll- and time-driven) |
| `scripts/interact.mjs` | Interaction scenarios on both sides; `expectChange` covers geometry, text, state attributes and canvas pixels |
| `scripts/detail.mjs` | Style diff at matching points, measured the same way on both sides |
| `scripts/hovers.mjs` | Hover every interactive element on both sides |
| `scripts/rules.mjs` | Every CSS rule matching an element (+ pseudo-elements, `@media`), cross-origin sheets included |
| `scripts/textshape.mjs` | Template mode: placeholder words with the reference's rendered word widths (`--list` for repeated rows) |
| `scripts/next.mjs` | Next.js mode: HTML → JSX per section, motion as a client component, shadcn globals + preflight parity; `--verify` scores it |
| `scripts/score.mjs`, `scripts/report.mjs` | All scores in parallel groups with time limits, then `REPORT.md` |
| `scripts/diff.mjs`, `spec.mjs`, `tiles.mjs` | Layout pixel diff per viewport/section; measured boxes; screenshot tiles |
| `scripts/chrome-debug.ps1` | Windows helper: Chrome with CDP on 9222 and a separate profile, for REA's browser tools |
| `sites/<name>/` | Test sites (reference, clone, next, scores). **Gitignored, never committed** |

## Working in this repo

Run the CLI from source: `node bin/trueclone.mjs <command>` (the same as `npx trueclone <command>` for users). To clone a site while developing, follow `skill/SKILL.md` with that substitution. Benchmarks: `sites/nickho` (Webflow + GSAP + Lenis, template mode) and `sites/rea-tools` (static docs + canvas game, exact mode with recorded permission).

After changing a scoring script, re-run `node bin/trueclone.mjs score <name>` on both benchmarks and compare with the last `REPORT.md`: a change that moves a score must be explained (a tool bug fixed, or a real difference found), never tuned.

## Rules

- Scripts must work from any folder: resolve siblings with `import.meta.url`, packages with `import.meta.resolve`; `sites/` is always relative to the current folder.
- Rendering must stay identical between capture and scoring: same viewports, frozen animations, deviceScaleFactor 1. Change both sides together (`scripts/lib.mjs`).
- Measure both sides the same way. Any asymmetry (reading the reference one way and the clone another) shows up as fake gaps.
- Captures run in installed Google Chrome (H.264/HLS); `LAB_BROWSER=chromium` forces Playwright's browser. Every page call has a timeout; never leave a server running.
- Reference measurements are cached per capture (`reference/cache/`); bump the cache key's `v` when a measuring method changes.
- Never get around bot checks, CAPTCHAs, logins or paywalls. Exact mode only with recorded permission. Clones stay local.
- Commit only when the user asks: one-line messages, no co-author trailers.
