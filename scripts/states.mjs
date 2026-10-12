// Multi-state capture: scroll the live page like a user (animations running), and at every step record
// a viewport screenshot (+ a masked one for structure scoring) and every element's opacity/transform/clip/
// position. From that it derives a motion inventory: scroll reveals, parallax, pinned and fixed elements.
// With --clone it replays the same scroll positions on the rebuild and scores each step.
//
// usage: node scripts/states.mjs <name> [--step 0.5] [--viewports desktop,mobile] [--cdp]
//        node scripts/states.mjs <name> --clone [url] [--structure]
import fs from 'node:fs/promises';
import path from 'node:path';
import { VIEWPORTS, parseArgs, openBrowser, newPage, serve, warmUp, waitStill, wheelTo, statesInPage, maskToggle, freezeLoops, matchPct, PNG } from './lib.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) {
  console.error('usage: npm run states -- <name> [--step 0.5] [--viewports desktop] | <name> --clone [url] [--structure]');
  process.exit(1);
}
const root = path.resolve('sites', name);
const ref = path.join(root, 'reference');
const meta = JSON.parse(await fs.readFile(path.join(ref, 'meta.json'), 'utf8'));
const cloneMode = Boolean(flags.clone);
const structure = Boolean(flags.structure);
const stepFrac = Number(flags.step || 0.5);
const wanted = typeof flags.viewports === 'string' ? flags.viewports.split(',') : null;
const viewports = VIEWPORTS.filter((v) => !wanted || wanted.includes(v.name));
const outRoot = path.join(cloneMode ? path.join(root, 'compare') : ref, 'states');

const server = cloneMode && typeof flags.clone !== 'string' ? await serve(path.join(root, 'clone')) : null;
const target = cloneMode ? (typeof flags.clone === 'string' ? flags.clone : server.url) : meta.url;
const browser = await openBrowser(flags.cdp);
const report = { name, target, mode: cloneMode ? (structure ? 'clone-structure' : 'clone-visual') : 'reference', at: new Date().toISOString(), viewports: [] };

// Viewports run side by side (one page each): most of a step is waiting for smooth scroll to glide.
try {
  report.viewports = await Promise.all(viewports.map(async (vp) => {
    const dir = path.join(outRoot, vp.name);
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { recursive: true });
    const { context, page } = await newPage(browser, vp, { reducedMotion: 'no-preference' });
    await page.goto(target, { waitUntil: 'load', timeout: 60000 });
    await page.mouse.move(5, vp.height - 5);
    const intro = await waitStill(page, { timeout: 15000, interval: 200 }); // let intros/loaders finish first
    // Before the first scroll: one-shot reveals (Framer Motion whileInView once, IntersectionObserver classes) are
    // still in their starting state here. The warm-up below fires them for good, so they must be read now.
    const initial = cloneMode ? null : await page.evaluate(statesInPage);
    await warmUp(page);
    await wheelTo(page, 0, vp);

    // Reference: step through the whole page. Clone: replay the reference's exact scroll positions.
    // Guard: a clone whose page height runs away (e.g. a slider sizing loop) would make every step meaningless
    const docH = await page.evaluate(() => document.documentElement.scrollHeight);
    let ys;
    if (cloneMode) {
      const refMeta = JSON.parse(await fs.readFile(path.join(ref, 'meta.json'), 'utf8'));
      const refH = refMeta.viewports?.find((v) => v.viewport === vp.name)?.pageHeight;
      if (refH && Math.abs(docH - refH) / refH > 0.2) console.warn(`WARNING ${vp.name}: clone page height ${docH}px vs reference ${refH}px after the warm-up scroll - a layout is running away; fix that before reading state scores.`);
      ys = JSON.parse(await fs.readFile(path.join(ref, 'states', `${vp.name}.json`), 'utf8')).steps.map((s) => s.y);
    } else {
      const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
      const step = Math.round(vp.height * stepFrac);
      ys = [];
      for (let y = 0; y < max; y += step) ys.push(y);
      ys.push(max);
    }

    const steps = [];
    const samples = []; // per step: { path: state }
    for (const [i, y] of ys.entries()) {
      const actual = await wheelTo(page, y, vp);
      const still = await waitStill(page);
      const file = `${String(i).padStart(2, '0')}`;
      await freezeLoops(page); // loops that started on entering view too, so every step is compared at the same phase
      await page.screenshot({ path: path.join(dir, `${file}.png`) });
      await maskToggle(page, true);
      await page.screenshot({ path: path.join(dir, `${file}.mask.png`) });
      await maskToggle(page, false);
      if (!cloneMode) samples.push(await page.evaluate(statesInPage));
      steps.push({ i, y: actual, target: y, settled: still.settled, settleMs: still.ms });
    }
    await context.close();

    if (cloneMode) {
      const sfx = structure ? '.mask' : '';
      const scored = [];
      for (const s of steps) {
        const f = `${String(s.i).padStart(2, '0')}${sfx}.png`;
        const a = PNG.sync.read(await fs.readFile(path.join(ref, 'states', vp.name, f)));
        const b = PNG.sync.read(await fs.readFile(path.join(dir, f)));
        scored.push({ ...s, match: matchPct(a, b).pct });
      }
      const avg = +(scored.reduce((n, s) => n + s.match, 0) / scored.length).toFixed(2);
      return { viewport: vp.name, match: avg, worst: [...scored].sort((a, b) => a.match - b.match).slice(0, 5), steps: scored };
    } else {
      const summary = summarize(steps, samples, vp, initial);
      await fs.writeFile(path.join(outRoot, `${vp.name}.json`), JSON.stringify({ viewport: vp, steps, samples }));
      await fs.writeFile(path.join(outRoot, `${vp.name}.summary.json`), JSON.stringify(summary, null, 2));
      return { viewport: vp.name, introMs: intro.ms, steps: steps.length, unsettled: steps.filter((s) => !s.settled).length, ...summary.counts };
    }
  }));
} finally {
  if (!flags.cdp) await browser.close();
  server?.close();
}

await fs.writeFile(path.join(outRoot, cloneMode ? `report${structure ? '.mask' : ''}.json` : 'report.json'), JSON.stringify(report, null, 2));
if (cloneMode) {
  console.log(`state match (${report.mode}) - average over scroll steps`);
  console.table(report.viewports.map((v) => ({ viewport: v.viewport, 'match %': v.match, worst: v.worst.map((s) => `#${s.i} y${s.y} ${s.match}%`).join('  ') })));
} else {
  console.table(report.viewports);
}
console.log(`States: ${path.relative(process.cwd(), outRoot)}`);

// ---------- Motion inventory ----------
// Classifies what changes between scroll steps, per element (keyed by DOM path).
function summarize(steps, samples, vp, initial = {}) {
  const inView = (st) => st.box[1] < vp.height && st.box[1] + st.box[3] > 0;
  const paths = new Set(samples.flatMap((s) => Object.keys(s)));
  const reveals = [], animated = [], parallax = [], pinned = [], fixed = [], revealsOnce = [];

  // One-shot reveals: below the fold at load in a hidden or offset starting state (opacity ~0, a translate, a blur),
  // and seen visible in view later. The starting state is the recipe the clone has to animate from.
  const offset = (t) => { const m = /matrix\(([^)]+)\)/.exec(t || ''); if (!m) return 0; const v = m[1].split(',').map(Number); return Math.hypot(v[4], v[5]); };
  for (const [p, s0] of Object.entries(initial || {})) {
    if (s0.box[1] < vp.height) continue; // above the fold: part of the intro, not a scroll reveal
    const hidden = s0.o <= 0.05 || !s0.v || offset(s0.t) >= 8 || /blur/.test(s0.f);
    if (!hidden) continue;
    const later = samples.map((s) => s[p]).find((s) => s && inView(s) && s.o > 0.5 && s.v);
    if (!later || (later.o === s0.o && later.t === s0.t && later.f === s0.f)) continue;
    revealsOnce.push({ path: p, cls: s0.cls, from: { opacity: s0.o, transform: s0.t || 'none', filter: s0.f || 'none' }, to: { opacity: later.o, transform: later.t || 'none', filter: later.f || 'none' }, box: later.box });
  }
  for (const p of paths) {
    const seq = samples.map((s, i) => (s[p] ? { ...s[p], i, y: steps[i].y } : null));
    const present = seq.filter(Boolean);
    if (present.length < 2) continue;
    const first = present[0];
    const label = { path: p, cls: first.cls, media: first.media };

    if (present.some((s) => s.pos === 'fixed')) fixed.push({ ...label, box: first.box });

    // Hidden while in view at one step, visible while in view at a later step => scroll reveal.
    const shownAt = present.find((s) => inView(s) && s.o > 0.05 && s.v);
    const hiddenBefore = present.find((s) => inView(s) && (s.o <= 0.05 || !s.v) && (!shownAt || s.i < shownAt.i));
    if (hiddenBefore && shownAt) reveals.push({ ...label, hiddenAtStep: hiddenBefore.i, shownAtStep: shownAt.i, box: shownAt.box });

    // Properties that change between steps.
    const props = ['o', 't', 'c', 'f'].filter((k) => new Set(present.map((s) => String(s[k]))).size > 1);
    if (props.length) animated.push({ ...label, props: props.map((k) => ({ o: 'opacity', t: 'transform', c: 'clip-path', f: 'filter' })[k]), steps: present.length });

    // Scroll speed relative to the page: 1 = normal, 0 = pinned, other = parallax.
    const pairs = [];
    for (let k = 1; k < present.length; k++) {
      const a = present[k - 1], b = present[k];
      const dScroll = b.y - a.y;
      if (dScroll <= 0 || !inView(a) || !inView(b)) continue;
      pairs.push(-(b.box[1] - a.box[1]) / dScroll);
    }
    if (pairs.length >= 2 && !present.some((s) => s.pos === 'fixed')) {
      const speed = pairs.reduce((n, v) => n + v, 0) / pairs.length;
      if (Math.abs(speed) < 0.05) pinned.push({ ...label, steps: pairs.length });
      else if (Math.abs(speed - 1) > 0.08) parallax.push({ ...label, speed: +speed.toFixed(2) });
    }
  }
  // Keep the list readable: outermost elements first (shorter paths), deduplicate children of listed parents.
  const prune = (list) => {
    list.sort((a, b) => a.path.length - b.path.length);
    const kept = [];
    for (const item of list) if (!kept.some((k) => item.path.startsWith(k.path + '>'))) kept.push(item);
    return kept;
  };
  const result = { reveals: prune(reveals), revealsOnce: prune(revealsOnce), animated: prune(animated), parallax: prune(parallax), pinned: prune(pinned), fixed: prune(fixed) };
  return { counts: Object.fromEntries(Object.entries(result).map(([k, v]) => [k, v.length])), ...result };
}
