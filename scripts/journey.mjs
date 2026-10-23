// App mode (a canvas app: capture's meta.canvasApp): what a visitor sees is reached by input, not by scrolling a
// document, so states are the checkpoints of a journey, a list of inputs the visitor makes (wheel, touch swipes, a
// pointer path, a gesture a gate asks for, holding a button, a click, a key) and the moments to look at.
//
//   sites/<name>/journey.json
//   { "viewports": ["desktop", "mobile"], "steps": [
//       { "checkpoint": "load", "settle": 10000 },
//       { "gesture": { "shape": "circle", "at": [0.5, 0.5], "size": 0.22 } },   (also "ellipse", or "path": [[x, y], ...])
//       { "checkpoint": "after-gate" },
//       { "wheel": { "dy": 1200, "at": [0.5, 0.5] } },                            (a touch swipe of the same length on a phone)
//       { "hold": { "at": "#hold" | [x, y], "ms": 2000 } },
//       { "click": "selector" | [x, y] }, { "key": "Enter" }, { "wait": 1500 }, { "checkpoint": "final" } ] }
// Points are fractions of the window. A checkpoint waits until the screen holds still (or `settle` ms) and shoots it.
// Both sides run with the same seeded Math.random (lib.mjs), never throttled.
//
// usage: trueclone journey <name> --draft            find the journey on the live reference -> journey.json
//        trueclone journey <name>                    the reference's checkpoints -> reference/journey/ (frames, the
//                                                    three.js scene at each, every shader program)
//        trueclone journey <name> --clone [--url u]  the clone through the same journey, compared -> compare/journey/
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { VIEWPORTS, parseArgs, openBrowser, newPage, serve, matchPct, canvasSimilarity, PNG, COMPARE, siteDir, openUrl, withMachineLock, recordBundle, maskToggle } from './lib.mjs';
import { startIdentity } from './identity.mjs';
import { writeUnits } from './results.mjs';
import { regionScore, region } from './measure.mjs';
import { TEMPLATE_ALLOWANCE, loadNoise, barFor, FLOORS, REVIEW_HEADING } from './verdict.mjs';
import { envelope } from './measure.mjs';
import { refIdOf } from './identity.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) { console.error('usage: trueclone journey <name> [--draft | --clone [--url <app>]]'); process.exit(1); }
const root = siteDir(name);
const ref = path.join(root, 'reference');
const meta = JSON.parse(await fs.readFile(path.join(ref, 'meta.json'), 'utf8').catch(() => 'null'));
if (!meta) { console.error(`no capture for ${name}`); process.exit(1); }
const journeyFile = path.join(root, 'journey.json');
const vpOf = (n) => VIEWPORTS.find((v) => v.name === n) || VIEWPORTS.find((v) => v.name === 'desktop');

// ---------- in the page ----------
// three.js announces every Scene and WebGLRenderer it creates to window.__THREE_DEVTOOLS__ (its own devtools hook),
// bundled or not; and every shader program passes through shaderSource. Both are listened to from the first byte.
function inventoryInPage() {
  window.__tcScenes = [];
  window.__tcRenderers = [];
  window.__tcShaders = [];
  const hook = new EventTarget();
  // what is drawn now: every render call, by scene, with its camera and time (an app that swaps its stage content or
  // draws each stage from a scene made later is read from what its renderer draws, not from the first scene made)
  window.__tcRendered = new Map();
  hook.addEventListener('observe', (e) => {
    const o = e.detail;
    if (!o) return;
    if (o.isScene) window.__tcScenes.push(o);
    else if (o.isWebGLRenderer) {
      window.__tcRenderers.push(o);
      const render = o.render;
      if (typeof render === 'function') o.render = function (scene, camera) { if (scene) window.__tcRendered.set(scene, { camera, t: performance.now() }); return render.apply(this, arguments); };
    }
  });
  Object.defineProperty(window, '__THREE_DEVTOOLS__', { value: hook, configurable: true });
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext].filter(Boolean)) {
    const orig = C.prototype.shaderSource;
    C.prototype.shaderSource = function shaderSource(shader, src) {
      try { const type = this.getShaderParameter(shader, this.SHADER_TYPE) === this.VERTEX_SHADER ? 'vert' : 'frag'; if (window.__tcShaders.length < 400 && !window.__tcShaders.some((s) => s.src === src)) window.__tcShaders.push({ type, src }); } catch { /* not readable */ }
      return orig.call(this, shader, src);
    };
  }
}
function sceneInPage() {
  const round = (v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v);
  let count = 0;
  const ser = (o, depth) => {
    if (count++ > 3000) return { type: o.type, truncated: true };
    const m = o.material && (Array.isArray(o.material) ? o.material[0] : o.material);
    const g = o.geometry;
    return {
      type: o.type, ...(o.name ? { name: o.name } : {}), ...(o.visible === false ? { visible: false } : {}),
      position: o.position ? [o.position.x, o.position.y, o.position.z].map(round) : undefined,
      rotation: o.rotation ? [o.rotation.x, o.rotation.y, o.rotation.z].map(round) : undefined,
      scale: o.scale && (o.scale.x !== 1 || o.scale.y !== 1 || o.scale.z !== 1) ? [o.scale.x, o.scale.y, o.scale.z].map(round) : undefined,
      ...(o.isCamera ? { camera: { fov: o.fov, near: o.near, far: o.far, zoom: o.zoom, aspect: round(o.aspect) } } : {}),
      ...(o.isLight ? { light: { color: o.color?.getHexString?.(), intensity: o.intensity } } : {}),
      ...(g ? { geometry: { type: g.type, parameters: g.parameters, vertices: g.attributes?.position?.count, instances: o.count } } : {}),
      ...(m ? { material: { type: m.type, color: m.color?.getHexString?.(), opacity: m.opacity, transparent: m.transparent, blending: m.blending, map: Boolean(m.map), uniforms: m.uniforms ? Object.fromEntries(Object.entries(m.uniforms).slice(0, 40).map(([k, u]) => [k, typeof u.value === 'number' ? round(u.value) : u.value?.isColor ? `#${u.value.getHexString()}` : u.value?.isVector2 ? [round(u.value.x), round(u.value.y)] : u.value?.isVector3 ? [round(u.value.x), round(u.value.y), round(u.value.z)] : u.value?.isTexture ? 'texture' : typeof u.value])) : undefined } } : {}),
      ...(depth < 14 && o.children?.length ? { children: o.children.slice(0, 300).map((c) => ser(c, depth + 1)) } : o.children?.length ? { children: o.children.length } : {}),
    };
  };
  const r = (window.__tcRenderers || [])[0];
  // the scenes drawn in the last half second (a stage plus its post-processing passes), newest first; else every
  // scene announced
  const rendered = [...(window.__tcRendered || new Map()).entries()].sort((a, b) => b[1].t - a[1].t);
  const latest = rendered[0]?.[1].t ?? 0;
  const drawn = rendered.filter(([, x]) => x.t > latest - 500).slice(0, 8);
  return {
    renderer: r ? { size: r.domElement ? [r.domElement.width, r.domElement.height] : null, pixelRatio: r.getPixelRatio?.(), toneMapping: r.toneMapping, outputColorSpace: r.outputColorSpace } : null,
    scenes: drawn.length
      ? drawn.map(([s, x]) => ({ drawnWith: x.camera ? ser(x.camera, 14) : null, ...ser(s, 0) }))
      : (window.__tcScenes || []).slice(0, 6).map((s) => ser(s, 0)),
    announced: (window.__tcScenes || []).length,
  };
}
// what the page says to the visitor now (the DOM layer over the canvas): visible text, a gate's instruction
function uiTextInPage() {
  const out = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (el.children.length) continue;
    const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 120) continue;
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    if (r.width < 2 || r.height < 2 || s.visibility === 'hidden' || r.bottom < 0 || r.top > innerHeight) continue;
    // faded out with an ancestor (a gate's instruction after the gate) is not on screen
    let o = 1;
    for (let e = el; e && o >= 0.05; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
    if (o < 0.05) continue;
    out.push(t);
    if (out.length > 40) break;
  }
  return out.join(' | ');
}
function canvasBoxInPage() {
  const c = [...document.querySelectorAll('canvas')].map((x) => x.getBoundingClientRect()).sort((a, b) => b.width * b.height - a.width * a.height)[0];
  return c ? { x: Math.max(0, Math.round(c.left)), y: Math.max(0, Math.round(c.top)), w: Math.round(Math.min(c.width, innerWidth)), h: Math.round(Math.min(c.height, innerHeight)) } : null;
}

// ---------- running a journey ----------
async function openSide(browser, url, vp, withInventory, record = false) {
  const touch = vp.name === 'mobile' || vp.name === 'tablet';
  // newPage seeds Math.random and starts the clock at the same instant on both sides (lib.mjs STABILISERS)
  const { context, page } = await newPage(browser, vp, { reducedMotion: 'no-preference', ...(touch ? { hasTouch: true, isMobile: vp.name === 'mobile' } : {}) });
  if (withInventory) await context.addInitScript(inventoryInPage);
  const cdp = await context.newCDPSession(page);
  // the reference of an own-bundle capture: what each stage loads joins the bundle (models and textures load late)
  const bundleDone = record ? recordBundle(page, ref) : null;
  await openUrl(page, url);
  // an own-bundle clone registers its service worker on the first load and reloads once: the app is the second load
  await page.waitForFunction(() => !document.getElementById('tc-sw-bootstrap'), null, { timeout: 20000 }).catch(() => {});
  return { context, page, cdp, touch, bundleDone };
}
const px = (vp, [x, y]) => [Math.round(x * vp.width), Math.round(y * vp.height)];
// the screen held still: two shots in a row alike, or the limit (a scene that never stops moving)
async function settle(page, maxMs = 6000) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < maxMs) {
    await page.waitForTimeout(250);
    const buf = await page.screenshot();
    if (last && (buf.equals(last) || matchPct(PNG.sync.read(last), PNG.sync.read(buf)).pct >= 99.5)) return { still: true, ms: Date.now() - t0, buf };
    last = buf;
  }
  return { still: false, ms: Date.now() - t0, buf: last || await page.screenshot() };
}
async function touchDrag(cdp, from, to, steps = 12) {
  const pt = ([x, y]) => [{ x, y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(from) });
  for (let i = 1; i <= steps; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt([from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps]) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function pointAt(page, vp, at) {
  if (Array.isArray(at)) return px(vp, at);
  const box = await page.locator(at).first().boundingBox().catch(() => null);
  return box ? [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)] : null;
}
async function doStep(side, vp, st) {
  const { page, cdp, touch } = side;
  if (st.wheel) {
    const [x, y] = px(vp, st.wheel.at || [0.5, 0.5]);
    const dy = st.wheel.dy ?? vp.height;
    if (touch) {
      // a swipe up of the same length (the page scrolls its content up), in strokes of at most 60% of the window
      for (let left = Math.abs(dy); left > 0; left -= vp.height * 0.6) {
        const d = Math.min(left, vp.height * 0.6) * Math.sign(dy);
        await touchDrag(cdp, [x, Math.round(vp.height * 0.8)], [x, Math.round(vp.height * 0.8 - d)]);
        await page.waitForTimeout(120);
      }
    } else {
      await page.mouse.move(x, y);
      const n = Math.max(4, Math.ceil(Math.abs(dy) / 120));
      for (let i = 0; i < n; i++) { await page.mouse.wheel(0, dy / n); await page.waitForTimeout(40); }
    }
  } else if (st.gesture) {
    const g = st.gesture;
    const [cx, cy] = px(vp, g.at || [0.5, 0.5]);
    const r = Math.round((g.size || 0.22) * Math.min(vp.width, vp.height));
    const pts = g.path ? g.path.map((p) => px(vp, p)) : Array.from({ length: 49 }, (_, i) => { const a = -Math.PI / 2 + (i / 48) * Math.PI * 2; return [Math.round(cx + Math.cos(a) * r * (g.shape === 'ellipse' ? 0.7 : 1)), Math.round(cy + Math.sin(a) * r)]; });
    if (touch) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0][0], y: pts[0][1], id: 1 }] });
      for (const [x, y] of pts.slice(1)) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] }); await page.waitForTimeout(16); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await page.mouse.move(...pts[0]);
      await page.mouse.down();
      for (const p of pts.slice(1)) { await page.mouse.move(...p, { steps: 2 }); await page.waitForTimeout(16); }
      await page.mouse.up();
    }
  } else if (st.pointer) {
    for (const p of st.pointer) await page.mouse.move(...px(vp, p), { steps: 8 });
  } else if (st.hold) {
    const at = await pointAt(page, vp, st.hold.at || [0.5, 0.5]);
    if (!at) return `hold: nothing at ${st.hold.at}`;
    if (touch) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at[0], y: at[1], id: 1 }] });
      await page.waitForTimeout(st.hold.ms || 2000);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await page.mouse.move(...at);
      await page.mouse.down();
      await page.waitForTimeout(st.hold.ms || 2000);
      await page.mouse.up();
    }
  } else if (st.click) {
    const at = await pointAt(page, vp, st.click);
    if (!at) return `click: nothing at ${st.click}`;
    if (touch) await page.touchscreen.tap(...at); else await page.mouse.click(...at);
  } else if (st.key) await page.keyboard.press(st.key);
  else if (st.wait) await page.waitForTimeout(st.wait);
  return null;
}

// A gate a page names in words (the draft passes "draw ..." with a gesture and "hold ..." with a hold, and counts it
// passed when its words leave the screen) is replayed by the same rule, on the reference and the clone alike: wait for
// the words to appear (up to 15 s), make the input, check they left, try again at most twice, and report a gate that
// never passes. RC5 zero: the load checkpoint held still within ~2 s while the loader counted, the gesture was drawn
// before the gate existed (it appears 3-6 s after load), and every later checkpoint stayed at "DRAW A ZERO".
// An input with no such words on screen within the wait is made as written.
const GATE_WORDS = { gesture: /\b(draw|trace|sketch)\b/i, hold: /\bhold\b/i };
async function gateStep(side, vp, st) {
  const re = st.gesture ? GATE_WORDS.gesture : GATE_WORDS.hold;
  const text = () => side.page.evaluate(uiTextInPage).catch(() => '');
  const t0 = Date.now();
  let shown = re.test(await text());
  while (!shown && Date.now() - t0 < 15000) { await side.page.waitForTimeout(250); shown = re.test(await text()); }
  if (!shown) return doStep(side, vp, st);
  let ui = '';
  for (let i = 1; i <= 3; i++) {
    const err = await doStep(side, vp, st);
    if (err) return err;
    await side.page.waitForTimeout(1500);
    ui = await text();
    if (!re.test(ui)) return null;
  }
  return `${st.gesture ? 'gesture' : 'hold'} gate not passed after 3 tries: the page still says "${String(ui).replace(/\s+/g, ' ').slice(0, 60)}"`;
}

// runs every step; at each checkpoint, calls shoot(index, name, settled)
async function runJourney(side, vp, steps, shoot) {
  const errors = [];
  let n = 0;
  for (const st of steps) {
    if (st.checkpoint) { const s = await settle(side.page, st.settle || 6000); await shoot(n++, st.checkpoint, s); continue; }
    const err = await (st.gesture || st.hold ? gateStep(side, vp, st) : doStep(side, vp, st)).catch((e) => e.message.split('\n')[0]);
    if (err) errors.push(err);
  }
  return errors;
}
const cpFile = (i, cp) => `${String(i).padStart(2, '0')}-${String(cp).replace(/[^a-z0-9-]+/gi, '-').slice(0, 40)}.png`;

// ---------- --draft: find the journey on the reference ----------
if (flags.draft) {
  const stopped = {}; // per size: why the draft ended (written into journey.json)
  // Drafted at each size the journey runs at: a phone reaches its states with swipes of its own length (half a window),
  // which may not land where the desktop's wheel turns do, so every size gets the steps that stop at each of its states.
  const draftAt = async (browser, vp) => {
    const touch = vp.name === 'mobile' || vp.name === 'tablet';
    const steps = [{ checkpoint: 'load', settle: 12000 }];
    const side = await openSide(browser, meta.finalUrl || meta.url, vp, false);
    const { page } = side;
    const loaded = await settle(page, 12000);
    // a scene that never holds still (ambient motion, a ticking counter): how far it drifts on its own, with no input,
    // so only a change beyond that drift counts as a new state, and its checkpoints wait a short fixed time
    const animated = !loaded.still;
    const pause = animated ? 2500 : 6000;
    const ui0 = await page.evaluate(uiTextInPage);
    // each state's own drift (a calm scene, then one with film grain or particles): two shots with no input, a pause
    // apart; a later shot below that, less a margin, is somewhere else
    const driftOf = async () => {
      const a = await page.screenshot();
      await page.waitForTimeout(pause);
      const b = await page.screenshot();
      const pct = matchPct(PNG.sync.read(a), PNG.sync.read(b)).pct;
      return { buf: b, pct, cut: Math.min(98, pct - 4) };
    };
    const d0 = await driftOf();
    const ticking = (await page.evaluate(uiTextInPage)) !== ui0;
    const words = (t) => ticking ? t.replace(/\d+/g, '#') : t;
    if (animated) console.log(`${vp.name}: the scene moves on its own (${d0.pct.toFixed(1)}% alike over ${pause} ms${ticking ? ', its text ticks' : ''}): each state's own drift is measured`);
    let last = d0.buf, cut = d0.cut;
    let lastUi = words(await page.evaluate(uiTextInPage));
    // every state reached so far: input that leads back to one of them (an app that loops after its last stage, a
    // toggle) reached nothing new
    const seen = [{ buf: last, ui: lastUi, cut }];
    const alike = (a, b, c) => matchPct(PNG.sync.read(a), PNG.sync.read(b)).pct >= c;
    // a new state: the picture moved beyond the scene's own drift, or what the page says changed (a gate's instruction
    // gone, a stage label), to somewhere not seen before
    const changed = async () => {
      const s = await settle(page, pause);
      const ui = words(await page.evaluate(uiTextInPage));
      if (alike(last, s.buf, cut) && ui === lastUi) return false;
      lastUi = ui;
      const back = seen.find((x) => x.ui === ui && alike(x.buf, s.buf, x.cut));
      if (back) { last = s.buf; cut = back.cut; return false; }
      const d = await driftOf();
      last = d.buf; cut = d.cut;
      seen.push({ buf: last, ui, cut });
      return true;
    };
    // each checkpoint's frame beside the draft, to check it against the live site by eye
    const shots = path.join(ref, 'journey-draft', vp.name);
    await fs.rm(shots, { recursive: true, force: true });
    await fs.mkdir(shots, { recursive: true });
    await fs.writeFile(path.join(shots, cpFile(0, 'load')), loaded.buf);
    let shot = 1;
    const cp = (name) => {
      console.log(`  ${vp.name}: ${name}`);
      fs.writeFile(path.join(shots, cpFile(shot++, name)), last).catch(() => {});
      return animated ? { checkpoint: name, settle: pause } : { checkpoint: name };
    };
    // a gate tried and not passed is not tried again while the page says the same
    const failed = new Set();
    let quiet = 0, k = 0, gates = 0;
    const centreOf = async (sel) => { const box = await page.locator(sel).first().boundingBox().catch(() => null); return box ? [+((box.x + box.width / 2) / vp.width).toFixed(3), +((box.y + box.height / 2) / vp.height).toFixed(3)] : null; };
    // a gate the page asks for in words, tried in order: draw (a gesture), hold, press a button
    const tryGate = async () => {
      const ui = await page.evaluate(uiTextInPage);
      if (failed.has(words(ui))) return false;
      // a gate is passed when its instruction leaves the screen; input that changed the picture with the instruction
      // still there is kept as a step (the replay makes it too), not counted as the gate
      const gone = async (re) => !re.test(await page.evaluate(uiTextInPage));
      const DRAW = /\b(draw|trace|sketch)\b/i, HOLD = /\bhold\b/i;
      if (DRAW.test(ui)) {
        for (const g of [{ shape: 'circle', at: [0.5, 0.5], size: 0.22 }, { shape: 'ellipse', at: [0.5, 0.5], size: 0.25 }, { shape: 'circle', at: [0.5, 0.55], size: 0.3 }]) {
          await doStep(side, vp, { gesture: g });
          if (await changed()) {
            if (await gone(DRAW)) { steps.push({ gesture: g }, cp(`gate-${++gates}`)); return true; }
            steps.push({ gesture: g });
          }
        }
      }
      // the control a "hold" label names: often a ring or button beside the words, not the words themselves; pressed
      // for 4 s (holds are commonly 2-3 s)
      const holdSel = await page.evaluate(() => {
        for (const e of document.querySelectorAll('[data-tc-journey-hold]')) e.removeAttribute('data-tc-journey-hold');
        const shown = (e) => {
          const r = e.getBoundingClientRect(), s = getComputedStyle(e);
          if (r.width <= 10 || r.height <= 10 || s.visibility === 'hidden' || s.display === 'none') return false;
          let o = 1;
          for (let x = e; x && o >= 0.05; x = x.parentElement) o *= Number(getComputedStyle(x).opacity);
          return o >= 0.05;
        };
        const label = [...document.querySelectorAll('button, [role="button"], a, div, span, p')].find((e) => /\bhold\b/i.test(e.textContent || '') && e.children.length < 4 && shown(e));
        if (!label) return null;
        const pressable = (e) => e.matches('button, [role="button"]') || ['pointer', 'grab'].includes(getComputedStyle(e).cursor) || getComputedStyle(e).touchAction === 'none';
        let el = label.closest('button, [role="button"]');
        for (let up = label, i = 0; !el && up && i < 3; up = up.parentElement, i++) el = [...up.querySelectorAll('*')].find((e) => e !== label && shown(e) && pressable(e)) || null;
        el ||= label;
        el.setAttribute('data-tc-journey-hold', '');
        return '[data-tc-journey-hold]';
      });
      const holdAt = holdSel ? await centreOf(holdSel) : null;
      if (holdAt) {
        await doStep(side, vp, { hold: { at: holdAt, ms: 4000 } });
        if (await changed()) {
          if (await gone(HOLD)) { steps.push({ hold: { at: holdAt, ms: 4000 } }, cp(`hold-${++gates}`)); return true; }
          steps.push({ hold: { at: holdAt, ms: 4000 } });
        }
      }
      const pressSel = await page.evaluate(() => { for (const e of document.querySelectorAll('[data-tc-journey-press]')) e.removeAttribute('data-tc-journey-press'); const el = [...document.querySelectorAll('button, [role="button"], a')].find((e) => /\b(start|enter|begin|explore|continue|tap|click|let'?s go)\b/i.test(e.textContent || '') && e.getBoundingClientRect().width > 10); if (!el) return null; el.setAttribute('data-tc-journey-press', ''); return '[data-tc-journey-press]'; });
      const pressAt = pressSel ? await centreOf(pressSel) : null;
      if (pressAt) {
        await doStep(side, vp, { click: pressAt });
        if (await changed()) { steps.push({ click: pressAt }, cp(`press-${++gates}`)); return true; }
      }
      failed.add(words(ui));
      return false;
    };
    // a long app (a phone swipes half a window at a time) has many turns: ten minutes and 80 turns per size at most
    const deadline = Date.now() + 10 * 60 * 1000;
    let i = 0;
    let rechecked = false;
    for (; i < 80 && Date.now() < deadline; i++) {
      if (await tryGate()) { quiet = 0; rechecked = false; await settle(page, 8000); continue; }
      const dy = Math.round(vp.height * (touch ? 0.5 : 1.2));
      await doStep(side, vp, { wheel: { dy } });
      if (await changed()) { steps.push({ wheel: { dy } }, cp(`step-${++k}`)); quiet = 0; rechecked = false; continue; }
      quiet++;
      steps.push({ wheel: { dy } });
      // three inputs that changed nothing: a long transition after a gate or a hold can swallow input (RC4 zero, phone:
      // the draft stopped at 18 checkpoints of 27), so the page is waited out once and asked again before it ends
      if (quiet >= 3 && !rechecked) { rechecked = true; quiet = 1; await settle(page, 8000); continue; }
      if (quiet >= 3) break;
    }
    const stoppedWhy = quiet >= 3 ? 'three inputs in a row changed nothing, after waiting out any transition' : i >= 80 ? `the turn limit (80)` : 'the time limit (10 minutes)';
    console.log(`${vp.name}: the draft stopped: ${stoppedWhy}`);
    if (quiet < 3) console.warn(`WARNING at ${vp.name} the draft stopped at ${stoppedWhy} while input still changed the page: the journey may go on; add the remaining steps to journey.json by hand`);
    stopped[vp.name] = stoppedWhy;
    // trailing input that changed nothing is left out
    while (steps.length && steps[steps.length - 1].wheel) steps.pop();
    await side.context.close();
    return steps;
  };
  const browser = await openBrowser(flags.cdp);
  const byViewport = {};
  try {
    for (const vpName of ['desktop', 'mobile']) byViewport[vpName] = await draftAt(browser, vpOf(vpName));
  } finally { if (!flags.cdp) await browser.close(); }
  // why each size's draft stopped is kept with it: an agent reading journey.json knows whether the journey can go on
  const journey = { viewports: ['desktop', 'mobile'], drafted: new Date().toISOString(), stopped, steps: byViewport.desktop, stepsByViewport: { mobile: byViewport.mobile } };
  const exists = await fs.stat(journeyFile).then(() => true, () => false);
  await fs.writeFile(exists ? path.join(root, 'journey.draft.json') : journeyFile, JSON.stringify(journey, null, 2));
  for (const [vpName, steps] of Object.entries(byViewport)) {
    const cps = steps.filter((s) => s.checkpoint).map((s) => s.checkpoint);
    console.log(`journey drafted at ${vpName}: ${cps.length} checkpoints (${cps.join(', ')})`);
    if (cps.length < 3) console.warn(`WARNING at ${vpName} the journey reached few states: a gate the instrument could not pass (a gesture it did not recognise), or input it does not make. Write the steps in journey.json (see the top of scripts/journey.mjs).`);
  }
  console.log(`-> ${path.relative(process.cwd(), exists ? path.join(root, 'journey.draft.json') : journeyFile)}${exists ? ' (journey.json exists: the draft is beside it)' : ''}; each checkpoint's frame: ${path.relative(process.cwd(), path.join(ref, 'journey-draft'))}/<size>/`);
  process.exit(0);
}

// ---------- the reference's checkpoints, or the clone's compared with them ----------
const journey = JSON.parse(await fs.readFile(journeyFile, 'utf8').catch(() => 'null'));
if (!journey?.steps?.length) { console.error(`no journey.json for ${name}: trueclone journey ${name} --draft`); process.exit(1); }
const clone = Boolean(flags.clone || flags.url);
const server = clone && typeof flags.url !== 'string' ? await serve(path.join(root, 'clone')) : null;
const url = clone ? (typeof flags.url === 'string' ? flags.url : server.url) : meta.finalUrl || meta.url;
const outRoot = clone ? path.join(root, COMPARE, 'journey') : path.join(ref, 'journey');
// what is measured (identity.mjs), taken before the first page opens
const ident = clone ? await startIdentity(root, 'journey', COMPARE === 'compare-next' ? 'app' : 'clone') : null;
const browser = await openBrowser(flags.cdp);
const result = { name, at: new Date().toISOString(), side: clone ? 'clone' : 'reference', viewports: [] };
try {
  // checkpoints are timed frames: one such run at a time on this machine
  await withMachineLock(`journey ${name}`, async () => {
    for (const vpName of journey.viewports || ['desktop']) {
      const vp = vpOf(vpName);
      const dir = path.join(outRoot, vp.name);
      await fs.rm(dir, { recursive: true, force: true });
      await fs.mkdir(dir, { recursive: true });
      const inventory = !clone && vp.name === 'desktop';
      const side = await openSide(browser, url, vp, inventory, !clone && Boolean(meta.bundle));
      const cps = [];
      const errors = await runJourney(side, vp, journey.stepsByViewport?.[vp.name] || journey.steps, async (i, cp, s) => {
        const file = cpFile(i, cp);
        await fs.writeFile(path.join(dir, file), s.buf);
        // the UI layer: the same screen with text and media masked and the canvas a flat box (lib.mjs mask), so the
        // interface's structure is compared on its own, apart from the scene
        await maskToggle(side.page, true).catch(() => {});
        await fs.writeFile(path.join(dir, file.replace(/\.png$/, '.mask.png')), await side.page.screenshot());
        await maskToggle(side.page, false).catch(() => {});
        const entry = { i, name: cp, file, still: s.still, ms: s.ms, canvas: await side.page.evaluate(canvasBoxInPage).catch(() => null), ui: await side.page.evaluate(uiTextInPage).catch(() => '') };
        if (inventory) {
          const scene = await side.page.evaluate(sceneInPage).catch(() => null);
          if (scene?.scenes?.length) { await fs.mkdir(path.join(ref, 'scene'), { recursive: true }); await fs.writeFile(path.join(ref, 'scene', file.replace(/\.png$/, '.json')), JSON.stringify(scene, null, 1)); entry.scene = `reference/scene/${file.replace(/\.png$/, '.json')}`; }
        }
        cps.push(entry);
      });
      if (inventory) {
        const shaders = await side.page.evaluate(() => window.__tcShaders || []).catch(() => []);
        if (shaders.length) {
          const sdir = path.join(ref, 'shaders');
          await fs.rm(sdir, { recursive: true, force: true });
          await fs.mkdir(sdir, { recursive: true });
          const index = [];
          for (const [k, sh] of shaders.entries()) {
            const f = `${String(k).padStart(3, '0')}-${crypto.createHash('sha1').update(sh.src).digest('hex').slice(0, 6)}.${sh.type}`;
            await fs.writeFile(path.join(sdir, f), sh.src);
            const uniforms = [...sh.src.matchAll(/uniform\s+\w+\s+(\w+)/g)].map((m) => m[1]);
            index.push(`| ${f} | ${sh.type} | ${sh.src.split('\n').length} | ${uniforms.slice(0, 12).join(', ')} |`);
          }
          await fs.writeFile(path.join(sdir, 'INDEX.md'), `# Shader programs the reference compiled (evidence: port the effect, never paste)\n\n| file | stage | lines | uniforms |\n|---|---|---|---|\n${index.join('\n')}\n`);
          console.log(`shaders: ${shaders.length} recorded -> reference/shaders/INDEX.md`);
        }
      }
      if (side.bundleDone) await side.bundleDone();
      await side.context.close();
      result.viewports.push({ viewport: vp.name, checkpoints: cps, errors });
      console.log(`${vp.name}: ${cps.length} checkpoint(s)${errors.length ? `; steps that failed: ${errors.join('; ')}` : ''}`);
    }
  });
} finally {
  if (!flags.cdp) await browser.close();
  server?.close();
}
await fs.mkdir(outRoot, { recursive: true });
await fs.writeFile(path.join(outRoot, 'journey.json'), JSON.stringify(result, null, 2));
if (!clone) { console.log(`reference journey -> ${path.relative(process.cwd(), outRoot)}`); process.exit(0); }

// ---------- the comparison ----------
// At each checkpoint, three spatial measures (measure.mjs), never a colour histogram (RC4 zero: 93.88 on the histogram
// for a different camera framing of the same palette):
//   ui     the UI layer, structure-masked (S-dom): the interface over the scene
//   scene  the canvas region: exact mode the lower of composition and colour layout (S-comp, A-grid); template mode
//          (decision D4: the art is the clone's own, "media replaced") composition only, with the stated allowance
//          TEMPLATE_ALLOWANCE (verdict.mjs) added to it; the UI layer gets none
//   text   the interface's text, as a share of the reference's words the clone shows (and no others)
// The checkpoint's value is the lowest of them; the histogram is kept beside them as a diagnostic.
const refRun = JSON.parse(await fs.readFile(path.join(ref, 'journey', 'journey.json'), 'utf8').catch(() => 'null'));
if (!refRun) { console.error(`no reference journey: trueclone journey ${name} first`); process.exit(1); }
const exact = meta.mode === 'exact';
const report = { name, at: new Date().toISOString(), mode: exact ? 'exact' : 'template', viewports: [] };
const reviewLines = {};
// The reference's own draws (calibrate.mjs, reference/calib/<k>/journey/): a checkpoint the reference varies on beyond
// its floor is judged by its envelope, never by a bar it cannot meet itself (rc.7; RC6 zero: the journey could only be
// "not verifiable" because nothing measured it). Not while calibrating: that run is a draw.
const noise = process.env.TC_CALIBRATE ? null : await loadNoise(root, refIdOf(meta));
// the draws' own runs (their interface text at each checkpoint: a counter or a toast differs between loads too)
const drawRuns = noise ? await Promise.all((noise.drawDirs || []).map((d) => fs.readFile(path.join(root, d, 'journey', 'journey.json'), 'utf8').then(JSON.parse, () => null))) : [];
const words = (t) => new Set(String(t || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1));
const textScore = (r, c) => { const wr = words(r), wc = words(c); return wr.size || wc.size ? +((100 * [...wr].filter((w) => wc.has(w)).length) / Math.max(1, new Set([...wr, ...wc]).size)).toFixed(2) : null; };
for (const v of result.viewports) {
  const rv = refRun.viewports.find((x) => x.viewport === v.viewport);
  if (!rv) continue;
  const cps = [];
  for (const c of rv.checkpoints) {
    const mine = v.checkpoints.find((x) => x.i === c.i);
    if (!mine) { cps.push({ i: c.i, name: c.name, match: 0, note: 'not reached on the clone' }); continue; }
    const a = PNG.sync.read(await fs.readFile(path.join(ref, 'journey', v.viewport, c.file)));
    const b = PNG.sync.read(await fs.readFile(path.join(outRoot, v.viewport, mine.file)));
    const readMask = (p) => fs.readFile(p.replace(/\.png$/, '.mask.png')).then((x) => PNG.sync.read(x), () => null);
    const am = await readMask(path.join(ref, 'journey', v.viewport, c.file)), bm = await readMask(path.join(outRoot, v.viewport, mine.file));
    const pixels = matchPct(a, b).pct;
    const ui = am && bm ? matchPct(am, bm).pct : null;
    const box = c.canvas;
    const sb = box && box.w > 8 && box.h > 8 ? [box.x, box.y, box.x + box.w, box.y + box.h] : null;
    const sc = sb ? regionScore(region(a, sb), region(b, sb), { template: !exact }) : null;
    const hist = sb ? canvasSimilarity(region(a, sb), region(b, sb)) : null;
    const scene = sc ? (exact ? sc.value : Math.min(100, sc.value + TEMPLATE_ALLOWANCE)) : null;
    const text = textScore(c.ui, mine.ui);
    // exact mode: the real pixels too, as before; template mode: the UI layer stands for the screen's layout
    const parts = [exact ? pixels : ui ?? pixels, scene, text].filter((x) => typeof x === 'number');
    const match = +Math.min(...parts).toFixed(2);
    // E: the same picture measures as the checkpoint's own (text apart), against the capture's frame and each draw's
    let env;
    if (noise && barFor(noise, 'journey', '', v.viewport, c.name).unstable) {
      const shot = async (dir, f) => { const full = await fs.readFile(path.join(dir, f)).then((x) => PNG.sync.read(x), () => null); return full ? { full, mask: await readMask(path.join(dir, f)) } : null; };
      const sim = (x, y) => Math.min(...[exact || !x.mask || !y.mask ? matchPct(x.full, y.full).pct : matchPct(x.mask, y.mask).pct, ...(sb ? [exact ? regionScore(region(x.full, sb), region(y.full, sb)).value : Math.min(100, regionScore(region(x.full, sb), region(y.full, sb), { template: true }).value + TEMPLATE_ALLOWANCE)] : [])]);
      const draws = [{ full: a, mask: am }, ...(await Promise.all((noise.drawDirs || []).map((d) => shot(path.join(root, d, 'journey', v.viewport), c.file)))).filter(Boolean)];
      env = envelope({ full: b, mask: bm }, draws, sim) || undefined;
      // The interface's words, by the same rule: the clone's against its nearest reference draw, at least what the
      // draws achieve against each other (less 1), and never held above the journey floor (RC6 zero, step-1 mobile:
      // the reference's own XP counter read 56, 54 and 61 on its three loads). A clone whose words match no draw fails.
      const uis = [c.ui, ...drawRuns.map((run) => run?.viewports?.find((x) => x.viewport === v.viewport)?.checkpoints?.find((x) => x.i === c.i || x.name === c.name)?.ui).filter((t) => typeof t === 'string')];
      if (env && uis.length >= 2 && (words(mine.ui).size || uis.some((t) => words(t).size))) {
        const near = Math.max(...uis.map((t) => textScore(t, mine.ui) ?? 100));
        const self = Math.min(...uis.map((t, k) => Math.max(...uis.filter((_, j) => j !== k).map((o) => textScore(t, o) ?? 100))));
        const bar = Math.min(FLOORS.journey ?? 80, self - 1);
        if (near < bar) env = { ...env, pass: false, reason: `the interface text matches no reference load (${near}% of the words at best; the reference against itself: ${self}%): ${env.reason}` };
        env = { ...env, text: { near, self, bar: +bar.toFixed(2) } };
      }
    }
    cps.push({ i: c.i, name: c.name, match, pixels, ui, scene, sComp: sc?.sComp ?? null, aGrid: sc?.aGrid ?? null, hist, text, uiRef: c.ui, uiClone: mine.ui, ...(env ? { envelope: env } : {}) });
    (reviewLines[v.viewport] ||= []).push({ c, mine, pixels });
  }
  const mean = cps.length ? +(cps.reduce((s, x) => s + x.match, 0) / cps.length).toFixed(2) : null;
  const worst = cps.length ? cps.reduce((x, y) => (y.match < x.match ? y : x)) : null;
  report.viewports.push({ viewport: v.viewport, match: mean, worst, checkpoints: cps, errors: v.errors });
  console.log(`journey (${v.viewport}): ${mean}% over ${cps.length} checkpoints; worst ${worst ? `${worst.name} ${worst.match}%` : '-'}`);
}
await fs.writeFile(path.join(outRoot, 'report.json'), JSON.stringify(report, null, 2));
// one unit per viewport, every checkpoint a member: the loop sees which checkpoint moved, not only the mean
await writeUnits(root, COMPARE, 'journey', report.viewports.map((v) => ({ viewport: v.viewport, value: v.match, template: !exact, errors: v.errors, members: v.checkpoints.map((c) => ({ id: c.name, i: c.i, value: c.match, pixels: c.pixels, ui: c.ui, scene: c.scene, sComp: c.sComp, aGrid: c.aGrid, hist: c.hist, text: c.text, note: c.note, ...(c.envelope ? { envelope: c.envelope } : {}) })) })), ident);

// the checkpoints side by side for the review, in review's format (tokens, frames.json, index.md): verdicts in notes.md
// as for any frame ("- journey/03-step-2 desktop [token]: same")
for (const [vpName, lines] of Object.entries(reviewLines)) {
  const dir = path.join(root, COMPARE, 'review', `journey-${vpName}`);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  const frames = [];
  for (const { c, mine, pixels } of lines) {
    const a = PNG.sync.read(await fs.readFile(path.join(ref, 'journey', vpName, c.file)));
    const b = PNG.sync.read(await fs.readFile(path.join(outRoot, vpName, mine.file)));
    const scale = 0.5, w = Math.round(a.width * scale), h = Math.round(a.height * scale);
    const img = new PNG({ width: w * 2 + 12, height: h });
    img.data.fill(255);
    [a, b].forEach((src, k) => {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const si = (Math.min(src.height - 1, Math.round(y / scale)) * src.width + Math.min(src.width - 1, Math.round(x / scale))) * 4, di = (y * img.width + x + k * (w + 12)) * 4;
        img.data[di] = src.data[si]; img.data[di + 1] = src.data[si + 1]; img.data[di + 2] = src.data[si + 2]; img.data[di + 3] = 255;
      }
    });
    let hsh = 2166136261;
    for (let gy = 0; gy < 10; gy++) for (let gx = 0; gx < 16; gx++) { const i = (Math.floor((gy + 0.5) * img.height / 10) * img.width + Math.floor((gx + 0.5) * img.width / 16)) * 4; hsh = Math.imul(hsh ^ (((img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3) >> 5), 16777619) >>> 0; }
    const file = c.file.replace(/\.png$/, '');
    await fs.writeFile(path.join(dir, `${file}.png`), PNG.sync.write(img));
    frames.push({ id: `journey/${file}`, file, pct: pixels, token: hsh.toString(36).slice(0, 5) });
  }
  await fs.writeFile(path.join(dir, 'frames.json'), JSON.stringify({ size: vpName, at: new Date().toISOString(), subjectHash: ident.subjectHash, frames }, null, 2));
  // the app's frames have their own verdicts, under their own heading (verdict.mjs reviewVerdicts; RC6 zero)
  const appSide = COMPARE === 'compare-next';
  await fs.writeFile(path.join(dir, 'index.md'), `# Journey review at ${vpName}: reference left, ${appSide ? 'the Next.js app' : 'clone'} right, at each checkpoint\n\nIn notes.md under "## ${REVIEW_HEADING[appSide ? 'app' : 'clone']}"${appSide ? ' (the app\'s own verdicts: the same frame names as the HTML clone\'s review, other pictures and tokens)' : ''}, one line per frame with its token (5 characters, exact): \`- <frame> ${vpName} [<token>]: same\` (below 85% pixel match, say why), \`differs: <what>\`, or \`tool: <why>; evidence: <file>\`.\n\n| frame | token | pixel match |\n|---|---|---|\n${frames.map((f) => `| [${f.id}](${f.file}.png) | ${f.token} | ${f.pct}% |`).join('\n')}\n`);
}
console.log(`-> ${path.relative(process.cwd(), path.join(outRoot, 'report.json'))}; review frames in ${COMPARE}/review/journey-<size>/`);
