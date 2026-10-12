// Render the clone exactly like the reference and score it: whole-page and per-section pixel match.
// usage: node scripts/diff.mjs <name> [--structure] [--url http://localhost:5173/] [--cdp]
// Without --url it serves sites/<name>/clone/ itself on a free local port.
import fs from 'node:fs/promises';
import path from 'node:path';
import { VIEWPORTS, parseArgs, openBrowser, newPage, settle, mask, serve, pad, crop, match, PNG } from './lib.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) {
  console.error('usage: npm run diff -- <name> [--url <dev server url>]');
  process.exit(1);
}
const root = path.resolve('sites', name);
const ref = path.join(root, 'reference');
const out = path.join(root, 'compare');
const meta = JSON.parse(await fs.readFile(path.join(ref, 'meta.json'), 'utf8'));
await fs.mkdir(out, { recursive: true });

// --structure: compare layout only (text and media masked on both sides), for placeholder-content clones.
const structure = Boolean(flags.structure);
const suffix = structure ? '.mask' : '';
const server = flags.url ? null : await serve(path.join(root, 'clone'));
const target = typeof flags.url === 'string' ? flags.url : server.url;
const browser = await openBrowser(flags.cdp);
const report = { name, mode: structure ? 'structure' : 'visual', source: meta.url, clone: target, at: new Date().toISOString(), viewports: [] };
try {
  for (const vp of VIEWPORTS) {
    const { context, page } = await newPage(browser, vp);
    await page.goto(target, { waitUntil: 'load', timeout: 60000 });
    await settle(page);
    if (structure) await mask(page);
    const clonePath = path.join(out, `${vp.name}${suffix}.clone.png`);
    await page.screenshot({ path: clonePath, fullPage: true });
    await context.close();

    const a0 = PNG.sync.read(await fs.readFile(path.join(ref, `${vp.name}${suffix}.png`)));
    const b0 = PNG.sync.read(await fs.readFile(clonePath));
    const w = Math.max(a0.width, b0.width), h = Math.max(a0.height, b0.height);
    const a = pad(a0, w, h), b = pad(b0, w, h);
    const diff = new PNG({ width: w, height: h });
    const bad = match(a, b, diff);
    await fs.writeFile(path.join(out, `${vp.name}${suffix}.diff.png`), PNG.sync.write(diff));

    const sections = JSON.parse(await fs.readFile(path.join(ref, `${vp.name}.sections.json`), 'utf8'));
    const perSection = sections
      // sections can start above the page (a skip link parked at y -80) or run past it: score the visible part
      .filter((s) => s.height > 0 && s.y < h && s.y + s.height > 0)
      .map((s) => {
        const y0 = Math.max(0, s.y);
        const sh = Math.min(s.y + s.height, h) - y0;
        const miss = match(crop(a, y0, sh), crop(b, y0, sh));
        return { index: s.index, label: s.heading || s.id || s.classes || s.tag, y: s.y, height: s.height, match: +(100 - (miss / (w * sh)) * 100).toFixed(2) };
      });
    report.viewports.push({
      viewport: vp.name,
      match: +(100 - (bad / (w * h)) * 100).toFixed(2),
      heightRef: a0.height,
      heightClone: b0.height,
      worstSections: [...perSection].sort((x, y) => x.match - y.match).slice(0, 5),
      sections: perSection,
    });
  }
} finally {
  if (!flags.cdp) await browser.close();
  server?.close();
}

await fs.writeFile(path.join(out, `report${suffix}.json`), JSON.stringify(report, null, 2));
console.log(`mode: ${report.mode}`);
console.table(report.viewports.map((v) => ({ viewport: v.viewport, 'match %': v.match, 'ref h': v.heightRef, 'clone h': v.heightClone, worst: v.worstSections[0] ? `${v.worstSections[0].label} (${v.worstSections[0].match}%)` : '-' })));
console.log(`Diff images + report: ${path.relative(process.cwd(), out)}`);
