// Hover inventory + comparison by position. Hovers every interactive element on the reference (links, buttons,
// anything with cursor:pointer), records which visual properties change on it and its first descendants, then
// hovers the same page point on the clone and checks it reacts the same way. Catches missing hover states,
// which screenshots at rest never show.
//
// usage: node scripts/hovers.mjs <name> [--viewport desktop] [--url <clone url>] [--max 40]
import fs from 'node:fs/promises';
import path from 'node:path';
import { VIEWPORTS, parseArgs, openBrowser, newPage, settle, serve, cached } from './lib.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) {
  console.error('usage: npm run hovers -- <name> [--viewport desktop] [--url <clone url>]');
  process.exit(1);
}
const root = path.resolve('sites', name);
const meta = JSON.parse(await fs.readFile(path.join(root, 'reference', 'meta.json'), 'utf8'));
const vp = VIEWPORTS.find((v) => v.name === (flags.viewport || 'desktop'));
const MAX = Number(flags.max || 40);
const server = typeof flags.url === 'string' ? null : await serve(path.join(root, 'clone'));
const cloneUrl = server ? server.url : flags.url;

function targets(max) {
  const seen = new Set();
  const out = [];
  for (const el of document.querySelectorAll('a, button, [role="button"], *')) {
    const s = getComputedStyle(el);
    if (s.cursor !== 'pointer' && !['A', 'BUTTON'].includes(el.tagName)) continue;
    if (s.display === 'none' || s.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 10 || r.height < 10 || r.width > innerWidth * 0.9) continue;
    // one target per interactive root: skip descendants of an already listed element
    let p = el.parentElement, nested = false;
    while (p) { if (seen.has(p)) { nested = true; break; } p = p.parentElement; }
    if (nested) continue;
    seen.add(el);
    out.push({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + scrollY + r.height / 2), sel: `${el.tagName.toLowerCase()}.${String(el.getAttribute('class') || '').split(/\s+/).slice(0, 2).join('.')}` });
    if (out.length >= max) break;
  }
  return out;
}

// Signature of the interactive root under a point and its first descendants.
function signature([px, vy]) {
  let el = document.elementFromPoint(px, vy);
  // cursor:pointer is inherited, so prefer the nearest real control (a/button/[role=button]); otherwise the
  // outermost ancestor that still has a pointer cursor
  const control = el?.closest('a, button, [role="button"]');
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
    props[i] = { color: s.color, background: s.backgroundColor, transform: s.transform, opacity: s.opacity, shadow: s.boxShadow, decoration: s.textDecorationLine, border: s.borderColor, filter: s.filter, scale: s.scale };
  });
  return { sel: `${el.tagName.toLowerCase()}.${String(el.getAttribute('class') || '').split(/\s+/).slice(0, 2).join('.')}`, props };
}
const changedKinds = (a, b) => {
  const kinds = new Set();
  for (const i of Object.keys(a.props)) for (const k of Object.keys(a.props[i])) if (b.props[i] && a.props[i][k] !== b.props[i][k]) kinds.add(k === 'scale' ? 'transform' : k);
  return [...kinds].sort();
};

async function hoverAll(browser, url, list) {
  const { context, page } = await newPage(browser, vp, { reducedMotion: 'no-preference' });
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await settle(page);
  if (!list) list = await page.evaluate(targets, MAX);
  const out = [];
  for (const t of list) {
    const top = Math.max(0, t.y - Math.round(vp.height / 2));
    await page.evaluate((y) => window.scrollTo(0, y), top);
    await page.mouse.move(2, 2);
    await page.waitForTimeout(400);
    const vy = t.y - (await page.evaluate(() => scrollY));
    const before = await page.evaluate(signature, [t.x, vy]);
    await page.mouse.move(t.x, vy, { steps: 6 });
    await page.waitForTimeout(800);
    const after = await page.evaluate(signature, [t.x, vy]);
    out.push({ sel: before?.sel || null, kinds: before && after && before.sel === after.sel ? changedKinds(before, after) : [] });
  }
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight).catch(() => null);
  await context.close();
  return { list, out, pageHeight };
}

const browser = await openBrowser(flags.cdp);
let ref, cl;
try {
  // reference hovers are cached until the next capture (--refresh-ref to re-measure); read twice, so a hover effect
  // that comes and goes by timing on the reference itself is set aside as unstable rather than demanded of the clone
  ref = await cached(root, { tool: 'hovers', vp: vp.name, max: MAX, v: 3 }, async () => {
    const first = await hoverAll(browser, meta.url, null);
    const captured = meta.viewports?.find((v) => v.viewport === vp.name)?.pageHeight;
    if (captured && first.pageHeight && Math.abs(first.pageHeight - captured) > Math.max(40, captured * 0.01)) console.warn(`WARNING reference drift (${vp.name}): the live page is ${first.pageHeight}px tall, the capture was ${captured}px (${meta.capturedAt}); re-capture before trusting this score`);
    const again = await hoverAll(browser, meta.url, first.list);
    return { ...first, unstable: first.out.map((a, i) => a.sel !== again.out[i]?.sel || a.kinds.join() !== (again.out[i]?.kinds || []).join()) };
  }, Boolean(flags['refresh-ref']));
  cl = await hoverAll(browser, cloneUrl, ref.list);
} finally {
  if (!flags.cdp) await browser.close();
  server?.close();
}
const rows = ref.list.map((t, i) => {
  const a = ref.out[i], b = cl.out[i];
  const status = ref.unstable?.[i] ? 'unstable' : !a.kinds.length ? (b.kinds.length ? 'extra' : 'static') : !b.sel ? 'no element' : !b.kinds.length ? 'MISSING' : a.kinds.some((k) => b.kinds.includes(k)) ? 'ok' : 'different';
  return { y: t.y, ref: a.sel || t.sel, refChanges: a.kinds.join(',') || '-', clone: b.sel || '-', cloneChanges: b.kinds.join(',') || '-', status };
});
const withHover = rows.filter((r) => r.refChanges !== '-' && r.status !== 'unstable');
const unstable = rows.filter((r) => r.status === 'unstable').length;
const ok = withHover.filter((r) => r.status === 'ok').length;
const report = { name, viewport: vp.name, at: new Date().toISOString(), score: +(100 * ok / Math.max(1, withHover.length)).toFixed(1), unstable, rows };
const out = path.join(root, 'compare', `hovers.${vp.name}.json`);
await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, JSON.stringify(report, null, 2));
console.log(`hover match (${vp.name}): ${report.score}% of ${withHover.length} reference hover effects reproduced (${rows.length} interactive elements probed${unstable ? `, ${unstable} unstable on the reference itself, not scored` : ''})`);
console.table(rows.filter((r) => r.status !== 'static' && r.status !== 'ok' && r.status !== 'unstable').slice(0, 25));
console.log(`-> ${path.relative(process.cwd(), out)}`);
