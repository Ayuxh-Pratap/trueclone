// Behaviour: what changes on the page by itself, measured on the live page on both sides (decision D1: a faithful clone
// follows the same observable rules of change). Stills cannot see these: every still holds loops at one time and is
// taken under the same seed, so a clone with a stopped marquee, a carousel that never advances or a gallery in a fixed
// order can match every frame. This check watches the pages instead:
//   move    an element that moves continuously while nothing is touched (a marquee, a ticker, a drifting background):
//           its axis, direction and speed (px/s). Same axis and direction, speed within ±15%
//   cycle   an element that changes in steps on its own (an autoplay carousel or banner: a slide, a fade): how often
//           (the median time between steps) and which way. Interval within ±10%, same direction
//   random  whether the page's order depends on Math.random at startup (a shuffled gallery): three loads, two seeds.
//           The reference and the clone must agree (a clone with a fixed order fails where the reference shuffles)
//   extra   something that moves or cycles on the clone where nothing does on the reference
// The move and cycle watch is run a second time with prefers-reduced-motion: reduce (members "reduce:…", decision D2):
// a clone that keeps a marquee running where the site stops it for that visitor fails there.
// Matched by place: the element's box on the page, not its name (a clone's markup may differ). Each member passes or
// fails with its reason; the unit's value is the share that pass. Nothing that changes on either side: "na".
// The reference is read once per capture (reference/cache). Not covered: loops that only run while hovered or in a
// pointer position, cycles slower than one step every ~6 s (fewer than two steps in the 12.5 s watch), canvas scenes
// (the journey and canvas checks), the clock's own effect on a page that measures elapsed time between loads.
//
// usage: node scripts/behaviour.mjs <name> [--url <clone url>] [--viewport desktop|mobile] [--route /path] [--refresh-ref]
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCORED, parseArgs, openBrowser, newPage, serve, cached, COMPARE, SIDE, siteDir, openUrl, unroll, withMachineLock } from './lib.mjs';
import { startIdentity } from './identity.mjs';
import { writeUnits, mergeAggregate, readCheck, isCurrent, unitKey } from './results.mjs';

export const BEHAVIOUR_VPS = ['desktop', 'mobile'];
export const TOL = { speed: 0.15, interval: 0.1 };
const LONG_MS = 12500, SHORT_MS = 1600, EVERY_MS = 100, MAX_SCREENS = 12;

// Every element with a box, sampled for `duration` ms: its box and opacity. Returns only the ones that changed, with
// their page box at the start and a DOM key (for the report, never for matching).
export async function watchInPage([duration, interval, max]) {
  const skip = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE', 'BR', 'HEAD', 'SOURCE', 'TRACK']);
  const els = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (skip.has(el.tagName) || (el.closest('svg') && el.tagName.toLowerCase() !== 'svg')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 16 || r.height < 8) continue;
    els.push(el);
    if (els.length >= max) break;
  }
  const keyOf = (el) => { const p = []; for (let e = el; e && e !== document.body && e.parentElement; e = e.parentElement) p.unshift(`${e.tagName.toLowerCase()}${[...e.parentElement.children].indexOf(e)}`); return p.join('>'); };
  const series = els.map(() => []);
  const t0 = performance.now();
  for (;;) {
    const t = performance.now() - t0;
    for (let k = 0; k < els.length; k++) { const r = els[k].getBoundingClientRect(); series[k].push([Math.round(t), Math.round(r.left * 10) / 10, Math.round(r.top * 10) / 10, Math.round(+getComputedStyle(els[k]).opacity * 100) / 100]); }
    if (t >= duration) break;
    await new Promise((res) => setTimeout(res, interval));
  }
  const out = [];
  for (let k = 0; k < els.length; k++) {
    const s = series[k];
    if (!s.some((p) => Math.abs(p[1] - s[0][1]) > 0.5 || Math.abs(p[2] - s[0][2]) > 0.5 || Math.abs(p[3] - s[0][3]) > 0.02)) continue;
    const r = els[k].getBoundingClientRect();
    out.push({ key: keyOf(els[k]), tag: els[k].tagName.toLowerCase(), cls: String(els[k].getAttribute('class') || '').split(/\s+/).slice(0, 2).join('.'), box: [Math.round(s[0][1] + scrollX), Math.round(s[0][2] + scrollY), Math.round(r.width), Math.round(r.height)], s });
  }
  return out;
}

// From samples to what the element does: a continuous mover, a stepping cycle, or neither
export function classify(item) {
  const s = item.s;
  const d = [];
  for (let i = 1; i < s.length; i++) { const dt = Math.max(1, s[i][0] - s[i - 1][0]); d.push({ t: s[i - 1][0], dt, dx: s[i][1] - s[i - 1][1], dy: s[i][2] - s[i - 1][2], dO: s[i][3] - s[i - 1][3] }); }
  if (!d.length) return null;
  const moving = (x) => Math.abs(x.dx) + Math.abs(x.dy) > 0.3 || Math.abs(x.dO) > 0.02;
  const share = d.filter(moving).length / d.length;
  const sx = d.reduce((n, x) => n + Math.abs(x.dx), 0), sy = d.reduce((n, x) => n + Math.abs(x.dy), 0);
  const axis = sx >= sy ? 'x' : 'y';
  const med = (a) => { const b = [...a].sort((p, q) => p - q); return b.length ? b[Math.floor(b.length / 2)] : 0; };
  if (share >= 0.8 && sx + sy > 0) {
    // speed: the median per-step velocity (one wrap of a loop is one outlier, not a change of speed)
    const v = med(d.filter(moving).map((x) => ((axis === 'x' ? x.dx : x.dy) / x.dt) * 1000));
    if (Math.abs(v) >= 4) return { kind: 'move', axis, v: +v.toFixed(1), box: item.box, key: item.key };
    return null;
  }
  // steps: runs of change separated by at least 600 ms of stillness
  const episodes = [];
  let cur = null, lastMove = -Infinity;
  for (const x of d) {
    if (!moving(x)) continue;
    if (!cur || x.t - lastMove > 600) { cur = { t: x.t, dx: 0, dy: 0, dO: 0 }; episodes.push(cur); }
    cur.dx += x.dx; cur.dy += x.dy; cur.dO += x.dO; lastMove = x.t;
  }
  if (episodes.length < 2 || share > 0.5) return null;
  const gaps = episodes.slice(1).map((e, i) => e.t - episodes[i].t);
  const disp = (e) => (axis === 'x' ? e.dx : e.dy);
  const moves = episodes.filter((e) => Math.abs(e.dx) + Math.abs(e.dy) > 2);
  const sign = moves.length ? Math.sign(moves.reduce((n, e) => n + Math.sign(disp(e)), 0)) : 0;
  return { kind: 'cycle', how: moves.length ? 'slide' : 'fade', axis, sign, interval: med(gaps), steps: episodes.length, starts: episodes.map((e) => e.t), box: item.box, key: item.key };
}

// outermost only: a track and its children move together, a fade carousel's slides cycle as one
export function prune(list) {
  const out = [];
  for (const it of [...list].sort((a, b) => a.key.length - b.key.length)) {
    const parent = out.find((o) => o.kind === it.kind && it.key.startsWith(`${o.key}>`));
    if (parent && (it.kind === 'cycle' || Math.abs(it.v - parent.v) <= Math.abs(parent.v) * 0.1)) continue;
    const twin = it.kind === 'cycle' && out.find((o) => o.kind === 'cycle' && overlap(o.box, it.box));
    if (twin) { twin.starts = [...new Set([...twin.starts, ...it.starts])].sort((a, b) => a - b).filter((t, i, a) => !i || t - a[i - 1] > 300); const g = twin.starts.slice(1).map((t, i) => t - twin.starts[i]).sort((a, b) => a - b); if (g.length) twin.interval = g[Math.floor(g.length / 2)]; continue; }
    out.push(it);
  }
  return out;
}
// the same place on the page: mostly the same rows, and at least partly the same columns (a moving track is caught at
// another phase on each side)
export function overlap(a, b) {
  const v = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
  const h = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
  return v / Math.max(1, Math.min(a[3], b[3])) >= 0.5 && h / Math.max(1, Math.min(a[2], b[2])) >= 0.3;
}

// a load's order: the text and fill of every element with a box, in document order (a shuffle reorders it; a carousel
// moving its slides does not)
function orderInPage() {
  const out = [];
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width < 16 || r.height < 8) continue;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').slice(0, 24);
    const bg = getComputedStyle(el).backgroundColor;
    if (own || (bg && bg !== 'rgba(0, 0, 0, 0)')) out.push(`${own}|${bg}`);
  }
  return out.join('\n');
}

// `reduce`: the same watch with prefers-reduced-motion: reduce (decision D2): what the site still moves for a visitor
// who asked for less motion, and what it stops. No order test there (the setting does not change a shuffle).
export async function readSide(browser, url, vp, { reduce = false } = {}) {
  const found = [];
  // the whole page watched from the top for 12.5 s (a carousel or loop that runs wherever it is)
  {
    const { context, page } = await newPage(browser, vp, reduce ? { reducedMotion: 'reduce' } : {});
    try {
      await openUrl(page, url);
      await unroll(page);
      await page.waitForTimeout(1000);
      for (const it of await page.evaluate(watchInPage, [LONG_MS, EVERY_MS, 4000])) { const c = classify(it); if (c) found.push(c); }
      // each screen in turn for 1.6 s (a loop that only runs in view)
      const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
      for (let k = 1, y = vp.height; y <= max && k < MAX_SCREENS; k++, y += vp.height) {
        await page.evaluate((yy) => window.scrollTo(0, yy), y);
        await page.waitForTimeout(300);
        for (const it of await page.evaluate(watchInPage, [SHORT_MS, EVERY_MS, 4000])) { const c = classify(it); if (c?.kind === 'move' && !found.some((f) => f.kind === 'move' && overlap(f.box, c.box))) found.push(c); }
      }
    } finally { await context.close(); }
  }
  if (reduce) return { items: prune(found), random: null };
  // the order under two seeds, and the first seed again (an order that differs under the same seed depends on time,
  // not on Math.random, and is not judged here)
  const orders = [];
  for (const seed of [1, 2, 1]) {
    const { context, page } = await newPage(browser, vp, { seed });
    try { await openUrl(page, url); orders.push(await page.evaluate(orderInPage)); } finally { await context.close(); }
  }
  const random = orders[0] === orders[2] ? orders[0] !== orders[1] : null;
  return { items: prune(found), random };
}

// reference against clone: one member per thing the reference does, plus one per thing only the clone does
export function compare(ref, clone) {
  const members = [];
  const used = new Set();
  const dir = (it) => (it.axis === 'x' ? (it.v ?? it.sign) < 0 ? 'leftwards' : 'rightwards' : (it.v ?? it.sign) < 0 ? 'upwards' : 'downwards');
  // the same thing on the clone: same kind, in place, or else the nearest of similar size within 600 px above or below
  // (a layout difference higher up moves everything under it; the layout check reports that, not this one)
  const similar = (a, b) => { const h = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]); return h / Math.max(1, Math.min(a[2], b[2])) >= 0.3 && a[3] / Math.max(1, b[3]) < 2 && b[3] / Math.max(1, a[3]) < 2; };
  const matchOf = (r) => {
    const free = clone.items.map((x, i) => [x, i]).filter(([x, i]) => !used.has(i) && x.kind === r.kind);
    const here = free.find(([x]) => overlap(r.box, x.box));
    if (here) return here[0];
    const near = free.filter(([x]) => similar(r.box, x.box) && Math.abs(x.box[1] - r.box[1]) <= 600).sort((p, q) => Math.abs(p[0].box[1] - r.box[1]) - Math.abs(q[0].box[1] - r.box[1]));
    return near[0]?.[0] || null;
  };
  for (const r of ref.items) {
    const c = matchOf(r);
    const id = `${r.kind}@${r.box[1]}`;
    if (!c) { members.push({ id, y: r.box[1], value: 0, reason: r.kind === 'move' ? `does not move: the reference moves ${dir(r)} at ${Math.abs(r.v)} px/s` : `does not change on its own: the reference ${r.how === 'fade' ? 'fades' : 'slides'} every ${(r.interval / 1000).toFixed(1)} s` }); continue; }
    used.add(clone.items.indexOf(c));
    let reason = null;
    if (r.kind === 'move') {
      const ratio = Math.abs(c.v) / Math.abs(r.v);
      if (c.axis !== r.axis) reason = `moves ${dir(c)} where the reference moves ${dir(r)}`;
      else if (Math.sign(c.v) !== Math.sign(r.v)) reason = `moves ${dir(c)}: the reference moves ${dir(r)}`;
      else if (Math.abs(ratio - 1) > TOL.speed) reason = `moves at ${ratio.toFixed(2)}x the reference's speed (${Math.abs(c.v)} vs ${Math.abs(r.v)} px/s)`;
    } else {
      const ratio = c.interval / r.interval;
      if (Math.abs(ratio - 1) > TOL.interval) reason = `changes every ${(c.interval / 1000).toFixed(1)} s: the reference every ${(r.interval / 1000).toFixed(1)} s`;
      else if (r.how === 'slide' && c.how === 'slide' && r.sign && c.sign && r.sign !== c.sign) reason = `slides ${dir(c)}: the reference slides ${dir(r)}`;
      else if (r.how !== c.how) reason = `${c.how}s where the reference ${r.how}s`;
    }
    members.push({ id, y: r.box[1], value: reason ? 0 : 100, ...(reason ? { reason } : {}), ref: r.kind === 'move' ? r.v : r.interval, clone: c.kind === 'move' ? c.v : c.interval });
  }
  clone.items.forEach((c, i) => { if (!used.has(i)) members.push({ id: `extra@${c.box[1]}`, y: c.box[1], value: 0, reason: `${c.kind === 'move' ? `moves ${dir(c)} at ${Math.abs(c.v)} px/s` : `changes every ${(c.interval / 1000).toFixed(1)} s`} where the reference does not` }); });
  if (ref.random !== null && clone.random !== null && (ref.random || clone.random)) {
    const ok = ref.random === clone.random;
    members.push({ id: 'random', value: ok ? 100 : 0, ...(ok ? {} : { reason: ref.random ? 'the reference shows a different order on each load (its own Math.random at startup); the clone shows the same order every time' : 'the clone shows a different order on each load; the reference does not' }) });
  }
  return members;
}
// the same comparison under prefers-reduced-motion: reduce, its members named as such (a clone that ignores the setting
// keeps moving where the reference stops: an "extra" member here)
export const compareReduced = (ref, clone) => compare(ref, clone).map((m) => ({ ...m, id: `reduce:${m.id}`, ...(m.reason ? { reason: `with prefers-reduced-motion: reduce, ${m.reason}` } : {}) }));

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { pos, flags } = parseArgs(process.argv.slice(2));
  const [name] = pos;
  if (!name) { console.error('usage: trueclone behaviour <name> [--url <clone url>] [--viewport desktop|mobile] [--route /path] [--refresh-ref]'); process.exit(1); }
  const root = siteDir(name);
  const meta = JSON.parse(await fs.readFile(path.join(root, 'reference', 'meta.json'), 'utf8'));
  const server = typeof flags.url === 'string' ? null : await serve(path.join(root, 'clone'));
  const cloneUrl = server ? server.url : flags.url;
  const ident = await startIdentity(root, 'behaviour', SIDE);
  const routes = (meta.routes?.length ? meta.routes : [{ path: '/', slug: '' }]).filter((r) => typeof flags.route !== 'string' || r.path === flags.route);
  const vps = SCORED.filter((v) => BEHAVIOUR_VPS.includes(v.name) && (typeof flags.viewport !== 'string' || v.name === flags.viewport));
  const browser = await openBrowser(flags.cdp);
  const units = [], report = { name, at: ident.startedAt, routes: [] };
  // Each unit is written as soon as it is measured, and a unit already measured on this content, against this
  // reference, with this code is not measured again (--fresh does): a run killed on its time limit keeps what it
  // finished, and the rerun does only what is left (RC6 heybhaskar: 14 finished units lost to a kill at 20 minutes)
  const before = flags.fresh || flags['refresh-ref'] ? { units: {} } : await readCheck(root, COMPARE, 'behaviour');
  let kept = 0;
  try {
    for (const r of routes) {
      const refUrl = new URL(r.slug ? r.path : '', meta.finalUrl || meta.url).href;
      const cUrl = r.slug ? (await import('./routes.mjs')).routeUrl(r.path, cloneUrl) : cloneUrl;
      const rows = [];
      for (const vp of vps) {
        const route = r.slug ? r.path : '';
        if (isCurrent(before.units[unitKey(route, vp.name, '')], ident)) { kept++; console.log(`${r.path} ${vp.name}: behaviour already measured on this clone (kept; --fresh measures it again)`); continue; }
        try {
          // speeds and intervals are timed: one such reading at a time on this machine (lib.mjs withMachineLock)
          const { ref, clone, refReduce, cloneReduce } = await withMachineLock(`behaviour ${name}`, async () => ({
            ref: await cached(root, { tool: 'behaviour', route, vp: vp.name, v: 1 }, () => readSide(browser, refUrl, vp), Boolean(flags['refresh-ref'])),
            clone: await readSide(browser, cUrl, vp),
            refReduce: await cached(root, { tool: 'behaviour', route, vp: vp.name, reduce: true, v: 1 }, () => readSide(browser, refUrl, vp, { reduce: true }), Boolean(flags['refresh-ref'])),
            cloneReduce: await readSide(browser, cUrl, vp, { reduce: true }),
          }));
          const members = [...compare(ref, clone), ...compareReduced(refReduce, cloneReduce)];
          const value = members.length ? +((100 * members.filter((m) => m.value === 100).length) / members.length).toFixed(2) : null;
          const unit = members.length ? { route, viewport: vp.name, value, members } : { route, viewport: vp.name, value: null, na: 'nothing on the reference or the clone changes by itself' };
          units.push(unit);
          await writeUnits(root, COMPARE, 'behaviour', [unit], ident);
          rows.push({ viewport: vp.name, value, ref, clone, members });
          console.log(`${r.path} ${vp.name}: behaviour ${value ?? 'n/a'}${members.filter((m) => m.reason).map((m) => `\n  - ${m.id}: ${m.reason}`).join('')}`);
        } catch (e) {
          const why = String(e.message).split('\n')[0];
          console.warn(`WARNING ${r.path} ${vp.name}: ${why}`);
          const unit = { route, viewport: vp.name, value: null, error: why };
          units.push(unit);
          await writeUnits(root, COMPARE, 'behaviour', [unit], ident);
        }
      }
      report.routes.push({ path: r.path, viewports: rows });
      await mergeAggregate(path.join(root, COMPARE, 'behaviour.json'), { ...report, routes: [report.routes.at(-1)] });
    }
  } finally {
    if (!flags.cdp) await browser.close();
    server?.close();
  }
  if (kept) console.log(`behaviour: ${kept} unit(s) kept from an earlier run on this clone; ${units.length} measured now`);
  if (units.some((u) => u.error)) process.exitCode = 1;
}
