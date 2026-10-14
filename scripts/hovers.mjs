// Hovers: does hovering do the same thing on the clone as on the reference? Every element a visitor can hover is
// found two ways: interactive elements (links, buttons, anything with cursor:pointer) and every element that has a
// mouse or pointer enter/over/move listener (read through the DevTools protocol, so a card that opens a panel from
// script is found even without a pointer cursor). Each one is hovered on the reference; the same page point is
// hovered on the clone. Two things are compared:
// - which visual properties change on the element and its first descendants (colour, background, transform…);
// - the outcome: the region around the element after the hover, as pixels, reference vs clone (text and media masked
//   in template mode). A clone that opens a different panel, or opens nothing, fails even if "something changed".
//
// usage: node scripts/hovers.mjs <name> [--viewport desktop] [--url <clone url>] [--max 60] [--refresh-ref]
import fs from 'node:fs/promises';
import path from 'node:path';
import { SCORED, parseArgs, openBrowser, newPage, settle, serve, cached, maskToggle, matchPct, PNG } from './lib.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) {
  console.error('usage: trueclone hovers <name> [--viewport desktop] [--url <clone url>] [--max 60]');
  process.exit(1);
}
const root = path.resolve('sites', name);
const meta = JSON.parse(await fs.readFile(path.join(root, 'reference', 'meta.json'), 'utf8'));
const vp = SCORED.find((v) => v.name === (flags.viewport || 'desktop'));
const MAX = Number(flags.max || 60);
const template = meta.mode !== 'exact';
// the hovered region must match this well (exact mode renders the same text, so it can be stricter)
const OUTCOME_MIN = template ? 95 : 97;
const REACTS_BELOW = 99.5; // the region before vs after the hover: below this, the hover changed something visible
const server = typeof flags.url === 'string' ? null : await serve(path.join(root, 'clone'));
const cloneUrl = server ? server.url : flags.url;

// Elements with a hover-type listener, marked data-lab-hover through CDP (one call for the whole document).
async function markListened(page) {
  const cdp = await page.context().newCDPSession(page);
  try {
    const { result } = await cdp.send('Runtime.evaluate', { expression: 'document', objectGroup: 'lab' });
    const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId, depth: -1, pierce: false });
    const HOVER = new Set(['mouseenter', 'mouseover', 'pointerenter', 'pointerover', 'mousemove', 'pointermove']);
    const nodes = [...new Set(listeners.filter((l) => HOVER.has(l.type) && l.backendNodeId).map((l) => l.backendNodeId))];
    let marked = 0;
    for (const backendNodeId of nodes.slice(0, 400)) {
      try {
        const { object } = await cdp.send('DOM.resolveNode', { backendNodeId, objectGroup: 'lab' });
        await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: 'function(){ if (this.setAttribute && this !== document.documentElement && this !== document.body) this.setAttribute("data-lab-hover", ""); }' });
        marked++;
      } catch { /* detached */ }
    }
    return marked;
  } catch { return 0; } finally { await cdp.detach().catch(() => {}); }
}

function targets(max) {
  const seen = new Set();
  const out = [];
  const sel = (el) => `${el.tagName.toLowerCase()}.${String(el.getAttribute('class') || '').split(/\s+/).slice(0, 2).join('.')}`;
  const consider = (el, why) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return;
    const r = el.getBoundingClientRect();
    if (r.width < 10 || r.height < 10 || r.width > innerWidth * 0.95) return;
    // one target per interactive root: never the same element twice (found by its listener and by its cursor), nor
    // one inside or around an element already listed (the same region, counted twice)
    if (seen.has(el)) return;
    for (let p = el.parentElement; p; p = p.parentElement) if (seen.has(p)) return;
    for (const s of seen) if (el.contains(s)) return;
    seen.add(el);
    out.push({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + scrollY + r.height / 2), w: Math.round(r.width), h: Math.round(r.height), sel: sel(el), why });
  };
  // listened elements first: they are the ones a visual check at rest never sees
  for (const el of document.querySelectorAll('[data-lab-hover]')) { if (out.length >= max) break; consider(el, 'listener'); }
  for (const el of document.querySelectorAll('a, button, [role="button"], *')) {
    if (out.length >= max) break;
    const s = getComputedStyle(el);
    if (s.cursor !== 'pointer' && !['A', 'BUTTON'].includes(el.tagName)) continue;
    consider(el, 'pointer');
  }
  return out.sort((a, b) => a.y - b.y);
}

// Signature of the hover root under a point and its first descendants.
function signature([px, vy]) {
  let el = document.elementFromPoint(px, vy);
  const control = el?.closest('[data-lab-hover], a, button, [role="button"]');
  if (control) el = control;
  else {
    let top = null;
    for (let n = el; n && n !== document.body; n = n.parentElement) if (getComputedStyle(n).cursor === 'pointer') top = n;
    el = top;
  }
  if (!el) return null;
  const nodes = [el, ...[...el.querySelectorAll('*')].slice(0, 12)];
  const props = {};
  nodes.forEach((n, i) => {
    const s = getComputedStyle(n);
    props[i] = { color: s.color, background: s.backgroundColor, transform: s.transform, opacity: s.opacity, shadow: s.boxShadow, decoration: s.textDecorationLine, border: s.borderColor, filter: s.filter, scale: s.scale, visibility: s.visibility };
  });
  return { sel: `${el.tagName.toLowerCase()}.${String(el.getAttribute('class') || '').split(/\s+/).slice(0, 2).join('.')}`, props };
}
const changedKinds = (a, b) => {
  const kinds = new Set();
  for (const i of Object.keys(a.props)) for (const k of Object.keys(a.props[i])) if (b.props[i] && a.props[i][k] !== b.props[i][k]) kinds.add(k === 'scale' ? 'transform' : k);
  return [...kinds].sort();
};

// the region a hover can change: the element and half its size around it (a panel opening next to a card), in view
const regionOf = (t, vy) => {
  const x = Math.max(0, Math.round(t.x - t.w)), y = Math.max(0, Math.round(vy - t.h));
  return { x, y, width: Math.min(vp.width - x, Math.round(t.w * 2)), height: Math.min(vp.height - y, Math.round(t.h * 2)) };
};

async function hoverAll(browser, url, list, shotDir) {
  const { context, page } = await newPage(browser, vp, { reducedMotion: 'no-preference' });
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await settle(page);
  let listened = 0;
  if (!list) { listened = await markListened(page); list = await page.evaluate(targets, MAX); }
  else await markListened(page);
  await fs.mkdir(shotDir, { recursive: true });
  const out = [];
  for (const [i, t] of list.entries()) {
    const top = Math.max(0, t.y - Math.round(vp.height / 2));
    await page.evaluate((y) => window.scrollTo(0, y), top);
    await page.mouse.move(2, 2);
    const vy = t.y - (await page.evaluate(() => scrollY));
    const clip = regionOf(t, vy);
    const ok = clip.width > 4 && clip.height > 4;
    // the region shot until two shots in a row agree (a transition has ended), at most 1.5 s: as long as a slow
    // hover needs, no longer than a quick one does. A region that is never still (a loop, a video) gets the fixed
    // 0.9 s wait instead: stillness will not come.
    let still = true;
    const grab = async (file, min = 0, max = 1500) => { // min: a transition-delay must have passed before "still" means done
      if (!ok) { await page.waitForTimeout(Math.max(300, min)); return null; }
      if (template) await maskToggle(page, true);
      let last = null, buf = null;
      const t0 = Date.now();
      try {
        for (;;) {
          await page.waitForTimeout(last ? 120 : 80);
          buf = await page.screenshot({ clip });
          // still = no visible change: a shimmering background or grain never repeats byte for byte
          if (last && (buf.equals(last) || matchPct(PNG.sync.read(last), PNG.sync.read(buf)).pct >= 99.8) && Date.now() - t0 >= min) break;
          if (Date.now() - t0 > max) { still = false; break; }
          last = buf;
        }
      } catch { buf = null; }
      if (template) await maskToggle(page, false);
      if (!buf) return null;
      const p = path.join(shotDir, file);
      await fs.writeFile(p, buf);
      return p;
    };
    const shotBefore = await grab(`${String(i).padStart(2, '0')}-before.png`, 0, 600);
    const before = await page.evaluate(signature, [t.x, vy]);
    await page.mouse.move(t.x, vy, { steps: 6 });
    const shot = await grab(`${String(i).padStart(2, '0')}.png`, 450, still ? 1500 : 900);
    const after = await page.evaluate(signature, [t.x, vy]);
    // what the hover changed on screen: deep descendants, a panel next to the card, a class-driven state
    const visible = shotBefore && shot ? matchPct(PNG.sync.read(await fs.readFile(shotBefore)), PNG.sync.read(await fs.readFile(shot))).pct : 100;
    const kinds = before && after && before.sel === after.sel ? changedKinds(before, after) : [];
    if (visible < REACTS_BELOW && !kinds.length) kinds.push('pixels');
    out.push({ sel: before?.sel || null, kinds, shot, visible });
  }
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight).catch(() => null);
  await context.close();
  return { list, out, pageHeight, listened };
}

const browser = await openBrowser(flags.cdp);
let ref, cl;
try {
  // reference hovers are cached until the next capture (--refresh-ref to re-measure); read twice, so a hover effect
  // that comes and goes by timing on the reference itself is set aside as unstable rather than demanded of the clone
  ref = await cached(root, { tool: 'hovers', vp: vp.name, max: MAX, v: 8 }, async () => {
    const dir = path.join(root, 'reference', 'cache', `hovers-${vp.name}`);
    const first = await hoverAll(browser, meta.url, null, path.join(dir, 'a'));
    const captured = meta.viewports?.find((v) => v.viewport === vp.name)?.pageHeight;
    if (captured && first.pageHeight && Math.abs(first.pageHeight - captured) > Math.max(40, captured * 0.01)) console.warn(`WARNING reference drift (${vp.name}): the live page is ${first.pageHeight}px tall, the capture was ${captured}px (${meta.capturedAt}); re-capture before trusting this score`);
    const again = await hoverAll(browser, meta.url, first.list, path.join(dir, 'b'));
    const unstable = await Promise.all(first.out.map(async (a, i) => {
      const b = again.out[i];
      if (a.sel !== b?.sel || a.kinds.join() !== (b?.kinds || []).join()) return true;
      if (a.shot && b?.shot) return matchPct(PNG.sync.read(await fs.readFile(a.shot)), PNG.sync.read(await fs.readFile(b.shot))).pct < 97;
      return false;
    }));
    return { ...first, unstable };
  }, Boolean(flags['refresh-ref']));
  cl = await hoverAll(browser, cloneUrl, ref.list, path.join(root, 'compare', `hovers-${vp.name}`));
} finally {
  if (!flags.cdp) await browser.close();
  server?.close();
}
const rows = [];
for (const [i, t] of ref.list.entries()) {
  const a = ref.out[i], b = cl.out[i];
  const outcome = a.shot && b.shot ? matchPct(PNG.sync.read(await fs.readFile(a.shot)), PNG.sync.read(await fs.readFile(b.shot))).pct : null;
  const reacts = a.kinds.length > 0;
  let status;
  if (ref.unstable?.[i]) status = 'unstable';
  else if (!reacts && !b.kinds.length) status = 'static';
  else if (!reacts) status = outcome !== null && outcome < OUTCOME_MIN ? 'EXTRA' : 'static'; // the clone reacts where the reference doesn't
  else if (!b.sel) status = 'no element';
  else if (!b.kinds.length) status = 'MISSING';
  else if (!a.kinds.some((k) => b.kinds.includes(k))) status = 'different';
  else if (outcome !== null && outcome < OUTCOME_MIN) status = 'WRONG OUTCOME';
  else status = 'ok';
  rows.push({ y: t.y, found: t.why || 'pointer', ref: a.sel || t.sel, refChanges: a.kinds.join(',') || '-', clone: b.sel || '-', cloneChanges: b.kinds.join(',') || '-', outcome, status });
}
const scored = rows.filter((r) => r.status !== 'static' && r.status !== 'unstable');
const unstable = rows.filter((r) => r.status === 'unstable').length;
const ok = scored.filter((r) => r.status === 'ok').length;
const report = { name, viewport: vp.name, at: new Date().toISOString(), score: +(100 * ok / Math.max(1, scored.length)).toFixed(1), unstable, listened: ref.listened ?? null, rows };
const out = path.join(root, 'compare', `hovers.${vp.name}.json`);
await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, JSON.stringify(report, null, 2));
console.log(`hover match (${vp.name}): ${report.score}% of ${scored.length} hover effects reproduced with the same outcome (${rows.length} elements probed, ${rows.filter((r) => r.found === 'listener').length} found by their mouse listeners${unstable ? `, ${unstable} unstable on the reference itself, not scored` : ''})`);
console.table(rows.filter((r) => !['static', 'ok', 'unstable'].includes(r.status)).slice(0, 25));
console.log(`-> ${path.relative(process.cwd(), out)}`);
