// Has the live page changed since the capture? Layout and scroll states score against the captured screenshots, but
// detail, hovers, motion curves, interactions and the load sequence measure the live page: when the site changed in
// between, those checks compare the clone with something it was never a copy of. One page load per width: the page
// height and the number of top-level sections against meta.json. Written to compare/drift.json; REPORT.md marks the
// live-measured checks "stale capture" and the advice is to re-capture, not to touch the clone.
// usage: node scripts/drift.mjs <name> [--viewport desktop|all]
import fs from 'node:fs/promises';
import path from 'node:path';
import { SCORED as VIEWPORTS, parseArgs, openBrowser, newPage, settle, sectionsOf, COMPARE, siteDir } from './lib.mjs';
import { refIdOf } from './identity.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) {
  console.error('usage: trueclone drift <name> [--viewport desktop|all]');
  process.exit(1);
}
const root = siteDir(name);
const meta = JSON.parse(await fs.readFile(path.join(root, 'reference', 'meta.json'), 'utf8'));
const vps = !flags.viewport || flags.viewport === 'all' ? VIEWPORTS : [VIEWPORTS.find((v) => v.name === flags.viewport)].filter(Boolean);

// the origins the page's scripts came from (capture records the same as meta.scriptOrigins)
function scriptOriginsInPage() {
  const o = new Set();
  for (const e of performance.getEntriesByType('resource')) if (e.initiatorType === 'script') { try { o.add(new URL(e.name).origin); } catch { /* not an address */ } }
  for (const s of document.scripts) if (s.src) { try { o.add(new URL(s.src).origin); } catch { /* not an address */ } }
  return [...o].sort();
}

const browser = await openBrowser(flags.cdp);
const viewports = [];
try {
  for (const vp of vps) {
    const captured = meta.viewports?.find((v) => v.viewport === vp.name);
    if (!captured) continue;
    const sample = async () => {
      const { context, page } = await newPage(browser, vp);
      try {
        const res = await page.goto(meta.url, { waitUntil: 'load', timeout: 60000 });
        if (res && res.status() >= 400) throw new Error(`HTTP ${res.status()}`);
        await settle(page, meta.hide || []);
        return { h: await page.evaluate(() => document.documentElement.scrollHeight), n: (await sectionsOf(page)).length, origins: await page.evaluate(scriptOriginsInPage).catch(() => null) };
      } finally {
        await context.close();
      }
    };
    // 1% (at least 40px) absorbs font hinting and a rotating line of text; a new section or a block that moved is above that.
    // The sites whose scripts run on the page too (ALLBIRDS-12: a third-party assistant changed and nothing noticed): an
    // origin that appeared or went since the capture, other than an excluded widget's, is a changed page
    const excluded = new Set((meta.ignore || []).map((i) => i.origin).filter(Boolean));
    const originChange = (s) => {
      if (!s.origins || !meta.scriptOrigins) return null;
      const added = s.origins.filter((o) => !meta.scriptOrigins.includes(o) && !excluded.has(o));
      const removed = meta.scriptOrigins.filter((o) => !s.origins.includes(o) && !excluded.has(o));
      return added.length || removed.length ? { added, removed } : null;
    };
    const differs = (s) => Math.abs(s.h - captured.pageHeight) > Math.max(40, captured.pageHeight * 0.01) || s.n !== captured.sections || Boolean(originChange(s));
    // a page that renders differently from one load to the next (a random block, a late embed) is not a changed site:
    // a difference counts only when a second load shows it too
    let s;
    try { s = await sample(); } catch (e) {
      // the live site did not answer: the reference cannot be checked (or re-measured) now; recorded, not skipped
      const why = String(e.message).split('\n')[0];
      viewports.push({ viewport: vp.name, unreachable: why });
      console.warn(`WARNING ${vp.name}: the live site did not load (${why})`);
      continue;
    }
    let confirmed = false;
    if (differs(s)) { const again = await sample().catch(() => null); confirmed = again ? differs(again) : false; if (again && !confirmed) s = again; }
    const stale = confirmed;
    const scripts = originChange(s);
    viewports.push({ viewport: vp.name, livePageHeight: s.h, capturedPageHeight: captured.pageHeight, liveSections: s.n, capturedSections: captured.sections, ...(scripts ? { scripts } : {}), stale });
    console.log(`${vp.name}: live ${s.h}px / ${s.n} sections, captured ${captured.pageHeight}px / ${captured.sections} sections${scripts ? `; scripts from ${[...scripts.added.map((o) => `+${o}`), ...scripts.removed.map((o) => `-${o}`)].join(' ')}` : ''}${stale ? '  <- changed since the capture (seen on two loads)' : '  (same)'}`);
  }
} finally {
  if (!flags.cdp) await browser.close();
}
// merged per size with the last run for this capture (a run narrowed to one size never erases the others); a record made
// for an earlier capture is discarded (refId: identity.mjs)
await fs.mkdir(path.join(root, COMPARE), { recursive: true });
const file = path.join(root, COMPARE, 'drift.json');
const refId = refIdOf(meta);
const prev = JSON.parse(await fs.readFile(file, 'utf8').catch(() => 'null'));
const all = prev?.refId === refId ? [...(prev.viewports || []).filter((v) => !viewports.some((n) => n.viewport === v.viewport)), ...viewports] : viewports;
const stale = all.some((v) => v.stale);
const unreachable = all.filter((v) => v.unreachable).map((v) => v.viewport);
await fs.writeFile(file, JSON.stringify({ at: new Date().toISOString(), capturedAt: meta.capturedAt, refId, stale, unreachable, viewports: all }, null, 2));
if (unreachable.length) process.exitCode = 1;
if (stale) console.warn(`WARNING reference drift: the live page has changed since the capture of ${meta.capturedAt}; detail, hovers, curves, interactions and load now measure a page the clone was never a copy of. Re-capture (trueclone capture, then states, reveals, seed --force) before trusting them.`);
else console.log(`drift: none since ${meta.capturedAt}`);
