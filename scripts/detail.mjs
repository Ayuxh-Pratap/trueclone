// Detail diff: style-level comparison of the same elements. Each reference probe records its element's place in the
// document; the clone is read at that place (the seed keeps the structure), or, where its script rebuilt that part,
// by page position. Originally by page position only: once the layout matches (diff ≥ 97%),
// the element at a given page coordinate on the reference corresponds to the element at the same coordinate on
// the clone. For every reference text element and every styled box (background, border, radius) this probes the
// clone at the same point and compares computed styles: font family, size, weight, line height, letter spacing,
// transform, colour, background, radius, padding. Only style values are compared, never content.
//
// usage: node scripts/detail.mjs <name> [--viewport desktop|tablet|mobile|all] [--url <clone url>] [--max 400]
import fs from 'node:fs/promises';
import path from 'node:path';
import { VIEWPORTS, parseArgs, openBrowser, newPage, settle, serve, cached, waitStill, COMPARE, SIDE, siteDir, openUrl } from './lib.mjs';
import { startIdentity } from './identity.mjs';
import { writeUnits, mergeAggregate } from './results.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) {
  console.error('usage: npm run detail -- <name> [--viewport desktop|all] [--url <clone url>]');
  process.exit(1);
}
const root = siteDir(name);
const meta = JSON.parse(await fs.readFile(path.join(root, 'reference', 'meta.json'), 'utf8'));
const wanted = !flags.viewport || flags.viewport === 'all' ? VIEWPORTS.map((v) => v.name) : String(flags.viewport).split(',');
const MAX = Number(flags.max || 400);
const server = typeof flags.url === 'string' ? null : await serve(path.join(root, 'clone'));
const cloneUrl = server ? server.url : flags.url;

// Styles that define "detail". Colours are compared as rgba with alpha.
function styleOf(el) {
  const s = getComputedStyle(el);
  return {
    family: s.fontFamily.split(',')[0].replace(/["']/g, '').trim().toLowerCase(),
    size: parseFloat(s.fontSize), weight: Number(s.fontWeight), lh: s.lineHeight === 'normal' ? parseFloat(s.fontSize) * 1.2 : parseFloat(s.lineHeight),
    ls: s.letterSpacing === 'normal' ? 0 : parseFloat(s.letterSpacing), tt: s.textTransform,
    color: s.color, bg: s.backgroundColor, radius: parseFloat(s.borderTopLeftRadius) || 0,
    pad: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].map(parseFloat),
    opacity: Number(s.opacity),
  };
}

// Reference probes: text elements and styled boxes in the current viewport, as page coordinates plus the scroll
// position they were seen at. The clone is probed at that same scroll position, so sticky and pinned content
// (which moves with the scroll) is compared where it actually sits on screen.
function collectProbes(max) {
  const own = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const out = [];
  const scroll = Math.round(scrollY);
  for (const el of document.body.querySelectorAll('*')) {
    if (el.__labProbed) continue;
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'PATH', 'IMG', 'VIDEO', 'CANVAS', 'HTML', 'BODY', 'MAIN', 'SECTION', 'FOOTER', 'HEADER'].includes(el.tagName.toUpperCase())) continue;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) continue;
    // content of a closed <details> (and other content-visibility: hidden subtrees) still reports a box but is
    // never painted: checkVisibility() is the browser's own answer
    if (el.checkVisibility && !el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true, opacityProperty: true })) continue;
    const r = el.getBoundingClientRect();
    const midY = r.top + r.height / 2;
    if (r.width < 6 || r.height < 6 || midY < 0 || midY >= innerHeight) continue;
    // Only what a visitor can actually see: not clipped away by an overflow ancestor, not inside a fixed
    // overlay (menus, cursors), not under a hidden or fully transparent ancestor.
    let hidden = false;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ps = getComputedStyle(p);
      if (ps.position === 'fixed' || ps.visibility === 'hidden' || +ps.opacity === 0) { hidden = true; break; }
      if (ps.overflow !== 'visible' || ps.overflowX !== 'visible' || ps.overflowY !== 'visible') {
        const pr = p.getBoundingClientRect();
        if (cx < pr.left || cx > pr.right || cy < pr.top || cy > pr.bottom) { hidden = true; break; }
      }
    }
    if (hidden) continue;
    // Split text (one span per character or word, for hover/reveal animations): probe the container once,
    // not every letter; otherwise one button label becomes 20 probes aimed at characters.
    const sib = el.parentElement ? [...el.parentElement.children].filter((c) => c.tagName === el.tagName) : [];
    if (own(el) && el.textContent.trim().length <= 2 && sib.length >= 3) {
      const parent = el.parentElement;
      if (!parent.__labSplit) {
        parent.__labSplit = true;
        const pr = parent.getBoundingClientRect();
        out.push({ kind: 'text', x: Math.round(pr.left + pr.width / 2), xs: [pr.left + pr.width / 2, pr.left + Math.min(8, pr.width / 2), pr.right - Math.min(8, pr.width / 2)].map(Math.round), y: Math.round(pr.top + scrollY + Math.min(pr.height / 2, 12)), w: Math.round(pr.width), h: Math.round(pr.height), sel: `${parent.tagName.toLowerCase()}.${String(parent.getAttribute('class') || '').split(/\s+/).slice(0, 2).join('.')} (split)`, scroll, style: window.__styleOf(el) });
      }
      continue;
    }
    const text = own(el);
    const alpha = (c) => { const m = c.match(/[\d.]+/g) || []; return m.length > 3 ? +m[3] : m.length ? 1 : 0; };
    // a box only counts if it is visible: a background with some alpha, or a border
    const box = !text && (alpha(s.backgroundColor) > 0.02 || parseFloat(s.borderTopWidth) > 0) && r.width < innerWidth * 0.95;
    if (!text && !box) continue;
    // The reference's style is read from the element itself; the clone is probed at three points for text
    // (left, centre, right: covers left/right/centre-aligned text of different lengths), the centre for boxes.
    const xs = text ? [r.left + r.width / 2, r.left + Math.min(8, r.width / 2), r.right - Math.min(8, r.width / 2)] : [r.left + r.width / 2];
    out.push({ kind: text ? 'text' : 'box', x: Math.round(r.left + r.width / 2), xs: xs.map(Math.round), y: Math.round(r.top + scrollY + Math.min(r.height / 2, 12)), w: Math.round(r.width), h: Math.round(r.height), sel: `${el.tagName.toLowerCase()}.${String(el.getAttribute('class') || '').split(/\s+/).slice(0, 2).join('.')}`, scroll, style: window.__styleOf(el) });
    el.__labProbed = true;
    if (out.length >= max) break;
  }
  return out;
}

// At a page point, the element of the requested kind (deepest first).
function probeAt([xs, py, kind, W, H]) {
  const vy = py - scrollY;
  if (vy < 0 || vy >= innerHeight) return { offscreen: true };
  const own = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const styled = (e) => { const s = getComputedStyle(e); return s.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(s.borderTopLeftRadius) > 0 || parseFloat(s.borderTopWidth) > 0; };
  const gap = (e) => { const r = e.getBoundingClientRect(); return Math.abs(r.width - W) + Math.abs(r.height - H); };
  let el = null, stack = [];
  // text boxes are cap-trimmed (often ~10px tall), so allow a few px of vertical drift
  const dys = kind === 'text' ? [0, -3, 3, -6, 6] : [0];
  outer: for (const dy of dys) {
    for (const px of xs) {
      if (vy + dy < 0 || vy + dy >= innerHeight) continue;
      stack = document.elementsFromPoint(px, vy + dy);
      // boxes: of the styled elements under the point, the one closest in size to the reference element
      el = kind === 'text' ? stack.find(own) : stack.filter((e) => !['HTML', 'BODY'].includes(e.tagName) && styled(e)).sort((a, b) => gap(a) - gap(b))[0];
      if (!el && kind === 'text') {
        // split text (a span per character, e.g. a typing prompt): the point can fall between characters, so take
        // the split container under it and read the style of its first character
        const split = stack.find((e) => e.children.length >= 3 && [...e.children].filter(own).length >= 3 && [...e.children].every((c) => c.textContent.trim().length <= 2));
        if (split) el = [...split.children].find(own);
      }
      if (el) break outer;
    }
  }
  if (!el) return { none: true, top: stack[0] ? `${stack[0].tagName.toLowerCase()}.${String(stack[0].getAttribute('class') || '').split(' ')[0]}` : null };
  const r = el.getBoundingClientRect();
  // the element's place in the document (as the seed keeps it), so the clone can be read at the same element
  const SKIP = new Set(['SCRIPT', 'NOSCRIPT', 'TEMPLATE', 'STYLE', 'LINK', 'META']);
  const parts = [];
  for (let n = el; n && n !== document.body && n.parentElement; n = n.parentElement) parts.unshift(`${n.tagName.toLowerCase()}:${[...n.parentElement.children].filter((c) => !SKIP.has(c.tagName)).indexOf(n) + 1}`);
  return { sel: `${el.tagName.toLowerCase()}.${String(el.getAttribute('class') || '').split(/\s+/).slice(0, 2).join('.')}`, w: Math.round(r.width), h: Math.round(r.height), path: parts.join('>'), style: window.__styleOf(el) };
}

// The clone's element at the reference element's place in the document: pairs the two by structure, not by page
// point, so text that wraps differently (template placeholders, a font metric) does not move the probe onto a
// neighbour. Falls back to the page point when the clone's script rebuilt that part (no visible element there).
function probeByPath([p, xs, py, kind, W, H]) {
  const SKIP = new Set(['SCRIPT', 'NOSCRIPT', 'TEMPLATE', 'STYLE', 'LINK', 'META']);
  let el = document.body;
  for (const part of String(p || '').split('>')) {
    if (!part) { el = null; break; }
    const [tag, i] = part.split(':');
    el = el && [...el.children].filter((c) => !SKIP.has(c.tagName))[Number(i) - 1];
    if (!el || el.tagName.toLowerCase() !== tag) { el = null; break; }
  }
  const own = (e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const r = el?.getBoundingClientRect();
  const s = el && getComputedStyle(el);
  if (el && r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && (kind !== 'text' || own(el))) {
    return { sel: `${el.tagName.toLowerCase()}.${String(el.getAttribute('class') || '').split(/\s+/).slice(0, 2).join('.')}`, w: Math.round(r.width), h: Math.round(r.height), by: 'structure', style: window.__styleOf(el) };
  }
  return { fallback: true };
}

async function sample(browser, url, vp, probes) {
  // Motion on, as visitors see it: many originals ignore prefers-reduced-motion, while a clone that honours it
  // shows a different (unpinned, unrevealed) layout. CSS transitions are frozen so states snap.
  const { context, page } = await newPage(browser, vp, { reducedMotion: 'no-preference' });
  await openUrl(page, url); // a load event that never comes is not a failed check (lib.mjs)
  await page.mouse.move(5, vp.height - 5);
  await waitStill(page, { timeout: 15000, interval: 200 }); // intros and loaders first
  await settle(page);
  // hit tests (elementsFromPoint) skip pointer-events:none layers, and text overlays often are
  await page.addStyleTag({ content: '*{pointer-events:auto!important}' });
  await page.evaluate(`window.__styleOf = ${styleOf.toString()}`);
  const go = async (y) => {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await waitStill(page, { timeout: 3000 }); // scroll-triggered reveals and pins finish
    return page.evaluate(() => Math.round(scrollY));
  };
  if (!probes) {
    // reference: walk the page a viewport at a time (with overlap), collecting what is on screen
    // Each point is then measured exactly as the clone will be (hit-tested at the same scroll), so both sides are
    // read the same way: an inline <strong> under the point is the <strong> on both pages, a point between split
    // characters misses on both, and an identical page scores 100% by construction.
    const list = [];
    const results = [];
    const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    for (let y = 0; list.length < MAX; y += vp.height - 80) {
      await go(Math.min(y, max));
      const found = await page.evaluate(collectProbes, MAX - list.length);
      for (const p of found) results.push(await page.evaluate(probeAt, [p.xs || [p.x], p.y, p.kind, p.w, p.h]));
      list.push(...found);
      if (y >= max) break;
    }
    await context.close();
    return { list, results, pageHeight: max + vp.height };
  }
  const list = probes;
  const results = new Array(list.length);
  let at = null;
  for (const [p, i] of list.map((q, k) => [q, k]).sort((x, y) => x[0].scroll - y[0].scroll)) {
    if (at === null || Math.abs(at - p.scroll) > 1) at = await go(p.scroll);
    const byPath = p.path ? await page.evaluate(probeByPath, [p.path, p.xs || [p.x], p.y, p.kind, p.w, p.h]) : { fallback: true };
    results[i] = byPath.fallback ? await page.evaluate(probeAt, [p.xs || [p.x], p.y, p.kind, p.w, p.h]) : byPath;
  }
  await context.close();
  return { list, results };
}

const near = (a, b, tol) => Math.abs(a - b) <= tol;
const rgba = (c) => (c.match(/[\d.]+/g) || []).map(Number).concat([1]).slice(0, 4);
const colorDist = (a, b) => { const x = rgba(a), y = rgba(b); return Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]) + Math.abs(x[3] - y[3]) * 255; };

const ident = await startIdentity(root, 'detail', SIDE);
const units = [];
const browser = await openBrowser(flags.cdp);
const report = { name, at: ident.startedAt, viewports: [] };
try {
  for (const vpName of wanted) {
   try {
    const vp = VIEWPORTS.find((v) => v.name === vpName);
    // reference probes are cached until the next capture (--refresh-ref to re-measure). The reference is read twice:
    // a probe that does not agree with itself (random motion, a hover that lands by timing, a rotating word) can
    // never be matched by any clone and is set aside as unstable instead of being handed over as a gap.
    const ref = await cached(root, { tool: 'detail', vp: vpName, max: MAX, v: 10 }, async () => {
      const first = await sample(browser, meta.url, vp, null);
      // a live site changes: a reference read against today's page scores a clone of yesterday's capture against the
      // wrong thing. The page height is a cheap tell; the fix is a new capture, not a new clone.
      const captured = meta.viewports?.find((v) => v.viewport === vpName)?.pageHeight;
      if (captured && first.pageHeight && Math.abs(first.pageHeight - captured) > Math.max(40, captured * 0.01)) console.warn(`WARNING reference drift (${vpName}): the live page is ${first.pageHeight}px tall, the capture was ${captured}px (${meta.capturedAt}); re-capture before trusting this score`);
      const again = await sample(browser, meta.url, vp, first.list.map(({ x, xs, y, kind, w, h, scroll }) => ({ x, xs, y, kind, w, h, scroll })));
      const unstable = first.list.map((p, i) => JSON.stringify(first.results[i]?.style) !== JSON.stringify(again.results[i]?.style) || first.results[i]?.sel !== again.results[i]?.sel);
      return { ...first, unstable };
    }, Boolean(flags['refresh-ref']));
    const cl = await sample(browser, cloneUrl, vp, ref.list.map(({ x, xs, y, kind, w, h, scroll }, i) => ({ x, xs, y, kind, w, h, scroll, path: ref.results[i]?.path })));
    const issues = [];
    const unstableList = [];
    let clean = 0, missing = 0;
    ref.list.forEach((p, i) => {
      const a = ref.results[i], b = cl.results[i];
      if (!a?.style) return;
      if (ref.unstable?.[i]) { unstableList.push({ y: p.y, kind: p.kind, ref: a.sel }); return; }
      if (!b?.style) { missing++; issues.push({ y: p.y, kind: p.kind, ref: a.sel, clone: b?.top || '(nothing)', props: [`no ${p.kind} element at this point on the clone`] }); return; }
      const A = a.style, B = b.style, props = [];
      if (p.kind === 'text') {
        if (A.family !== B.family) props.push(`font ${A.family} vs ${B.family}`);
        if (!near(A.size, B.size, 0.6)) props.push(`size ${A.size} vs ${B.size}px`);
        if (A.weight !== B.weight) props.push(`weight ${A.weight} vs ${B.weight}`);
        if (!near(A.lh, B.lh, 1)) props.push(`line-height ${A.lh.toFixed(1)} vs ${B.lh.toFixed(1)}px`);
        if (!near(A.ls, B.ls, 0.2)) props.push(`letter-spacing ${A.ls} vs ${B.ls}px`);
        if (A.tt !== B.tt) props.push(`transform ${A.tt} vs ${B.tt}`);
        if (colorDist(A.color, B.color) > 24) props.push(`color ${A.color} vs ${B.color}`);
      } else {
        if (colorDist(A.bg, B.bg) > 24) props.push(`background ${A.bg} vs ${B.bg}`);
        if (!near(A.radius, B.radius, 1)) props.push(`radius ${A.radius} vs ${B.radius}px`);
        if (!near(a.w, b.w, 3) || !near(a.h, b.h, 3)) props.push(`size ${a.w}x${a.h} vs ${b.w}x${b.h}`);
      }
      if (props.length) issues.push({ y: p.y, kind: p.kind, ref: a.sel, clone: b.sel, props });
      else clean++;
    });
    const total = ref.list.filter((p, i) => ref.results[i]?.style && !ref.unstable?.[i]).length;
    const byProp = {};
    issues.forEach((it) => it.props.forEach((pr) => { const k = pr.split(' ')[0] === 'no' ? 'missing element' : pr.split(' ')[0]; byProp[k] = (byProp[k] || 0) + 1; }));
    const v = { viewport: vpName, probes: total, clean, missing, unstable: unstableList.length, score: +(100 * clean / Math.max(1, total)).toFixed(1), byProp, issues, unstableProbes: unstableList };
    report.viewports.push(v);
    units.push(total ? { viewport: vpName, value: v.score, probes: total, issues: issues.length } : { viewport: vpName, value: null, error: 'no style probe could be read on the reference' });
   } catch (e) {
    const why = String(e.message).split('\n')[0];
    console.warn(`WARNING detail ${vpName}: ${why}`);
    units.push({ viewport: vpName, value: null, error: why });
   }
  }
} finally {
  if (!flags.cdp) await browser.close();
  server?.close();
}
const out = path.join(root, COMPARE, 'detail.json');
await writeUnits(root, COMPARE, 'detail', units, ident);
await mergeAggregate(out, report);
for (const v of report.viewports) {
  console.log(`\n${v.viewport}: detail match ${v.score}% (${v.clean}/${v.probes} probes clean, ${v.missing} with no counterpart${v.unstable ? `; ${v.unstable} unstable on the reference itself, not scored: ${[...new Set(v.unstableProbes.map((u) => u.ref))].slice(0, 4).join(', ')}` : ''})  by property: ${JSON.stringify(v.byProp)}`);
  // group identical issues so one root cause prints once with a count
  const groups = new Map();
  for (const it of v.issues) { const k = `${it.ref} -> ${it.clone}: ${it.props.join('; ')}`; const g = groups.get(k) || { ...it, n: 0 }; g.n++; groups.set(k, g); }
  [...groups.values()].sort((a, b) => b.n - a.n).slice(0, 18).forEach((g) => console.log(`  x${String(g.n).padEnd(3)} y${String(g.y).padEnd(6)} ${g.ref} -> ${g.clone}: ${g.props.join('; ')}`));
}
console.log(`-> ${path.relative(process.cwd(), out)}`);
