# trueclone (repo guide for coding agents)

trueclone builds a working twin of a website from its URL (HTML/CSS/JS clone, Next.js + Tailwind + shadcn app, DESIGN.md, shadcn globals.css) and proves the match with scores. It bundles [REA](https://github.com/morluto/rea) (Reverse Engineer Anything) for the parts a capture can't explain. Users install it with `npx @trueclone/cli init` in their own project (published as `@trueclone/cli`; the command is `trueclone`); this repo is the tool itself.

## Layout

| Path | What |
|---|---|
| `bin/trueclone.mjs` | The CLI: `init`, `doctor`, `<url>` shortcut, `rea` passthrough, and one command per step script |
| `skill/SKILL.md` | The agent workflow `init` installs (Claude Code skill; `AGENTS.md` points other agents at it). **The product's brain: keep it in step with the scripts** |
| `scripts/lib.mjs` | Shared: viewports, browser/page setup with timeouts, settle/freeze, scroll (`wheelTo` learns the page's wheel gain), masks, pixel match, reference cache |
| `scripts/capture.mjs` | Playwright: full-page screenshots (shot until stable) at 390/768/1440, sections, tokens, inline styles per width (`inline-styles.json`), rendered HTML (view-mounted content kept, marked `data-tc-viewmount`; open shadow roots as declarative shadow DOM), assets, HAR, script-free mirror (SRI hashes dropped, media the capture never saw fetched); `--mirror-only` rebuilds the mirror; `--mode exact --permission` keeps runtime media |
| `scripts/seed.mjs` | `clone/` from the mirror: exact mode as is, template mode with layout-measured lorem text and same-size media placeholders; marks recorded reveals/scrubs/class changes (per width) and ships `trueclone-reveals.js`; GSAP pins become sticky elements in a spacer (`data-tc-pin`, per-width distances), canvases marked `data-tc-runtime`, per-width inline styles become media rules (`data-tc-w`); boot contract (`tc-boot`, `--hide-until-boot`); `clone/patches/` applied on every seed |
| `scripts/widgets.mjs` | Records every tab and menu state by clicking it (marks re-applied by path for nested widgets; menu regions widened to their aria-controls panel) |
| `scripts/reveals.mjs` | At every width in parallel: one-shot scroll reveals frame by frame, scroll-linked curves (sampled per settled scroll position; pins listed, not replayed) and scroll-caused class changes (with thresholds), library-agnostic |
| `scripts/design.mjs` | `design-tokens.json` → `DESIGN.md` (linted with `@google/design.md`), shadcn `globals.css`, `clone/tokens.css` |
| `scripts/motion.mjs` | Motion inventory from the live runtime (GSAP/ScrollTrigger, Lenis, Swiper, CSS animations, cursor probe). Parameters only, never the site's code |
| `scripts/states.mjs` | Live scroll states + inventory; `--clone` scores each step |
| `scripts/curves.mjs` | Motion score: sampled property curves (scroll- and time-driven) |
| `scripts/interact.mjs` | Interaction scenarios on both sides; `expectChange` covers geometry, text, state attributes and canvas pixels |
| `scripts/detail.mjs` | Style diff at matching points, measured the same way on both sides |
| `scripts/hovers.mjs` | Hover every interactive element on both sides |
| `scripts/load.mjs` | Load sequence on both sides: viewport frames at 0.25/0.5/1/2/4 s after navigation (cold cache, same emulated network) compared with the settled frame; score = 100 − mean gap between the two settledness curves |
| `scripts/rules.mjs` | Every CSS rule matching an element (+ pseudo-elements, `@media`), cross-origin sheets included |
| `scripts/textshape.mjs` | Template mode: placeholder words with the reference's rendered word widths (`--list` for repeated rows) |
| `scripts/next.mjs` | Next.js mode: HTML → JSX per section (whitespace kept as rendered, verbatim inside `pre`; a declarative shadow root host as raw HTML), motion as a client component, shadcn globals; seeded clones import the original's stylesheets after the theme, without Tailwind's preflight unless the original used Tailwind, preload the clone's scripts and run them in order the moment hydration is done (boot contract: `tc-boot` released after the last one); `--verify` scores it |
| `scripts/score.mjs`, `scripts/report.mjs` | All scores in parallel groups with time limits (`--only`, `--viewport`; checks whose inputs are unchanged are kept from their last run, `--fresh` re-measures; `score-times.json`), then `REPORT.md` |
| `scripts/explain.mjs` | One place on the page: the layout section, scroll states, differing detail probes and hovers there, plus a reference\|clone\|diff crop |
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
