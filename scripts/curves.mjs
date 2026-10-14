// Motion score: sample animated properties of matched elements on the reference and the clone, then
// compare the curves. Each entry in sites/<name>/motion-map.json pairs a reference selector with a clone
// selector and samples either across a scroll range or over time after a scroll (for onEnter reveals).
//
//   { "name": "hero far layer", "ref": ".hero_depthmap-wrapper", "clone": ".hero-layer@0",
//     "props": ["ty"], "scroll": { "from": 0, "to": 900, "steps": 10 } }
//   { "name": "quote reveal", "ref": ".is-quote .reveal-line", "clone": ".is-quote .split-line",
//     "props": ["ty"], "time": { "before": 0, "at": 700, "ms": 1400, "every": 100 } }
//
// selector@n picks the n-th match (default 0); path:<recorded path> picks an element the reveals recorder saw. Props: opacity, tx, ty, sx, sy, rot, top, left, width, height, saturate.
// Viewport-independent ranges: "scroll": { "of": { "ref": "...", "clone": "..." }, "start": "top bottom", "end": "bottom top", "steps": 10 }
// resolve each side's own scroll positions, so one map scores desktop, tablet and mobile (--viewport tablet).
// usage: node scripts/curves.mjs <name> [--viewport desktop] [--only "<name substring>"]
//        node scripts/curves.mjs <name> --draft      (writes motion-map.draft.json from reference/motion.<vp>.json)
import fs from 'node:fs/promises';
import path from 'node:path';
import { VIEWPORTS, parseArgs, openBrowser, newPage, serve, warmUp, waitStill, wheelTo, withTimeout, cached, readCache, COMPARE, siteDir } from './lib.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) {
  console.error('usage: npm run curves -- <name> [--viewport desktop] [--only text] | --draft');
  process.exit(1);
}
const root = siteDir(name);
const ref = path.join(root, 'reference');
const meta = JSON.parse(await fs.readFile(path.join(ref, 'meta.json'), 'utf8'));
const vp = VIEWPORTS.find((v) => v.name === (flags.viewport || 'desktop'));

// ---------- Draft a map from the motion inventory ----------
if (flags.draft) {
  const motion = JSON.parse(await fs.readFile(path.join(ref, `motion.${vp.name}.json`), 'utf8').catch(() => '{"triggers":[],"onScroll":[]}'));
  const propsFor = (vars) => {
    const out = new Set();
    for (const k of Object.keys(vars || {})) {
      if (['y', 'yPercent'].includes(k)) out.add('ty');
      if (['x', 'xPercent'].includes(k)) out.add('tx');
      if (['scale', 'scaleY'].includes(k)) out.add('sy');
      if (k === 'scaleX') out.add('sx');
      if (['rotation', 'rotate', 'rotationZ'].includes(k)) out.add('rot');
      if (['opacity', 'autoAlpha'].includes(k)) out.add('opacity');
      if (k === 'width') out.add('width');
      if (k === 'height') out.add('height');
      if (k === 'filter') out.add('saturate');
    }
    return [...out];
  };
  const tweensOf = (a) => (!a ? [] : a.type === 'timeline' ? a.children.flatMap(tweensOf) : [a]);
  const entries = [];
  const seen = new Set();
  for (const st of motion.triggers) {
    if (st.scrub === false || !st.animation) continue;
    for (const tw of tweensOf(st.animation)) {
      const sel = tw.targets[0]?.sel;
      const props = propsFor({ ...tw.vars, ...(tw.vars.startAt || {}) });
      if (!sel || !props.length || seen.has(sel + props)) continue;
      seen.add(sel + props);
      const pos = (v) => String(v).replace(/^clamp((.*))$/, '$1');
      entries.push({ name: `${st.trigger.section || ''} ${sel}`.trim(), ref: sel, clone: 'TODO', props, scroll: { of: { ref: st.trigger.sel, clone: 'TODO' }, start: pos(st.start), end: pos(st.end), steps: 10 } });
    }
  }
  for (const tw of motion.onScroll.slice(0, 40)) {
    const leaves = tweensOf(tw).filter((t) => t.targets.length && propsFor({ ...t.vars, ...(t.vars.startAt || {}) }).length);
    const leaf = leaves.find((t) => t.duration > 0) || leaves[0];
    if (!leaf) continue;
    const sel = leaf.targets[0].sel;
    if (seen.has('time' + sel)) continue;
    seen.add('time' + sel);
    const y = tw.firedAt[0];
    entries.push({ name: `reveal ${sel}`, ref: sel, clone: 'TODO', props: propsFor({ ...leaf.vars, ...(leaf.vars.startAt || {}) }), time: { before: Math.max(0, y - vp.height), at: y, ms: Math.ceil((tw.duration + 0.4) * 10) * 100, every: 100 } });
  }
  // Scroll-linked curves the recorder sampled (any library, or none the inventory can read): one entry per element,
  // over the scroll range it was seen moving at this size
  const recorded = JSON.parse(await fs.readFile(path.join(ref, `reveals.${vp.name}.json`), 'utf8').catch(() => '{}')).scrubs || [];
  let fromScrubs = 0;
  for (const s of recorded) {
    const samples = (s.samples || []).filter((x) => x && Number.isFinite(x.y));
    if (samples.length < 2 || seen.has(`path:${s.path}`)) continue;
    const moved = (k) => Math.max(...samples.map((x) => x[k] ?? 0)) - Math.min(...samples.map((x) => x[k] ?? 0));
    const props = [];
    if (moved('o') > 0.02) props.push('opacity');
    if (moved('tx') > 1) props.push('tx');
    if (moved('ty') > 1) props.push('ty');
    if (moved('s') > 0.01) props.push('sx', 'sy');
    if (!props.length) continue;
    seen.add(`path:${s.path}`);
    fromScrubs++;
    entries.push({ name: `scrub ${s.cls || s.path}`, ref: `path:${s.path}`, clone: 'TODO', props, viewports: [vp.name], scroll: { from: samples[0].y, to: samples.at(-1).y, steps: Math.min(12, Math.max(4, samples.length - 1)) } });
  }
  const out = path.join(root, 'motion-map.draft.json');
  await fs.writeFile(out, JSON.stringify(entries, null, 2));
  console.log(`${entries.length} entries (${fromScrubs} from recorded scroll curves) -> ${path.relative(process.cwd(), out)}. Fill in the clone selectors, then save as motion-map.json.`);
  process.exit(0);
}

// ---------- Sampling ----------
// No map = no scroll/time-driven motion to score (static sites): say so instead of failing the score run.
const mapText = await fs.readFile(path.join(root, 'motion-map.json'), 'utf8').catch(() => null);
if (mapText === null) {
  console.log(`motion score (${vp.name}): skipped, no motion-map.json (run --draft if the motion inventory lists scroll or time animations)`);
  process.exit(0);
}
let map = JSON.parse(mapText);
if (typeof flags.only === 'string') map = map.filter((e) => e.name.includes(flags.only));
map = map.filter((e) => e.clone && e.clone !== 'TODO' && (!e.viewports || e.viewports.includes(vp.name)));

// `path:section:3>div:2` is a recorded element path (from trueclone reveals: tag:position among the children that
// are not script/style/meta, 1-based, from <body>); anything else is a CSS selector with an optional @n.
// Installed on every page as window.__tcFind.
function installFind() {
  window.__tcFind = (selector) => {
    if (selector.startsWith('path:')) {
      const SKIP = new Set(['SCRIPT', 'NOSCRIPT', 'TEMPLATE', 'STYLE', 'LINK', 'META']);
      let n = document.body;
      for (const part of selector.slice(5).split('>')) {
        const [tag, i] = part.split(':');
        n = n && [...n.children].filter((c) => !SKIP.has(c.tagName))[Number(i) - 1];
        if (!n || n.tagName.toLowerCase() !== tag) return null;
      }
      return n;
    }
    const [sel, idx] = selector.split('@');
    return document.querySelectorAll(sel)[Number(idx || 0)] || null;
  };
}

function sampleInPage([selector, props]) {
  const el = window.__tcFind(selector);
  if (!el) return null;
  const s = getComputedStyle(el);
  const m = new DOMMatrixReadOnly(s.transform === 'none' ? undefined : s.transform);
  const r = el.getBoundingClientRect();
  const sat = /saturate\(([\d.]+)\)/.exec(s.filter);
  const all = {
    opacity: +s.opacity * (s.visibility === 'hidden' ? 0 : 1),
    tx: m.m41, ty: m.m42,
    sx: Math.hypot(m.m11, m.m12), sy: Math.hypot(m.m21, m.m22),
    rot: (Math.atan2(m.m12, m.m11) * 180) / Math.PI,
    top: r.top, left: r.left, width: r.width, height: r.height,
    saturate: sat ? +sat[1] : 1,
  };
  return Object.fromEntries(props.map((p) => [p, all[p]]));
}

// Settle on the sampled element only: poll its values until they stop changing (scrub lag, smooth scroll),
// typically 0.3-0.8s, instead of waiting for the whole page (which never stops on sites with loops).
async function settleSample(page, selector, props) {
  let last = null, same = 0, v = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 2500) {
    v = await withTimeout(page.evaluate(sampleInPage, [selector, props]), 15000, `sample ${selector}`);
    const key = JSON.stringify(v && Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Math.round(x * 10) / 10])));
    same = key === last ? same + 1 : 0;
    last = key;
    if (same >= 2) break;
    await page.waitForTimeout(70);
  }
  return v;
}

async function run(url, side, entries, onEntry) {
  if (!entries.length) return [];
  const browser = await openBrowser(flags.cdp);
  const results = [];
  const done = async (e, series) => {
    const result = { name: e.name, selector: side === 'ref' ? e.ref : e.clone, series };
    results.push(result);
    if (onEntry) await onEntry(result); // saved immediately: a killed run keeps what it measured
  };
  try {
    const { context, page } = await newPage(browser, vp, { reducedMotion: 'no-preference' });
    await page.addInitScript(installFind);
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await page.mouse.move(5, vp.height - 5);
    await waitStill(page, { timeout: 15000, interval: 200 });
    await warmUp(page);
    // Scroll entries: resolve every range first (at the top, before anything is pinned), then visit all sample
    // positions of all curves in one downward pass, so the page glides short distances and never rewinds.
    const resolve = (of, spec) => page.evaluate(([sel, s]) => {
      const el = window.__tcFind(sel);
      if (!el) return 0;
      const r = el.getBoundingClientRect();
      const top = r.top + scrollY;
      const at = (word, size, base) => (word === 'top' ? base : word === 'bottom' ? base + size : word === 'center' ? base + size / 2 : base + (parseFloat(word) / 100) * size);
      const [elWord, vpWord] = s.split(' ');
      return Math.max(0, Math.round(at(elWord, r.height, top) - at(vpWord, innerHeight, 0)));
    }, [of, spec]);
    await wheelTo(page, 0, vp);
    const plan = [];
    const series = new Map();
    const scrollEntries = entries.filter((e) => e.scroll);
    for (const e of scrollEntries) {
      const { steps = 10 } = e.scroll;
      // Ranges can be absolute ({from, to}) or relative to an element, ScrollTrigger-style:
      // { of: {ref, clone}, start: "top bottom", end: "bottom top" } -> resolved per side and per viewport.
      let { from, to } = e.scroll;
      if (e.scroll.of) {
        from = await resolve(e.scroll.of[side], e.scroll.start || 'top bottom');
        to = await resolve(e.scroll.of[side], e.scroll.end || 'bottom top');
      }
      series.set(e, new Array(steps + 1));
      for (let i = 0; i <= steps; i++) plan.push({ e, i, y: Math.round(from + ((to - from) * i) / steps) });
    }
    plan.sort((p, q) => p.y - q.y);
    const left = new Map(scrollEntries.map((e) => [e, (e.scroll.steps ?? 10) + 1]));
    let at = null;
    for (const p of plan) {
      if (at === null || Math.abs(p.y - at) >= 2) at = await wheelTo(page, p.y, vp);
      series.get(p.e)[p.i] = { x: p.y, v: await settleSample(page, side === 'ref' ? p.e.ref : p.e.clone, p.e.props) };
      left.set(p.e, left.get(p.e) - 1);
      if (!left.get(p.e)) await done(p.e, series.get(p.e));
    }
    for (const e of entries.filter((x) => x.time)) {
      const selector = side === 'ref' ? e.ref : e.clone;
      const samples = [];
      await wheelTo(page, e.time.before, vp);
      await waitStill(page, { timeout: 4000 });
      await page.evaluate((y) => window.scrollTo(0, y), e.time.at); // jump: the reveal starts now
      const t0 = Date.now();
      for (let t = 0; t <= e.time.ms; t += e.time.every) {
        const wait = t - (Date.now() - t0);
        if (wait > 0) await page.waitForTimeout(wait);
        samples.push({ x: t, v: await withTimeout(page.evaluate(sampleInPage, [selector, e.props]), 15000, `sample ${e.name}`) });
      }
      await done(e, samples);
    }
    await context.close();
  } finally {
    if (!flags.cdp) await browser.close();
  }
  return results;
}

// --url scores another build of the clone (e.g. the Next.js app) instead of serving clone/
const server = typeof flags.url === 'string' ? null : await serve(path.join(root, 'clone'));
const cloneUrl = server ? server.url : flags.url;
// Reference curves are cached per entry (keyed by the entry's reference side, viewport and capture time):
// only new or edited entries touch the live site. --refresh-ref measures everything again. Bump v when the
// sampling method changes, so reference and clone are always measured the same way.
const refKey = (e) => ({ tool: 'curves', v: 2, vp: vp.name, ref: e.ref, props: e.props, scroll: e.scroll && { ...e.scroll, of: e.scroll.of?.ref }, time: e.time });
const refCache = new Map();
const missing = [];
for (const e of map) {
  const hit = flags['refresh-ref'] ? null : await readCache(root, refKey(e));
  if (hit) refCache.set(e.name, hit); else missing.push(e);
}
console.log(missing.length ? `measuring ${missing.length} reference curve(s) (${map.length - missing.length} cached)` : `reference: all ${map.length} curves cached`);
// the reference (if anything is missing) and the clone are measured at the same time, in separate browsers
const [, cloneResults] = await Promise.all([
  run(meta.url, 'ref', missing, async (r) => {
    const e = missing.find((m) => m.name === r.name);
    await cached(root, refKey(e), async () => r, true);
    refCache.set(r.name, r);
  }),
  run(cloneUrl, 'clone', map),
]);
const cloneByName = new Map(cloneResults.map((r) => [r.name, r]));
server?.close();
const refRuns = map.map((e) => refCache.get(e.name));
const cloneRuns = map.map((e) => cloneByName.get(e.name));

// ---------- Compare ----------
// Error per property = mean |ref - clone| over the samples, normalised by the reference's range of motion
// (or by a floor: 1 for opacity/scale/saturate, 10deg, 40px). Score = 100 * (1 - error), floored at 0.
const FLOOR = { opacity: 1, sx: 1, sy: 1, saturate: 1, rot: 10 };
const report = { name, viewport: vp.name, at: new Date().toISOString(), entries: [] };
for (const [i, e] of map.entries()) {
  const a = refRuns[i].series, b = cloneRuns[i].series;
  const missing = a.every((s) => !s.v) ? 'ref' : b.every((s) => !s.v) ? 'clone' : null;
  if (missing) { report.entries.push({ name: e.name, score: 0, note: `selector matched nothing on ${missing}` }); continue; }
  const props = e.props.map((p) => {
    const ra = a.map((s) => s.v?.[p] ?? 0), rb = b.map((s) => s.v?.[p] ?? 0);
    const range = Math.max(...ra) - Math.min(...ra);
    const norm = Math.max(range, FLOOR[p] ?? 40);
    const err = ra.reduce((n, v, k) => n + Math.abs(v - rb[k]), 0) / ra.length / norm;
    return { prop: p, score: +Math.max(0, 100 * (1 - err)).toFixed(1), ref: ra.map((v) => +v.toFixed(2)), clone: rb.map((v) => +v.toFixed(2)) };
  });
  report.entries.push({ name: e.name, mode: e.scroll ? 'scroll' : 'time', score: +(props.reduce((n, p) => n + p.score, 0) / props.length).toFixed(1), props, x: a.map((s) => s.x) });
}
report.score = +(report.entries.reduce((n, e) => n + e.score, 0) / Math.max(1, report.entries.length)).toFixed(1);
const out = path.join(root, COMPARE, `curves.${vp.name}.json`);
await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, JSON.stringify(report, null, 2));

const spark = (vals) => { const lo = Math.min(...vals), hi = Math.max(...vals); const bars = '▁▂▃▄▅▆▇█'; return vals.map((v) => bars[hi === lo ? 0 : Math.round(((v - lo) / (hi - lo)) * 7)]).join(''); };
console.log(`motion score (${vp.name}): ${report.score}%  over ${report.entries.length} curves`);
for (const e of [...report.entries].sort((x, y) => x.score - y.score)) {
  console.log(`${String(e.score).padStart(5)}%  ${e.name}${e.note ? `  (${e.note})` : ''}`);
  for (const p of e.props || []) if (p.score < 90) console.log(`        ${p.prop.padEnd(8)} ref ${spark(p.ref)}  clone ${spark(p.clone)}  (${p.ref[0]}..${p.ref[p.ref.length - 1]} vs ${p.clone[0]}..${p.clone[p.clone.length - 1]})`);
}
console.log(`-> ${path.relative(process.cwd(), out)}`);
