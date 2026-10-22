# Changing content: how trueclone should compare animated, random and live regions

Research for RC5, 22 Oct 2026. I only read files. Nothing in `C:\dev\tc-tests\` was modified and no trueclone command
was run.

**Sources:**
- `C:\dev\rea-lab\scripts\*.mjs` (byte-identical to what RC4 ran; below as `lib.mjs:NN` etc.);
- `docs/eval-rc4/REPORT.md` and `projects/*.md`;
- the five RC4 run folders. Site folders below:
  - `B\` = `rc4-bhaskar\sites\heybhaskar\`
  - `V\` = `rc4-varsity\sites\varsity\`
  - `A\` = `rc4-allbirds\sites\allbirds\`
  - `Z\` = `rc4-zero\sites\zero\`
  - `S\` = `rc4-astro\sites\astro\`

**Verdict labels used in section 1:**
- **genuine** = the reference really differs from itself;
- **artefact** = the way the tool measures makes the two sides differ;
- **excused defect** = a clone defect closed or tolerated as noise.

---

## 0. Findings in one table

| # | Finding | Evidence | Consequence for RC5 |
|---|---|---|---|
| F1 | **Most "variability" in RC4 was measurement asymmetry, not page randomness.** Review frames anchor to each side's own `load` event. The clone loads from disk, the reference from the network. | `review.mjs:96-103`. varsity: the reference intro starts 215-335 ms before `load`, the clone's 2-12 ms before (`V\compare\intro-timing-evidence.md`, `intro-clock-*-evidence.json`). The load-300 frame scores 5.8-9.2% clone vs reference, but **97.85%** reference vs reference (`V\compare-reference-self-review\review\mobile\index.md`) | Fix the anchor and the network before adding tolerance. `load.mjs:30-40` already does both (navigation start, emulated network on both sides). `review.mjs` does neither |
| F2 | **The heybhaskar shuffle can be made deterministic, so it needs no tolerance.** | Only the Fisher-Yates in `6c0f70-app.js:866-870` calls `Math.random` at startup. app.js is a synchronous `<script>` (`B\reference\rendered.html:1236`). The only other `Math.random` (speed insights, `4d04ef-script.js`) is `defer`. The clone's shuffle is the first `Math.random` call in `B\clone\script.js:236-240`, over the same manifest order | `seededRandomInPage` (`lib.mjs:107`) on both sides would very likely give the same draw. It is used only in `journey.mjs:125`. BHASKAR-1/-3/-4 and 13 min of entrance work would not have existed |
| F3 | **Time-integrated scenes need clock control, not more samples.** varsity's cords are Verlet ropes whose step is the frame `dt` and whose sway is a sine of elapsed time. | `V\reference\scripts\2dd5aa-scenes.pretty.js:15563, 15568-15570`. zero's seeded random stream still drifted 12361 vs 12371 calls because the call count depends on frame timing (`Z\evidence\cloud-input-timing-audit.json`) | Use `page.clock` (Playwright 1.64 is installed; it fakes rAF, `performance.now`, `Date` and timers) together with seeding, on both sides |
| F4 | **The stabilisers also hide real behaviour.** | `freezeLoops` sets every endless animation to `currentTime 0` (`lib.mjs:398-406`). Capture runs with `reducedMotion:'reduce'` (`lib.mjs:197`), so the site's own `animation:none` rules apply (heybhaskar `styles.css:649, 894, 999`). Review does not freeze, and its marquee frames were closed as "same: ticker phase differs" (`B\notes.md:94-134`). bhaskar recorded **0 motion curves** (REPORT.md:21) | A clone with a stopped or wrong-speed marquee passes every numeric gate. Seek loops to equal **non-zero** times on both sides, so speed and direction are verified |
| F5 | **The third-party widget on allbirds was a clone defect, closed as tool noise.** | Seed baked the `#ads-agent-host` snapshot into `A\clone\index.html:4284`, and `patches\04-assistant.js` keeps it alive. With the two assistant rectangles excluded, mobile frame 04 agrees **99.99%** (`A\compare\mobile-scroll-isolation.json`) | Third-party widgets need an explicit decision ("hide on both sides" or "port it"), never "tool" verdicts. Today `--hide` cannot do this: it applies to the reference host only (`lib.mjs:207-208`) |

---

## 1. Catalogue of variable regions observed in RC4

### 1.1 heybhaskar (exact, 8 routes)

| Region | Class | Cause, established from evidence | Numbers | Verdict |
|---|---|---|---|---|
| `/playground` "All" grid order | shuffled content (Math.random) | `B\reference\scripts\6c0f70-app.js:866-870`: `const j = (Math.random() * (i + 1)) \| 0`, run once at app start. The SPA builds the grid on every route (rendered.html carries the playground and lightbox markup). The clone repeats it: `B\clone\script.js:228-240` restores manifest order, then Fisher-Yates | Capture self-draws 96.57 / 97.24, desktop only (`meta.json`). Agent's mobile reference-vs-capture: 92.95-95.57 (`B\compare\independent-gallery-pairs.json`). Clone route: 93.99 / 96.05 / 94.36 / 96.12 / 97.56 layout, mobile states 92.51. I viewed `B\compare\review\routes\playground\wide\00-load-300.png`: same shell, tabs, spans and Trio card; different first cards ("Monthly Savings" vs a KPI tile; "Upload Files" white card vs a different card) | **genuine**, but controllable (F2). The desktop gap (93.99 below all 8 reference draws) is **possibly a clone defect hidden by the lowered bar** (BHASKAR-3) |
| `/about` photo strip | animation timing/phase + delayed/lazy loading | CSS `about-scroll 80s linear infinite`, `translateX(-50%)` (`styles.css:888-894`). JS doubles the 28 items (`app.js:1041-1045`), giving a 13,772 px track with 56 lazy images. **The pixel offset depends on start time and on track width, and the track width grows as lazy images load** (`B\compare\independent-strip-review.json`: progress 0.0057 at 459 ms, 12 of the first 16 images complete). Hover pauses it (`:892`). Under `reduce` it is `animation:none` (`:894`) | Interaction "go to /about (mobile)": 95.03, 95.03, 92.81, 99.58, 92.8 over 5 scores. The last change touched titles and cursor, not the strip (bhaskar.md BHASKAR-9). Wide review frames 00-06 were all closed as "tool" (`B\notes.md:194-200`) | **genuine phase** (an endless loop). Made worse by an **artefact**: interact never freezes or seeks loops, and its "before" waits at most 6 s for stillness (`interact.mjs:148-152`). Strip *speed* was never verified (F4) |
| Case-sheet entrance (`/work/novatr…`, `/thrive…`) | animation timing/phase | A sheet transition `transform 0.46s cubic-bezier(.22,1,.36,1)`, opened by two rAFs (`app.js:523-524`). Probe at 1440 (`B\compare\independent-probe.json`), thrive: the reference at load+12 ms is already at translateY 83 px, and at +319 ms at 0. The clone at load+16 ms is at 852 px (not started), and at +307 ms at 10 px. **The reference starts its transition before `load`; the clone starts at `load`** | novatr wide 00-load-300: **96.66 → 60.4** on an unchanged area (`.trueclone-run\52-`, `91-review-novatr-*.log`); thrive wide 89.74 → 96.04; work wide 91.22 → 99.9. I viewed the 60.4 frame: the reference sheet is mid-slide (top about 185/540 px, list page visible behind it); the clone sheet is fully open | **artefact** (the load-event anchor, `review.mjs:96-103`) plus small genuine jitter. Not a clone defect: settled frames are 100 |
| Testimonial ticker (55 s), AI ticker (16 s) | animation timing/phase | `styles.css:995-999` (`ticker-scroll 55s`), `:645-649` (`ai-scroll 16s`); both `animation:none` under reduce | 14 review frames say "ticker phase differs" and were closed "same" (`B\notes.md:94-134, 156-157`) | **genuine phase**; speed unverified (F4) |
| Showreel / carousel | none (no video); a click-driven lightbox carousel | No `<video>`, mp4, webm, iframe or "reel" in `rendered.html`, the route folders or `reference\assets` (searched). The "carousel" is the playground lightbox, built once at `app.js:912+` and opened on click: arrows, Escape, 44 px swipe (`B\notes.md:26`). There is no autoplay. The moving "reel-like" content is the three CSS marquees above | The lightbox has no automated scenario. The agent checked it in its own probe (`B\compare\independent-functional.json`: next / previous / Escape pass) | not variable. **Coverage gap**: only verified outside the gates |
| "Thanks" scramble in the footer | shuffled content + timing | `app.js:684-735`: phrases every 2300 ms, per-glyph random start and end frames, random glyphs | No frame was flagged; the footer is usually out of view at load | genuine, latent |
| Live clock (IST) | live data | `app.js:283-294`: `toLocaleTimeString(... 'Asia/Kolkata')`, every 15000 ms | Both sides showed "4:08 AM" in the frames I viewed | genuine; becomes a difference whenever two sides are shot in different minutes |
| GitHub contributions chart | network / live data | `app.js:1047+` fetches the last 90 days live. The clone keeps captured data (`B\notes.md:61`) | none in RC4 | genuine drift over days (the reference will change after capture) |
| White "Upload Files" card on tablet | shuffled content | One random draw starts with white art: clone ink 0.044 vs reference 0.344, so the empty-page floor fires (`interact.mjs:271, 282-283`) | "go to /playground (tablet)": 79.62-94.77, final 85.76 | **artefact** (a ratio floor applied across two random draws) |

### 1.2 varsity (exact, 2 pages)

| Region | Class | Cause | Numbers | Verdict |
|---|---|---|---|---|
| Manifesto exit cords, desktop y 7650 (frame 17) / mobile y 7596 | physics/time-integrated simulation | A three.js Verlet rope of 40 nodes × 4 (`2dd5aa-scenes.pretty.js:15303, 15340-15347`). The step is `Math.min(v, 1/30)/2` from the frame delta (`:15568-15570`). The sway is a sine of `elapsedTime` since mount (`:15563`). The state machine depends on scroll history (`:15601`). Exit easing is `.07` **per rAF frame**, not per dt (`e597cb-manifesto.pretty.js:100`). Energy comes from ScrollTrigger velocity (`:63-64`). The mount is lazy: IntersectionObserver plus a network `import()` of 467 KB (`:87-98`) | Reference vs its own capture: desktop **51.55 / 49.21**, mobile **44.65 / 48.23** (`V\compare-reference-self-1/-2\states\report.mask.json`). Viewed (by the varsity investigator): the capture `reference\states\desktop\17.png` has **three cords**; self-1 has one cord at x 285-395; self-2 has one diagonal cord at x 750-840. Final Next: 50.28 | **genuine**. Amplified by the tool: one sample; `waitStill` skips `CANVAS` (`lib.mjs:650`); five viewports share the GPU (`states.mjs:46`), so dt varies; `canvasSimilarity` is coverage-weighted (`lib.mjs:538-556`), so 3 vs 1 cords gives about 50. The 47 min chase was over noise. Exception: controller attempt 187 (mobile **6.61**) was a **real clone regression**, and it was fixed |
| Intro frames load-300 / load-1500, all 5 sizes | animation timing/phase | GSAP timeline starts on the hero image `complete`/`load` (`5902b1-hero.pretty.js:1389-1403`), timed from `performance.now()` (`:1142-1215`, about 3.65 s total). Tool: frames at load+300/1500/4500 ms (`review.mjs:96-103`) | Clone vs reference load-300: 5.83-9.2; load-1500: 90.55-94.09. **Reference vs reference load-300: 97.85**, load-1500: 95.82. Viewed (varsity investigator): the reference photo is opaque, the clone's about 50% opaque at "300" | **artefact** (load anchor plus local vs network). 10 "tool" verdicts (`V\notes.md:80-81, 126-127, …`) are justified |
| Hero floating labels and pills | shuffled content (Math.random) | `5902b1-hero.pretty.js:885` (`x + Math.random() * (C - x)`), `:944`, plus random delays (`:1352`) | Reference vs reference mobile frames 11/12: 90.92 / 91.53 | **genuine**, controllable by seeding (call order permitting) |
| Stories Flip / parallax, team quote progress | animation timing/phase | Parallax easing `.12` per frame; 8000 ms auto-progress (`V\notes.md:33, 119, 319`) | Reference vs reference mobile 35: 97.42 | genuine transient |
| Cold load sequence | network/capture | `V\compare\load-177-variability-evidence.json`: two clone runs at laptop differ by 51.67 points | Load final 95.52-99.87 after the boot fix | Mixed: a **real clone defect** before (72.7-76.4, fixed by porting the boot state); network noise after |
| Auto-scenario "home return" | animation timing | interactions-auto shoots "arrived" at 1500 ms during a ~3.75 s intro | 89.96-94.96, fixed with a 4500 ms wait (`V\notes.md:303`) | **artefact** |

### 1.3 allbirds (template, 1 page)

| Region | Class | Cause | Numbers | Verdict |
|---|---|---|---|---|
| AI shopping assistant `#ads-agent-host` | third-party widget + personalisation/AB + network failure | An async loader from an Azure Front Door CDN (`A\reference\scripts\1939cc-frontendInjection.pretty.js:87, 112, 187-198`). Its manifest resolves the live index, which injects a shadow-DOM React app 4-5 network hops later. Content varies per visit: present or absent at 300 ms, a different nudge text, y536 vs y684 (`A\compare\reference-repeat*.json`). At review time all 8 SDK chunks failed with `ERR_ABORTED` and `host=false` on the reference (`A\compare\review-phase-probe.json`) | Clone-only in 103/105 review frames, each closed as "tool" (`A\notes.md:184-292`). Viewed by the allbirds investigator: `compare\review\mobile\sheet-01.png` shows a "Lorem ipsum" nudge and pill over the swatches on the clone side only. Excluding the two widget rectangles, frame 04 agrees 241,612 of 241,630 px = **99.99%** | Reference: **genuine** variability. Clone: an **excused defect**. Seed baked the captured snapshot into `A\clone\index.html:4284`, and `clone\patches\04-assistant.js` (15 KB) shows it on every load with Lorem text |
| SDK drift | third-party deploy drift | The captured index `index-3s-kPGgE.js` vs the live `index-D8t-UWIV.js`; the manifest's Last-Modified is after capture (`A\compare\sdk-drift.json`). Old chunks return 404/429 (`history\runtime-before-refresh\sdk-source\provenance.json`). `drift.mjs:1-5` checks only height and section count, so it reported nothing | The agent re-captured on its own; about 2.5 h were spent on the widget overall | **genuine** change, in third-party code only |
| Geofencing modal | personalisation/geo | `6b2736-geofencing.pretty.js:30-34, 77-99` compares the inferred country with the shop's country | Handled by `--hide`, but `profileOfSite` (`lib.mjs:180-188`) races and only the first parallel page got the hide. States sat at 14-25%; desktop **19.88 → 98.03 with no clone change** | genuine geo; **artefact** in measurement (ALLBIRDS-2) |
| Mobile scroll worst y flipping 1688 ↔ 2110 | third-party widget (clone-only) | Frames 1266-3376 all fall between 95.47 and 95.50. The constant penalty is the widget over the dock, so "worst" is chosen by 0.03-point noise. The status key includes y (`status.mjs:206`) | 94.33 → 94.12 over 7 cycles | **excused defect** plus a tool keying weakness |
| Load laptop/wide | delayed loading (network) | Hero JPEG arrival/decode and an 0.8 s fade. Reference wide run 1 stays at 84.38 until 2000 ms; run 2 is at 97.19 by 500 ms (noise 12.81). Laptop noise 2.04 with a gap of about 10 points (`A\compare\load.json`) | Laptop set aside at 92.22; wide 94.1 never named (ALLBIRDS-10) | genuine network variability plus a **template limit**: grey placeholders paint instantly, real photos do not |
| Global banner (5000 ms autoplay), brand marquee, one-shot reveals | animation timing/phase | `f54dd9-global-banner.pretty.js:62, 72`, `data-autoplay-delay="5000"`; `UL.marquee-content` had 862 style mutations (`A\compare\widget-activity-probe.json`) | The reference's third frame shows a different banner message | genuine |
| Material video poster | capture/instrument | The mask leaves the poster visible: reference RGB 136 vs clone RGB 168 (`A\compare\video-mask-probe.json`); `MASK_CSS` `img,video{object-position…}` (`lib.mjs:343`) | small | **artefact** (mask gap) |

### 1.4 zero.university (template, three.js canvas app)

| Region | Class | Cause | Numbers | Verdict |
|---|---|---|---|---|
| Checkpoint sampling time | capture artefact (animation timing) | `journey.mjs:137-147` settles **each side independently** (two equal shots 250 ms apart, up to 6000 ms), called per checkpoint at `:220`. The reference never stills, so it always waits the full 6000 ms; the clone stills sooner | Before the workaround (`Z\evidence\journey-adaptive-timing.json`): the reference was not still at 27/30 desktop checkpoints (clone 12/30), mean wait 5,926 vs 3,634 ms, **cumulative lag +68.8 s desktop and +62.0 s mobile**. The agent's fix was a fixed 6000 ms wait plus `settle: 1` in `Z\journey.json`; per-checkpoint skew is now ≤ 110 ms | **artefact**, now worked around in config, not in the tool |
| Post-FX grain, god rays, particles, clouds | animation timing/phase + physics/time-integrated | `8ad15d-main…pretty.js:39540-39561`: `uTime = clock.elapsedTime`, grain reseeded every 1/60 s. Particles: `uTime += dt` (`:28351`). Camera lerp `.08` **per frame** (`:24431, 29426`) | Final residual is small. The low checkpoints are template art (step-24..26: pixels 26-29 vs canvas 89-92) | genuine. The canvas metric hides the template differences |
| Seeded random stream | shuffled content | Seeded (`journey.mjs:125`), but which random call builds the clouds depends on how many frames ran first | Call index 12361 vs 12371 (`Z\evidence\cloud-input-timing-audit.json`) | **artefact**: seeding without clock control is not enough |
| Gate-1 whiteout read as still | animation timing | The two-shot still test accepted a transition frame (`Z\notes.md:56`) | | **artefact** |
| Load mobile | animation timing (a loader that never settles) | Run 1 vs run 2 final frames differ (`Z\compare\load.json`: 74 vs 46 against each run's own final frame) | Reference noise **33.15** at mobile | genuine. The load metric does not fit canvas apps |

### 1.5 astro (template, 4 pages)

| Region | Class | Cause | Numbers | Verdict |
|---|---|---|---|---|
| Load mobile marked unstable | delayed loading + network/capture | `load.mjs:78` takes two runs; `:82` noise = largest per-time gap; `:102` sets unstable above 15; `:91` caches the reference "forever" (until `--refresh-ref`). Reference run 1 was 83.61 at 250 ms, run 2 was 100; every later moment was 100. The likely cause is a cold first run of ~40 eager, async-decoded avatars at the paint edge (inference). Run 1's frame was overwritten (`:49` reuses file names), so it cannot be inspected | **noise 16.39**, `score:null` (`S\compare\load.json:23,39`). Desktop is the same shape at 12.42, so it was scored, and 98.76 is entirely the reference's own gap | **artefact**: two samples, a 250 ms moment on the paint edge, cached. Nothing was excused here (the clone is 100/100), but **a mobile load regression would now go unseen** |

### 1.6 Totals by class

| Class | Instances | Genuine | Artefact | Excused defect |
|---|---|---|---|---|
| animation timing/phase | 11 | 7 (loops, banner, reveals, grain) | 4 (load anchor, adaptive settle, still test, auto-scenario wait) | 0 |
| shuffled content | 5 | 4 (gallery, hero labels, scramble, zero particles) | 2 (ink-ratio floor, random stream offset) | 0, but the bhaskar desktop gap is unproven |
| physics/time-integrated | 3 | 3 (cords, zero clouds, particles) | amplified by a single sample and the GPU-shared dt | 0 (187 was a real regression and was fixed) |
| third-party widget | 3 | 2 (assistant presence and content, SDK drift) | 0 | **1** (the always-on Lorem assistant) |
| personalisation/geo/AB | 2 | 2 | 1 (profile race) | 0 |
| delayed/lazy loading | 4 | 3 | 1 (astro cold run) | 0 |
| network/capture failure | 2 | 1 | 1 (SDK `ERR_ABORTED` used as a baseline) | 0 |
| responsive | 1 (bhaskar mobile draws vary more than desktop) | 1 | calibration was desktop-only (`capture.mjs:378`) | 0 |

---

## 2. What the tool does today

### 2.1 Page set-up and settling

| Mechanism | file:line | What it does | Where it applies | Can it hide real behaviour? |
|---|---|---|---|---|
| `newPage` default `reducedMotion:'reduce'` | `lib.mjs:193-198` | Emulates `prefers-reduced-motion: reduce`. The site's own reduce rules apply (heybhaskar: marquees `animation:none`, `styles.css:649, 894, 999`; JS `reduce` at `app.js:26, 220, 1006`) | Every call without an override: **capture main pass** (`capture.mjs:150`), routes (`:338`), route self-draws (`:383`), `diff.mjs:39` (the layout score), `drift.mjs:28`, `spec.mjs:68`, `owned.mjs:36`, `brief.mjs:46`, `seed.mjs:547`; `widgets.mjs:133` explicitly | **Yes.** The layout gate measures the site's *reduced-motion variant*. A site that swaps a carousel for a static stack, or hides a hero video, under reduce is laid out differently for real visitors. Only states and review (no-preference) see the default variant |
| `reducedMotion:'no-preference'` | `states.mjs:50`, `review.mjs:93`, `interact.mjs:65, 127`, `load.mjs:31`, `journey.mjs:124`, `motion.mjs:189`, `curves.mjs:179`, `hovers.mjs:121`, `detail.mjs:156`, `reveals.mjs:205`, `textshape.mjs:268`, `rules.mjs:27`, `understand.mjs:68` | Default visitor | | — |
| `settle` + `FREEZE_CSS` | `lib.mjs:64-65, 319-337` | `animation-duration:0s; animation-delay:0s; transition:none` on every element, plus a scroll-through, `networkidle` and fonts | capture, diff, spec, drift, detail, hovers, owned, rules, textshape, understand | **Yes.** Every animation jumps to its end (an endless loop to its 0 s end), so loop speed, easing and timing are invisible to layout |
| `freezeLoops` | `lib.mjs:398-406` | `getAnimations()` with `iterations === Infinity`: `currentTime = 0; pause()` | `states.mjs:83` only | **Yes.** A stopped, reversed or wrong-speed marquee is identical at t=0. Not applied in review, interact or load |
| `waitStill` | `lib.mjs:641-683` | Polls box, opacity and transform of on-screen elements; skips `VIDEO`/`CANVAS` (`:650`); an element changing on ≥90% of polls counts as "continuous" and is ignored | states, interact, motion, detail, rules, reveals, widgets, textshape, curves | **Yes.** Canvases are never waited for (the varsity y7650 shot was taken at DOM stillness: `settleMs` 461) |
| `mediaReady` | `lib.mjs:583-589` | Makes lazy images in view eager and decoded, up to 8 s | interact shots (`interact.mjs:163`) | Low risk; hides lazy-load *timing* only |
| Review: lazy images to eager | `review.mjs:106-110` | Same, before the scroll frames | review | Low |
| `journey.mjs` `settle` | `journey.mjs:137-147, 220` | Per-side adaptive stillness (two equal shots 250 ms apart, ≤ 6000 ms) | journey | Desynchronises the sides (zero +62-69 s) |
| `seededRandomInPage` | `lib.mjs:107-110`, used only at `journey.mjs:125` | Replaces `Math.random` with a fixed generator (seed 20261021) via `addInitScript` | **journey only**: not capture, states, review, interact, load, hovers or detail | No (it is neutral), but it is unused where it would help (F2) |
| Load timing | `load.mjs:28-40` | Emulated network (40 ms, 1.25 MB/s), cache off, frames at 250-4000 ms from **navigation start** | load | — (the right anchor; review lacks it) |
| Review timing | `review.mjs:96-103` | Frames at **load event** +300/1500/4500 ms, real network vs local disk | review | Produces artefacts (F1) |

### 2.2 Masks and exclusions

| Mechanism | file:line | What it does | Can a whole carousel or canvas be masked away? |
|---|---|---|---|
| `MASK_CSS` (structure) | `lib.mjs:340-348`, `mask()` `:388-393`, `maskToggle` `:409-424`, `maskExtrasInPage` `:356-386` | Text transparent; `img, video` greyed by moving `object-position` off-box over `#888`; SVG children hidden; iframes hidden; **canvas becomes a flat grey box** (`contrast(0)`); background photos greyed (a MutationObserver keeps re-marking them) | **Canvas: yes.** Its content never reaches the layout or states structure score; only `canvasSimilarity` in states and journey looks inside. **Carousel: partly.** Slide images are grey, but slide boxes and the track `transform` remain, so a carousel at a different index differs only when slide geometry differs. A video poster can leak through (allbirds RGB 136 vs 168) |
| `*.mask.png` | `capture.mjs:282-283` (start page), `:373-374` (routes) | The structure shot of the reference | The **layout gate is always the masked comparison** (`report.mjs:43` reads `report.mask.json`), also in exact mode |
| `data-tc-viewmount` | `capture.mjs:792`, `diff.mjs:47-56` | View-mounted content is painted the same flat colour on both sides | The only region-exclusion mechanism. Not user-controllable; applies to layout only |
| `--hide` (meta.hide) | `lib.mjs:204-214` | `display:none!important` via an adopted sheet, **only when the hostname is the reference's** (`:208`) | It hides a reference overlay. It **cannot** hide a clone-side widget, and there is no "ignore this region on both sides" |
| Accepted differences | `report.mjs:31, 90-91` | A Findings line with `evidence:` naming an existing file; never below 95 (`ACCEPT_FLOOR`) | Not wired to routes (BHASKAR-2) |

### 2.3 Self-calibration (the reference measured against itself)

| Mechanism | file:line | Samples | Sizes / checks | Effect | Hides real behaviour? |
|---|---|---|---|---|---|
| Route `unstable` | `capture.mjs:378-393` (`if (vp.name === 'desktop')`); `report.mjs:211-213` (`bar = min(target, match - 1)`) | 2 extra loads, minimum | **desktop only**, structure shot; applied to layout **and** states at **all 5 sizes** | bhaskar: bar 95.57 everywhere; the mobile reference itself gets 92.95-95.57 | **Yes.** The lowered bar also admits real layout defects (BHASKAR-3: desktop 93.99 < every reference draw). Unstable routes are **dropped from Next parity** (`status.mjs:286-293, 304`) and from interactions scoring (`interact.mjs:309-317`) |
| Load noise | `load.mjs:25, 74-84, 97-105` | 2 runs per side (3 if a frame is missing) | per size | Reference noise > 15 means `score:null`, "not scored"; clone noise > 15 means scored by the worse run | **Yes.** An unstable width is never scored again until `--refresh-ref` (astro mobile; a clone with a broken mobile load would pass) |
| Detail / hovers unstable probes | `detail.mjs:208-228`, `hovers.mjs:190-204` | the reference read twice | per probe | Probes that differ between reads are dropped | Mild (per-probe) |
| Canvas | `report.mjs:35-36, 144-147`; `states.mjs:110-124` | **none** (no reference self-repeat) | every canvas frame ≥ 60, mean ≥ 90 | varsity y7650 can fail on the reference itself | The reverse problem: noise reads as failure (VAR-2) |
| Interactions `notBehaviour` | `interact.mjs:300` | the reference shot before and after | auto-scenarios | An auto-scenario where the reference shows no change is set aside | Can hide behaviour that was simply mistimed (a carousel mid-autoplay hides the click's effect) |
| Interactions `unstable` | `interact.mjs:269, 309-317` | inherits the route flag | scenarios starting on or going to an unstable route | Not scored unless empty, HTTP ≥ 400 or wrong address | **Yes.** The whole gallery and lightbox behaviour on `/playground` is unscored |
| Empty-page floor | `interact.mjs:271, 282-283`; `inkShare` `lib.mjs:569-579` | — | clone ink < 0.3 × reference ink | A false fail across random draws (BHASKAR-4) | — |

### 2.4 Scoring tolerant of change

| Mechanism | file:line | What it does | Hides real behaviour? |
|---|---|---|---|
| `canvasSimilarity` | `lib.mjs:538-556` | 50% intersection of 64-bin colour histograms + 50% "ink coverage" against the dominant colour. Position-blind | **Yes.** Cords in the wrong place, a frozen scene or mirrored art can score high. zero: canvas 89-92 where pixels are 26-29. It also rewards palette fitting (ZERO-5) |
| Journey template score | `journey.mjs:439, 456-459` | Canvas histogram only in template mode | Same |
| Review tokens | `review.mjs:162-171` | FNV hash of 16×10 sample points at 8 grey levels (`>>5`), 5 chars | **Yes.** A small clone-only widget, or text, rarely changes a 160-point, 8-level sample, so an old verdict sticks (A9; allbirds 27 re-shot frames kept verdicts unseen) |
| Review closure | `report.mjs:81-83` | "same" (with a reason below 85%) or "tool" plus any evidence file that exists and is not CSS/JS | **Yes.** allbirds: 103/105 "tool", with a visible clone-only overlay |

### 2.5 Risk summary: where stabilisation hides behaviour from verification

1. **Endless CSS loops:** frozen at 0 in states, `animation:none` under reduce in layout, unfrozen but unjudged in review. Speed and direction are never scored, and no motion curve is recorded for CSS loops on bhaskar.
2. **Canvas content:** greyed in structure, compared only by histogram and coverage.
3. **Unstable routes:** lowered bar, interactions not scored, excluded from Next parity.
4. **Unstable load widths:** never scored.
5. **`--hide`:** reference-only, so a widget the clone keeps is "correct" on the reference and can only be excused by "tool" verdicts.

---

## 3. Recommended comparison strategy per variability class

### 3.1 Principles, ordered by priority

| # | Principle | Why (RC4 evidence) |
|---|---|---|
| P1 | **Symmetric measurement first.** Both sides use the same network emulation, the same time anchor (navigation start, or better virtual time), the same seed, the same input script and the same reduced-motion setting. | F1: 5.8-9.2% becomes 97.85% when the asymmetry is removed |
| P2 | **Control the source of change instead of tolerating it.** Seed `Math.random`, install a virtual clock and seek CSS/WAAPI animations, on both sides, in every check where it is safe. | F2, F3 |
| P3 | **Capture equivalent states by driving the page, not by waiting.** Same carousel index, same virtual age since navigation, same animation `currentTime`, same scroll input sequence. | varsity cords, bhaskar entrance, zero adaptive settle |
| P4 | **Sample only what cannot be controlled** (server personalisation, third-party loads, network, GPU). Accept the clone if it falls inside the reference's own distribution, per size and per check. | BHASKAR-1 (one size calibrated), VAR-2 (no calibration), astro (2 samples) |
| P5 | **Split stable structure from changing pixels.** Gate on boxes, computed styles, type, media boxes and `object-fit`, and on behaviour. Use pixels only where the two states are equivalent. | allbirds 99.99% without the widget; zero canvas vs pixels |
| P6 | **Behaviour tests replace screenshots for things that move by design.** Measure interval, speed, direction, controls and pause rules. | F4: marquee speed unverified; lightbox only in an agent probe |
| P7 | **Stabilisation is evaluation-only.** It is injected through the Playwright context or CDP at measurement time on both sides, never written into clone files, and always paired with one unstabilised "live" pass. | the clone must keep its behaviour |
| P8 | **Every tolerance is listed in REPORT.md with its own evidence.** No silent `score:null`. | astro mobile load and bhaskar Next parity silently dropped |

### 3.2 Strategy per class (implementable)

| Class | Primary strategy | Fallback | Stable properties gated | Behaviour checks | Where in code |
|---|---|---|---|---|---|
| **Shuffled content (Math.random)** | `context.addInitScript(seededRandomInPage)` on **both** sides in capture, diff, states, review, interact, hovers, detail and load. Then a **draw signature**: after load, hash the ordered list of `img.currentSrc` / text of repeated siblings in the container (e.g. `.pg-grid > *`). Equal signatures mean strict targets (98 / 95), with no unstable bar | Signatures differ (a different call order: third-party scripts or a different pre-shuffle order): (a) report "draw differs with the same seed" as a **finding about the clone's pre-shuffle order or call order**; (b) score by distribution (row below) | Set equality of items (multiset of `src`), per-item box sizes, grid template, spans (`pg-wide`) | A reload with a different seed changes the order on both sides (the shuffle exists); the order holds within a visit (tabs → All keeps it, `B\notes.md:26`) | `lib.mjs:107` exists; add it in `newPage` behind a `stabilise` option; signature in `capture.mjs` next to `:378` |
| **Animation timing/phase: one-shot intros and transitions** | **Virtual time:** `page.clock.install({ time: <fixed epoch> })` before `goto`, then `runFor(t)` from navigation; shoot at equal virtual ages on both sides. For CSS/WAAPI: CDP `Animation.setPlaybackRate(0)` (or `getAnimations()`), and seek each animation to `virtualNow - its virtual start` | Without a clock: anchor at navigation start with emulated network (as `load.mjs:39`), take 2 reference shots, and flag a frame whose reference-vs-reference < 95 as "unstable frame: judged settled-only" | End state (the settled frame, already 100 on bhaskar and varsity) | Duration and easing from `getAnimations()` timing (both sides), plus start trigger (load / DOMContentLoaded / image `load` / in-view). Compare **trigger and timing**, not the frame | `review.mjs:96-103` |
| **Animation timing/phase: endless loops (marquee, ticker, spinner)** | Replace `freezeLoops` (seek to 0) with **two seeks on both sides**: `currentTime = 0` and `currentTime = 0.25 × duration`. Pixel-compare both. The second frame catches a wrong speed, direction or track width | Track width depends on lazy images (bhaskar strip): run `mediaReady` over the whole track first; compare `track.scrollWidth` | Track box, item boxes, gap | Loop duration, direction, iteration count, `animation-play-state` on hover (bhaskar `:892`), behaviour under `reduce` (expect `animation:none` if the site has it) | `lib.mjs:398`, `states.mjs:83`; add to `interact.mjs:146` and `review.mjs` |
| **Carousel / slider / autoplay banner** | **Drive the index:** read the active index (aria-current, `.is-active`, translate ÷ slide width) on the reference; on the clone, click next/prev or swipe until the indices are equal (or under the virtual clock, `runFor(k × interval)`); compare pixels at the equal index after the transition | No readable index: sample the reference over one full cycle (N = slide count frames); accept the clone frame if it matches **some** reference frame ≥ target (min distance to a set) | Container box, slide box sizes, count, controls (position, size, disabled state), dots | Autoplay interval (time between index changes, ±10%), transition duration/easing, loop wrap, pause on hover/focus, next/prev step = 1, swipe threshold, keyboard. Each is a measured scalar on both sides | new `behaviour.mjs` (or extend `interact.mjs` scenarios with `measure:` steps) |
| **Physics / time-integrated simulation (canvas)** | **Clock + seed + identical input:** install the clock, seed, then a fixed input script (wheel deltas, pointer path) with `runFor(16)` between steps, so dt is fixed and the frame count deterministic. The cords' sway phase becomes identical. Compare canvas pixels or downscaled luminance/edges at equal virtual times | The scene runs in a worker, uses AudioContext time, or the clock breaks the page: **distribution**: K reference samples at the same scroll y (K = 3-5); accept the clone if `min(clone vs refs) ≥ min(ref_i vs ref_j) − 2` per frame and per size, and store reference self-min with the reference | Canvas element box, backing size / DPR, visible while expected, blend/opacity | The scene reacts to input (frames with and without input differ on both sides); frame rate; the state machine reaches the same state (hooks such as the site's own `k.state` are not available, so use coverage over time) | `states.mjs:110-124`, `report.mjs:35`, `journey.mjs:137-147` |
| **Delayed / lazy loading** | Same emulated network on both sides (already in load); for stills, `mediaReady` everywhere | ≥ 3 reference runs; noise = interquartile range, not max(|a−b|) of 2; **never `score:null`**: score against the reference's best and worst runs (the clone passes if inside [worst − ε, best]) | Placeholder box size equal to the final box (no layout shift) | Lazy vs eager attribute, `decoding`, fade duration | `load.mjs:78-104` |
| **Personalisation / geo / AB** | Pin it: `--cookie`, `--locale`, `--hide` for overlays (fix the race, ALLBIRDS-2); record the variant (text, experiment bucket) in `meta.json` | Sample N reference visits; the clone must match one variant | Region box and presence | — | `lib.mjs:180-214` |
| **Third-party widget** | Explicit decision at capture, listed in REPORT: **(a) not part of the site** means hide it on **both** sides by selector (a new `--ignore` that paints the same flat box on both sides, like `diff.mjs:47-56`) and lint the clone for it (a clone-only element = `differs`); **(b) port it** means compare as a carousel/behaviour region | Detection: shadow hosts / iframes from a third-party origin that differ across two reference loads (`#ads-agent-host`) | Box of the launcher if ported | Opens on click, closes | `capture.mjs` overlay detection; `report.mjs:83` must reject "tool" for clone-only elements |
| **Responsive behaviour** | Every calibration per size (BHASKAR-1) | — | — | — | `capture.mjs:378` |
| **Network / capture failure** | Detect it: failed requests for script/module/media on the reference during a check (`requestfailed`) mark that sample invalid and re-run it; never use a failed load as the baseline | After 2 failures: report "reference incomplete" for that region; no score | — | — | every `newPage` caller (`page.on('requestfailed')`) |
| **Live data (clock, GitHub chart)** | `page.clock.install({ time })` fixes `Date` (both sides show the same time); live fetches are served from the capture (route interception from the HAR) during scoring | Mask by selector with evidence | Box | Update interval (clock 15000 ms) as a behaviour check | — |

### 3.3 "Distribution" acceptance rule (for what cannot be controlled)

| Step | Rule |
|---|---|
| 1 | Take K ≥ 3 reference samples per (route, size, check, frame). They are cached with the reference and refreshed with `--refresh-ref`. |
| 2 | Reference self-floor `R = min over i<j of sim(ref_i, ref_j)` and spread `σ`. |
| 3 | Take M ≥ 2 clone samples (seeded / clock-driven where possible). |
| 4 | **Pass** if `max_j min_i sim(clone_j, ref_i) ≥ min(target, R − margin)`, *and* `min_j max_i sim(clone_j, ref_i) ≥ R − 2·margin` (every clone draw looks like some reference draw). The margin is 1 point by default. |
| 5 | **Fail with "below the reference's own range"** if every clone draw is below every reference pair (bhaskar desktop: 93.99 vs reference 96.57-98.09). This is the BHASKAR-3 test, made automatic. |
| 6 | If `R < 50` (varsity y7650): pixels are meaningless for that frame. Gate it on stable properties and behaviour only, and say so in REPORT. |

Min-vs-min instead of min-1 matters because `report.mjs:213` lets any clone through that is within one point of the worst *single* reference pair. With one sample per side that is a coin toss in both directions.

### 3.4 How a carousel or canvas section stays verified when its pixels vary

| Layer | Carousel | Canvas scene | Already exists? |
|---|---|---|---|
| Structure (masked layout) | container, slide and control boxes; `overflow`; track `transform` reduced to index × slide width | canvas box, CSS size vs backing size (DPR), z-order, visible when expected | yes (`MASK_CSS`), keep it |
| Computed style | slide gap, border radius, object-fit/position of slide media, control styles, active-dot style | background colour behind the canvas, blend mode, opacity curve on scroll (varsity fade `e597cb:122-126`) | `detail.mjs` probes; add carousel and canvas roles |
| Equivalent-state pixels | index k on both sides after the transition (driven) | equal virtual time + seed + input script | **new** |
| Behaviour scalars | interval, transition duration/easing, wrap, pause rules, step size, swipe threshold | reacts to scroll/pointer; frame cadence; state sequence (falls/hangs/forms) as coverage-over-time curves on both sides | **new** (curves exist for DOM motion: `curves.mjs`, `motion.mjs`) |
| Distribution pixels | only if the index cannot be driven | only if the clock cannot be used | **new** (replaces `CANVAS_FLOOR` on one sample) |

### 3.5 Keeping stabilisation evaluation-only

| Rule | Implementation |
|---|---|
| Stabilisers live in the measurement context only | `newPage(browser, vp, { stabilise: { seed, clock, animations } })`. Everything goes through `addInitScript`, `page.clock` or a CDP session, as today with `seededRandomInPage`. Nothing is written to `clone/` |
| Same stabilisers on both sides, always | A single helper is used by both the reference and the clone call. The REPORT header lists them ("seeded, virtual clock, loops seeked") |
| A live pass proves behaviour still exists | One unstabilised run per scenario/region: the carousel advances within 2× its interval; the marquee moves; the canvas changes between two frames 500 ms apart; the gallery order differs across two unseeded reloads (bhaskar shuffle exists). This pass *fails* a clone that hard-coded a stable state |
| Lint the clone for test hooks | Fail when clone files override `Math.random`, `performance.now`, `Date` or `requestAnimationFrame`, set `animation: none` without a `prefers-reduced-motion` query, or contain `data-tc-*` stabilisation attributes beyond the seed's own |
| Next app inherits the same | `next --verify` uses the same `stabilise` profile, and parity covers the live pass |

### 3.6 Template mode: media that cannot be obtained

| What can be claimed | How it is measured | What must **not** be claimed |
|---|---|---|
| **Geometry equivalence:** box, aspect ratio, `object-fit`/`object-position`, crop, rounded corners, z-order | Masked layout (already), plus computed styles of `img`/`video`/`canvas`/`picture` | "looks like the original" |
| **Media-type and attribute equivalence:** img vs video vs canvas; `autoplay muted loop playsinline`; poster present; `loading`/`decoding`; `srcset` sizes per breakpoint | DOM attribute diff per media element | the same frame content |
| **Timing equivalence:** placeholder → loaded transition (fade 0.8 s on allbirds), autoplay start | load curves with both sides on the emulated network; `getAnimations()` timings | the same load curve when the reference's photos take network time (allbirds laptop gap 10 points is a **template limit**, not a defect: report it as "template: media not transferable") |
| **Behaviour equivalence:** carousel/scene rules (section 3.4) | behaviour scalars | — |
| Canvas in template mode | structure + behaviour only; **no colour-histogram score** (it rewarded palette fitting in zero, ZERO-5) | percentages near 100 from histograms |

Report template media as a separate verdict level: **"structure- and behaviour-equivalent; media replaced"**, not as a pixel score.

### 3.7 Assumptions the evidence challenges

| Assumption in RC4 | Evidence against | Better approach |
|---|---|---|
| "A random route needs a lower bar." | bhaskar's only startup random call is the shuffle (F2); the lowered bar admitted a possibly real desktop gap (BHASKAR-3) | Seed + signature; distribution only when signatures differ |
| "Early review frames are noisy." | Reference vs reference is 97.85% when both are on the network (varsity) | Fix the anchor (navigation start / virtual time), not the verdicts |
| "Freezing loops at 0 makes stills fair." | It also makes a stopped marquee pass | Seek to two equal non-zero times |
| "`reducedMotion:'reduce'` is a neutral stabiliser." | heybhaskar ships 6 `prefers-reduced-motion` blocks plus JS `matchMedia` branches; reduce is a different presentation | Keep reduce for the layout gate only if the site has no reduce rules; else run the layout gate at `no-preference` with clock+seek, and score the reduce variant as its own (small) check, because it is real site behaviour too |
| "One reference sample defines the target." | varsity y7650: the reference fails itself at 44-52 | K samples where pixels vary; behaviour where R < 50 |
| "Seeding alone makes canvas apps deterministic." | zero stream offset 12361 vs 12371 | Seed + clock together |
| "Third-party noise justifies 'tool'." | allbirds 99.99% with the widget excluded; the widget was clone-only | Decide hide-both or port; a clone-only element is `differs` |
| "More samples are always better." | They quantify noise but never remove it, and they cost a full page load each | Control first (cheap), sample the residue (expensive) |

---

## 4. Feasibility

### 4.1 What Playwright/Chromium support

| Technique | Support | Notes and limits |
|---|---|---|
| `page.clock` (`install`, `pauseAt`, `runFor`, `fastForward`, `setFixedTime`, `setSystemTime`, `resume`) | **Clean.** Playwright **1.64** is installed (`rea-lab/package.json`, `node_modules/playwright-core/package.json`); the API exists in `lib/coreBundle.js` | Fakes `Date`, `setTimeout/Interval`, `requestAnimationFrame`/`cancelAnimationFrame` (rAF as 16 ms timers), `requestIdleCallback` and `performance.now` (checked in `coreBundle.js`). **Not faked:** CSS animations and transitions, WAAPI `document.timeline`, `<video>` playback, `AudioContext.currentTime`, **Web Workers / OffscreenCanvas**, `MessageChannel` scheduling. Must be installed before `goto` |
| `context.addInitScript` seeding | **Clean**, already used (`journey.mjs:125`) | Covers every frame of the context; not workers. Determinism needs the same *call order* on both sides (true for bhaskar, not guaranteed for bundles that call `Math.random` in vendor code or in rAF loops) |
| CDP Animation domain (`Animation.enable`, `setPlaybackRate`, `seekAnimations`, `setPaused`, `animationStarted`) | **Clean in Chromium** through `context.newCDPSession(page)` (pattern already at `load.mjs:33`) | Controls CSS animations, transitions and WAAPI. `setPlaybackRate(0)` at context start plus seek gives exact phases. Chromium-only (fine: the tool is Chromium-only) |
| `document.getAnimations()` + `currentTime` | **Clean** (already `freezeLoops`) | Simpler than CDP for loops; misses animations created after the call (re-run before each shot) |
| `page.screenshot({ animations: 'disabled' })` | **Clean** | Built-in equivalent of FREEZE_CSS + freezeLoops for a single shot (finite to end, infinite to start). Has the same blind spot (F4) |
| `Emulation.setVirtualTimePolicy` (virtual time budget) | **Fragile.** Experimental CDP; Playwright doesn't expose it | Interacts badly with Playwright's real-time waits and screenshots: a capture can stall while virtual time is paused. Not recommended as the primary mechanism |
| `HeadlessExperimental.beginFrame` (deterministic frames) | **Not available as launched.** Only `chrome-headless-shell` with `--enable-begin-frame-control`; the tool launches `channel:'chrome'` first (`lib.mjs:96-100`) | Would give true frame control for WebGL. It needs a different browser binary, so it is out of scope for RC5 |

### 4.2 Integration cost (what has to change around the clock)

| Helper | Today | Under a paused clock | Change |
|---|---|---|---|
| `waitStill` (`lib.mjs:641`) | Real-time polls, `waitForTimeout` | Nothing moves unless the clock advances, so the page looks "still" instantly | `advance(ms)` = `clock.runFor(ms)` plus seeking CSS animations by the same ms; poll after each advance |
| `wheelTo` / `scrollSettled` (`lib.mjs:684-724`) | Waits for smooth scroll in real time | Lenis/ScrollTrigger glide on rAF, so they freeze | Interleave `runFor(16)` while polling `scrollY` |
| `settle` networkidle (`lib.mjs:333`) | Real network | Network is real-time, unaffected | Keep. Run timers with `runFor` until idle |
| `review.mjs` frames | load + real ms | — | Virtual age since navigation |
| `journey.mjs` holds and gestures | Real ms | Holds measured by the app's `performance.now` | `runFor(hold.ms)` |

### 4.3 Capture-time cost

Estimates are inferences from the RC4 run timings.

| Item | Cost |
|---|---|
| Seeding everywhere | ~0 |
| Clock + seek | ~0 to slightly faster: `runFor(4500)` executes 280 rAF ticks without waiting real time. WebGL scenes render each tick, about 1-5 s CPU for a 5 s intro (inference) |
| Draw signature per route | 1 `evaluate` per page, ~0 |
| Extra reference samples, only where control fails (flagged after 2 draws) | One extra page load + settle per sample: bhaskar route self-draws ran inside the 3.7 min capture of 8 routes × 5 sizes. The eval estimated +2-5 min per site for one more states/canvas pass (REPORT §5 item 4). With control first, K-sampling is needed on few frames (varsity: the exit cords; allbirds: the widget, if ported) |
| Behaviour tests (carousel interval, loop speed) | Under the clock: <1 s real time per region (fast-forward through 3 intervals); without it: 2-3 intervals in real time (bhaskar ticker 55 s, so use the clock or WAAPI timing reads, never real-time waits) |
| Live (unstabilised) pass | One extra load per scenario/region at one size, ~10-20 s per region |

### 4.4 Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Site detects or breaks under clock control: frozen `Date` vs server time (signed URLs, token expiry, "x min ago", consent expiry), bot scripts checking timing jitter or `Function.prototype.toString` of patched globals | medium on commerce sites (allbirds-like), low on portfolios | `install({ time: Date.now() })` (real epoch), and only `pauseAt` after DOMContentLoaded. Detect breakage: new `pageerror`s, failed requests or a different DOM signature vs an unclocked load, then mark the site "clock-incompatible", fall back to sampling and say so in REPORT |
| WebGL timing outside the clock (worker render loops, `AudioContext` clocks, video textures) | medium for canvas apps | Detect workers/OffscreenCanvas (`page.on('worker')`); fall back to distribution |
| GPU nondeterminism (antialiasing, float precision, SwiftShader vs GPU) | low within one browser on one machine | Compare downscaled luminance/edges with a small tolerance, not exact pixels |
| Frame-rate-dependent code (`exit += … * .07` per frame, varsity `e597cb:100`; zero camera lerp `.08` per frame) | certain in these sites | The clock fixes the frame count per virtual ms; without it, parallel viewports (`states.mjs:46`) change the frame rate, so run canvas checks serially or under the clock |
| Seed call-order mismatch (vendor code calling `Math.random` first; the clone's code differs in order) | medium | The draw signature detects it, which turns it into a finding instead of noise |
| Stabilisation masking a real defect | real (F4) | The live pass, two-phase loop seeks, and behaviour scalars |
| Lazy-dependent loop geometry (bhaskar strip width grows as images load) | certain where loops contain lazy media | `mediaReady` over the entire track before seeking; compare `scrollWidth` |
| Clock install interacts with Playwright auto-waits | low | Playwright's own waits are real-time and still work; only page-side timers are virtual |

### 4.5 Suggested RC5 order (smallest change, biggest effect)

1. Seed on both sides in every check, plus the draw signature (fixes bhaskar `/playground` outright).
2. Review frames anchored at navigation start with emulated network on both sides (fixes the varsity and bhaskar entrance frames); then virtual-time ages.
3. Loops seeked to two equal non-zero times, plus loop-speed behaviour scalars (closes F4).
4. Per-size, per-check reference self-calibration with min-vs-min (BHASKAR-1/-3, VAR-2), used only where control fails.
5. `page.clock` for canvas and physics checks (varsity cords, zero journey), with the clock-incompatible fallback.
6. Third-party decision (`--ignore` on both sides or port), and reject "tool" for clone-only elements.
