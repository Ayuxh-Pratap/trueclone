// Has the live page changed since the capture? Layout and scroll states score against the captured screenshots, but
// detail, hovers, motion curves, interactions and the load sequence measure the live page: when the site changed in
// between, those checks compare the clone with something it was never a copy of. One page load per width: the page
// height and the number of top-level sections against meta.json. Written to compare/drift.json; REPORT.md marks the
// live-measured checks "stale capture" and the advice is to re-capture, not to touch the clone.
// usage: node scripts/drift.mjs <name> [--viewport desktop|all]
import fs from 'node:fs/promises';
import path from 'node:path';
import { SCORED as VIEWPORTS, parseArgs, openBrowser, newPage, settle, sectionsOf, COMPARE, siteDir } from './lib.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) {
  console.error('usage: trueclone drift <name> [--viewport desktop|all]');
  process.exit(1);
}
const root = siteDir(name);
const meta = JSON.parse(await fs.readFile(path.join(root, 'reference', 'meta.json'), 'utf8'));
const vps = !flags.viewport || flags.viewport === 'all' ? VIEWPORTS : [VIEWPORTS.find((v) => v.name === flags.viewport)].filter(Boolean);

const browser = await openBrowser(flags.cdp);
const viewports = [];
try {
  for (const vp of vps) {
    const captured = meta.viewports?.find((v) => v.viewport === vp.name);
    if (!captured) continue;
    const sample = async () => {
      const { context, page } = await newPage(browser, vp);
      try {
        await page.goto(meta.url, { waitUntil: 'load', timeout: 60000 });
        await settle(page, meta.hide || []);
        return { h: await page.evaluate(() => document.documentElement.scrollHeight), n: (await sectionsOf(page)).length };
      } finally {
        await context.close();
      }
    };
    // 1% (at least 40px) absorbs font hinting and a rotating line of text; a new section or a block that moved is above that
    const differs = (s) => Math.abs(s.h - captured.pageHeight) > Math.max(40, captured.pageHeight * 0.01) || s.n !== captured.sections;
    // a page that renders differently from one load to the next (a random block, a late embed) is not a changed site:
    // a difference counts only when a second load shows it too
    let s = await sample();
    let confirmed = false;
    if (differs(s)) { const again = await sample(); confirmed = differs(again); if (!confirmed) s = again; }
    const stale = confirmed;
    viewports.push({ viewport: vp.name, livePageHeight: s.h, capturedPageHeight: captured.pageHeight, liveSections: s.n, capturedSections: captured.sections, stale });
    console.log(`${vp.name}: live ${s.h}px / ${s.n} sections, captured ${captured.pageHeight}px / ${captured.sections} sections${stale ? '  <- changed since the capture (seen on two loads)' : '  (same)'}`);
  }
} finally {
  if (!flags.cdp) await browser.close();
}
const stale = viewports.some((v) => v.stale);
await fs.mkdir(path.join(root, COMPARE), { recursive: true });
await fs.writeFile(path.join(root, COMPARE, 'drift.json'), JSON.stringify({ at: new Date().toISOString(), capturedAt: meta.capturedAt, stale, viewports }, null, 2));
if (stale) console.warn(`WARNING reference drift: the live page has changed since the capture of ${meta.capturedAt}; detail, hovers, curves, interactions and load now measure a page the clone was never a copy of. Re-capture (trueclone capture, then states, reveals, seed --force) before trusting them.`);
else console.log(`drift: none since ${meta.capturedAt}`);
