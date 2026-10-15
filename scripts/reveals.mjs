// Record what scrolling does to the reference, so the clone can replay it exactly:
// - one-shot scroll reveals, frame by frame: every element that sat below the fold in a hidden or offset state
//   (opacity ~0, a translate, a scale, a blur) is watched with requestAnimationFrame, and when it starts to change
//   its opacity, translate, scale and blur are sampled every frame until they settle. The result is the reveal's
//   real curve (delay, duration, easing, stagger included), whatever library drew it: Framer Motion, GSAP, AOS,
//   IntersectionObserver plus CSS transitions;
// - scroll-linked curves (parallax, a scrubbed fade or scale): every element is sampled at each settled scroll
//   position; what follows the scroll position, and comes back to its start when the page returns to the top, is a
//   curve keyed by scroll position. A translate that follows the scroll one to one is a pin and is listed, not
//   replayed (the clone's script recreates pins);
// - class changes caused by scrolling (a header that gets its backdrop past 12px, an "is-visible" toggle).
// `trueclone seed` marks these elements in the clone and adds a small player that replays them.
//
// Elements are identified by their path of element children, skipping script/style/meta-like tags, which is
// the same in the live page and in the script-free mirror the clone is seeded from.
//
// Runs at every width by default (offsets differ per width): one file each, recorded in parallel.
// usage: node scripts/reveals.mjs <name> [--viewport desktop]   -> sites/<name>/reference/reveals.<vp>.json
import fs from 'node:fs/promises';
import path from 'node:path';
import { VIEWPORTS, parseArgs, openBrowser, newPage, waitStill, wheelTo, siteDir, unroll } from './lib.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) {
  console.error('usage: trueclone reveals <name> [--viewport desktop|tablet|mobile]');
  process.exit(1);
}
const root = siteDir(name);
const meta = JSON.parse(await fs.readFile(path.join(root, 'reference', 'meta.json'), 'utf8'));
const vps = flags.viewport ? [VIEWPORTS.find((v) => v.name === flags.viewport)] : VIEWPORTS;
if (vps.some((v) => !v)) {
  console.error(`unknown viewport ${flags.viewport}: desktop, tablet or mobile`);
  process.exit(1);
}

// Runs in the page before any scroll: picks the reveal candidates, starts the frame sampler, and prepares the
// per-position sampler for every element.
function watchInPage() {
  const SKIP = new Set(['SCRIPT', 'NOSCRIPT', 'TEMPLATE', 'STYLE', 'LINK', 'META']);
  const pathOf = (el) => {
    const parts = [];
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const sibs = [...n.parentElement.children].filter((c) => !SKIP.has(c.tagName));
      parts.unshift(`${n.tagName.toLowerCase()}:${sibs.indexOf(n) + 1}`);
    }
    return parts.join('>');
  };
  const clsOf = (el) => String(el.getAttribute('class') || '').split(/\s+/).slice(0, 2).join('.');
  const read = (el) => {
    const s = getComputedStyle(el);
    const m = new DOMMatrixReadOnly(s.transform === 'none' ? undefined : s.transform);
    const blur = /blur\(([\d.]+)px\)/.exec(s.filter);
    return { o: +(+s.opacity).toFixed(3), tx: +m.m41.toFixed(2), ty: +m.m42.toFixed(2), s: +Math.hypot(m.m11, m.m12).toFixed(4), blur: blur ? +blur[1] : 0 };
  };
  const hiddenish = (st) => st.o <= 0.05 || Math.hypot(st.tx, st.ty) >= 8 || Math.abs(st.s - 1) >= 0.04 || st.blur > 0;
  const candidates = [];
  const tracked = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (SKIP.has(el.tagName) || el.closest('svg') && el.tagName !== 'svg') continue;
    tracked.push({ el, samples: [], last: null, back: null });
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight || r.width < 8 || r.height < 8) continue;
    const st = read(el);
    if (!hiddenish(st)) continue;
    // continuous motion (marquees, loops) is not a reveal: skip anything running an endless animation
    const endless = (e) => e.getAnimations().some((a) => a.effect?.getTiming().iterations === Infinity);
    if (endless(el) || (el.parentElement && endless(el.parentElement))) continue;
    // keep the outermost element of a revealing group (a hidden card hides its children too)
    if (candidates.some((c) => c.el.contains(el))) continue;
    candidates.push({ el, path: pathOf(el), from: st, frames: null, start: null, topAtStart: null, last: JSON.stringify(st), still: 0, done: false, doneAtY: null, movedStill: 0, lastY: Math.round(scrollY) });
  }
  window.__tcReveals = candidates;
  // one sample per element per settled scroll position, kept only when the state changed
  window.__tcSample = () => {
    const y = Math.round(scrollY);
    for (const t of tracked) {
      if (!t.el.isConnected) continue;
      const r = t.el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      const st = read(t.el);
      const key = JSON.stringify(st);
      if (key === t.last) continue;
      t.last = key;
      // v: where the element's layout box sits in the viewport (its translate taken out), the way ScrollTrigger sees it
      t.samples.push({ y, v: Math.round(r.top - st.ty), ...st });
    }
  };
  window.__tcSampleBack = () => { for (const t of tracked) if (t.el.isConnected) { const st = read(t.el); t.back = { y: Math.round(scrollY), v: Math.round(t.el.getBoundingClientRect().top - st.ty), ...st }; } };
  // called twice while the page stands still: what changed in between moves on its own (a loop, a timer), not with the scroll
  window.__tcSampleIdle = () => { for (const t of tracked) { if (!t.el.isConnected) continue; const key = JSON.stringify(read(t.el)); if (t.idleKey !== undefined && key !== t.idleKey) t.idleMoved = true; t.idleKey = key; } };
  // after the scroll-through: which sampled elements follow the scroll position
  window.__tcClassify = (classPathList) => {
    const classPaths = new Set(classPathList);
    const revealOf = new Map(candidates.filter((c) => c.done && c.movedStill >= 2).map((c) => [c.el, c]));
    const scrubs = [], pins = [];
    for (const t of tracked) {
      if (!t.el.isConnected || t.samples.length < 2 || t.idleMoved) continue;
      const p = pathOf(t.el);
      if (classPaths.has(p)) continue; // a class change the class player replays
      const rev = revealOf.get(t.el);
      let samples = t.samples;
      if (rev) {
        // after its one-shot reveal: the state back at the top (revealed, scroll position 0), then from where the
        // reveal ended; between the two the curve is interpolated (a parallax is linear in the scroll position)
        const last = rev.frames[rev.frames.length - 1];
        const after = samples.filter((s) => s.y > rev.doneAtY);
        samples = [...(t.back && t.back.y < rev.doneAtY ? [t.back] : []), { y: rev.doneAtY, v: after[0] ? after[0].v + (after[0].y - rev.doneAtY) : undefined, o: last.o, tx: last.tx, ty: last.ty, s: last.s, blur: last.blur }, ...after];
      }
      if (samples.length < 3) continue; // two states is a toggle, not a curve
      // a pin: translateY follows the scroll one to one between two positions, nothing else changes
      const slopes = [];
      for (let i = 1; i < samples.length; i++) slopes.push((samples[i].ty - samples[i - 1].ty) / ((samples[i].y - samples[i - 1].y) || 1));
      const isPin = (k) => Math.abs(k - 1) < 0.05, isFlat = (k) => Math.abs(k) < 0.02;
      if (slopes.filter(isPin).length >= 2 && slopes.every((k) => isPin(k) || isFlat(k)) && samples.every((s) => Math.abs(s.tx - samples[0].tx) < 2 && Math.abs(s.o - samples[0].o) < 0.03 && Math.abs(s.s - samples[0].s) < 0.01)) {
        const first = slopes.findIndex(isPin);
        let lastI = slopes.length - 1;
        while (lastI > first && !isPin(slopes[lastI])) lastI--;
        pins.push({ path: p, cls: clsOf(t.el), start: samples[first].y, end: samples[lastI + 1].y });
        continue;
      }
      const step = Math.max(1, Math.ceil(samples.length / 40));
      // keyed by the element's viewport position when it moves with the page (a card's parallax: the same curve in
      // any viewport height, as a ScrollTrigger on the element would give), by scroll position when it doesn't (a
      // line inside a pinned stage: its box stays put while the page scrolls)
      const a = samples[0], b = samples[samples.length - 1];
      const key = b.y !== a.y && a.v !== undefined && Math.abs((b.v - a.v) / (b.y - a.y) + 1) < 0.15 ? 'v' : 'y';
      scrubs.push({ path: p, cls: clsOf(t.el), key, samples: samples.filter((s, i) => i % step === 0 || i === samples.length - 1) });
    }
    return { scrubs, pins };
  };
  const tick = (now) => {
    for (const c of candidates) {
      if (c.done) continue;
      const st = read(c.el);
      const key = JSON.stringify(st);
      if (c.frames === null) {
        if (key !== c.last) {
          c.frames = [{ t: 0, ...c.from }, { t: 16, ...st }];
          c.start = now - 16;
          const r = c.el.getBoundingClientRect();
          c.topAtStart = +(r.top / innerHeight).toFixed(3);
          c.last = key;
        }
        continue;
      }
      c.frames.push({ t: Math.round(now - c.start), ...st });
      // motion while the page stands still is a one-shot animation; motion only while scrolling is scroll-linked
      const y = Math.round(scrollY);
      if (key !== c.last && y === c.lastY) c.movedStill++;
      c.lastY = y;
      c.still = key === c.last ? c.still + 1 : 0;
      c.last = key;
      if (c.still >= 8 || now - c.start > 6000) {
        c.frames = c.frames.slice(0, c.frames.length - c.still + 1); // drop the trailing identical frames
        c.done = true;
        c.doneAtY = Math.round(scrollY);
      }
    }
    if (candidates.some((c) => !c.done)) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return candidates.length;
}

// Records the first class change of each element while the page scrolls, with where it happened.
function watchClassesInPage() {
  const SKIP = new Set(['SCRIPT', 'NOSCRIPT', 'TEMPLATE', 'STYLE', 'LINK', 'META']);
  const pathOf = (el) => {
    const parts = [];
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const sibs = [...n.parentElement.children].filter((c) => !SKIP.has(c.tagName));
      parts.unshift(`${n.tagName.toLowerCase()}:${sibs.indexOf(n) + 1}`);
    }
    return parts.join('>');
  };
  const pinned = (el) => { for (let n = el; n && n !== document.body; n = n.parentElement) { const p = getComputedStyle(n).position; if (p === 'fixed' || p === 'sticky') return true; } return false; };
  window.__tcClasses = [];
  window.__tcClassIdle = true;
  const idleChanged = new Set();
  const seen = new Set();
  new MutationObserver((records) => {
    for (const r of records) {
      const el = r.target;
      if (!(el instanceof Element) || !el.isConnected || el === document.body || el === document.documentElement) continue;
      if (window.__tcClassIdle) { idleChanged.add(el); continue; }
      if (idleChanged.has(el) || seen.has(el)) continue;
      const now = el.getAttribute('class');
      if (now === r.oldValue) continue;
      seen.add(el);
      // an element without a box (display: contents, an empty wrapper) is placed by its first descendant that has one
      let boxEl = el;
      if (!boxEl.getBoundingClientRect().height) boxEl = [...el.querySelectorAll('*')].find((d) => d.getBoundingClientRect().height) || el;
      const rect = boxEl.getBoundingClientRect();
      window.__tcClasses.push({ el, path: pathOf(el), from: r.oldValue, to: now, scrollY: Math.round(scrollY), ratio: +(rect.top / innerHeight).toFixed(3), sticky: pinned(el) });
    }
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
}

async function record(vp) {
  const browser = await openBrowser(flags.cdp);
  let result, scrubs, pins;
  try {
    const { page } = await newPage(browser, vp, { reducedMotion: 'no-preference' });
    await page.goto(meta.url, { waitUntil: 'load', timeout: 60000 });
    await page.mouse.move(5, vp.height - 5);
    await waitStill(page, { timeout: 15000, interval: 200 });
    await unroll(page); // an app shell scrolls like a document (lib.mjs), as everywhere the page is measured
    // Only what scrolling does: with pointer events off, whatever scrolls under the resting pointer is never hovered,
    // so a card that opens on hover is not recorded as opened by the scroll. (Wheel input still reaches the page.)
    await page.addStyleTag({ content: '*, *::before, *::after { pointer-events: none !important; }' });
    await page.mouse.move(vp.width - 2, Math.round(vp.height / 2));
    const count = await page.evaluate(watchInPage);
    // Class changes caused by scrolling (a header that gets its backdrop, an "is-visible" toggle): watched with a
    // MutationObserver. Anything that changes while the page sits idle (timers, carousels) is ignored.
    await page.evaluate(watchClassesInPage);
    await page.waitForTimeout(1500);
    await page.evaluate(() => { window.__tcClassIdle = false; });
    await page.evaluate(() => window.__tcSample()); // every element's state at the top
    // scroll down a third of a window at a time, give each reveal time to play, sample every element where it settled
    const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    for (let y = 0; y <= max; y += Math.round(vp.height / 3)) {
      await wheelTo(page, y, vp, { settle: true });
      await page.waitForTimeout(450);
      await page.evaluate(() => window.__tcSample());
    }
    await page.waitForTimeout(1300);
    await page.evaluate(() => { window.__tcSample(); window.__tcSampleIdle(); });
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.__tcSampleIdle());
    // back to the top: does each class change revert (scroll state) or stay (one-shot)? does each moved element
    // return to its starting state (scroll-linked) or not (one-shot, time-driven)?
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.__tcSampleBack());
    // class order changes when a site removes and re-adds classes: compare the sets
    // It reverts when the classes the scroll removed are back; classes added once (a one-time animation) may stay, so the
    // state after returning ('back') is recorded too and used by the clone after the first scroll.
    await page.evaluate(() => {
      const toks = (v) => String(v || '').split(/\s+/).filter(Boolean);
      for (const c of window.__tcClasses) {
        c.back = c.el.getAttribute('class');
        const removed = toks(c.from).filter((t) => !toks(c.to).includes(t));
        c.reverts = removed.length ? removed.every((t) => toks(c.back).includes(t)) : !toks(c.back).some((t) => toks(c.to).includes(t) && !toks(c.from).includes(t));
        c.marks = toks(c.to).filter((t) => !toks(c.back).includes(t)); // classes that only exist while scrolled
      }
    });
    // sticky/fixed elements switch at a scroll position: find it precisely by bisection
    const stickyCount = await page.evaluate(() => window.__tcClasses.filter((c) => c.sticky && c.reverts).length);
    for (let i = 0; i < stickyCount; i++) {
      let lo = 0, hi = await page.evaluate((k) => window.__tcClasses.filter((c) => c.sticky && c.reverts)[k].scrollY, i);
      while (hi - lo > 2) {
        const mid = Math.round((lo + hi) / 2);
        await page.evaluate((y) => window.scrollTo(0, y), mid);
        await page.waitForTimeout(160);
        const on = await page.evaluate((k) => { const c = window.__tcClasses.filter((x) => x.sticky && x.reverts)[k]; const now = String(c.el.getAttribute('class') || '').split(/\s+/); return c.marks.length > 0 && c.marks.every((t) => now.includes(t)); }, i);
        if (on) hi = mid; else lo = mid;
      }
      await page.evaluate(([k, y]) => { window.__tcClasses.filter((c) => c.sticky && c.reverts)[k].threshold = y; }, [i, hi]);
    }
    const classes = await page.evaluate(() => window.__tcClasses.map((c) => ({ path: c.path, from: c.from, to: c.to, back: c.back, sticky: c.sticky, reverts: c.reverts, ...(c.sticky ? { threshold: c.threshold ?? c.scrollY } : { trigger: c.ratio }) })));
    // a reveal settles; anything still moving at the 6s cap is continuous motion driven some other way
    // a reveal settles, and moves while the page stands still; anything still moving at the 6s cap is continuous
    // motion driven some other way, and a change seen only during scroll steps is scroll-linked (a curve, below)
    result = await page.evaluate(() => window.__tcReveals.filter((c) => c.frames && c.frames.length > 2 && c.movedStill >= 2 && c.frames[c.frames.length - 1].t < 5900).map((c) => {
      const last = c.frames[c.frames.length - 1];
      // keep at most ~60 keyframes: enough for any easing, small enough for the clone
      const step = Math.max(1, Math.ceil(c.frames.length / 60));
      const frames = c.frames.filter((f, i) => i % step === 0 || i === c.frames.length - 1);
      return { path: c.path, cls: String(c.el.getAttribute('class') || '').split(/\s+/).slice(0, 2).join('.'), from: c.from, to: { o: last.o, tx: last.tx, ty: last.ty, s: last.s, blur: last.blur }, trigger: c.topAtStart, duration: last.t, frames };
    }));
    ({ scrubs, pins } = await page.evaluate((cp) => window.__tcClassify(cp), classes.map((c) => c.path)));
    console.log(`${vp.name}: ${count} candidates below the fold, ${result.length} revealed while scrolling; ${scrubs.length} scroll-linked curve(s), ${pins.length} pin(s)${pins.length ? ` (${pins.map((p) => `${p.cls || p.path.split('>').pop()} ${p.start}-${p.end}px`).join(', ')})` : ''}`);
    result.classes = classes;
    console.log(`${vp.name}: ${classes.length} class change(s) caused by scrolling: ${classes.filter((c) => c.sticky).length} at a scroll position (sticky/fixed), ${classes.filter((c) => !c.sticky).length} when in view; ${classes.filter((c) => c.reverts).length} revert on the way back up`);
  } finally {
    if (!flags.cdp) await browser.close();
  }
  const out = path.join(root, 'reference', `reveals.${vp.name}.json`);
  await fs.writeFile(out, JSON.stringify({ url: meta.url, viewport: vp, at: new Date().toISOString(), reveals: result, scrubs, pins, classes: result.classes }, null, 2));
  const groups = new Map();
  for (const r of result) {
    const k = `${JSON.stringify(r.from)} -> ${Math.round(r.duration / 50) * 50}ms`;
    groups.set(k, (groups.get(k) || 0) + 1);
  }
  for (const [k, n] of [...groups].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`  ${vp.name} ${String(n).padStart(3)}x  from ${k}`);
  console.log(`-> ${path.relative(process.cwd(), out)}`);
}

await Promise.all(vps.map(record));
