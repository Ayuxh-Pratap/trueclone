// Load sequence: what a visitor sees between the first byte and the settled page, on both sides, measured the same
// way. Each side loads in a fresh context (cold cache, cache disabled) on the same emulated network, and the visible
// viewport is photographed 250, 500, 1000, 2000 and 4000 ms after navigation starts, then once more when the page has
// settled. "Settled at t" is how much the frame at t already matches the final frame (pixel match), so a clone that
// paints a wrong skeleton for two seconds, or settles much later or earlier than the original, shows up as a gap
// between the two curves. The score is 100 minus the mean gap. Reference curves are cached per capture.
//
// usage: node scripts/load.mjs <name> [--viewport desktop|tablet|mobile|all] [--url <clone url>] [--refresh-ref]
//   -> sites/<name>/compare/load.json, frames in compare/load/ and reference/load/
import fs from 'node:fs/promises';
import path from 'node:path';
import { SCORED as VIEWPORTS, parseArgs, openBrowser, newPage, serve, matchPct, cached, readCache, PNG, withTimeout, COMPARE, SIDE, siteDir, withMachineLock } from './lib.mjs';
import { startIdentity } from './identity.mjs';
import { writeUnits } from './results.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) {
  console.error('usage: trueclone load <name> [--viewport desktop|all] [--url <clone url>] [--refresh-ref]');
  process.exit(1);
}
const root = siteDir(name);
const meta = JSON.parse(await fs.readFile(path.join(root, 'reference', 'meta.json'), 'utf8'));
const vps = !flags.viewport || flags.viewport === 'all' ? VIEWPORTS : [VIEWPORTS.find((v) => v.name === flags.viewport)].filter(Boolean);
const TIMES = [250, 500, 1000, 2000, 4000];
const SETTLED = 98; // a frame this close to the final one counts as settled
const NOISE_LIMIT = 15; // two runs of one side further apart than this: that side is unstable, the width is not scored
// the same network for both sides: the clone is served from this machine, the reference from a CDN, so both are
// bounded by the emulated link, not by where they come from
const NETWORK = { offline: false, latency: 40, downloadThroughput: 1.25e6, uploadThroughput: 6e5 };

async function sequence(browser, url, vp, dir) {
  const { context, page } = await newPage(browser, vp, { reducedMotion: 'no-preference' });
  try {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', NETWORK);
    await fs.mkdir(dir, { recursive: true });
    const frames = {};
    const t0 = Date.now();
    // a page that did not load (no answer, an error status) is no load sequence at all: the run fails and is never
    // kept, least of all as the reference (an error page cached as the original would score any clone)
    const nav = page.goto(url, { waitUntil: 'load', timeout: 60000 }).then((res) => ({ res }), (err) => ({ err }));
    for (const t of TIMES) {
      const wait = t0 + t - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      // the frame may be blank before the first byte (a valid part of the sequence)
      const shot = await withTimeout(page.screenshot({ fullPage: false, animations: 'allow' }), 5000, `load shot ${t}`).catch(() => null);
      frames[t] = shot ? PNG.sync.read(shot) : null;
      // a shot that did not come back in time is a missing frame, not a blank one (and an older file of that moment
      // must not stand in for it)
      if (shot) await fs.writeFile(path.join(dir, `${vp.name}-${t}.png`), shot);
      else await fs.rm(path.join(dir, `${vp.name}-${t}.png`), { force: true });
    }
    const loaded = await nav;
    if (loaded.err && !/Timeout/i.test(String(loaded.err.name || loaded.err.message))) throw new Error(`${url} did not load: ${String(loaded.err.message).split('\n')[0]}`);
    if (loaded.res && loaded.res.status() >= 400) throw new Error(`${url} answered HTTP ${loaded.res.status()}`);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    await page.waitForTimeout(1500);
    const finalShot = await page.screenshot({ fullPage: false, animations: 'allow' });
    await fs.writeFile(path.join(dir, `${vp.name}-final.png`), finalShot);
    const final = PNG.sync.read(finalShot);
    const curve = {};
    for (const t of TIMES) curve[t] = frames[t] ? matchPct(frames[t], final).pct : null;
    const settledAt = TIMES.find((t) => curve[t] >= SETTLED) ?? null;
    return { curve, settledAt };
  } finally {
    await context.close();
  }
}

const cloneUrl = typeof flags.url === 'string' ? flags.url : null;
const server = cloneUrl ? null : await serve(path.join(root, 'clone'));
const ident = await startIdentity(root, 'load', SIDE);
const units = [];
const browser = await openBrowser(flags.cdp);
const viewports = [];
try {
  // each side twice: a load is never the same twice (an image that arrives a frame later moves an intro), so the
  // curve is the mean of two runs and the spread between them is reported as the measurement's own noise
  const twice = async (url, dir, vp) => {
    // a run with a missing frame (a screenshot that timed out) gets one more run to fill it; a moment missing from
    // every run is left out of the comparison, never counted as a blank screen
    const runs = [await sequence(browser, url, vp, dir), await sequence(browser, url, vp, dir)];
    if (runs.some((r) => TIMES.some((t) => r.curve[t] === null))) runs.push(await sequence(browser, url, vp, dir));
    const curve = Object.fromEntries(TIMES.map((t) => { const v = runs.map((r) => r.curve[t]).filter((x) => x !== null); return [t, v.length ? +(v.slice(0, 2).reduce((x, y) => x + y, 0) / Math.min(2, v.length)).toFixed(2) : null]; }));
    const pairs = TIMES.map((t) => runs.map((r) => r.curve[t]).filter((x) => x !== null)).filter((v) => v.length >= 2);
    const noise = pairs.length ? +Math.max(...pairs.map((v) => Math.abs(v[0] - v[1]))).toFixed(2) : 0;
    const incomplete = TIMES.some((t) => curve[t] === null);
    return { curve, noise, settledAt: TIMES.find((t) => curve[t] !== null && curve[t] >= SETTLED) ?? null, runs, ...(incomplete ? { incomplete: true } : {}) };
  };
  for (const vp of vps) {
   try {
    // a reference run with a moment still missing is measured again next time, never kept as the reference
    const refKey = { tool: 'load', vp: vp.name, times: TIMES, network: NETWORK, v: 4 };
    // timed frames: one such measurement at a time on this machine (lib.mjs withMachineLock), whatever else runs
    const { ref, clone } = await withMachineLock(`load ${name} ${vp.name}`, async () => ({
      ref: await cached(root, refKey, () => twice(meta.url, path.join(root, 'reference', 'load'), vp), Boolean(flags['refresh-ref']) || Boolean((await readCache(root, refKey))?.incomplete)),
      clone: await twice(cloneUrl || `${server.url}index.html`, path.join(root, COMPARE, 'load'), vp),
    }));
    // the moments measured on both sides (a missing frame is left out, never scored as blank)
    const both = (curve) => TIMES.filter((t) => ref.curve[t] !== null && curve[t] !== null);
    const gap = Object.fromEntries(both(clone.curve).map((t) => [t, +Math.abs(ref.curve[t] - clone.curve[t]).toFixed(2)]));
    const noise = +Math.max(ref.noise, clone.noise).toFixed(2);
    const match = (curve) => { const ts = both(curve); return ts.length ? +(100 - ts.reduce((s, t) => s + Math.abs(ref.curve[t] - curve[t]), 0) / ts.length).toFixed(2) : null; };
    // Only the reference not agreeing with itself (an intro that starts a second later in one run) leaves nothing to
    // score against: that width is reported as unstable, like a probe. A clone that loads differently from one run to
    // the next is a defect, not noise: it is scored by its worse run (a visitor may get that one).
    const unstable = ref.noise > NOISE_LIMIT;
    const cloneUnstable = !unstable && clone.noise > NOISE_LIMIT;
    const score = unstable ? null : cloneUnstable ? Math.min(...clone.runs.map((r) => match(r.curve)).filter((x) => x !== null)) : match(clone.curve);
    viewports.push({ viewport: vp.name, at: new Date().toISOString(), score, unstable, cloneUnstable, noise, gap, ref, clone });
    units.push(unstable
      ? { viewport: vp.name, value: null, tool: `the reference loads differently each time (±${ref.noise} between runs of itself): no single curve to compare with`, noise: ref.noise }
      : { viewport: vp.name, value: score, noise, cloneUnstable, members: Object.entries(gap).map(([t, g]) => ({ id: `${t}ms`, value: +(100 - g).toFixed(2) })) });
    const curves = `curves ref ${TIMES.map((t) => ref.curve[t]).join('/')} clone ${clone.runs.map((r) => TIMES.map((t) => r.curve[t]).join('/')).join(' | ')}`;
    console.log(unstable
      ? `${vp.name}: load unstable (the reference differs by ±${ref.noise} between two runs of itself; not scored; ${curves})`
      : `${vp.name}: load match ${score}%${cloneUnstable ? ` (the clone loads differently each time, ±${clone.noise}: scored by its worse run)` : ` (noise ±${noise})`}; settled: reference ${ref.settledAt ?? '>4000'}ms, clone ${clone.settledAt ?? '>4000'}ms; ${curves}`);
   } catch (e) {
    const why = String(e.message).split('\n')[0];
    console.warn(`WARNING load ${vp.name}: ${why}`);
    units.push({ viewport: vp.name, value: null, error: why });
   }
  }
} finally {
  if (!flags.cdp) await browser.close();
  server?.close();
}
await fs.mkdir(path.join(root, COMPARE), { recursive: true });
await writeUnits(root, COMPARE, 'load', units, ident);
const out = path.join(root, COMPARE, 'load.json');
const previous = await fs.readFile(out, 'utf8').then(JSON.parse).catch(() => null);
// each size keeps the time it was measured (an older size merged in is never relabelled with this run's time)
const merged = vps.length === VIEWPORTS.length || !previous ? viewports : [...(previous.viewports || []).filter((v) => !viewports.some((n) => n.viewport === v.viewport)), ...viewports];
await fs.writeFile(out, JSON.stringify({ at: ident.startedAt, clone: cloneUrl || server?.url, times: TIMES, network: NETWORK, viewports: merged }, null, 2));
console.log(`-> ${path.relative(process.cwd(), out)}`);
