# trueclone 0.6: app mode (canvas experiences like why.zero.university)

0.5 clones **documents**: a page that scrolls, built of sections, its motion tied to scroll position and the DOM. A
growing class of sites is not that: **canvas apps**, where one full-window canvas (three.js, WebGL shaders) draws
everything, the page itself never scrolls, and the site's own code moves the visitor through scenes from wheel, touch,
pointer and gestures. why.zero.university is the reference case (analysis: docs/analysis-0.5-rc3-runs.md):

- one `canvas#webgl`, three.js r160 bundled (no `window.THREE`), ~60 custom shaders, a post-processing chain;
- assets that are not images: KTX2/Basis textures, Draco/Meshopt GLBs (wasm decoders), videos used as textures, audio;
- a virtual scroll (`body{overflow:hidden}`; wheel/touch move a lerped position through 5 stages), hold buttons;
- a gate: "draw a zero" (a pointer gesture judged by the site's code) before anything else is reachable;
- a DOM layer (HUD, menus, a dialog) built by the script over the canvas; GA4 and a backend (Supabase) behind it.

0.5 detects this class at capture (`meta.canvasApp`) and stops with an honest message (status exit 4). 0.6 clones it.

## Principles (unchanged, sharpened for apps)

1. Accuracy first: a state is what the visitor sees after the same input, not after the same scroll position.
2. Determinism is part of measuring: time, randomness and frame pacing are controlled on both sides, or a canvas can
   never be compared frame for frame.
3. Global: nothing about one site; every mechanism works for any input-driven canvas app.
4. Honest: what cannot be reproduced (a backend, a live feed) is listed, and the checks never read high on a frame
   they did not reach.

## The two ways to an exact app

| | **Own bundle** (exact mode, owner's permission) | **Port** (template mode, or exact without the bundle) |
|---|---|---|
| What the clone runs | the site's own JS, CSS, shaders and assets, served locally; its backend and tracking stubbed | the agent's code: the scenes ported from the site's code, at the site's library versions |
| Expected by eye | ≥ 95 (it is the site's own renderer) | first scenes high, a whole 5-stage app is weeks of porting: realistic ≥ 70 per ported stage |
| Who it is for | an owner migrating, archiving, or moving to Next.js | learning, a design reference, a template |
| Decision needed | **yes**: 0.5 never runs the site's code ("behaviour is code the agent ports"). Own-bundle mode changes that rule for exact mode only, where the owner's permission already covers their code. Recommended: allow it, exact mode only, never in template mode. |  |

## Phase 9.1: record the journey (states without scroll)

- **J1 Determinism:** every app-mode page (reference and clone) runs with a controlled clock (Playwright `page.clock`:
  `Date`, timers, `requestAnimationFrame`, `performance.now` advance only when the instrument says), `Math.random`
  replaced by a seeded generator before any script, background throttling off, a fixed device pixel ratio. A frame
  after "input + 2000 ms" is then the same frame every run.
- **J2 Journeys:** a journey is a list of inputs with checkpoints: `{ wheel: dy, ticks }`, `{ touch: path }`,
  `{ pointer: path }`, `{ gesture: "circle" | "line" | path, at, size }`, `{ hold: selector, ms }`, `{ key }`,
  `{ wait: ms }`, `{ checkpoint: "name" }`. Stored in `journey.json`; the default journey is drafted at capture.
- **J3 Auto journey:** capture probes the app: wheel ticks in steps until the frames stop changing (each plateau is a
  checkpoint), the hold buttons and gates the DOM layer names (`aria-label`, "hold", "drag", "draw"), and records where
  input stops having an effect (a gate).
- **J4 Recorded journey:** `trueclone record <name>` opens a visible browser on the live site; the user (or the agent
  with the user's OK) goes through it once (draws the zero, holds, scrolls); every input is saved with its timing as
  the journey. A gate the instrument cannot pass by itself is passed by a recording, never by bypassing it.
- **J5 Deep links:** a site's own stage parameter (a hash or query its code reads) is used only when the owner allows
  it (it is often a debug route).

## Phase 9.2: what the app is made of (evidence for porting and for checks)

- **E1 Scene inventory:** an init script defines `window.__THREE_DEVTOOLS__` (the hook three.js itself calls for every
  Scene and WebGLRenderer it creates, bundled or not), so capture receives the live scene graph: objects, geometry
  types and sizes, material types and parameters, cameras, lights, render targets, per checkpoint ->
  `reference/scene.<checkpoint>.json`.
- **E2 Shaders:** `shaderSource` and `uniform*` calls on the WebGL context are recorded: every program's vertex and
  fragment source and its uniforms, named by the material that uses it -> `reference/shaders/`.
- **E3 Assets beyond images:** KTX2/Basis, GLB (Draco, Meshopt), wasm decoders, HDR/EXR, video and audio recorded at
  every checkpoint (they load per stage), with the loader paths the code uses.
- **E4 Input map:** which listeners drive what (wheel, touch, pointer, deviceorientation, keys), located file:line like
  the 0.5 script evidence; the lerp constants (SCROLL_LERP, CAMERA_LERP) and stage ranges from the code.
- **E5 Brief per stage:** `brief <name> --stage <n>`: the stage's scene objects, shaders, assets, the code that builds it
  (file:line), its checkpoints and scores.

## Phase 9.3: the checks for an app

- **C1 Journey states:** at every checkpoint, both sides after the same inputs at the same controlled time: the canvas
  compared by pixels and by `canvasSimilarity` (colours, coverage), the DOM layer by layout; worst checkpoint gate.
- **C2 Gates and transitions:** each gate (a gesture, a hold) passes on both sides with the same input, and the frames
  of a transition (every 100 ms of controlled time) follow the reference's curve.
- **C3 Input response:** pointer and gyro parallax: the camera's response to a pointer path, compared over time.
- **C4 Load:** time to first frame and to the gate, against the reference (assets are large: the network is emulated
  the same on both sides).
- **C5 Review:** checkpoint frames side by side, verdicts as in 0.5 (tokens, reasons).
- **C6 No false highs:** in app mode the document checks (layout of a one-screen page, scroll states of a page that
  does not scroll) are not shown as scores; the report leads with the journey.

## Phase 9.4: own-bundle mode (exact, with permission)

- **B1** The mirror keeps the site's scripts (local copies, module graph and dynamic imports resolved, wasm and workers
  included), rewrites asset URLs to local files, and keeps the order and type of every script.
- **B2 Network stubs:** a stub layer in the clone answers the site's backend and tracking calls without the network:
  tracking dropped, data calls answered from the captured responses (HAR) or empty, forms submit nowhere. Keys found in
  the bundle (a public anon key) are never used against the live backend.
- **B3** The Next app mounts the same bundle in a client component (the canvas and the DOM layer), with the stubs, so
  it equals the HTML clone.
- **B4** The report says what is the site's own code (the whole renderer) and what is stubbed.

## Phase 9.5: port mode (template, or exact without the bundle)

- **P1** `vendor` offers three.js at the bundled revision (r160 from `__THREE__`/`data-engine`) and the loaders the
  site uses (GLTF/Draco/KTX2/Meshopt), with their decoders.
- **P2** The brief per stage gives the agent the scene graph, shaders and assets to port; the skill's Canvas recipe
  grows into an app recipe (renderer setup, post chain, stage machine driven by the virtual scroll, gates).
- **P3** Template mode for an app: placeholder textures and geometry of the same sizes, the scene structure and motion
  kept; text in the DOM layer as lorem.
- **P4** status walks the stages in order: stage 1 to its checkpoints' targets before stage 2 (a gate first).

## Phase 9.6: status and skill

- **S1** `meta.app = "canvas app"` switches status to the app path: capture, journey (auto or recorded), reads (scene,
  shaders, input map), own-bundle or port, per-stage briefs, journey checks, review, Next. Exit 4 goes away.
- **S2** The skill gets an "Apps" chapter: when to ask the user for permission for own-bundle mode, how to record a
  journey with them, the stage-by-stage porting recipe.

## Proof

- why.zero.university in **own-bundle exact mode** (only with the owner's permission; otherwise a canvas app we own):
  journey states ≥ 95 at every checkpoint, by eye ≥ 95, Next equal to the clone.
- why.zero.university in **port mode** (template): stages 1-2 ported, ≥ 80 by eye on those checkpoints, the rest listed.
- Two more canvas apps of different makes (a three.js portfolio with a free camera, a Spline or Rive scene embedded in
  a page) to prove nothing is site-specific.
- Regression: the 0.5 document set (varsity, heybhaskar, allbirds, astro) unchanged.

## Order and size

9.1 (determinism + journeys) is the foundation and the largest piece; 9.2 and 9.3 follow; 9.4 is the shortest road to
an exact app and should land before 9.5; 9.6 ties them together. Estimated: 9.1-9.3 one phase of work each like 0.5's
phases; 9.4 one; 9.5 two (porting tooling is open-ended).
