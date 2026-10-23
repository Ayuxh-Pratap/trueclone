// Render the clone exactly like the reference and score it: whole-page and per-section pixel match.
// usage: node scripts/diff.mjs <name> [--structure] [--url http://localhost:5173/] [--cdp]
// Without --url it serves sites/<name>/clone/ itself on a free local port.
import fs from 'node:fs/promises';
import path from 'node:path';
import { SCORED, parseArgs, openBrowser, newPage, settle, mask, serve, pad, isPad, crop, match, PNG, COMPARE, siteDir, holdStill } from './lib.mjs';
import { startIdentity, refIdOf } from './identity.mjs';
import { writeUnits, mergeAggregate } from './results.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) {
  console.error('usage: npm run diff -- <name> [--url <dev server url>]');
  process.exit(1);
}
const root = siteDir(name);
const ref = path.join(root, 'reference');
const out = path.join(root, COMPARE);
const meta = JSON.parse(await fs.readFile(path.join(ref, 'meta.json'), 'utf8'));
await fs.mkdir(out, { recursive: true });

// --structure: compare layout only (text and media masked on both sides), for placeholder-content clones.
// --reduce: the reduced-motion page (decision D2), a check of its own: both sides opened with prefers-reduced-motion:
// reduce, at desktop and mobile, structure-masked. The reference is shot live (once per capture, kept in
// reference/reduced/); every other check measures the page a visitor without the setting sees.
const reduce = Boolean(flags.reduce);
const structure = Boolean(flags.structure) || reduce;
const suffix = structure ? '.mask' : '';
const server = flags.url ? null : await serve(path.join(root, 'clone'));
const target = typeof flags.url === 'string' ? flags.url : server.url;
// calibrate.mjs replays the live reference through this path (TC_CALIBRATE): its routes are at their own addresses
const calibrating = process.env.TC_CALIBRATE === '1';
// what is measured (identity.mjs), taken before the first page opens: an edit made while this runs leaves it stale
const check = reduce ? 'reduced' : structure ? 'layout' : 'layout-real';
const ident = await startIdentity(root, check, COMPARE === 'compare-next' ? 'app' : 'clone');
const browser = await openBrowser(flags.cdp);
const report = { name, mode: structure ? 'structure' : 'visual', source: meta.url, clone: target, at: ident.startedAt, viewports: [], routes: [] };
// Every route of the site (meta.routes, from capture): the captured page writes where it always has (compare/), each
// other route to compare/routes/<slug>/, its reference in reference/routes/<slug>/, opened at its own address.
// --viewport and --route narrow the run; what is not measured keeps its earlier result (results.mjs).
const routes = (meta.routes?.length ? meta.routes : [{ path: '/', slug: '', dir: 'reference' }]).filter((r) => typeof flags.route !== 'string' || r.path === flags.route);
const REDUCED_VPS = ['desktop', 'mobile']; // verdict.mjs requires the same sizes
const vpsWanted = SCORED.filter((v) => (typeof flags.viewport !== 'string' || v.name === flags.viewport) && (!reduce || REDUCED_VPS.includes(v.name)));
const units = [];
const motion = reduce ? { reducedMotion: 'reduce' } : {};
// one page shot the way every layout shot is taken (settle, mask, full page), with what view-mounted content covers
async function shoot(url, vp, file) {
  const { context, page } = await newPage(browser, vp, motion);
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await settle(page);
    if (structure) await mask(page);
    await holdStill(page); // the same page age as the reference's shot (lib.mjs)
    await page.screenshot({ path: file, fullPage: true });
    // View-mounted content (marked by capture): a full-page still can't show it on either side, so its boxes are
    // painted the same flat colour in both images; the scroll-state check scores it with a real viewport.
    return await page.evaluate(() => [...document.querySelectorAll('[data-tc-viewmount]')]
      .map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.top + scrollY, r.width, r.height].map(Math.round); })
      .filter((r) => r[2] > 0 && r[3] > 0));
  } finally { await context.close(); }
}
// the reduced-motion reference, shot live once per capture (refId), with its sections
async function reducedReference(r, vp) {
  const dir = path.join(root, 'reference', 'reduced', r.slug || '_');
  const file = path.join(dir, `${vp.name}.mask.png`);
  const stamp = path.join(dir, `${vp.name}.json`);
  const id = refIdOf(meta);
  const had = JSON.parse(await fs.readFile(stamp, 'utf8').catch(() => 'null'));
  if (had?.refId === id && (await fs.stat(file).then(() => true, () => false))) return { file, sections: had.sections || [] };
  await fs.mkdir(dir, { recursive: true });
  const url = new URL(r.slug ? r.path : '', meta.finalUrl || meta.url).href;
  await shoot(url, vp, file);
  const h = PNG.sync.read(await fs.readFile(file)).height;
  await fs.writeFile(stamp, JSON.stringify({ refId: id, url, at: new Date().toISOString(), sections: [{ index: 0, y: 0, height: h, heading: 'page' }] }));
  return { file, sections: [{ index: 0, y: 0, height: h, heading: 'page' }] };
}
async function scoreRoute(r) {
  const ref = path.join(root, r.dir);
  const out = r.slug ? path.join(root, COMPARE, 'routes', r.slug) : path.join(root, COMPARE);
  await fs.mkdir(out, { recursive: true });
  const pageUrl = r.slug ? (await import('./routes.mjs')).routeUrl(r.path, target, calibrating) : target;
  const viewports = [];
  const routeKey = r.slug ? r.path : '';
  for (const vp of vpsWanted) {
    // a reference capture missing at a size is an incomplete reference, recorded as such (never skipped as if passing)
    if (!reduce && !(await fs.stat(path.join(ref, `${vp.name}${suffix}.png`)).then(() => true, () => false))) {
      console.log(`${r.path} ${vp.name}: no reference capture at ${vp.width}x${vp.height} (re-capture to score it)`);
      units.push({ route: routeKey, viewport: vp.name, value: null, error: `the reference has no ${structure ? 'structure ' : ''}capture at ${vp.name}: capture again` });
      continue;
    }
    try {
      viewports.push(await scoreViewport(r, ref, out, pageUrl, vp, routeKey));
    } catch (e) {
      console.warn(`WARNING ${r.path} ${vp.name}: ${e.message.split('\n')[0]}`);
      units.push({ route: routeKey, viewport: vp.name, value: null, error: e.message.split('\n')[0] });
    }
  }
  return viewports;
}
async function scoreViewport(r, ref, out, pageUrl, vp, routeKey) {
  {
    const tag = reduce ? '.reduce' : '';
    const clonePath = path.join(out, `${vp.name}${tag}${suffix}.clone.png`);
    const excluded = await shoot(pageUrl, vp, clonePath);
    const refShot = reduce ? await reducedReference(r, vp) : { file: path.join(ref, `${vp.name}${suffix}.png`), sections: null };

    const a0 = PNG.sync.read(await fs.readFile(refShot.file));
    const b0 = PNG.sync.read(await fs.readFile(clonePath));
    const w = Math.max(a0.width, b0.width), h = Math.max(a0.height, b0.height);
    const a = pad(a0, w, h), b = pad(b0, w, h);
    // (never over padding: rows only one side has stay a difference, RC6-16, whatever box the clone reports there)
    for (const [x, y, rw, rh] of excluded) {
      for (let yy = Math.max(0, y); yy < Math.min(h, y + rh); yy++) {
        for (let xx = Math.max(0, x); xx < Math.min(w, x + rw); xx++) {
          const i = (yy * w + xx) * 4;
          if (isPad(a, i) || isPad(b, i)) continue;
          for (const img of [a, b]) { img.data[i] = 64; img.data[i + 1] = 64; img.data[i + 2] = 64; img.data[i + 3] = 255; }
        }
      }
    }
    const diff = new PNG({ width: w, height: h });
    const bad = match(a, b, diff);
    await fs.writeFile(path.join(out, `${vp.name}${tag}${suffix}.diff.png`), PNG.sync.write(diff));

    const sections = refShot.sections || JSON.parse(await fs.readFile(path.join(ref, `${vp.name}.sections.json`), 'utf8'));
    const perSection = sections
      // sections can start above the page (a skip link parked at y -80) or run past it: score the visible part
      .filter((s) => s.height > 0 && s.y < h && s.y + s.height > 0)
      .map((s) => {
        const y0 = Math.max(0, s.y);
        const sh = Math.min(s.y + s.height, h) - y0;
        const miss = match(crop(a, y0, sh), crop(b, y0, sh));
        return { index: s.index, label: s.heading || s.id || s.classes || s.tag, y: s.y, height: s.height, match: +(100 - (miss / (w * sh)) * 100).toFixed(2) };
      });
    const v = {
      viewport: vp.name,
      match: +(100 - (bad / (w * h)) * 100).toFixed(2),
      heightRef: a0.height,
      heightClone: b0.height,
      excludedViewMounted: excluded.length,
      worstSections: [...perSection].sort((x, y) => x.match - y.match).slice(0, 5),
      sections: perSection,
    };
    units.push({ route: routeKey, viewport: vp.name, value: v.match, members: perSection.map((s) => ({ id: `section-${s.index + 1}`, y: s.y, label: s.label, value: s.match })), heightRef: a0.height, heightClone: b0.height });
    return v;
  }
}
try {
  for (const r of routes) {
    const viewports = await scoreRoute(r);
    if (!r.slug) report.viewports = viewports;
    else report.routes.push({ path: r.path, slug: r.slug, viewports: viewports.map(({ sections, ...v }) => v) });
  }
} finally {
  if (!flags.cdp) await browser.close();
  server?.close();
}

await writeUnits(root, COMPARE, check, units, ident);
await mergeAggregate(path.join(out, `report${reduce ? '.reduce' : ''}${suffix}.json`), report);
console.log(`mode: ${report.mode}`);
console.table(report.viewports.map((v) => ({ viewport: v.viewport, 'match %': v.match, 'ref h': v.heightRef, 'clone h': v.heightClone, worst: v.worstSections[0] ? `${v.worstSections[0].label} (${v.worstSections[0].match}%)` : '-' })));
for (const r of report.routes) console.log(`route ${r.path}: ${r.viewports.map((v) => `${v.viewport} ${v.match}`).join('  ')}`);
console.log(`Diff images + report: ${path.relative(process.cwd(), out)}`);
