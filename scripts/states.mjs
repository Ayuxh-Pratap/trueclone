// Multi-state capture: scroll the live page like a user (animations running), and at every step record
// a viewport screenshot (+ a masked one for structure scoring) and every element's opacity/transform/clip/
// position. From that it derives a motion inventory: scroll reveals, parallax, pinned and fixed elements.
// With --clone it replays the same scroll positions on the rebuild and scores each step.
//
// usage: node scripts/states.mjs <name> [--step 0.5] [--viewports desktop,mobile] [--cdp]
//        node scripts/states.mjs <name> --clone [url] [--structure]
import fs from 'node:fs/promises';
import path from 'node:path';
import { SCORED, parseArgs, openBrowser, newPage, serve, warmUp, waitStill, wheelTo, statesInPage, maskToggle, seekLoops, matchPct, canvasSimilarity, PNG, COMPARE, siteDir, unroll, openUrl, holdStill, releaseStill, STILL_AGE } from './lib.mjs';
import { startIdentity, refIdOf } from './identity.mjs';
import { writeUnits, mergeAggregate } from './results.mjs';
import { regionScore, region, envelope, presence, presenceInRange } from './measure.mjs';
import { loadNoise, barFor } from './verdict.mjs';

// page time between two scroll steps' stills (lib.mjs holdStill): longer than any step takes, so every step is held ahead
const STEP_AGE = 10000;

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) {
  console.error('usage: npm run states -- <name> [--step 0.5] [--viewports desktop] | <name> --clone [url] [--structure]');
  process.exit(1);
}
const root = siteDir(name);
const ref = path.join(root, 'reference');
const meta = JSON.parse(await fs.readFile(path.join(ref, 'meta.json'), 'utf8'));
const cloneMode = Boolean(flags.clone);
const structure = Boolean(flags.structure);
const stepFrac = Number(flags.step || 0.5);
const wanted = typeof flags.viewports === 'string' ? flags.viewports.split(',') : null;
const viewportsAll = SCORED.filter((v) => !wanted || wanted.includes(v.name));
// Every route of the site (meta.routes, from capture; --route "/about" for one): the captured page reads and writes
// where it always has (reference/states, compare/states), each other route under its own folder
// (reference/routes/<slug>/states, compare/routes/<slug>/states), opened at its own address.
const routes = (meta.routes?.length ? meta.routes : [{ path: '/', slug: '', dir: 'reference' }]).filter((r) => typeof flags.route !== 'string' || r.path === flags.route);
const server = cloneMode && typeof flags.clone !== 'string' ? await serve(path.join(root, 'clone')) : null;
const base = cloneMode ? (typeof flags.clone === 'string' ? flags.clone : server.url) : (meta.finalUrl || meta.url);
// calibrate.mjs replays the live reference through the clone path (TC_CALIBRATE): its routes are at their own addresses
const calibrating = process.env.TC_CALIBRATE === '1';
// template mode: the clone's media and scenes are its own (decision D4), so a canvas region is gated on composition
const template = meta.mode !== 'exact';
// the reference's own draws (calibrate.mjs: reference/calib/<k>/), for frames the reference varies on; and its noise
const noise = cloneMode && !calibrating ? await loadNoise(root, refIdOf(meta)) : null;
const drawDirs = noise ? (noise.drawDirs || []).map((d) => path.join(root, d)) : [];
// what is measured (identity.mjs), taken before the first page opens
const ident = cloneMode ? await startIdentity(root, 'scroll', COMPARE === 'compare-next' ? 'app' : 'clone') : null;
const scrollUnits = [], canvasUnits = [];
const browser = await openBrowser(flags.cdp);
const report = { name, target: base, mode: cloneMode ? (structure ? 'clone-structure' : 'clone-visual') : 'reference', at: new Date().toISOString(), viewports: [], routes: [] };

async function runRoute(r) {
  const refDir = path.join(root, r.dir);
  const outRoot = path.join(cloneMode ? (r.slug ? path.join(root, COMPARE, 'routes', r.slug) : path.join(root, COMPARE)) : refDir, 'states');
  const target = r.slug ? (await import('./routes.mjs')).routeUrl(r.path, base, !(cloneMode && !calibrating)) : base;
  // the clone is only replayed where the reference has states (a capture older than the held-out sizes has none there)
  const viewports = [];
  for (const v of viewportsAll) {
    if (cloneMode && !(await fs.stat(path.join(refDir, 'states', `${v.name}.json`)).then(() => true, () => false))) { console.log(`${r.path} ${v.name}: no reference states (run trueclone reads ${name})`); scrollUnits.push({ route: r.slug ? r.path : '', viewport: v.name, value: null, error: `the reference has no scroll states at ${v.name}: run trueclone reads` }); continue; }
    viewports.push(v);
  }
  // Viewports run side by side (one page each): most of a step is waiting for smooth scroll to glide. Not where the
  // reference draws canvases: five WebGL scenes sharing one GPU draw differently from one alone (RC4 varsity), so those
  // sizes are measured one after another.
  const refHasCanvas = cloneMode && (await Promise.all(viewports.map((v) => fs.readFile(path.join(refDir, 'states', `${v.name}.json`), 'utf8').then((t) => JSON.parse(t).steps.some((s) => s.canvases?.length), () => false)))).some(Boolean);
  const each = refHasCanvas ? async (list, fn) => { const out = []; for (const v of list) out.push(await fn(v)); return out; } : (list, fn) => Promise.all(list.map(fn));
  const result = (await each(viewports, async (vp) => {
   try {
    const dir = path.join(outRoot, vp.name);
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { recursive: true });
    const { context, page } = await newPage(browser, vp, { reducedMotion: 'no-preference' });
    await openUrl(page, target); // a load event that never comes is not a failed check (lib.mjs)
    await page.mouse.move(5, vp.height - 5);
    const intro = await waitStill(page, { timeout: 15000, interval: 200 }); // let intros/loaders finish first
    await unroll(page); // an app shell scrolls like a document (lib.mjs), the same on both sides
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
      const refH = (r.slug ? r.viewports : meta.viewports)?.find((v) => v.viewport === vp.name)?.pageHeight;
      if (refH && Math.abs(docH - refH) / refH > 0.2) console.warn(`WARNING ${r.path} ${vp.name}: clone page height ${docH}px vs reference ${refH}px after the warm-up scroll - a layout is running away; fix that before reading state scores.`);
      ys = JSON.parse(await fs.readFile(path.join(refDir, 'states', `${vp.name}.json`), 'utf8')).steps.map((s) => s.y);
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
      // every step at the same page age on both sides (timers fired in order up to it), the clock held for the shots
      await holdStill(page, STILL_AGE + i * STEP_AGE);
      await seekLoops(page); // loops that started on entering view too: every step compared at the same, non-zero time
      await page.screenshot({ path: path.join(dir, `${file}.png`) });
      await maskToggle(page, true);
      await page.screenshot({ path: path.join(dir, `${file}.mask.png`) });
      await maskToggle(page, false);
      if (!cloneMode) samples.push(await page.evaluate(statesInPage));
      await releaseStill(page);
      // the canvases in view (scenes a script draws): masked out of the structure score, so compared on their own
      const canvases = await page.evaluate(() => [...document.querySelectorAll('canvas')].map((c) => {
        const r = c.getBoundingClientRect(), s = getComputedStyle(c);
        if (r.width < 40 || r.height < 40 || r.bottom <= 0 || r.top >= innerHeight || s.visibility === 'hidden' || +s.opacity < 0.05) return null;
        return [Math.max(0, r.left), Math.max(0, r.top), Math.min(innerWidth, r.right), Math.min(innerHeight, r.bottom)].map(Math.round);
      }).filter((r) => r && r[2] - r[0] >= 40 && r[3] - r[1] >= 40));
      steps.push({ i, y: actual, target: y, settled: still.settled, settleMs: still.ms, canvases });
    }
    await context.close();

    if (cloneMode) {
      const sfx = structure ? '.mask' : '';
      const routeKey = r.slug ? r.path : '';
      const readPng = (p) => fs.readFile(p).then((b) => PNG.sync.read(b), () => null);
      // the same frame in each of the reference's own draws (calibrate.mjs), for a frame the reference varies on
      const drawsOf = async (f) => [PNG.sync.read(await fs.readFile(path.join(refDir, 'states', vp.name, f))), ...(await Promise.all(drawDirs.map((d) => readPng(path.join(d, r.slug ? path.join('routes', r.slug) : '', 'states', vp.name, f))))).filter(Boolean)];
      const scored = [];
      for (const s of steps) {
        const f = `${String(s.i).padStart(2, '0')}${sfx}.png`;
        const a = PNG.sync.read(await fs.readFile(path.join(refDir, 'states', vp.name, f)));
        const b = PNG.sync.read(await fs.readFile(path.join(dir, f)));
        const row = { ...s, match: matchPct(a, b).pct };
        // E (measure.mjs): only where the reference does not match itself; a stable frame is always scored against the
        // capture, so a clone cannot pick its best draw where the site is deterministic
        if (barFor(noise, 'scroll', routeKey, vp.name, String(s.i)).unstable) row.envelope = envelope(b, await drawsOf(f), (x, y) => matchPct(x, y).pct);
        scored.push(row);
      }
      const avg = +(scored.reduce((n, s) => n + s.match, 0) / scored.length).toFixed(2);
      // canvases: the reference's canvas regions at each step, compared by what is drawn (real pixels, not the mask), by
      // composition and colour layout (measure.mjs regionScore); the colour histogram is kept beside it as a diagnostic
      const refSteps = JSON.parse(await fs.readFile(path.join(refDir, 'states', `${vp.name}.json`), 'utf8')).steps;
      const canvasScores = [];
      for (const s of steps) {
        const regions = refSteps[s.i]?.canvases;
        if (!regions?.length) continue;
        const f = `${String(s.i).padStart(2, '0')}.png`;
        const a = PNG.sync.read(await fs.readFile(path.join(refDir, 'states', vp.name, f)));
        const b = PNG.sync.read(await fs.readFile(path.join(dir, f)));
        for (const [x0, y0, x1, y1] of regions) {
          const w = Math.min(x1, a.width, b.width) - x0, h = Math.min(y1, a.height, b.height) - y0;
          if (w < 40 || h < 40) continue;
          const box = [x0, y0, x0 + w, y0 + h];
          const ca = region(a, box), cb = region(b, box);
          const sc = regionScore(ca, cb, { template });
          const id = `${s.i}:${[x0, y0, x1, y1].join(',')}`;
          const row = { i: s.i, y: s.y, region: [x0, y0, x1, y1], id, similarity: sc.value, sComp: sc.sComp, aGrid: sc.aGrid, gate: sc.gate, hist: canvasSimilarity(ca, cb) };
          if (barFor(noise, 'canvas', routeKey, vp.name, id).unstable) {
            // the scene varies between reference loads: its nearest draw, and the share of strong colour in view (a
            // missing object, RC4 varsity's cords, leaves the share outside every draw's range)
            const draws = (await drawsOf(f)).map((d) => region(d, box));
            row.envelope = envelope(cb, draws, (x, y) => regionScore(x, y, { template }).value);
            const inRange = presenceInRange(presence(cb), draws.map(presence));
            if (row.envelope && !inRange.pass) row.envelope = { ...row.envelope, pass: false, reason: inRange.reason };
          }
          canvasScores.push(row);
        }
      }
      const hasCanvasData = refSteps.some((s) => Array.isArray(s.canvases));
      const canvas = canvasScores.length ? +(canvasScores.reduce((n, c) => n + c.similarity, 0) / canvasScores.length).toFixed(2) : null;
      const refCanvas = refSteps.some((s) => s.canvases?.length);
      // a unit judged by its envelope: every frame the reference varies on within its draws, the others at their bars
      const unitEnvelope = (rows) => { const e = rows.filter((x) => x.envelope); if (!e.length) return undefined; const pass = e.every((x) => x.envelope.pass); return { pass, value: +(e.reduce((n, x) => n + x.envelope.value, 0) / e.length).toFixed(2), reason: pass ? `${e.length} frame(s) the reference varies on, each within its own draws` : e.filter((x) => !x.envelope.pass).map((x) => `y ${x.y}: ${x.envelope.reason}`).join('; ') }; };
      scrollUnits.push({ route: routeKey, viewport: vp.name, value: avg, refCanvas, envelope: unitEnvelope(scored), members: scored.map((s) => ({ id: String(s.i), y: s.y, value: s.match, ...(s.envelope ? { envelope: s.envelope } : {}) })) });
      if (refCanvas) canvasUnits.push({ route: routeKey, viewport: vp.name, value: canvas, template, envelope: unitEnvelope(canvasScores), members: canvasScores.map((c) => ({ id: c.id, y: c.y, value: c.similarity, sComp: c.sComp, aGrid: c.aGrid, hist: c.hist, ...(c.envelope ? { envelope: c.envelope } : {}) })) });
      return { viewport: vp.name, match: avg, worst: [...scored].sort((a, b) => a.match - b.match).slice(0, 5), steps: scored, canvas, canvasWorst: [...canvasScores].sort((a, b) => a.similarity - b.similarity).slice(0, 5), ...(hasCanvasData ? {} : { canvasNote: 'reference states predate the canvas check: re-run trueclone states' }) };
    } else {
      const summary = summarize(steps, samples, vp, initial);
      await fs.writeFile(path.join(outRoot, `${vp.name}.json`), JSON.stringify({ viewport: vp, steps, samples }));
      await fs.writeFile(path.join(outRoot, `${vp.name}.summary.json`), JSON.stringify(summary, null, 2));
      return { viewport: vp.name, introMs: intro.ms, steps: steps.length, unsettled: steps.filter((s) => !s.settled).length, ...summary.counts };
    }
   } catch (e) {
    // one size that fails is recorded as failed (never as passing, never by aborting the other sizes)
    const why = String(e.message).split('\n')[0];
    console.warn(`WARNING ${r.path} ${vp.name}: ${why}`);
    if (cloneMode) scrollUnits.push({ route: r.slug ? r.path : '', viewport: vp.name, value: null, error: why });
    return null;
   }
  })).filter(Boolean);
  if (r.slug) await mergeAggregate(path.join(outRoot, cloneMode ? `report${structure ? '.mask' : ''}.json` : 'report.json'), { ...report, route: r.path, viewports: result, routes: undefined });
  return result;
}

try {
  for (const r of routes) {
    const result = await runRoute(r);
    if (!r.slug) report.viewports = result;
    else report.routes.push({ path: r.path, slug: r.slug, viewports: result.map(({ steps, ...v }) => ({ ...v, stepCount: steps?.length ?? 0 })) });
  }
} finally {
  if (!flags.cdp) await browser.close();
  server?.close();
}

// the captured page's report (with every other route's summary in it), where it has always been
const outRoot = path.join(cloneMode ? path.join(root, COMPARE) : ref, 'states');
await fs.mkdir(outRoot, { recursive: true });
// the units the evaluator judges (results.mjs); a narrowed run (--viewports, --route) leaves the others as they were
if (cloneMode && structure) { await writeUnits(root, COMPARE, 'scroll', scrollUnits, ident); await writeUnits(root, COMPARE, 'canvas', canvasUnits, { ...ident, codeHash: (await import('./identity.mjs')).codeHash('canvas') }); }
if (cloneMode) await mergeAggregate(path.join(outRoot, `report${structure ? '.mask' : ''}.json`), report);
else await fs.writeFile(path.join(outRoot, 'report.json'), JSON.stringify(report, null, 2));
for (const r of report.routes) console.log(`route ${r.path}: ${r.viewports.map((v) => `${v.viewport} ${v.match ?? `${v.stepCount ?? 0} steps`}`).join('  ')}`);
if (cloneMode) {
  console.log(`state match (${report.mode}) - average over scroll steps`);
  console.table(report.viewports.map((v) => ({ viewport: v.viewport, 'match %': v.match, 'canvas %': v.canvas ?? '-', worst: v.worst.map((s) => `#${s.i} y${s.y} ${s.match}%`).join('  ') })));
  for (const v of report.viewports) if (v.canvasNote) console.log(`${v.viewport}: ${v.canvasNote}`);
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
