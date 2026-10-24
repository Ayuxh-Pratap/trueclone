// An own bundle that has every page and file the capture has (exact mode, --bundle or a canvas app). The clone of an own
// bundle is the bundle (bundle.mjs): a page or file not in it is a 404 there. RC8 elise: the bundle was recorded on one
// load of the start page, so 5 of the 9 captured routes (Kruiz, AISS, NASA (Draft), Codazen, NASA) and 76 of the 144
// files the capture saved (the About page's photos, the project videos) were never in it; status called the bundle
// whole, the seed wrote 1 document, and every check on those pages failed with HTTP errors on 127.0.0.1 after 63 minutes
// of scoring.
//   bundleCoverage(): what the bundle still lacks: a document for each captured route, each file the capture saved
//   completeBundle(): each captured route loaded once more at desktop, recorded and scrolled through (its document, its
//     scripts, its lazy files, all recovered whole by the recorder), then each file the capture saved at any size that
//     the bundle still lacks, fetched whole by its address (lib.mjs fetchWhole: never a partial video, never an HTML
//     page standing in for a file)
import fs from 'node:fs/promises';
import path from 'node:path';
import { VIEWPORTS, openBrowser, newPage, settle, loadLive, recordBundle, recordFetched, fetchWhole, TRACKING_HOSTS } from './lib.mjs';
import { routeKey, routeUrl } from './routes.mjs';

const readJson = (f) => fs.readFile(f, 'utf8').then(JSON.parse, () => null);
const keyOf = (u) => { try { const x = new URL(u); return `${x.origin}${x.pathname}`; } catch { return null; } };
// an entry the clone serves as a page: a frame's document, or HTML recorded another way (a view prefetched by a shell)
export const isDocumentEntry = (e) => Boolean(e && !e.failed && e.file && (e.document || e.frameDocument || e.kind === 'document' || /text\/html/i.test(e.type || '')));
// the captured routes, the start page first
export const capturedRoutes = (meta) => [{ path: '/' }, ...(meta.routes || []).filter((r) => r.slug)];

export async function bundleCoverage(refDir, meta) {
  const manifest = await readJson(path.join(refDir, 'bundle', 'manifest.json'));
  if (!manifest) return { recorded: false, routes: [], assets: [] };
  const site = new URL(meta.finalUrl || meta.url);
  const entries = Object.entries(manifest.entries || {});
  const docs = new Set(entries.filter(([k, e]) => isDocumentEntry(e) && new URL(k).host === site.host).map(([k]) => routeKey(new URL(k).pathname)));
  const start = routeKey(site.pathname);
  const routes = capturedRoutes(meta).filter((r) => !docs.has(r.path === '/' ? start : routeKey(r.path)));
  const have = new Set(entries.filter(([, e]) => !e.failed && e.file).map(([k]) => k));
  const saved = (await readJson(path.join(refDir, 'assets', 'manifest.json'))) || [];
  const assets = [...new Set(saved.map((a) => a?.url).filter((u) => /^https?:/i.test(u || '') && !TRACKING_HOSTS.test(u)).map(keyOf).filter(Boolean))].filter((k) => !have.has(k));
  return { recorded: true, entries: entries.length, routes, assets };
}

export async function completeBundle(root, meta, { cdp = false, log = console.log } = {}) {
  const refDir = path.join(root, 'reference');
  const home = new URL(meta.finalUrl || meta.url);
  const desktop = VIEWPORTS.find((v) => v.name === 'desktop');
  const routeFailures = [];
  const browser = await openBrowser(cdp);
  try {
    for (const r of capturedRoutes(meta)) {
      const url = r.path === '/' ? home.href : routeUrl(r.path, home, true);
      const { context, page } = await newPage(browser, desktop);
      const finished = recordBundle(page, refDir);
      try {
        await loadLive(page, url);
        await settle(page, meta.hide || []);
        await finished();
        log(`  recorded ${r.path}`);
      } catch (e) {
        routeFailures.push({ path: r.path, error: String(e.message).split('\n')[0] });
        log(`  WARNING ${r.path} not recorded: ${String(e.message).split('\n')[0]}`);
      } finally { await context.close(); }
    }
    // what the capture saved at other sizes or behind interactions, and the pages above did not load: fetched whole
    const missing = (await bundleCoverage(refDir, meta)).assets;
    const saved = (await readJson(path.join(refDir, 'assets', 'manifest.json'))) || [];
    const typeOf = new Map(saved.filter((a) => a?.url).map((a) => [keyOf(a.url), String(a.contentType || '').split(';')[0].trim().toLowerCase()]));
    const kindOf = new Map(saved.filter((a) => a?.url).map((a) => [keyOf(a.url), a.type || 'other']));
    const context = await browser.newContext();
    let fetched = 0;
    try {
      for (const k of missing) {
        const got = await fetchWhole(context, k, { want: typeOf.get(k) || '' });
        await recordFetched(refDir, k, got, { kind: kindOf.get(k) });
        if (got.body) fetched++; else log(`  WARNING ${k} not fetched whole: ${got.failed}`);
      }
    } finally { await context.close(); }
    const coverage = await bundleCoverage(refDir, meta);
    return { routes: capturedRoutes(meta).length, routeFailures, fetched, tried: missing.length, coverage };
  } finally { if (!cdp) await browser.close(); }
}
