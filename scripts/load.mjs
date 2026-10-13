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
import { VIEWPORTS, parseArgs, openBrowser, newPage, serve, matchPct, cached, PNG, withTimeout } from './lib.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) {
  console.error('usage: trueclone load <name> [--viewport desktop|all] [--url <clone url>] [--refresh-ref]');
  process.exit(1);
}
const root = path.resolve('sites', name);
const meta = JSON.parse(await fs.readFile(path.join(root, 'reference', 'meta.json'), 'utf8'));
const vps = !flags.viewport || flags.viewport === 'all' ? VIEWPORTS : [VIEWPORTS.find((v) => v.name === flags.viewport)].filter(Boolean);
const TIMES = [250, 500, 1000, 2000, 4000];
const SETTLED = 98; // a frame this close to the final one counts as settled
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
    const nav = page.goto(url, { waitUntil: 'load', timeout: 60000 }).catch(() => null);
    for (const t of TIMES) {
      const wait = t0 + t - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      // the frame may be blank before the first byte (a valid part of the sequence)
      const shot = await withTimeout(page.screenshot({ fullPage: false, animations: 'allow' }), 5000, `load shot ${t}`).catch(() => null);
      frames[t] = shot ? PNG.sync.read(shot) : null;
      if (shot) await fs.writeFile(path.join(dir, `${vp.name}-${t}.png`), shot);
    }
    await nav;
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    await page.waitForTimeout(1500);
    const finalShot = await page.screenshot({ fullPage: false, animations: 'allow' });
    await fs.writeFile(path.join(dir, `${vp.name}-final.png`), finalShot);
    const final = PNG.sync.read(finalShot);
    const curve = {};
    for (const t of TIMES) curve[t] = frames[t] ? matchPct(frames[t], final).pct : 0;
    const settledAt = TIMES.find((t) => curve[t] >= SETTLED) ?? null;
    return { curve, settledAt };
  } finally {
    await context.close();
  }
}

const cloneUrl = typeof flags.url === 'string' ? flags.url : null;
const server = cloneUrl ? null : await serve(path.join(root, 'clone'));
const browser = await openBrowser(flags.cdp);
const viewports = [];
try {
  for (const vp of vps) {
    const ref = await cached(root, { tool: 'load', vp: vp.name, times: TIMES, network: NETWORK, v: 1 }, () => sequence(browser, meta.url, vp, path.join(root, 'reference', 'load')), Boolean(flags['refresh-ref']));
    const clone = await sequence(browser, cloneUrl || `${server.url}index.html`, vp, path.join(root, 'compare', 'load'));
    const gap = Object.fromEntries(TIMES.map((t) => [t, +Math.abs(ref.curve[t] - clone.curve[t]).toFixed(2)]));
    const score = +(100 - TIMES.reduce((s, t) => s + gap[t], 0) / TIMES.length).toFixed(2);
    viewports.push({ viewport: vp.name, score, gap, ref, clone });
    console.log(`${vp.name}: load match ${score}% (settled: reference ${ref.settledAt ?? '>4000'}ms, clone ${clone.settledAt ?? '>4000'}ms; curves ref ${TIMES.map((t) => ref.curve[t]).join('/')} clone ${TIMES.map((t) => clone.curve[t]).join('/')})`);
  }
} finally {
  if (!flags.cdp) await browser.close();
  server?.close();
}
await fs.mkdir(path.join(root, 'compare'), { recursive: true });
const out = path.join(root, 'compare', 'load.json');
const previous = await fs.readFile(out, 'utf8').then(JSON.parse).catch(() => null);
const merged = vps.length === VIEWPORTS.length || !previous ? viewports : [...(previous.viewports || []).filter((v) => !viewports.some((n) => n.viewport === v.viewport)), ...viewports];
await fs.writeFile(out, JSON.stringify({ at: new Date().toISOString(), clone: cloneUrl || server?.url, times: TIMES, network: NETWORK, viewports: merged }, null, 2));
console.log(`-> ${path.relative(process.cwd(), out)}`);
