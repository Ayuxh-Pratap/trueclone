# RC5 research: the similarity metrics

Audit of every similarity measure trueclone 0.5.0-rc.4 computes and gates on, checked against saved RC4 frames. Source
read: `C:\dev\rea-lab\scripts\*.mjs` (byte-identical to what the RC4 runs executed, see `eval-rc4/REPORT.md` section 2).
Run data read only: `C:\dev\tc-tests\rc4-zero\sites\zero\`, `C:\dev\tc-tests\rc4-varsity\sites\varsity\`. Nothing in
those folders or in rea-lab's scripts or skill was modified.

Scratch scripts and raw outputs (session scratchpad, not part of the repo):
`C:\Users\AYUSHP~1\AppData\Local\Temp\claude\C--dev-github-finds\74777172-e120-4cee-9679-ce3cfd3beef3\scratchpad\metrics\`
(`m.mjs` metric implementations, `sanity.mjs`, `zero.mjs`, `varsity.mjs`, `envelope.mjs`, `seq.mjs`, `token.mjs`;
outputs `zero-out.json`, `varsity-out-desktop_mobile.json`, `envelope.txt`). They import `matchPct`,
`canvasSimilarity`, `inkShare` and `PNG` from `scripts/lib.mjs`, so the tool's own numbers are reproduced exactly
(zero desktop canvas 90.5 / mobile 88.91, varsity desktop y 7650 51.55 / 49.21 match the saved reports).

Labels: **Obs** seen in a file or a measured number; **Inf** inference; **Rec** recommendation.

---

## 0. Summary

| # | Finding | Evidence |
|---|---|---|
| 1 | `canvasSimilarity` measures colour distribution only. It has no spatial term, so it cannot stand in for layout. On zero it is uncorrelated with every spatial measure across checkpoints (Pearson r 0.04 / 0.19 with pixels, -0.09 / 0.03 with SSIM, desktop / mobile), while pixels, SSIM and thumbnail correlation agree with one another (r 0.71-0.87). | 2a |
| 2 | Its hard 2-bit bins give 50 for two flat frames 1 RGB level apart (127 vs 128, 191 vs 192), and 100 for the same pixels with 64 px tiles shuffled or mirrored. | 2c |
| 3 | 11 of 30 zero desktop checkpoints and 9 of 27 mobile checkpoints score canvas ≥ 88 while SSIM is < 40 or composition correlation < 60 (e.g. desktop step-10: canvas 93.88, SSIM 31.07, thumbnail r 31.8: a different camera framing of the same palette). | 2a |
| 4 | On varsity y 7650 no single-frame image metric separates noise from a real defect. A synthetic "cords deleted" frame scores pixel 87.17, SSIM 75.1 and canvas 43.6, inside or above the reference's own replays (83-85, 68-69, 49-52). Two things do separate them: (a) scoring against the **set** of reference draws (nearest draw) and (b) a **stable property over the frame sequence** (cord-colour coverage per frame). | 2b |
| 5 | The current canvas floor is scored against one draw (the capture). The HTML clone, fitted to that draw (three cords), gets 95.97. The Next app and the live site itself (one cord) get 49-51. Against the nearest of three reference draws, Next gets 98.11 and the HTML clone 95.97. | 2b |
| 6 | On mobile y 7596 the Next frame has **no cord pixels at all** (0.00 % against 1.16-7.30 % in the three reference draws) and passes the canvas floor at 87.13. The current metric hides a possible real defect here, and the stable-property check would flag it. | 2b |
| 7 | The review token (`review.mjs:164-170`) changes on a 1 RGB level change for 20/20 zero frames and 10-11/20 varsity frames, and on a 1 px shift for 20/20 and 15/20. A verdict goes stale on noise. | 2c |
| 8 | Every gate target (98 / 95 / 90 / 80 / 60 …, `report.mjs:28-36`) is a fixed constant. Only routes (desktop only, `capture.mjs:378-392`), load (`load.mjs:102`), detail and hovers (two reference reads) look at the reference's own variability, and each does it differently. | 1 |

Recommended system (section 3): four kinds of measure, each reported as value, noise floor and verdict:

- **Structure:** masked pixel match for the DOM layer, plus 32 px composition correlation for canvas and media regions.
- **Appearance:** a spatial colour grid, plus real-pixel match in exact mode.
- **Envelope:** for regions that legitimately vary, the score against the nearest reference draw, plus stable properties over the frame sequence.
- **Behaviour:** what already exists (interactions, hovers, curves, load, journey reachability), plus scene and uniform reads.

`canvasSimilarity` becomes a diagnostic.

---

## 1. Inventory

Common primitive, `lib.mjs:532`: `pixelmatch(a, b, …, { threshold: 0.1, includeAA: false })`.

- **Threshold:** 0.1 is a per-pixel YIQ colour-distance threshold. A pixel counts as different when its perceptual
  delta exceeds about 10 % of the maximum.
- **Anti-aliasing:** pixels detected as anti-aliasing are *not* counted.
- **Size mismatch:** handled by `matchPct` (`lib.mjs:558-564`), which white-pads to the larger size (`pad`, `:518-524`). The padding counts as mismatch.
- **No other tolerance:** no downscaling and no shift tolerance. The score is 100 − (different pixels / all pixels).

| Metric (file:line) | Exact formula | What it measures | Target / gate (file:line), how chosen | Blind spots: a bad clone passes when… | Blind spots: a perfect clone fails when… |
|---|---|---|---|---|---|
| **Layout (structure)** `diff.mjs:36-88` | Full-page shot of both sides after `settle` (`lib.mjs:319-337`: freeze CSS `:64`, scroll once, fonts) and `mask` (`lib.mjs:340-395`: text transparent; img/video/svg/canvas/bg-images → flat #888). `[data-tc-viewmount]` boxes painted grey 64 on both sides (`:56-65`). `match` over the padded full page (`:67`, `:82`); per section the same over the reference's section rows (`:71-79`). | Spatial structure of boxes (positions, sizes, background colours of non-media boxes). | Mean ≥ 98 per viewport (`report.mjs:28`, `:130`). Fixed by hand (`docs/test-plan-0.5-rc4.md:185` lists ≥ 98 as given). Unstable routes: `min(98, self − 1)` (`report.mjs:213`). | The wrong media, text, font or glyphs (masked by design). Hidden content in view-mounted boxes (painted grey). Errors confined to a small area of a very tall page (the mean over the page dilutes them; the worst section is only shown, not gated). | Sub-pixel layout drift on dense pages (a 1-2 px shift of every box edge). Reference randomness on routes at sizes other than desktop (BHASKAR-1: mobile self 92.95-95.57 vs bar 95.57). |
| **Layout (real pixels)** exact mode `diff.mjs` without `--structure`; `report.mjs:131` | Same, unmasked. | Appearance and structure together (text rendering, media). | ≥ 98 (`report.mjs:131`). | – | Any rotating or lazy content; font hinting. No reference self-measure. |
| **Scroll states, mean** `states.mjs:99-108` | Clone replays the reference's exact scroll positions (`:68`). At each step: `waitStill` (`lib.mjs:641-681`), `freezeLoops` (`:398-407`), viewport shot plus masked shot. `matchPct(ref.mask, clone.mask)` per step (`:106`); mean over steps (`:108`). | Spatial structure in view at each scroll position, with live motion (reveals, pinned and parallax positions). | ≥ 95 per viewport (`report.mjs:28`, `:141`). Fixed by hand. | A wrong scene inside a canvas (masked to grey). Wrong timing between steps (only settled frames are compared). | A frame that never settles (`settled:false`, e.g. varsity mobile steps 6-11 `settleMs` 4020-4094 in `compare/controller-187-states-evidence.json`) caught at a different phase. |
| **Scroll states, worst frame** `report.mjs:34`, `:111`, `:141` | min over `worst[]` (the 5 lowest steps) of the step match. | As above, per frame. | No frame < 80 (`FRAME_FLOOR`). Fixed by hand after rc.3 (a 91 % mean with a frame at 17 %). | The same as the mean, frame by frame. | A frame that is unsettled on the reference itself. Varsity reference-self worst frame: mobile 88.74 / 89.99, tablet 93.58 / 95.19 (`compare-reference-self-*/states/report.mask.json`). Passes, but with no calibration. |
| **Canvas similarity** `lib.mjs:538-556`; used `states.mjs:110-128` | Per canvas region of the *reference's* step (`refSteps[i].canvases`, regions ≥ 40 px), cropped from the unmasked viewport shots of both sides. Histogram: 64 bins, `(r>>6, g>>6, b>>6)`: 2 bits per channel, hard edges at 64 / 128 / 192. `inter` = histogram intersection. "Ink" = share of pixels with L1 distance > 96 from the centre of the modal bin; `cover = 1 − |inkA − inkB| / max(inkA, inkB, 0.05)`. Score = 100 × (0.5 inter + 0.5 cover). Mean over all regions and steps. | **Colour distribution plus how much differs from the dominant colour.** No position at all. | Mean ≥ 90 (`report.mjs:28`) and no frame < 60 (`CANVAS_FLOOR`, `:36`, `:147`). Chosen as "lower than states because scenes vary" (comment `:35`). Never measured against the reference. | Same palette, wrong geometry: 64 px tiles shuffled = 100, mirrored = 100 (2c). Zero desktop step-10: 93.88 with a different camera framing (2a). Cords deleted on varsity mobile y 7596: 87.13 (2b). | 1-level colour shifts across a bin edge (flat 127 vs 128 = **50**, 2c). A physics scene in a different draw: varsity y 7650 reference vs itself 49.21-51.55 (VAR-2). A coverage flip when an object leaves the view (half the score is `cover`). |
| **Journey (app mode)** `journey.mjs:448-466` | Per checkpoint: `pixels = matchPct(full viewport)` (`:456`). `canvas = canvasSimilarity` of the rows `[box.y, box.y + box.h)` across the *full width* of the largest canvas (`crop`, `:458`; `canvasBoxInPage` `:116-119`). `match` = exact ? (pixels + canvas) / 2 : canvas (`:459`). Mean and worst over checkpoints (`:463-464`). Checkpoint shot when two shots 250 ms apart are ≥ 99.5 alike or after `settle` ms (`:139-147`). | Template: colour distribution only. Exact: half pixels, half colours. | Mean ≥ 95 and worst ≥ 80 (`report.mjs:28-30`, `:139`; SKILL.md:163). Fixed by hand (`plan-0.6-app-mode.md` C1). | Template: any art with the reference's palette (ZERO-4/-5: the agent fitted palettes and moved the score; canvas 90.5 / 88.9 with pixels 63.2 / 58.5). | Template: replaced art, the intended product, can never reach 95 on a fair measure (2a: the reference vs its own second run averages 96.2 canvas, 82.8 pixels). Exact: a scene with its own drift. |
| **Journey draft drift** `journey.mjs:245-251` | `matchPct` of two shots `pause` ms apart; a new state needs a match < `min(98, drift − 4)`. | Change detection, not similarity scoring. | Self-calibrated (the one place that is). | – | – |
| **Interaction end state** `interact.mjs:263-317` | Per scenario: shots at each `shot` step on both sides, each after `mediaReady`, the first frame when two shots are ≥ 99.8 alike (`:146-153`). `score` = mean `matchPct` over shots other than `before` (`:290`). Masked if `compare: 'structure'`. `changed` = the string `stateOf` (`:100-118`: box, scroll, transform, opacity, visibility, clip-path, 9 state attributes, value, first 200 characters of text, canvas `toDataURL` hash) differs from before on that side. | End-state appearance (pixels) plus a behavioural change flag. | Pass when the end state ≥ 95 (`END_STATE_MIN`, `:263`), both sides `changed` when `expectChange` is given, same address and no HTTP ≥ 400. Fixed by hand. The reference run is cached and done **once**. | Any change in the named element counts as "changed" (a canvas hash changes every frame). A clone whose end state is visually close but reached by a different mechanism. | A scenario on a page with reference randomness (only `meta.routes[].unstable` routes are exempted, `:313`). A marquee in view (BHASKAR-9: 92.8-99.58 over 5 scores on the same clone). |
| **Empty-page floor** `interact.mjs:271`, `:280-284`; `lib.mjs:569-579` | `inkShare`: modal colour from a 4-bit-per-channel histogram (hard edges every 16 levels) sampled every 7th pixel; ink = share (every 3rd pixel) with L1 > 48 from the bin centre. Fail when `inkRef > 0.04 && inkClone < 0.3 × inkRef`. | Is there a page at all (content vs background). | 0.3 ratio, fixed by hand. It overrides the unstable exemption (`:305`, `:313`). | A page of large light-grey cards on white (a card at #f0f0f0 is not ink: L1 3 × 15 < 48; 2c). | A different random draw with light artwork (BHASKAR-4: "Upload Files" card ink 0.044 vs 0.344 → fail). |
| **Hovers** `hovers.mjs:26-28`, `:150-178`, `:196-232` | Per hover target: region shot before and after (until two shots ≥ 99.8 alike, at most 1.5 s), masked in template mode. Reacts when before vs after < 99.5 or a style changed (`changedKinds`). Outcome = `matchPct(ref after, clone after)`. Reference hovered **twice**; unstable when selector or kinds differ or the two after-shots < 97 (`:198-203`). Score = % of reacting targets with status ok. | Behaviour (reacts the same way) plus end-state appearance. | ≥ 90 % ok (`report.mjs:28`); outcome ≥ 95 template / 97 exact (`:27`). Hand-picked; the instability cut of 97 is a fixed number, not the measured spread. | A hover that changes the right property kind to a different value with the same pixels within 5 %. | A hover with a long transition that never stills (0.9 s cap). |
| **Detail (styles)** `detail.mjs:28-40`, `:199-250` | Probes reference text elements and styled boxes in view; reads the clone element at the same DOM path or position. Text: family equal, size ±0.6 px, weight equal, line height ±1, letter spacing ±0.2, text transform equal, colour L1(rgba, alpha × 255) ≤ 24. Box: background ≤ 24, radius ±1, size ±3 px. Reference read twice; probes that differ dropped as unstable (`:218`). Score = clean / stable probes. | Exact computed style per element (appearance at the token level). | ≥ 95 (`report.mjs:28`). Tolerances hand-picked. | Extra elements in the clone (only reference probes are checked). A wrong element at the same point with the same style. | A probe that maps by position to a neighbour after a 2-3 px layout shift. |
| **Load sequence** `load.mjs:23-28`, `:30-110` | Each side: cold cache, emulated network (40 ms, 1.25 MB/s). Viewport shots at 250 / 500 / 1000 / 2000 / 4000 ms after `goto`; final shot after networkidle + 1.5 s. Curve(t) = `matchPct(frame_t, own final)`. Two runs per side (a third if a frame is missing); curve = mean; `noise` = max \|run1 − run2\|. Score = 100 − mean_t \|refCurve − cloneCurve\| (`:98`). Ref noise > 15 → width unscored; clone noise > 15 → worse run (`:102-104`). | Timing of settledness (behaviour). Each side is compared only with **itself**. | ≥ 95 (`report.mjs:28`), `SETTLED` 98, `NOISE_LIMIT` 15. Hand-picked. | A clone that settles into a wrong final page at the same pace scores 100. Skeleton screens of the same "distance" from final. | A clone served locally reaching `load` earlier (VAR-6 / BHASKAR-9 for review: anchored at the load event there, at navigation start here). |
| **Review pixel % and token** `review.mjs:96-147`, `:164-192`; `report.mjs:78-84` | Frames: load at 300 / 1500 / 4500 ms after each side's own `load` event (`:96-103`), every section top or screen, each plus a hover. pct = `matchPct` of viewport shots (`:190`). Token = FNV hash of 160 grey samples of the side-by-side composite, quantised `>> 5` (8 levels) (`:164-170`). A verdict is closed when its token equals the frame's token, it is "same" (with a reason below 85 %, `report.mjs:81-83`), or "tool" with an evidence file. | Human by-eye judgement; pct is a hint; the token is identity. | Every frame closed. 85 is hand-picked. | The by-eye pass is the guard; pct is not gating. | **Token flips on noise**: +1 level 20/20 zero and 11/20 varsity frames; 1 px 20/20 and 15/20 (2c). Load frames anchored on the load event differ by phase (BHASKAR-9: 300 ms frame 96.66 → 60.4 on an unchanged clone). |
| **Motion curves** `curves.mjs:271-288` | Per map entry and property: err = mean_k \|ref_k − clone_k\| / max(range_ref, FLOOR) with FLOOR 1 (opacity, scale, saturate), 10° rotation, 40 px otherwise. Entry = mean over properties of 100 (1 − err), ≥ 0; score = mean over entries. Reference cached, sampled once. | Behaviour: property curves over scroll or time. | ≥ 95 (`report.mjs:28`). Hand-picked. | A curve with a correct average and a wrong shape is penalised in proportion, but a property not in the map is never measured. Mean over entries hides one broken entry (the report lists entries < 90, `report.mjs:240`, without gating them). | A reference whose timing jitters (no second reference sample). |
| **Route self-match** `capture.mjs:378-392`; `report.mjs:211-218` | Desktop only: 2 extra loads, masked full page, `matchPct` vs the capture; `self = min`; unstable when < 99. The bar for every viewport and for both layout and states = `min(target, self − 1)`. | Reference variability (layout). | Calibrated, but on one viewport and one check. | – | Mobile and tablet (BHASKAR-1). States use a layout-derived bar. |
| **Next parity** `status.mjs:285-314` | App vs HTML clone value per check, size, route, scenario and review frame. Gap when `app < clone − slack`, slack 1 (2 for load and review frames). | Regression between two builds. | Slack hand-picked. | A missing value is skipped (`typeof … === 'number'`, VAR-4). | A noisy check re-rolled into or out of a pass (VAR-7; Next desktop canvas 92.81 → 49.57 → 50.28 on the same scene). |
| **Drift** `drift.mjs:36-44` | Page height ±max(40 px, 1 %) or section count differs, confirmed on a second load. | Whether the live reference changed. | Calibrated by a second load. | – | – |
| **Incremental reuse** `score.mjs:69-104` | Not a metric: a check whose inputs (clone files, capture, args, code hash) are unchanged reports its last value. | – | – | A noisy check keeps a lucky value. | – |

**How targets were chosen.**

- **Fixed by hand:** every number in `report.mjs:28-36`, `interact.mjs:263/271`, `hovers.mjs:27-28`, `load.mjs:24-25`
  and `review.mjs:172`, chosen from earlier runs (`plan-0.4.md:102`, `analysis-0.5-rc3-runs.md` A5). None is derived
  from the reference's own variability on the site being cloned.
- **Self-calibrated, each differently:**
  - routes (desktop, layout, 2 loads, min − 1);
  - load (2 runs, max abs difference, cut 15);
  - detail and hovers (2 reads, any difference → probe dropped);
  - journey draft drift (2 shots, −4).

---

## 2. Empirical checks on RC4 frames

Metrics implemented in `m.mjs`, in addition to the tool's own:

| Name | Definition |
|---|---|
| `pix` | `lib.matchPct` |
| `canvas` | `lib.canvasSimilarity` |
| `soft` | the same 64-bin intersection with **linear soft binning**: each channel value splits between the two nearest bin centres |
| `grid` | spatial colour layout: mean RGB per cell of a 16 × 10 grid, 100 − 4 × mean per-channel \|Δ\| / 255 × 100 (a 25 % mean error scores 0) |
| `ssim` | mean SSIM, 8 × 8 windows at stride 4, on luminance box-downscaled to about 180 px wide |
| `thumb` | composition: Pearson r × 100 of luminance box-downscaled to about 32 px wide |
| `edge` | F1 of Sobel edges (blurred, about 240 px wide, matched within 2 px) |

### 2a. zero: histogram vs structure per checkpoint

The column groups are:

- `c.*`: reference (`reference/journey/<vp>`) vs clone (`compare/journey/<vp>`).
- `r.*`: reference vs the reference's own **draft run** (`reference/journey-draft/<vp>`), an independent second visit
  of the same checkpoints. This is the only reference-vs-reference data for zero.

The draft frames differ in timing. Desktop checkpoints 21-26 are not at the same place (r.thumb 17-57), so the
reference noise below uses the 24 desktop and 18 mobile checkpoints where r.thumb ≥ 75.

`c.canvas` reproduces the tool's `canvas` column exactly.

Desktop (all 30 checkpoints; numbers from `node zero.mjs`):

| cp | c.canvas | c.soft | c.pix | c.grid | c.ssim | c.thumb | r.canvas | r.pix | r.grid | r.ssim | r.thumb |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 00-load | 96.21 | 97.37 | 90.29 | 91.38 | 49.01 | 92.6 | 99.16 | 99.1 | 99.13 | 97.06 | 99.5 |
| 01-gate-1 | 92.44 | 97.5 | 94.69 | 93.23 | 82.12 | 77.7 | 99.98 | 99.99 | 99.95 | 99.92 | 100 |
| 03-step-2 | 83.44 | 93 | 85.74 | 86.02 | 70.64 | 76.1 | 99.88 | 99.53 | 99.55 | 98.81 | 99.9 |
| 04-step-3 | 92.38 | 88.69 | 55.91 | 72.1 | **35.15** | 74.9 | 99.2 | 96.24 | 97.61 | 92.8 | 99.1 |
| 06-hold-2 | 91.06 | 85.61 | 55.46 | 70.05 | 63.58 | **55.7** | 98.04 | 83.84 | 96.64 | 94.3 | 99.6 |
| 10-step-8 | 88.83 | 93.21 | 51.21 | 75.7 | 64.49 | **56.4** | 90.81 | 74.31 | 90.13 | 84.65 | 91.3 |
| 12-step-10 | **93.88** | 82.67 | 45.3 | 57.85 | **31.07** | **31.8** | 95.78 | 69.47 | 88.89 | 47.25 | 80.2 |
| 15-step-13 (worst canvas) | 77.61 | 93.61 | 64.98 | 86.13 | 51.05 | 73.4 | 85.99 | 64.78 | 86.37 | 52.93 | 80.5 |
| 18-step-16 | 96.78 | 98.57 | 76.21 | 94.48 | 78.7 | 65.5 | 99.84 | 79.79 | 99.37 | 90.09 | 99.9 |
| 25-step-22 | **95.94** | 96.06 | 55.77 | 65.21 | **23.45** | 72.2 | (not aligned) | | | | |
| 27-step-24 | 91.51 | 90.71 | 29.03 | 62.46 | **15.5** | **54.3** | 93.31 | 74.26 | 80.1 | 92.54 | 89.8 |
| 28-step-25 | 89.17 | 89.55 | 26.63 | 70.16 | **13.15** | **45.6** | 97.28 | 76.77 | 81.36 | 94.17 | 83.9 |
| 29-step-26 | 89.04 | 89.57 | 27.76 | 74.68 | **14.04** | **55.8** | 99.12 | 96.92 | 97.39 | 98.75 | 99.2 |

Summary:

| | canvas | soft | pix | grid | ssim | thumb | edge |
|---|---|---|---|---|---|---|---|
| desktop clone, mean over 30 (min) | **90.50** (77.61) | 92.46 (82.67) | 63.22 (26.63) | 79.04 (57.85) | 50.83 (13.15) | 70.45 (31.8) | 82.23 (52.71) |
| desktop clone, mean over 24 aligned | 89.7 | 91.7 | 62.2 | 79.7 | 53.1 | 68.4 | 80.6 |
| desktop **reference vs itself**, 24 aligned | 96.2 | 98.0 | 82.8 | 93.6 | 84.5 | 94.2 | 95.6 |
| mobile clone, mean over 27 (min) | **88.91** (77.9) | 90.71 (70.32) | 58.49 (28.36) | 72.76 (43.54) | 34.20 (7.16) | 57.92 (20.7) | 76.72 (50.2) |
| mobile clone, mean over 18 aligned | 88.5 | 90.8 | 63.6 | 77.6 | 39.2 | 59.1 | 70.8 |
| mobile **reference vs itself**, 18 aligned | 92.5 | 95.7 | 82.2 | 92.7 | 66.0 | 92.8 | 91.1 |
| Pearson r across checkpoints (desktop / mobile) | canvas~pix 0.04 / 0.19, canvas~ssim −0.09 / 0.03, canvas~thumb 0.06 / 0.27 | | pix~ssim 0.78 / 0.87, pix~thumb 0.71 / 0.81 | | | | |

**Histogram high, structure low** (canvas ≥ 88 and SSIM < 40 or thumb < 60):

- **desktop, 11/30:** 04, 05, 06, 10, 12, 24-29;
- **mobile, 9/27:** 06, 12, 14, 16, 20-24.

Reading:
- **canvas says nothing about structure.** It is uncorrelated with every spatial measure. On the aligned checkpoints,
  the clone sits 6.5 points (desktop) and 4.0 points (mobile) below the reference's own canvas level. On composition
  the gap is 25.8 and 33.7 points.
- **Viewed: `compare/review/journey-desktop/12-step-10.png`.** The same green-black palette with a dollar bill, but
  the bill fills the frame at a different scale and place, and the type and glow strokes differ. canvas 93.88, thumb
  31.8. The framing difference is a camera constant from the site's code, which a template port is expected to get
  right.
- **Viewed: `27-step-24.png`.** An isometric branded city vs a photographic aerial city. Composition 54.3; the
  joystick, buttons and central dome sit in the same places.
- **SSIM at about 180 px is too fine for template mode.** On the textured scene it drops to 63.6 for an 8 px shift
  (2c). The reference's own mobile SSIM is only 66.0, so it cannot gate there.
- **`thumb` (32 px composition) is the fair structural term.** The reference holds 94.2 / 92.8 against itself. It is
  robust to shifts and to +1 level (2c), it sees geometry (shuffle 5.4, mirror 51) and it ignores recolouring
  (96.6-100).
- **`grid` covers appearance with position.** Reference 93.6 / 92.7.
- **`edge` saturates on dense texture** (tile shuffle 99.14): drop it.

### 2b. varsity: reference-self replays vs capture, noise vs real difference

Data used:
- `reference/states/<vp>/NN.png` (capture);
- `compare-reference-self-{1,2}/states/<vp>/NN.png` (live site replayed as "clone");
- `compare/states` (final HTML clone), `compare-next/states` (final Next app);
- the agent's preserved earlier attempts: `compare/next-canvas-202-desktop-exit.png`,
  `compare/next-canvas-184-mobile-exit.png`, and `compare/controller-187-mobile-exit.png` (attempt 187, scored 6.61;
  notes.md:289 calls it a real regression; viewed: one giant cord fills the view);
- `SYNTH cords deleted`: the per-pixel lightest of the three reference draws (text identical, cords removed wherever any
  draw lacks one).

Regions are the reference's canvas regions (full viewport at these frames).

Viewed `desktop/17.png` across sides:

| Side | What the frame shows |
|---|---|
| capture | three cords (blue, olive, white) |
| self-1, self-2 | one white cord each, at different x |
| HTML clone | three cords, like the capture |
| Next | one cord |

**Single frame against the capture** (the tool's method; `node varsity.mjs desktop,mobile`):

| frame | pair | pix | canvas | soft | grid | ssim | thumb |
|---|---|---|---|---|---|---|---|
| desktop 17, y 7650 | ref ~ self1 | 83.25 | **51.55** | 88.74 | 71.99 | 69.23 | −4.8 |
| | ref ~ self2 | 85.04 | **49.21** | 88.31 | 70.49 | 68.24 | −9.3 |
| | self1 ~ self2 | 93.73 | 95.95 | 99.55 | 90.64 | 84.72 | −4.3 |
| | ref ~ html | 75.90 | 95.97 | 99.17 | 65.57 | 58.56 | 5.8 |
| | ref ~ next | 84.87 | 50.28 | 88.47 | 70.38 | 68.23 | −9.1 |
| | ref ~ SYNTH cords deleted | **87.17** | 43.64 | 87.23 | **74.20** | **75.10** | −14.4 |
| mobile 18, y 7596 | ref ~ self1 | 80.04 | **44.65** | 81.60 | 68.81 | 80.59 | 21.4 |
| | ref ~ self2 | 77.30 | **48.23** | 84.83 | 60.96 | 78.60 | −7.1 |
| | ref ~ html | 89.19 | 72.51 | 97.12 | 80.16 | 85.69 | −4.4 |
| | ref ~ next | 97.16 | **87.13** | 98.50 | 95.11 | 97.17 | −4.2 |
| | ref ~ next184 (evidence) | 81.15 | 50.74 | 87.63 | 66.69 | 80.78 | −6.8 |
| | ref ~ WRONG controller187 | **15.93** | **6.61** | 13.62 | 0 | 70.97 | −14.8 |
| | ref ~ SYNTH cords deleted | 97.16 | 87.13 | 98.50 | 95.10 | 97.17 | −4.2 |

- **Against one draw, no metric separates noise from deletion at y 7650.** Every metric puts "cords deleted" inside or
  above the reference's own replays. Pixel and SSIM even rank deletion *better* than the live site.
- **The grossly wrong attempt is caught by every metric except SSIM** (pix 15.9, canvas 6.6, grid 0; SSIM 71 is
  blind to one big flat region after downscaling).
- **`thumb` is meaningless on a near-empty sparse region** (negative values): composition needs content.

**Scored against the set of reference draws** (nearest of capture, self1 and self2; bar = each draw's leave-one-out
nearest; `node envelope.mjs`):

| frame | side | pix | canvas | soft | grid | ssim | cord-colour % of view |
|---|---|---|---|---|---|---|---|
| desktop 17 | draws (leave-one-out): capture / self1 / self2 | 85.0 / 93.7 / 93.7 | 51.6 / 96.0 / 96.0 | 88.7 / 99.6 / 99.6 | 72.0 / 90.6 / 90.6 | 69.2 / 84.7 / 84.7 | 6.47 / 1.22 / 0.87 |
| | html | 86.27 | 95.97 | 99.17 | 76.82 | 73.17 | 6.97 |
| | next (and next202 evidence) | 95.57 | **98.11** (vs capture only: 50.28) | 99.78 | 92.83 | 86.89 | 1.06 |
| | SYNTH cords deleted | **97.87** | 90.40 | 98.93 | 96.30 | 93.14 | **0.00** |
| mobile 18 | draws (leave-one-out): capture / self1 / self2 | 80.0 / 80.0 / 77.3 | 48.2 / 79.5 / 79.5 | 84.8 / 95.4 / 95.4 | 68.8 / 68.8 / 61.0 | 80.6 / 80.6 / 78.6 | 1.16 / 5.98 / 7.30 |
| | next184 (evidence) | 82.42 | **90.54** (vs capture only: 50.74) | 97.17 | 69.92 | 80.78 | 5.88 |
| | next (final) | 97.16 | 87.13 | 98.50 | 95.11 | 97.17 | **0.00** |
| | WRONG controller187 | 24.46 | 37.14 | 31.57 | 0 | 70.97 | **24.65** |

- **The envelope removes the false fails** on the noise frames: Next desktop 50.28 → 98.11, Next 184 mobile
  50.74 → 90.54.
- **The envelope keeps the gross failure:** controller187 is far below every draw's leave-one-out.
- **The envelope alone also passes "cords deleted"** (pix 97.87): a frame where the reference sometimes has very little
  drawn cannot prove presence on its own.

**Stable property over the sequence**: share of the viewport in cord colours (saturation > 0.35 or luminance < 60) at
each frame of the exit range (`node seq.mjs`):

| desktop frame | 10 | 11 | 12 | 13 | 14 | 15 | 16 | **17** | 18 | 19 |
|---|---|---|---|---|---|---|---|---|---|---|
| capture / self1 / self2 | .72/.75/.67 | 1.58/1.35/1.58 | 3.74/2.99/3.72 | 4.36/4.27/4.30 | 4.52/4.49/4.52 | 3.68/3.82/3.67 | 4.00/3.98/4.16 | **6.47/1.22/0.87** | .43 ×3 | 1.13 ×3 |
| html / next | .68/.67 | 1.59/1.59 | 3.52/3.63 | 4.36/4.38 | 4.60/4.59 | 3.73/3.72 | 4.17/4.12 | 6.97/1.06 | .43/.43 | 1.13/1.13 |

| mobile frame | 11 | 12 | 13 | 14 | 15 | 16 | 17 | **18** | 19 |
|---|---|---|---|---|---|---|---|---|---|
| capture / self1 / self2 | 2.22/2.70/2.40 | 3.46/3.90/2.58 | 8.12/7.64/5.28 | 8.10/8.07/8.07 | 8.39/8.31/8.30 | 7.67/7.91/7.90 | 3.89/3.53/3.60 | **1.16/5.98/7.30** | .66 ×3 |
| html / next | 2.42/2.62 | 3.85/3.82 | 8.89/8.02 | 7.92/7.90 | 8.12/8.18 | 7.90/7.78 | 3.82/**2.44** | 3.65/**0.00** | .66/.66 |

Reading:
- **This property is tight on stable frames:** ±0.2 at desktop 10-16 and 18-19, ±0.5 at mobile 14-16. It spreads
  only at the exit frame.
- **At the exit frame it is the only measure that distinguishes "one cord drawn" (0.87-1.22) from "no cord"
  (0.00).**
- **It flags Next mobile:** 17 is below the draws (2.44 vs 3.53-3.89) and 18 is below every draw (0.00 vs 1.16-7.30).
  Inf: the app's cords leave the view earlier than the site's. That is either a real timing defect or noise that two
  more draws would cover. Today's gate passed it at 87.13 and failed the noise frames instead.
- **The HTML clone matches the captured draw (three cords) rather than the live site's typical draw.** That is a result
  of chasing one sample (VAR-2: about 1.5 h). The envelope treats both as valid.

Scroll-state (masked) reference noise, from `compare-reference-self-*/states/report.mask.json`:

| vp | self-1 mean / worst | self-2 mean / worst | HTML clone mean / worst | Next mean / worst |
|---|---|---|---|---|
| mobile | 98.22 / 88.74 | 98.39 / 89.99 | 98.37 / 89.94 | 98.39 / 89.75 |
| tablet | 99.14 / 93.58 | 99.37 / 95.19 | 99.40 / 94.99 | 99.38 / 95.58 |
| desktop | 99.56 / 97.23 | 99.56 / 96.92 | 99.51 / 96.76 | 99.52 / 97.23 |

The clones sit inside the reference band at every size.

- **The fixed bars happen to be safe here** (95 / 80).
- **They are 10-20 points looser than the reference's real band** (desktop worst-frame noise 96.9, bar 80). A clone at
  85 on a desktop frame passes while being 12 points outside what the site does to itself.

### 2c. Sanity: shifts, 1 level, recolour, scramble (`node sanity.mjs`)

Base = `rc4-zero/.../reference/journey/desktop/27-step-24.png` (dense texture) and
`rc4-varsity/.../reference/states/desktop/17.png` (sparse, white page).

| variant | zero: pix | canvas | soft | grid | ssim | thumb | varsity: pix | canvas | soft | grid | ssim | thumb |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| shift 1 px | **88.82** | 100 | 100 | 98.38 | 99.31 | 100 | 99.61 | 99.91 | 99.97 | 99.40 | 99.69 | 100 |
| shift 2 px right + down | **73.53** | 100 | 100 | 96.98 | 93.80 | 99.6 | 98.34 | 99.84 | 99.95 | 98.82 | 98.30 | 99.8 |
| +1 RGB level | 100 | 99.53 | 99.33 | 98.53 | 100 | 100 | 100 | 97.28 | 99.72 | 99.70 | 99.98 | 100 |
| shift 1 px and +1 level | 88.81 | 99.53 | 99.33 | 97.75 | 99.31 | 100 | 99.61 | 97.34 | 99.73 | 99.34 | 99.68 | 100 |
| shift 8 px down | 56.17 | 100 | 100 | 91.27 | 63.64 | 96.4 | 96.96 | 99.88 | 99.94 | 98.66 | 93.07 | 98.8 |
| recolour: channel swap | 67.08 | 88.02 | 78.78 | **72.74** | 96.70 | 96.6 | 89.99 | 94.45 | 91.04 | 93.57 | 99.80 | 99.9 |
| recolour: darken × 0.8 | 57.07 | 83.20 | 81.92 | **61.55** | 95.30 | 100 | 8.87 | 74.75 | 38.33 | **25.25** | 96.93 | 100 |
| same pixels, 64 px tiles shuffled | 18.78 | **100** | **100** | 48.82 | 3.28 | **5.4** | 76.63 | **100** | **100** | 57.78 | 41.75 | −10.9 |
| same pixels, mirrored | 30.50 | **100** | **100** | 58.56 | 13.93 | 51.0 | 76.68 | **100** | **100** | 61.12 | 61.63 | −1.2 |
| blank (flat 245) | 9.94 | 5.70 | 9.61 | 0 | 6.00 | 0 | 88.74 | 43.64 | 87.23 | 69.55 | 74.17 | 0 |
| flat 127 vs flat 128 | 100 | **50** | 97.66 | 98.43 | 100 | 100 | | | | | | |
| flat 191 vs flat 192 | 100 | **50** | 97.66 | 98.43 | 100 | 100 | | | | | | |

How each measure responds to the variants:

| Measure | Response |
|---|---|
| `pixelmatch` | Robust to 1 level. On texture it loses 11 points per pixel of shift. On a white page it barely notices a recolour or a blank (blank 88.74). |
| `canvasSimilarity` | Halves on a 1-level change at a bin edge. Scores geometry-destroying edits 100. |
| Soft binning | Fixes the bin edge (97.66) but stays geometry-blind. |
| `grid` | Sees recolour and geometry, and is shift-tolerant. |
| `thumb` | Sees geometry only (recolour 96.6-100), is shift-tolerant, and is undefined on near-empty regions. |
| `ssim` at 180 px | Shift-sensitive on texture. |

Other measures under the same changes:

| Measure | Under a 1-level or 1 px change |
|---|---|
| Review token (`review.mjs:164-170`, over 20 frames per site) | Changes on +1 level for **20/20** zero and **11/20** varsity frames; on −1 level for 20/20 and 10/20; on 1 px right for 20/20 and 15/20; on 2 px down for 20/20 and 18/20. A verdict is therefore tied to noise, not to the picture. |
| `inkShare` (`lib.mjs:569-579`) | Stable at a 1-level background change (0.100 / 0.100). But ink grey 225 on a 255 background is ink (0.300), while grey 240 is not (0.000): light cards on white are "empty" (the BHASKAR-4 mechanism). |

---

## 3. Recommended small metric system

Four measures, each defined once in `lib.mjs` and reused by states, journey, interact, hovers and review. Each reports
**value, noise floor (reference vs reference, N draws), bar, verdict** (pass / fail / unstable → judged by its stable
property or behaviour).

| # | Measure | Definition | Where computed | Bar calibrated by | Report |
|---|---|---|---|---|---|
| **S** structure | **S-dom**: masked `matchPct` (today's layout and states masks, `lib.mjs:340`) on full pages and on every scroll-state, journey and interaction frame. **S-comp**: composition r of 32 px luminance (`thumb`) for each canvas or replaced-media region with enough content (luminance std > 8; otherwise S-comp is "n/a, sparse"). | `diff.mjs`, `states.mjs`, `journey.mjs` (add a masked shot per checkpoint, like states `:85-87`), `interact.mjs` | Per viewport, per frame: `noise = min over replays(ref_k vs capture)`. Bar = `min(target, noise − margin)`, margin = max(1, spread of the replays). Targets stay 98 / 95 as ceilings. | value / noise / bar / verdict per vp; worst frame against **its own** frame bar |
| **A** appearance | **A-grid**: 16 × 10 mean-colour grid (`grid`). Exact mode: also real-pixel `matchPct` on DOM regions (unmasked), as today. | Same places as S; canvas regions use A-grid instead of `canvasSimilarity` | Same calibration | Same |
| **E** envelope (legitimate variation) | For a region or frame whose reference noise is below a stable bar: score = **max over the N reference draws** of S/A (nearest draw), bar = the draws' leave-one-out minimum − margin. Plus a **stable property sequence**: per frame of the region's range, the share of the view in each of the reference's dominant non-background colours (k-means k ≤ 4 on the reference draws, or the cord-colour rule above). The clone's per-frame value must lie in `[0.5 × min, 1.5 × max]` of the draws (with an absolute slack of 0.3 points when the minimum is ≈ 0). Its sum over the range must lie within the draws' sum range ± 10 %. Checked on 2b: an additive "± spread on stable frames" was tried first and fails. Mobile frame 13 spreads 2.84 points, which would make "no cord" (0.00) pass at frame 18. The ratio form fails Next mobile 18 (0.00 < 0.58), SYNTH deleted (0.00) and controller187 (24.65 > 10.95). It passes HTML desktop 17 (6.97 ≤ 9.71), Next desktop 17 (1.06 ≥ 0.44) and Next mobile 17 (2.44 ≥ 1.77). | `states.mjs` canvas block (`:109-128`) → `envelope()` in lib; `journey.mjs` for animated checkpoints | N = 3 reference draws (capture + 2 replays). A frame is "unstable" when the draws' leave-one-out < hard floor (S 90, A 85). | `canvas desktop y 7650: unstable on the reference (draws 51.6-96.0); nearest-draw 98.1 (bar 50.6); colour sequence in range` |
| **B** behaviour | Keep and harden: interaction change flag plus end state (on S/A, envelope on unstable routes); hovers; motion curves; load curve; journey (checkpoint reached, the UI text equal (`uiTextInPage`), gate passed). Add for canvas apps and scenes: **scene reads** at each checkpoint or frame (camera position and FOV, projection, uniform values, object count: already recorded by `inventoryInPage`, `journey.mjs:36+`, and by the agent's `diagnose-rope-uniforms.mjs`), compared within the reference's own spread. | `interact`, `hovers`, `curves`, `load`, `journey` | Each reads the reference twice (as hovers and detail already do); tolerance = the reference's own spread; hard tolerances only as caps | `% pass`, per item ref spread |

### Keep, change, demote, drop

| Existing | Decision | Why |
|---|---|---|
| Layout masked `matchPct` (`diff.mjs`) | **Keep** as S-dom; add a per-viewport noise floor from 3 loads | Spatial and interpretable. Masking already removes content variance. |
| Layout real pixels (exact) | **Keep** as A for exact mode, with a noise floor | Rotating content needs the floor, not a lower constant. |
| Scroll states mean + worst frame | **Keep**; bar per frame from replays (not 80 for all) | The fixed 80 is 10-17 points looser than measured noise on desktop and tablet (2b). |
| `canvasSimilarity` | **Demote to diagnostic** (show it, never gate); replace the gate by S-comp + A-grid + E | Geometry-blind (2c), bin edges (2c), half "coverage" flips on exits (VAR-2), uncorrelated with structure (2a). If kept anywhere, soft-bin it. |
| `CANVAS_FLOOR` 60 on one draw | **Drop**; replaced by the E bar | The reference fails it against itself (2b). |
| Journey template = canvas only | **Change**: template journey = S-dom of the UI layer (masked shot) + S-comp of the scene, each against the draft and replay noise, minus a fixed, stated template allowance (Rec: 15 points on S-comp, from 2a: reference 94.2 / 92.8, a faithful port with own art should reach ~80). A-grid informational only in template mode (palette fitting is not a goal, ZERO-5). Gate also on B (checkpoint reached, UI text, gate passed, scene reads within spread). | Gives template mode a fair structural measure that replaced art can meet and that camera or framing errors fail (zero step-10: thumb 31.8). |
| Journey exact = (pix + canvas) / 2 | **Change** to S-dom + A (pixels) + E for animated checkpoints | Same reasons. |
| Interaction end state ≥ 95 | **Keep**; reference run twice; on unstable routes use E (nearest of the reference draws) instead of exemption | BHASKAR-1/-4. |
| Empty floor `inkShare` ratio 0.3 | **Change**: absolute floor (clone ink < 0.01, or the route's main DOM missing, or HTTP ≥ 400); soft-binned modal colour; ink threshold relative to the reference's own background contrast | BHASKAR-4; light cards are not ink (2c). |
| Hovers | **Keep**; replace the fixed 97 instability cut by the measured spread of its two reads | Already calibrated in spirit. |
| Detail | **Keep** as is (style tolerances are physical units and interpretable); add an "extra element" count as diagnostic | Not a pixel metric; no noise problem seen. |
| Load | **Keep**; anchor both sides at navigation start (it already is) and use the same anchor in review; `NOISE_LIMIT` = ref spread × 2 instead of 15; 3 runs per side | VAR-6, BHASKAR-9. |
| Motion curves | **Keep**; sample the reference twice; an entry < 90 fails on its own (not only the mean) | Mean hides a broken curve. |
| Review pct | **Keep as diagnostic** (it already is); 85 "same needs a reason" bar → per-frame noise floor | – |
| Review token | **Change** to a 64-bit perceptual hash (dHash on 9 × 8 grey) compared by Hamming distance; stale when the distance exceeds the reference's own replay distance (or 6 bits) | Today it flips on 1 level (2c). |
| Route self-match | **Change**: every viewport, both layout and states, N = 3, bar per viewport and check | BHASKAR-1. |
| Next parity slack 1 / 2 | **Change**: slack = the check's noise floor; a flip after a fail on unchanged input needs a second agreeing run | VAR-4/-7. |
| `edge` F1 (tested here) | **Do not adopt** | Saturates on texture (tile shuffle 99.14). |
| SSIM at 180 px (tested here) | **Do not adopt as a gate** | Shift-sensitive on texture; misses large flat errors (controller187: 71). |

**Questions the brief asked to address:**

1. *The histogram must not stand in for layout fidelity.* After this change no gate reads a position-free colour
   measure. Structure is always S-dom or S-comp.
2. *Template mode needs a fair structural measure.* Use S-comp at 32 px, which ignores palette (recolour 96.6-100),
   tolerates shifts (99.6 at 2 px), detects framing and geometry (5.4-55), and holds 92-94 reference against
   reference. Add the masked UI layer. Both are held to calibrated noise minus a stated template allowance, so a port
   with its own art can pass without fitting the reference's colours.
3. *Canvas and animated regions are verified on stable properties and behaviour, not masked away.* The region stays
   in S and A against the nearest reference draw. The colour-presence sequence and the scene reads (uniforms, camera,
   counts) carry the proof where single frames are stochastic. A region is "unstable" only with the number that makes
   it so, and it is never silently excluded.

---

## 4. Threshold policy

### When and how many reference draws

| Check | Reference draws | Stage | Extra cost (RC4 timings) |
|---|---|---|---|
| Layout (main page + every route) | 3 loads per viewport (capture + 2), masked and unmasked | `capture` (today: routes, desktop only, `capture.mjs:378-392`) | ~2 × 2 min (bhaskar layout step 122 s for 8 routes × 5 vps) |
| Scroll states + canvas regions | 3 runs per viewport (capture + 2 replays, exactly what the varsity agent ran by hand with `TC_COMPARE`) | `states` reference run (the `reads` stage, VAR-2 fix) | ~2 × 3 min (varsity states 184 s for 5 vps) |
| Journey checkpoints | 3 runs per viewport; the draft run counts as one if its checkpoints align (thumb ≥ 75 to the reference run; zero desktop 21-26 did not) | `journey` reference run | ~2 × 4.5 min (zero journey 543 s for 2 vps) |
| Interactions, hovers, detail, motion curves, load | 2-3 reference reads (hovers and detail already read twice; load twice; interact and curves once today) | first score; cached until re-capture | interact ~1 min, curves ~1-3 min |

Total about 15-25 extra minutes, once per capture. A single false fail cost more than that in RC4: 1.5 h on varsity y
7650, and a stopped run on heybhaskar. N = 3 is the minimum that gives a leave-one-out spread. Use 5 for a frame
flagged unstable at N = 3 and for unstable routes (BHASKAR-3 needed 8 draws to judge one route).

### Computing the floor

- **For each (route, viewport, check, frame or region) and each measure:**
  - `noise = min_k sim(capture, draw_k)`;
  - `spread = max − min` over the pairs.
- **Stable frame** (noise ≥ hard floor: S 90, A 85):
  - bar = `min(target, noise − max(1, spread))`;
  - score the clone against the capture.
- **Unstable frame:** score the clone against the nearest draw, bar = the draws' leave-one-out minimum − margin, and
  require the stable-property sequence to be in range.
- **Reference fails its own threshold** (leave-one-out < hard floor, or the property sequence spread wider than a stated
  maximum): the frame is **unmeasurable by pixels**.
  - **Report:** a REPORT row `Reference varies here: <check> <vp> <frame> self <min-max> over N draws; judged by
    <property / behaviour>`.
  - **Status:** status never issues a pixel step for it.
  - **Fallback check:** if no property or behaviour check covers it, status issues "write a behaviour check (scene read,
    curve, or interaction) for <region>". That is a concrete step, not a set-aside, and not a pass.

### Stopping stale or inapplicable tolerances from hiding defects

| Rule | Mechanism |
|---|---|
| A tolerance is keyed, never global | Store in `reference/noise.json` as `{route, viewport, check, frame id or y, region, measure, N, draws[], capturedAt, codeHash}`. `report.mjs` and `status.mjs` look up by the full key; no key → the fixed target applies and the row says "not calibrated". This removes BHASKAR-1's desktop number applied to mobile. |
| Expiry | Invalid when `capturedAt` changes (re-capture) or the metric's code hash changes (as `score.mjs:101` does for results); `drift` confirming a change invalidates all of them. |
| Floor under every tolerance | A calibrated bar can never go below the hard floor (S 90, A 85); below it the frame is "unstable", routed to properties or behaviour, and listed. A frame cannot pass by being declared noisy. |
| Scope | A tolerance covers only the frames or regions it was measured on; the frames around a noisy one keep their own bars (varsity desktop 10-16 have spread ≤ 0.2 on cord colour; the y 7650 tolerance must not leak to them). |
| Direction | Score against the nearest draw only for frames flagged unstable. Stable frames always score against the capture, so a clone cannot pick its best draw where the site is deterministic. |
| Flip confirmation | A value that crosses its bar on unchanged input (same clone hash) needs a second agreeing run before the verdict changes (VAR-7). |
| Visibility | Every row prints `value \| noise floor (N, date) \| bar \| verdict`; the report header lists every frame judged by property or behaviour instead of pixels and every "not calibrated" row. |

### What the report shows (example rows)

| Check | Viewport | Value | Reference noise (N=3) | Bar | Verdict |
|---|---|---|---|---|---|
| Scroll states (structure) | desktop | mean 99.51, worst 96.76 (y 2699) | mean 99.56, worst 96.92 (y 2699) | worst ≥ 95.9 at y 2699 | pass |
| Canvas regions | desktop | 13 frames ≥ bar; y 7650 unstable | y 7650: 51.6-96.0 | nearest-draw ≥ 50.6; colour in [0.44, 9.71] | pass (Next 98.1 nearest, colour 1.06; HTML 96.0, colour 6.97) |
| Canvas regions | mobile | y 7596 colour 0.00 | colour 1.16-7.30 | in [0.58, 10.95] | **fail: no cord in view where every reference draw has one** |
| Journey (template) | desktop | S-comp mean 68.4, worst 31.8 (step-10) | 94.2 | ≥ 79 (noise − 15 template allowance) | **fail: framing differs at step-10, 12, 27-29** |
