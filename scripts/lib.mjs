// Shared capture settings so the reference and the clone are rendered identically.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import fsSync, { createReadStream } from 'node:fs';
import http from 'node:http';
import zlib from 'node:zlib';
import path from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright';
import { canonicalPath, decodeEach, safeSegment } from './routes.mjs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export { PNG };

// A step whose reader went away (the agent's launcher timed out and was killed, a pipe closed) must keep working and
// finish: its results and logs are on disk. Node throws EPIPE on the next console write and the process dies with exit
// 1 and its error lost (RC6 varsity: calibrate exited 1 a second after its launcher's pipe was dropped, most likely so).
for (const s of [process.stdout, process.stderr]) s.on?.('error', (e) => { if (e?.code !== 'EPIPE') throw e; });
// The step's own log (bin/trueclone.mjs sets TC_LOG for a step on a site): everything this process and its children
// print, an uncaught error with its stack, and the step's end record in logs/commands.jsonl, written by the process
// itself, so nothing depends on who is still reading its console.
if (process.env.TC_LOG) {
  const logFile = process.env.TC_LOG;
  const append = (f, data) => { try { fsSync.appendFileSync(f, data); } catch { /* a log is never a reason to fail */ } };
  for (const s of [process.stdout, process.stderr]) {
    const write = s.write.bind(s);
    s.write = (chunk, ...rest) => { append(logFile, typeof chunk === 'string' ? chunk : Buffer.from(chunk)); try { return write(chunk, ...rest); } catch { return true; } };
  }
  process.on('uncaughtExceptionMonitor', (e, origin) => append(logFile, `\n# ${origin}: ${e?.stack || e}\n`));
  if (process.env.TC_JOURNAL && process.ppid === Number(process.env.TC_LAUNCHER_PID)) {
    process.on('exit', (code) => {
      const endedAt = new Date().toISOString();
      append(process.env.TC_JOURNAL, `${JSON.stringify({ event: 'end', step: process.env.TC_STEP, pid: process.pid, startedAt: process.env.TC_STEP_STARTED, endedAt, exit: code })}\n`);
      append(logFile, `# ${endedAt} exit ${code}\n`);
    });
  }
}

// The seed sizes: the clone is built from what the reference shows at these.
export const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];
// Held-out sizes: captured and scored, never read by anything that builds the clone. A clone that is right at the seed
// sizes and wrong here is fitted to the sizes it was built from, not a copy of the site.
export const HELD_OUT = [
  { name: 'laptop', width: 1280, height: 720, heldOut: true },
  { name: 'wide', width: 1920, height: 1080, heldOut: true },
];
export const SCORED = [...VIEWPORTS, ...HELD_OUT];
// --viewport for a tool that only looks (rules, explain): any scored size by name, or a width in pixels ("1366" or
// "1366x768"); anything else is a clear error, not a crash further down
export function viewportArg(v, list = SCORED) {
  const want = typeof v === 'string' ? v : 'desktop';
  const named = list.find((x) => x.name === want);
  if (named) return named;
  const m = /^(\d{3,4})(?:x(\d{3,4}))?$/.exec(want);
  if (m) return { name: `${m[1]}px`, width: Number(m[1]), height: Number(m[2] || 900) };
  console.error(`--viewport ${want}: use one of ${list.map((x) => x.name).join(', ')}, or a width in pixels (1366, 1366x768)`);
  process.exit(1);
}
// Where a score run writes (sites/<name>/<COMPARE>/, <REPORT_FILE>): the HTML clone's by default; `next --verify` sets
// compare-next / REPORT.next.md for the app, so the two never share or move each other's files.
export const COMPARE = process.env.TC_COMPARE || 'compare';

// A route given on the command line ("/about", "about"): Git Bash on Windows rewrites an argument that starts with "/"
// into a path inside its install folder ("C:/Program Files/Git/about"), so that is undone, and the leading slash is
// optional.
// The route's identity is the encoded path, as capture records it (routes.mjs): "/Landing Page.html" typed decoded is
// "/Landing%20Page.html".
export function routeArg(v) {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\\/g, '/').replace(/^[a-z]:\/.*?\/git(\/|$)/i, '/');
  return canonicalPath(`/${s.replace(/^\/+/, '')}`.replace(/\/+$/, '') || '/') || '/';
}

// sites/<name> from any folder inside the project: the current folder, the nearest parent that has sites/<name>, or
// the site folder itself (an agent that cd'd into sites/<name>). A new site (capture) goes in ./sites/<name>.
export function siteDir(name) {
  const here = path.resolve('sites', name);
  for (let d = process.cwd(); ; d = path.dirname(d)) {
    if (fsSync.existsSync(path.join(d, 'sites', name))) return path.join(d, 'sites', name);
    if (path.basename(d) === name && path.basename(path.dirname(d)) === 'sites') return d;
    if (path.dirname(d) === d) return here;
  }
}
export const REPORT_FILE = process.env.TC_REPORT || 'REPORT.md';

// Jump every animation/transition to its end state so screenshots are deterministic.
const FREEZE_CSS = `*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;
transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}`;

const MAX_SCROLL = 30000; // stop infinite-scroll pages from running forever

export function parseArgs(argv) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { flags[key] = next; i++; } else flags[key] = true;
    } else pos.push(a);
  }
  // routes as the site names them, whatever the shell did to the argument (see routeArg)
  if (typeof flags.route === 'string') flags.route = routeArg(flags.route);
  if (typeof flags.routes === 'string' && !/^\d+$/.test(flags.routes)) flags.routes = flags.routes.split(',').map((r) => routeArg(r.trim())).join(',');
  return { pos, flags };
}

export function siteName(url) {
  return new URL(url).hostname.replace(/^www\./, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
}

// --cdp attaches to the lab Chrome (npm run chrome) for sites that refuse headless browsers.
// Installed Google Chrome by default: Playwright's bundled Chromium has no H.264/AAC, so sites that wait
// for an HLS/MP4 video (intros, loaders) never finish loading in it. LAB_BROWSER=chromium forces the bundled one.
// Timers and frames never slowed down for a page the browser thinks is in the background (several checks share one
// machine; a canvas app's frames must keep coming at the same pace on both sides)
const BROWSER_ARGS = ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
export async function openBrowser(cdp) {
  if (cdp) return chromium.connectOverCDP(cdp === true ? 'http://127.0.0.1:9222' : cdp);
  if (process.env.LAB_BROWSER !== 'chromium') {
    try { return await chromium.launch({ channel: 'chrome', args: BROWSER_ARGS }); } catch { /* Chrome not installed: fall back */ }
  }
  return chromium.launch({ args: BROWSER_ARGS });
}

// The same "random" on both sides of a canvas app: Math.random replaced, before any script runs, by a generator with a
// fixed seed, so a scene that scatters particles or picks a colour at random draws the same on the reference and on
// the clone, and from one run to the next (an init script: pass to page.addInitScript or context.addInitScript)
// It counts its draws (window.__tcDraws): two sides that draw a different number of values before a shuffle show a
// different order for a reason the seed cannot remove, and the count says so.
export function seededRandomInPage(seed = 20261021) {
  let s = seed >>> 0;
  window.__tcDraws = 0;
  Math.random = function random() { window.__tcDraws++; s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Symmetric measurement (docs/plan-rc5/PLAN.md §4, decisions D1 and D2). Every page any check opens, on the reference
// and on the clone alike, is opened under the same controls, applied through the browser context only (never written
// into the clone's files):
//   seed    Math.random seeded the same on both sides, so a gallery shuffled at startup by the same rule shows the same
//           order (and a clone with another rule, or a fixed order, shows a different one)
//   clock   Date and performance start at the same instant on both sides (Playwright's clock, running at real speed:
//           timers and animation frames run as usual), so a page that shows the time or the date shows the same one
//   motion  prefers-reduced-motion: no-preference: the page every visitor without the setting sees is the one compared.
//           The reduced-motion page is a separate check (diff --reduce), never a stand-in for the animated one (D2)
//   loops   before a still, every endless CSS/WAAPI animation is put at the same time, LOOP_AGE ms, and held: equal and
//           not zero, so a stopped, reversed or faster loop is not at the same place (seekLoops)
// `TC_STABILISE=0` turns seed and clock off (the behaviour check's live pass opens its pages that way on purpose).
export const SEED = 20261021;
export const CLOCK_EPOCH = '2026-01-15T12:00:00.000Z';
export const LOOP_AGE = 2300;
// A still is taken at the same virtual age on both sides (holdStill): STILL_AGE ms after the page's DOMContentLoaded,
// with every timer due by then fired in order (an autoplay carousel that steps every 3 s is on the same slide), and the
// clock held while the picture is taken. RC4 shot the reference whenever the capture got there and the clone whenever
// its check did: the carousel was on another slide, and the reference "varied" against itself by 85-96 points there.
// 46.3 s, not a round number: a timer started at DOMContentLoaded with a common interval (1, 2, 2.5, 3, 4, 5, 6, 8 s)
// is at least 300 ms from a step here, and at every scroll step after it (states.mjs adds 10 s per step), so a few ms
// of jitter between two loads never lands one side a slide further (a hold at 45 s did, on a 3 s carousel)
export const STILL_AGE = 46300;
export const STABILISERS = { seed: SEED, clock: CLOCK_EPOCH, motion: 'no-preference', loops: `held at ${LOOP_AGE} ms`, stills: `at ${STILL_AGE / 1000} s of page time` };

// Hold the page's clock at `age` ms after its DOMContentLoaded: pause where it is (no jump), then run every timer and
// frame callback up to that age, in order. The page must have been opened with the clock (newPage). Returns whether it
// held, and whether the page was already older (then it is held where it is, and says so).
export async function holdStill(page, age = STILL_AGE) {
  try {
    const [now, dcl] = await page.evaluate(() => [Date.now(), window.__tcDcl || null]);
    if (!dcl) return { held: false, why: 'no clock on this page' };
    // paused 100 ms ahead of the time read (the page's clock runs on while this call travels): never in its past
    await page.clock.pauseAt(now + 100);
    const elapsed = now + 100 - dcl;
    if (elapsed < age) await page.clock.runFor(age - elapsed);
    return { held: true, age: Math.max(age, elapsed), late: elapsed > age };
  } catch (e) { return { held: false, why: String(e.message).split('\n')[0] }; }
}
export const releaseStill = (page) => page.clock.resume().catch(() => {});

// Own-bundle recording (exact mode, a canvas app, with the owner's permission): every response the app loads (its
// documents, scripts and modules, wasm decoders, workers, models, textures, data), saved at its own address under
// reference/bundle/<host>/<path> with a manifest, so the clone can run the site's own code on its own files. Tracking
// is never saved; requests that are not GET (a form, a backend write) are never saved either.
const TRACKING_HOSTS = /google-analytics|googletagmanager|doubleclick|facebook\.(com|net)|hotjar|segment\.(io|com)|plausible|cloudflareinsights|clarity\.ms|sentry|datadog|mixpanel|amplitude|posthog|intercom|hubspot|linkedin\.com\/px|tiktok|bat\.bing|snap\.licdn|vercel-insights|vitals\.vercel/i;
//
// What the browser hands over is checked before it is kept (RC5 zero: nine textures and videos saved as 0-byte files).
// Chrome's DevTools protocol (Network.getResponseBody, under Playwright's response.body()) returns an EMPTY body for a
// fetch the page consumes as a Blob (`fetch(u).then((r) => r.blob())`), although the bytes arrived: the browser streams
// such bodies straight into its blob store, past the DevTools buffer. So every body is compared with what the browser
// says it received (request.sizes().responseBodySize: the body's bytes on the wire, with any content encoding and any
// chunked framing, so it only tells "nothing arrived" from "something arrived") and with the length the server
// declared (Content-Length, comparable to the body only when the body is not content-encoded):
//   ok          the body as received
//   empty       nothing arrived (a 204, a zero-length answer): legitimately empty, kept as such
//   lost        an empty body although bytes arrived: recovered
//   incomplete  not content-encoded, with a declared length the body does not have: recovered
//   partial     a 206 range answer (a video element streaming): the whole file is recovered
// Recovery asks for the same address again through the page's own browser context (its cookies, the request's headers,
// no Range), at most twice, and keeps the answer only when it is the same resource: status 200, the same address after
// any redirect, the same media type, not an HTML page standing in for something else, and its own declared length.
// Two answers that agree a resource is empty (the browser's and the recovery's) make it legitimately empty. Otherwise
// the entry is recorded as failed, with why; a file is never taken as recorded merely because it exists
// (bundleIntegrity reads the manifest, not the folder). Each entry says how it was obtained.
export function bodyVerdict({ status, bodyLength, wireBytes, encoding, contentLength }) {
  if (status === 206) return 'partial';
  if (status === 204) return 'empty';
  if (bodyLength === 0) return wireBytes === 0 || contentLength === 0 ? 'empty' : 'lost';
  const encoded = encoding && !/^identity$/i.test(encoding);
  if (!encoded && Number.isFinite(contentLength) && bodyLength !== contentLength) return 'incomplete';
  return 'ok';
}
const declared = (h) => (h['content-length'] !== undefined && /^\d+$/.test(h['content-length']) ? Number(h['content-length']) : undefined);
const baseType = (t) => String(t || '').split(';')[0].trim().toLowerCase();
const HOP = /^(:|host$|content-length$|range$|if-range$|cookie$|connection$|accept-encoding$)/i;
// the same resource asked for again through the page's browser context; returns { body, via } or { failed }
export async function recoverBody(context, req, res, { attempts = 2 } = {}) {
  const url = res.url();
  const want = baseType(res.headers()['content-type']);
  const headers = Object.fromEntries(Object.entries(await req.allHeaders().catch(() => ({}))).filter(([k]) => !HOP.test(k)));
  let why = 'not tried';
  for (let i = 1; i <= attempts; i++) {
    try {
      const r = await context.request.get(url, { headers, timeout: 60000, maxRedirects: 5 });
      const body = await r.body();
      const h = r.headers();
      const got = baseType(h['content-type']);
      // the length the recovery's own answer declared, when its body arrives as declared (Playwright decodes an
      // encoded body, so an encoded answer's length cannot be checked)
      const enc = h['content-encoding'] && !/^identity$/i.test(h['content-encoding']);
      const len = enc ? undefined : declared(h);
      if (r.status() !== 200) why = `answered HTTP ${r.status()}`;
      else if (r.url() !== url) why = `redirected to ${r.url()}`;
      else if (want && got && got !== want) why = `answered ${got}, not ${want}`;
      else if (!/html/.test(want) && /html/.test(got)) why = 'answered an HTML page';
      else if (Number.isFinite(len) && body.length !== len) why = `answered ${body.length} of the ${len} bytes it declared`;
      else return { body, attempts: i, ...(body.length ? {} : { empty: true }) };
    } catch (e) { why = String(e.message).split('\n')[0]; }
  }
  return { failed: why, attempts };
}
export function recordBundle(page, refDir) {
  const dir = path.join(refDir, 'bundle');
  const manifestFile = path.join(dir, 'manifest.json');
  let pending = Promise.resolve();
  page.on('response', (res) => {
    pending = pending.then(async () => {
      try {
        const req = res.request();
        const u = new URL(res.url());
        if (req.method() !== 'GET' || !/^https?:$/.test(u.protocol) || TRACKING_HOSTS.test(u.href) || res.status() >= 300) return;
        let body = await res.body().catch(() => null);
        const wireBytes = await req.sizes().then((s) => s.responseBodySize, () => null);
        const encoding = res.headers()['content-encoding'] || '';
        let verdict = body ? bodyVerdict({ status: res.status(), bodyLength: body.length, wireBytes, encoding, contentLength: declared(res.headers()) }) : 'lost';
        let via = 'browser', failed = null, tries = 0;
        if (['lost', 'incomplete', 'partial'].includes(verdict)) {
          const r = await recoverBody(page.context(), req, res);
          tries = r.attempts;
          if (r.body) { body = r.body; via = 'recovered'; if (r.empty) verdict = 'empty'; } else failed = r.failed;
        }
        if (body && body.length > 300 * 1024 * 1024) return;
        // the same file name rule as every route and the clone server (routes.mjs): a bare % never throws here
        let rel = decodeEach(u.pathname);
        if (rel.endsWith('/')) rel += 'index.html';
        const parts = rel.split('/').filter((p) => p && p !== '..' && p !== '.').map(safeSegment);
        if (!parts.length) parts.push('index.html');
        const file = path.join(dir, u.host.replace(/[:]/g, '_'), ...parts);
        const key = `${u.origin}${u.pathname}`;
        const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8').catch(() => '{"entries":{}}'));
        const had = manifest.entries[key];
        const base = { type: res.headers()['content-type'] || '', kind: req.resourceType(), document: req.isNavigationRequest() && req.frame() === page.mainFrame(), status: res.status(), wireBytes, encoding, at: new Date().toISOString() };
        if (failed) {
          // a good copy recorded earlier (another load of the same address) is kept; otherwise the failure is recorded
          if (had && had.via && !had.failed && had.bytes > 0) return;
          await fs.rm(file, { force: true });
          manifest.entries[key] = { ...base, failed: `${verdict} body (${body ? body.length : 'unreadable'} of ${wireBytes ?? '?'} bytes), recovery ${failed}`, attempts: tries };
        } else {
          await fs.mkdir(path.dirname(file), { recursive: true });
          await fs.writeFile(file, body);
          manifest.entries[key] = { ...base, file: path.relative(dir, file).split(path.sep).join('/'), bytes: body.length, sha1: crypto.createHash('sha1').update(body).digest('hex'), via, ...(via === 'recovered' ? { recoveredFrom: verdict, attempts: tries } : {}), ...(verdict === 'empty' ? { empty: true } : {}) };
        }
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(manifestFile, JSON.stringify(manifest, null, 1));
      } catch { /* a response that cannot be read at all (the page closed) is left out */ }
    });
  });
  // await it before closing the page: until every response seen so far is recorded or recovered, and no new one has
  // joined for a quarter of a second (a texture requested while the last one was being written is not cut off)
  return async () => {
    for (;;) {
      const at = pending;
      await at;
      await new Promise((r) => setTimeout(r, 250));
      if (at === pending) return;
    }
  };
}

// Is the recorded bundle whole? Read from the manifest's own record of each file, never from the folder alone: an entry
// that failed, a file missing or of another size than recorded, and (bundles recorded before rc.6, which kept no
// record) any empty file not recorded as legitimately empty.
export async function bundleIntegrity(refDir) {
  const dir = path.join(refDir, 'bundle');
  const manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8').catch(() => 'null'));
  if (!manifest) return { recorded: false, problems: [] };
  const problems = [];
  for (const [url, e] of Object.entries(manifest.entries || {})) {
    if (e.failed) { problems.push({ url, why: e.failed }); continue; }
    const st = await fs.stat(path.join(dir, ...String(e.file || '').split('/'))).catch(() => null);
    if (!e.file || !st) problems.push({ url, why: 'its file is missing' });
    else if (typeof e.bytes === 'number' && st.size !== e.bytes) problems.push({ url, why: `its file has ${st.size} bytes, ${e.bytes} were recorded` });
    else if (st.size === 0 && !e.empty) problems.push({ url, why: e.via ? 'empty' : 'empty (recorded before rc.6)' });
  }
  return { recorded: true, entries: Object.keys(manifest.entries || {}).length, problems };
}

// One timing-sensitive measurement at a time across every trueclone process on this machine (load sequences, reveals
// and other frame-timed reads): several clones scored in parallel share the CPU and GPU, and a frame-timed check run
// beside another heavy one measures the contention, not the page. A lock file in the system temp folder; a lock older
// than its holder's limit, or whose holder is no longer running, is taken over. Everything else runs in parallel.
// The holder's process id is in the file: a step killed on its time limit never runs its `finally` (RC6 heybhaskar's
// behaviour, killed by score), and its lock used to block every other run for 20 minutes while doctor called it "a
// measurement running".
export const timingLockFile = () => path.join(os.tmpdir(), 'trueclone-timing.lock');
export const pidAlive = (pid) => { if (!Number(pid)) return false; try { process.kill(Number(pid), 0); return true; } catch (e) { return e.code === 'EPERM'; } };
export async function timingLockHolder(file = timingLockFile()) {
  const held = await fs.readFile(file, 'utf8').catch(() => null);
  if (held === null) return null;
  const parts = held.split(':');
  const pid = Number(parts[0]), since = Number(parts.at(-1)) || 0;
  return { pid, label: parts.slice(1, -1).join(':') || '?', since, alive: pidAlive(pid), raw: held };
}
// Remove the lock if a given (killed) process holds it: score calls this after killing a step on its time limit
export async function releaseTimingLockOf(pid, file = timingLockFile()) {
  const h = await timingLockHolder(file);
  if (h && h.pid === Number(pid) && !h.alive) await fs.rm(file, { force: true });
}
export async function withMachineLock(label, fn, { limitMs = 20 * 60 * 1000 } = {}) {
  const file = timingLockFile();
  const me = `${process.pid}:${label}:${Date.now()}`;
  let waited = 0, said = false;
  for (;;) {
    try {
      await fs.writeFile(file, me, { flag: 'wx' });
      break;
    } catch {
      const h = await timingLockHolder(file);
      if (!h) continue; // released between the two calls
      if (!h.alive || Date.now() - h.since > limitMs) {
        // taken over only if it is still the same stale lock (another process may have just taken a fresh one)
        if ((await fs.readFile(file, 'utf8').catch(() => null)) === h.raw) await fs.rm(file, { force: true });
        continue;
      }
      const held = h.raw;
      if (!said && waited > 2000) { console.log(`waiting for another trueclone measurement to finish (${held.split(':')[1] || 'timing'}), so the two do not distort each other`); said = true; }
      await new Promise((r) => setTimeout(r, 1000));
      waited += 1000;
    }
  }
  // the wait is reported (score sums it per step): time spent queueing is not time spent measuring
  if (waited >= 2000) console.log(`waited ${Math.round(waited / 1000)}s for another trueclone measurement (${label})`);
  try { return await fn(); } finally { if ((await fs.readFile(file, 'utf8').catch(() => '')) === me) await fs.rm(file, { force: true }); }
}

// One locale for every page, so a site that picks its variant by language or region (stripe.com -> /in) shows the
// same one to the capture and to every check. `capture --locale` sets it; score passes it on (TC_LOCALE).
export const LOCALE = process.env.TC_LOCALE || 'en-US';
// The reference's own visit settings, on every page any check opens on the reference's host, from the first byte: the
// hide list (capture --hide: a cookie banner, a popup a region gets by its IP) and the cookies the capture was given
// (capture --cookie "consent=1; region=us": a choice any visitor makes, never a login). Without them a check compares
// the clone with a page under a popup. Read from the capture of the site the command names (every check is called
// with the site's name first), or set by capture itself before it has written meta.json. The clone is never touched.
// The read is remembered as a promise, never as a value set before the read finishes: checks open their viewports in
// parallel, and every one of them must wait for the same profile (RC4 allbirds: the first page got the hide list, the
// other four got null, and four sizes were measured against a page under a dialog).
let referenceProfile;
export function setReferenceProfile(p) { referenceProfile = Promise.resolve(p); }
function profileOfSite() {
  referenceProfile ??= (async () => {
    const [name] = parseArgs(process.argv.slice(2)).pos;
    if (!name || /^https?:/i.test(name)) return null;
    const meta = JSON.parse(await fs.readFile(path.join(siteDir(name), 'reference', 'meta.json'), 'utf8').catch(() => 'null'));
    return meta?.url ? { url: meta.finalUrl || meta.url, hide: meta.hide || [], ignore: (meta.ignore || []).map((i) => i.sel), cookies: meta.cookies || [], unroll: meta.unroll || 'xy' } : null;
  })();
  return referenceProfile;
}
export const referenceProfileOfSite = () => profileOfSite();
// "a=1; b=2" -> [{ name, value }]
export const parseCookies = (s) => String(s || '').split(';').map((p) => p.trim()).filter((p) => p.includes('=')).map((p) => ({ name: p.slice(0, p.indexOf('=')).trim(), value: p.slice(p.indexOf('=') + 1).trim() }));

export async function newPage(browser, vp, { stabilise = process.env.TC_STABILISE !== '0', seed = SEED, ...extra } = {}) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
    locale: LOCALE,
    extraHTTPHeaders: { 'accept-language': `${LOCALE},${LOCALE.split('-')[0]};q=0.9` },
    ...extra,
  });
  if (stabilise) {
    await context.clock.install({ time: new Date(CLOCK_EPOCH) });
    await context.addInitScript(seededRandomInPage, seed);
    // the page's own time zero for holdStill: DOMContentLoaded, in page time
    await context.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { window.__tcDcl = Date.now(); }, { once: true }));
  }
  const ref = await profileOfSite();
  if (ref && (ref.hide.length || ref.cookies.length)) {
    const host = new URL(ref.url).hostname.replace(/^www\./, '');
    if (ref.cookies.length) await context.addCookies(ref.cookies.map((c) => ({ name: c.name, value: c.value, domain: `.${host}`, path: '/' }))).catch((e) => console.warn(`WARNING cookies not set: ${e.message}`));
    // an adopted sheet exists before the page's first element, and no script of the site removes it
    if (ref.hide.length) await context.addInitScript(([h, css]) => {
      if (location.hostname.replace(/^www\./, '') !== h && !location.hostname.endsWith(`.${h}`)) return;
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      const adopt = () => { if (!document.adoptedStyleSheets.includes(sheet)) document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]; };
      adopt();
      document.addEventListener('DOMContentLoaded', adopt);
    }, [host, ref.hide.map((s) => `${s}{display:none!important}`).join('\n')]);
  }
  // Excluded content (meta.ignore: third-party widgets by default, decision D3) is hidden on EVERY page, the reference
  // and the clone alike: the same exclusion on both sides, so it can neither cost the clone nor hide one of its defects
  // (a clone that keeps an excluded widget fails the clone lint, verdict.mjs; review's clone-only test sees the rest)
  if (ref?.ignore?.length) await context.addInitScript((css) => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    const adopt = () => { if (!document.adoptedStyleSheets.includes(sheet)) document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]; };
    adopt();
    document.addEventListener('DOMContentLoaded', adopt);
  }, ref.ignore.map((s) => `${s}{display:none!important}`).join('\n'));
  const page = await context.newPage();
  // Hard limits on Playwright actions: a stuck click or navigation fails loudly instead of hanging for hours.
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(60000);
  // Surface script errors immediately: one uncaught error can stop a clone's whole motion layer and
  // turn every score into noise, which is much harder to diagnose from the numbers alone.
  page.on('pageerror', (e) => console.warn(`PAGE ERROR (${page.url()}): ${e.message}`));
  return { context, page };
}

// Navigate and wait for the load event for as long as the page keeps loading. A heavy page on a slow link is slow, not
// broken (RC7 elise: 21 MB of autoplaying video and photos at ~300 KB/s reached load at 46-57 s alone, later when
// several reads shared the link, and a fixed 60 s limit failed every read): the limit is on silence, `stall` ms with
// no byte received and no request starting or ending, with a `ceiling` on the whole load. The load event itself is
// still required: nothing here measures a page before it.
// Returns { loaded, ms, stalled } (stalled: the page went silent; otherwise the ceiling was reached).
export async function gotoLoaded(page, url, { stall = 30000, ceiling = 600000 } = {}) {
  const t0 = Date.now();
  let last = t0, loadedAt = null;
  const bump = () => { last = Date.now(); };
  const onLoad = () => { loadedAt = Date.now(); };
  const events = ['request', 'requestfinished', 'requestfailed', 'response'];
  for (const e of events) page.on(e, bump);
  page.on('load', onLoad);
  // bytes arriving on a long download (a video) show progress no request event does: Chromium's network events
  let cdp = null;
  try { cdp = await page.context().newCDPSession(page); await cdp.send('Network.enable'); cdp.on('Network.dataReceived', bump); } catch { cdp = null; }
  try {
    await page.goto(url, { waitUntil: 'commit', timeout: 60000 });
    for (;;) {
      if (loadedAt) return { loaded: true, ms: loadedAt - t0, stalled: false };
      if (Date.now() - last > stall) return { loaded: false, ms: Date.now() - t0, stalled: true };
      if (Date.now() - t0 > ceiling) return { loaded: false, ms: Date.now() - t0, stalled: false };
      await new Promise((r) => setTimeout(r, 250));
    }
  } finally {
    for (const e of events) page.off(e, bump);
    page.off('load', onLoad);
    if (cdp) await cdp.detach().catch(() => {});
  }
}
const notLoaded = (r, stall, ceiling) => (r.stalled ? `nothing arrived for ${stall / 1000}s (a request that never finishes)` : `still loading after ${ceiling / 1000}s`);

// The live page, loaded for a capture: the load event is required. A page that goes silent or never finishes loading is
// the live page not loading (owner: the environment), named with what was seen.
export async function loadLive(page, url, { stall = 30000, ceiling = 600000 } = {}) {
  const r = await gotoLoaded(page, url, { stall, ceiling });
  if (!r.loaded) throw new Error(`the live page did not load (${notLoaded(r, stall, ceiling)} after ${Math.round(r.ms / 1000)}s): ${url}`);
  return r;
}

// Open a page for measuring. A live page whose load event never comes because a request hangs (a third-party beacon)
// is still the page a visitor sees once it is parsed: on a stall the check carries on from DOMContentLoaded, says so,
// and settles as usual, instead of failing the whole check. A page still loading is waited for (gotoLoaded).
export async function openUrl(page, url, { stall = 30000, ceiling = 600000 } = {}) {
  const r = await gotoLoaded(page, url, { stall, ceiling });
  if (r.loaded) return r;
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
  console.warn(`WARNING ${url}: no load event: ${notLoaded(r, stall, ceiling)}; measured from the parsed page`);
  return r;
}

// page.evaluate has no timeout in Playwright; anything that loops over evaluate goes through this.
export function withTimeout(promise, ms, label) {
  let timer;
  const guard = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms: ${label}`)), ms); });
  return Promise.race([promise.finally(() => clearTimeout(timer)), guard]);
}

// Reference results don't change between clone iterations: measure once, reuse until the next capture.
// The key includes the capture time, so `npm run capture` invalidates everything automatically.
async function cacheFile(siteRoot, keyObj) {
  const meta = JSON.parse(await fs.readFile(path.join(siteRoot, 'reference', 'meta.json'), 'utf8'));
  // cache generation 2 (rc.5): every reference measurement made before the profile fix (lib.mjs profileOfSite) is
  // discarded, since it may have been taken without the hide list
  const key = crypto.createHash('sha1').update(JSON.stringify({ gen: 2, capturedAt: meta.capturedAt, ...((meta.hide || []).length || (meta.cookies || []).length || (meta.ignore || []).length ? { visit: [meta.hide, meta.cookies, meta.ignore] } : {}), ...keyObj })).digest('hex').slice(0, 16);
  return path.join(siteRoot, 'reference', 'cache', `${key}.json`);
}

// Read-only lookup: the cached value, or null (never writes).
export async function readCache(siteRoot, keyObj) {
  try { return JSON.parse(await fs.readFile(await cacheFile(siteRoot, keyObj), 'utf8')); } catch { return null; }
}

export async function cached(siteRoot, keyObj, compute, refresh = false) {
  const file = await cacheFile(siteRoot, keyObj);
  if (!refresh) {
    try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { /* not cached yet */ }
  }
  const value = await compute();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value));
  return value;
}

// An app shell (a fixed sidebar beside a content pane that scrolls on its own, the document never scrolling): every
// whole-page measure (a full-page shot, scroll states, sections) would see one screen. The pane and its ancestors are
// let grow to their content, with a stylesheet and marks only (never inline styles, removed before any HTML is saved),
// so the page scrolls like a document: done the same way on the reference and on the clone. Returns what was unrolled.
export function unrollInPage(axis = 'y') {
  if (document.getElementById('tc-unroll')) return document.getElementById('tc-unroll').dataset.what || null;
  const doc = document.scrollingElement || document.documentElement;
  if (doc.scrollHeight > innerHeight + 4) return null; // the document scrolls: nothing to do
  const scrolls = (el) => { const s = getComputedStyle(el); return /(auto|scroll|overlay)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 40; };
  // the pane a visitor scrolls: the one under the middle of the screen (an open sheet over the page, the content pane
  // beside a sidebar), otherwise the largest that scrolls
  let pick = null;
  for (let el = document.elementFromPoint(innerWidth / 2, innerHeight / 2); el && el !== document.body; el = el.parentElement) if (scrolls(el)) { pick = el; break; }
  if (!pick) {
    let best = 0;
    for (const el of document.querySelectorAll('body *')) {
      if (!scrolls(el)) continue;
      const r = el.getBoundingClientRect();
      const area = r.width * r.height;
      if (area >= innerWidth * innerHeight * 0.3 && area > best) { pick = el; best = area; }
    }
  }
  if (!pick) return null;
  pick.setAttribute('data-tc-unroll', 'pane');
  // a fixed container (a sheet, an overlay) does not add to the page's height: while unrolled it is placed in the
  // page instead, from the top, so its whole content is part of the page
  for (let p = pick; p; p = p.parentElement) {
    if (p !== pick) p.setAttribute('data-tc-unroll', '');
    if (getComputedStyle(p).position === 'fixed') p.setAttribute('data-tc-unroll', p === pick ? 'pane fixed' : 'fixed');
  }
  const st = document.createElement('style');
  st.id = 'tc-unroll';
  st.dataset.what = `${pick.tagName.toLowerCase()}${pick.id ? `#${pick.id}` : ''}${pick.classList.length ? `.${[...pick.classList].slice(0, 2).join('.')}` : ''}`;
  // axis "y" (captures from 0.5.0-rc.3, meta.unroll): vertically only, so a horizontal ticker or a closed sideways
  // drawer inside stays clipped at the side. overflow-x is clip, not hidden: next to hidden (or auto), overflow-y:
  // visible computes to auto and the pane would still scroll. "xy" (older captures): both axes, as they were shot.
  st.textContent = `[data-tc-unroll]{height:auto!important;max-height:none!important;${axis === 'y' ? 'overflow-x:clip!important;overflow-y:visible!important' : 'overflow:visible!important'}}[data-tc-unroll~="fixed"]{position:absolute!important}`;
  document.head.append(st);
  return st.dataset.what;
}
// The clone is unrolled exactly as the reference was when it was captured (meta.unroll), so both sides match. A clone's
// scripts may open a view at load (a case study's sheet at its own address; in the Next app they run after hydration,
// later than in the HTML clone): the pane to unroll is the one they leave, so the boot contract is waited for first
// (tc-boot released: every clone script has run). A reference never has it.
export const unroll = async (page) => {
  await page.waitForFunction(() => !document.documentElement.classList.contains('tc-boot'), null, { timeout: 5000 }).catch(() => {});
  return page.evaluate(unrollInPage, (await profileOfSite())?.unroll || 'xy').catch(() => null);
};

export async function settle(page, hide = []) {
  const hideCss = hide.length ? `${hide.join(',')}{display:none!important}` : '';
  const tag = await page.addStyleTag({ content: FREEZE_CSS + hideCss });
  await tag.evaluate((el) => el.setAttribute('data-lab-freeze', ''));
  await unroll(page);
  // Scroll the whole page once so lazy images and in-view reveals load.
  await page.evaluate(async (max) => {
    const step = Math.max(200, window.innerHeight * 0.8);
    for (let y = 0; y < Math.min(document.documentElement.scrollHeight, max); y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 150));
    }
    window.scrollTo(0, 0);
  }, MAX_SCROLL);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
}

// Structure mode: hide glyphs and turn every image/video/svg/background photo into a flat grey box,
// so a clone with placeholder content can be scored on layout alone. Applied to both sides.
// An iframe is a flat grey box too, never hidden: its content is masked (contrast(0) flattens whatever the frame
// paints, an empty or transparent frame shows the #888 background), its presence and box are compared. RC6-23: hidden,
// an iframe shell whose stage was empty in the clone scored 100 on elise's start page.
const MASK_CSS = `*,*::before,*::after{color:transparent!important;text-shadow:none!important;
-webkit-text-stroke-color:transparent!important;text-decoration-color:transparent!important}
::placeholder{color:transparent!important}
img,video{object-position:-99999px -99999px!important;background:#888!important}
svg{background:#888!important} svg *{visibility:hidden!important}
canvas,iframe{background:#888!important;filter:contrast(0) brightness(1.066)!important}
[data-lab-cliptext]{background:none!important;-webkit-text-fill-color:transparent!important}
[data-lab-bgi]{background-image:none!important;background-color:#888!important}
[data-lab-bgb]::before,[data-lab-bga]::after{background-image:none!important;background-color:#888!important}`; // canvas = media (WebGL heroes, 3D models): flat grey box like images
// The mask the reference's masked shots were taken with (capture records it in meta.maskVersion): a clone masked one
// way against a reference masked another is no comparison (rc.7 replay: elise's start page 5.33 against an rc.6 mask
// that hid the iframes the rc.7 mask paints), so status captures again when the two differ
export const MASK_VERSION = crypto.createHash('sha1').update(MASK_CSS).digest('hex').slice(0, 8);

// What CSS alone can't select: photo backgrounds (a script that rewrites an element's inline background every frame
// would undo an inline override, so the mask is a stylesheet rule on a marker attribute, which inline styles lose
// to), gradient text (background-clip: text paints the glyphs with its background, so a transparent colour still
// shows the letters) and photo backgrounds on ::before/::after. `off` removes the markers.
// A script that rebuilds or restyles media after the mask went on (a resize during a full-page shot rebuilds a grid)
// would leave the new elements unmasked on one side only; an observer marks them as they appear, on both sides.
function maskExtrasInPage(enable) {
  const marks = ['data-lab-bgi', 'data-lab-cliptext', 'data-lab-bgb', 'data-lab-bga'];
  if (!enable) {
    window.__labMaskObserver?.disconnect();
    window.__labMaskObserver = null;
    for (const m of marks) for (const el of document.querySelectorAll(`[${m}]`)) el.removeAttribute(m);
    return;
  }
  const markOne = (el) => {
    const s = getComputedStyle(el);
    if (s.backgroundImage.includes('url(')) el.setAttribute('data-lab-bgi', '');
    if (s.backgroundClip === 'text' || s.webkitBackgroundClip === 'text') el.setAttribute('data-lab-cliptext', '');
    if (getComputedStyle(el, '::before').backgroundImage.includes('url(')) el.setAttribute('data-lab-bgb', '');
    if (getComputedStyle(el, '::after').backgroundImage.includes('url(')) el.setAttribute('data-lab-bga', '');
  };
  for (const el of document.querySelectorAll('*')) markOne(el);
  window.__labMaskObserver?.disconnect();
  window.__labMaskObserver = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'attributes') {
        if (!(r.target instanceof Element) || marks.includes(r.attributeName)) continue;
        markOne(r.target);
        // a custom property or url() set on an ancestor (--hero-img) reaches its descendants' backgrounds
        if (/url\(|--/.test(r.target.getAttribute('style') || '')) for (const el of r.target.querySelectorAll('*')) markOne(el);
        continue;
      }
      for (const n of r.addedNodes) if (n instanceof Element) { markOne(n); for (const el of n.querySelectorAll('*')) markOne(el); }
    }
  });
  window.__labMaskObserver.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class'] });
}

export async function mask(page) {
  const tag = await page.addStyleTag({ content: MASK_CSS });
  await tag.evaluate((el) => el.setAttribute('data-lab-freeze', ''));
  await page.evaluate(maskExtrasInPage, true);
  await page.waitForTimeout(200);
}

// Endless animations (marquees, rotating borders, pulsing glows) sit at whatever phase the page's clock happens to
// be at, so two screenshots of the same page differ. Before a still comparison, every infinite animation is put at the
// same time and held, on both sides: LOOP_AGE ms, not 0. At 0 a stopped marquee looks exactly like a running one
// (RC4 put every loop on its first frame, so a clone with no marquee animation passed); at an equal, non-zero time a
// stopped, reversed or faster loop is somewhere else. Loops a script drives frame by frame are not CSS/WAAPI animations:
// the behaviour check measures their speed and direction on the live page.
// A finite animation or transition still running at that moment (a slide a timer just started) is finished: its end
// state is the same on both sides, its halfway point depends on when the picture happened to be taken.
export async function seekLoops(page, age = LOOP_AGE) {
  return page.evaluate((t) => {
    let n = 0;
    for (const a of document.getAnimations()) {
      if (a.effect?.getTiming().iterations !== Infinity) { if (a.playState === 'running') a.finish(); continue; }
      a.pause();
      a.currentTime = t;
      n++;
    }
    return n;
  }, age).catch(() => 0);
}

// Reversible version of mask() for live pages: on() masks, off() removes the stylesheet and every marker.
export async function maskToggle(page, on) {
  await page.evaluate(([css, enable]) => {
    if (enable) {
      const tag = document.createElement('style');
      tag.id = 'lab-mask';
      tag.setAttribute('data-lab-freeze', '');
      tag.textContent = css;
      document.head.appendChild(tag);
    } else {
      document.getElementById('lab-mask')?.remove();
    }
  }, [MASK_CSS, on]);
  await page.evaluate(maskExtrasInPage, on);
  await page.waitForTimeout(on ? 150 : 50);
}

// Top-level visual sections: unwrap single-child wrappers (#__next, #root...), then list the blocks.
export async function sectionsOf(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && r.height > 0 && r.width > 0
        && !['SCRIPT', 'STYLE', 'NOSCRIPT', 'LINK', 'META'].includes(el.tagName);
    };
    // an app shell's sections are its scrolling pane's blocks (lib.mjs unrollInPage marks the pane), not the shell
    let node = document.querySelector('[data-tc-unroll~="pane"]') || document.body;
    for (let kids = [...node.children].filter(visible); kids.length === 1; kids = [...node.children].filter(visible)) {
      node = kids[0];
    }
    // decorations (a custom cursor parked off the page, a 2px rule) are not sections
    let blocks = [...node.children].filter(visible).filter((el) => { const r = el.getBoundingClientRect(); return r.height >= 8 && r.bottom + window.scrollY > 0; });
    blocks = blocks.flatMap((el) => (el.tagName === 'MAIN' && el.children.length > 1 ? [...el.children].filter(visible) : [el]));
    return blocks.map((el, index) => {
      const r = el.getBoundingClientRect();
      const heading = el.querySelector('h1,h2,h3');
      return {
        index,
        tag: el.tagName.toLowerCase(),
        id: el.id || undefined,
        classes: [...el.classList].slice(0, 3).join(' ') || undefined,
        heading: heading ? heading.textContent.trim().replace(/\s+/g, ' ').slice(0, 60) : undefined,
        y: Math.round(r.top + window.scrollY),
        height: Math.round(r.height),
      };
    });
  });
}

// ---------- Static server for clones (diff + states) ----------
const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json', '.m3u8': 'application/vnd.apple.mpegurl', '.ts': 'video/mp2t',
  // what a canvas app loads besides images: decoders, compressed textures, models, audio
  '.wasm': 'application/wasm', '.ktx2': 'image/ktx2', '.basis': 'application/octet-stream', '.bin': 'application/octet-stream',
  '.drc': 'application/octet-stream', '.hdr': 'application/octet-stream', '.exr': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.txt': 'text/plain', '.xml': 'application/xml',
};

// Port 0 = a free port picked by the OS, so several scoring tools can run side by side; use server.url.
// Serves a clone the way a host would: text compressed (brotli or gzip, as the browser asks), so the load check
// compares the clone with a CDN-served original on equal terms.
const COMPRESSIBLE = /\.(html?|css|m?js|json|svg|txt|xml|map)$/i;
export function serve(dir, port = 0) {
  dir = path.resolve(dir); // forward or back slashes, relative or not: one form, so the containment check holds
  return new Promise((resolve) => {
    // the site's kind, from its capture next to the folder served (clone/ beside reference/): a site of separate
    // pages answers an address it does not have with a 404, as its host does; a single-page app with its document
    const kind = JSON.parse(fsSync.existsSync(path.join(dir, '..', 'reference', 'meta.json')) ? fsSync.readFileSync(path.join(dir, '..', 'reference', 'meta.json'), 'utf8') : '{}').app || null;
    // routes.mjs: the route-to-file rule the seed writes with (imported here so this edit stays inside serve)
    const rules = import('./routes.mjs');
    const server = http.createServer(async (req, res) => {
      const { decodeSegments, safeSegment } = await rules;
      // decoded once, segment by segment, each made the file name the seed gave it ("Landing%20Page.html" is
      // "Landing Page.html", "%3F" is "_"); a malformed escape (a bare %) is a bad request, never a crash (RC6-07).
      // A route asked with or without its trailing slash (/about/ and /about) is the same route.
      const segs = decodeSegments(new URL(req.url, 'http://x').pathname, true);
      if (!segs) { res.writeHead(400).end(); return; }
      let p = `/${segs.map(safeSegment).join('/')}`;
      if (p === '/') p = '/index.html';
      let file = path.join(dir, p);
      if (file !== dir && !file.startsWith(dir + path.sep)) { res.writeHead(403).end(); return; }
      // An address that is not a file is a route, served like a host does: its own page (/about -> about/index.html,
      // about.html) or, for a single-page app (one document for every address), the app's document.
      if (!(await fs.stat(file).then((s) => s.isFile(), () => false))) {
        const candidates = [path.join(file, 'index.html'), ...(path.extname(p) ? [] : [`${file}.html`]), ...(!path.extname(p) && kind !== 'pages' ? [path.join(dir, 'index.html')] : [])];
        for (const c of candidates) {
          if (await fs.stat(c).then((s) => s.isFile(), () => false)) { file = c; break; }
        }
      }
      try {
        await fs.access(file);
        // a stylesheet saved without an extension by an older capture (/wss/fonts?…) is still a stylesheet
        const type = MIME[path.extname(file).toLowerCase()] || (/[\\/]css[\\/][^\\/.]+$/.test(file) ? MIME['.css'] : 'application/octet-stream');
        const headers = { 'content-type': type };
        const accept = String(req.headers['accept-encoding'] || '');
        const enc = COMPRESSIBLE.test(file) || type === MIME[".css"] ? (/\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : null) : null;
        if (enc) {
          res.writeHead(200, { ...headers, 'content-encoding': enc, vary: 'accept-encoding' });
          createReadStream(file).pipe(enc === 'br' ? zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }) : zlib.createGzip({ level: 6 })).pipe(res);
        } else {
          res.writeHead(200, headers);
          createReadStream(file).pipe(res);
        }
      } catch { res.writeHead(404).end(); }
    });
    server.listen(port, '127.0.0.1', () => { server.url = `http://127.0.0.1:${server.address().port}/`; resolve(server); });
  });
}

// ---------- Image comparison ----------
// Pad so images of different sizes can be compared; the gap always counts as mismatch. The padding is a sentinel no
// page screenshot has (transparent magenta: screenshots are opaque), so match() knows it whatever the other side shows
// there, and it survives crop(). RC6-16: white padding against allbirds' near-white extra band (rgb 236,233,226) was
// under pixelmatch's threshold, so a clone 750 px (11%) taller scored 99.99; counted as different it is 88.73.
export const isPad = (png, i) => png.data[i + 3] === 0 && png.data[i] === 255 && png.data[i + 1] === 0 && png.data[i + 2] === 255;
export function pad(png, width, height) {
  if (png.width === width && png.height === height) return png;
  const out = new PNG({ width, height });
  for (let i = 0; i < out.data.length; i += 4) { out.data[i] = 255; out.data[i + 1] = 0; out.data[i + 2] = 255; out.data[i + 3] = 0; }
  PNG.bitblt(png, out, 0, 0, png.width, png.height, 0, 0);
  return out;
}

export function crop(png, y, h) {
  const out = new PNG({ width: png.width, height: h });
  PNG.bitblt(png, out, 0, y, png.width, h, 0, 0);
  return out;
}

// pixelmatch at threshold 0.1, except that a pixel that is padding on either side is always different: counted here and
// drawn red in the diff (pixelmatch is given the same opaque colour on both sides there, so it counts none of it)
export const match = (a, b, diff) => {
  const n = a.width * a.height;
  let padded = 0;
  for (let i = 0; i < n * 4; i += 4) if (isPad(a, i) || isPad(b, i)) padded++;
  if (!padded) return pixelmatch(a.data, b.data, diff ? diff.data : null, a.width, a.height, { threshold: 0.1, includeAA: false });
  const da = Buffer.from(a.data), db = Buffer.from(b.data);
  for (let i = 0; i < n * 4; i += 4) if (isPad(a, i) || isPad(b, i)) { da[i] = db[i] = 0; da[i + 1] = db[i + 1] = 0; da[i + 2] = db[i + 2] = 0; da[i + 3] = db[i + 3] = 255; }
  const bad = pixelmatch(da, db, diff ? diff.data : null, a.width, a.height, { threshold: 0.1, includeAA: false });
  if (diff) for (let i = 0; i < n * 4; i += 4) if (isPad(a, i) || isPad(b, i)) { diff.data[i] = 255; diff.data[i + 1] = 0; diff.data[i + 2] = 0; diff.data[i + 3] = 255; }
  return bad + padded;
};

// How alike two canvas regions look, 0-100: what a scene draws rarely matches pixel for pixel (time, physics, random
// seeds), so it is compared by what is drawn rather than where: the colour distribution (64 bins) and how much of the
// region is covered by drawing at all (pixels away from the region's dominant colour). An empty or wrong canvas scores
// low; the same scene a frame apart scores high.
// DIAGNOSTIC ONLY since rc.5: a colour histogram has no spatial term, so it never gates a result (measure.mjs has the
// measures that do). Kept because it says something S-comp does not: "the colours are there, in another arrangement".
export function canvasSimilarity(a, b) {
  const stats = (img) => {
    const hist = new Float64Array(64);
    const n = img.width * img.height;
    for (let i = 0; i < n; i++) hist[((img.data[i * 4] >> 6) << 4) | ((img.data[i * 4 + 1] >> 6) << 2) | (img.data[i * 4 + 2] >> 6)]++;
    let mode = 0;
    for (let k = 1; k < 64; k++) if (hist[k] > hist[mode]) mode = k;
    const [mr, mg, mb] = [(mode >> 4) * 64 + 32, ((mode >> 2) & 3) * 64 + 32, (mode & 3) * 64 + 32];
    let ink = 0;
    for (let i = 0; i < n; i++) if (Math.abs(img.data[i * 4] - mr) + Math.abs(img.data[i * 4 + 1] - mg) + Math.abs(img.data[i * 4 + 2] - mb) > 96) ink++;
    for (let k = 0; k < 64; k++) hist[k] /= n || 1;
    return { hist, ink: ink / (n || 1) };
  };
  const A = stats(a), B = stats(b);
  let inter = 0;
  for (let k = 0; k < 64; k++) inter += Math.min(A.hist[k], B.hist[k]);
  const cover = 1 - Math.abs(A.ink - B.ink) / Math.max(A.ink, B.ink, 0.05);
  return +(100 * (0.5 * inter + 0.5 * cover)).toFixed(2);
}

export function matchPct(pngA, pngB, withDiff = false) {
  const w = Math.max(pngA.width, pngB.width), h = Math.max(pngA.height, pngB.height);
  const a = pad(pngA, w, h), b = pad(pngB, w, h);
  const diff = withDiff ? new PNG({ width: w, height: h }) : null;
  const bad = match(a, b, diff);
  return { pct: +(100 - (bad / (w * h)) * 100).toFixed(2), diff };
}

// The images in view loaded and decoded (lazy ones made eager), at most `ms`: a shot after a navigation or a click
// shows the view a visitor sees once its media arrive, on both sides alike, not whichever side's network was faster.
export const mediaReady = (page, ms = 8000) => page.evaluate(async (max) => {
  const inView = [...document.images].filter((i) => { const r = i.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 1 && r.height > 1; });
  for (const i of inView) if (i.loading === 'lazy') i.loading = 'eager';
  await Promise.race([Promise.all(inView.map((i) => (i.complete ? (i.decode ? i.decode().catch(() => {}) : null) : new Promise((r) => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); })))), new Promise((r) => setTimeout(r, max))]);
}, ms).catch(() => {});

// ---------- Live-state sampling (animations running, nothing frozen) ----------
// Loads lazy content without freezing anything: scroll once top to bottom, then back to the top.
export async function warmUp(page) {
  await page.evaluate(async (max) => {
    const step = Math.max(200, window.innerHeight * 0.8);
    for (let y = 0; y < Math.min(document.documentElement.scrollHeight, max); y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  }, MAX_SCROLL);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
}

// Motion-relevant state of every element, keyed by a stable DOM path. Elements at opacity 0 or
// visibility:hidden are kept on purpose: "hidden until scrolled into view" is what we need to see.
export function statesInPage() {
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'LINK', 'META', 'BR', 'PATH', 'G', 'DEFS', 'USE', 'RECT', 'CIRCLE', 'LINE', 'POLYGON', 'TSPAN', 'STOP', 'CLIPPATH']);
  const pathOf = (el) => {
    const parts = [];
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      parts.unshift(`${n.tagName.toLowerCase()}:${[...n.parentElement.children].indexOf(n) + 1}`);
    }
    return parts.join('>');
  };
  const out = {};
  for (const el of document.body.querySelectorAll('*')) {
    if (SKIP.has(el.tagName.toUpperCase())) continue;
    const s = getComputedStyle(el);
    if (s.display === 'none') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    const tag = el.tagName.toLowerCase();
    out[pathOf(el)] = {
      cls: String(el.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 2).join('.'),
      box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], // viewport-relative
      o: +(+s.opacity).toFixed(2),
      v: s.visibility === 'hidden' ? 0 : 1,
      t: s.transform === 'none' ? '' : s.transform,
      c: s.clipPath === 'none' ? '' : s.clipPath,
      f: s.filter === 'none' ? '' : s.filter,
      pos: s.position === 'fixed' || s.position === 'sticky' ? s.position : undefined,
      media: ['img', 'video', 'canvas', 'svg', 'iframe'].includes(tag) ? tag : undefined,
    };
  }
  return out;
}

// Wait until nothing moves: layout + opacity + transform unchanged for 3 polls (video/canvas ignored).
// Endless loops (a floating helmet, a marquee) would never settle, so an element that changed on at least
// 90% of polls after the first second counts as "continuous" and is ignored from then on.
export async function waitStill(page, { timeout = 4000, interval = 80 } = {}) {
  const changed = () => withTimeout(page.evaluate(() => {
    const prev = window.__labSig || new Map();
    const next = new Map();
    const out = [];
    let i = 0;
    const H = innerHeight;
    for (const el of document.body.querySelectorAll('*')) {
      i++;
      if (['VIDEO', 'CANVAS', 'SCRIPT', 'STYLE'].includes(el.tagName)) continue;
      // Only what is on (or just around) the screen can matter for a screenshot; reading styles for the
      // whole document on every poll was the main cost of scoring (thousands of elements, every 80-120ms).
      const r = el.getBoundingClientRect();
      if (r.bottom < -200 || r.top > H + 200 || (r.width === 0 && r.height === 0)) continue;
      const s = getComputedStyle(el);
      if (s.display === 'none') continue;
      const str = `${Math.round(r.top)}|${Math.round(r.left)}|${s.opacity}|${s.transform}`;
      next.set(i, str);
      if (prev.size && prev.get(i) !== str) out.push(i);
    }
    window.__labSig = next;
    return { out, y: Math.round(scrollY) };
  }), 15000, 'waitStill poll');
  await withTimeout(page.evaluate(() => { window.__labSig = undefined; }), 15000, 'waitStill reset');
  await changed();
  const start = Date.now();
  const counts = new Map();
  let polls = 0, quiet = 0, lastY = null;
  while (Date.now() - start < timeout) {
    await page.waitForTimeout(interval);
    const { out, y } = await changed();
    polls++;
    out.forEach((k) => counts.set(k, (counts.get(k) || 0) + 1));
    const continuous = (k) => polls >= 8 && counts.get(k) >= polls * 0.9;
    const real = out.filter((k) => !continuous(k));
    quiet = real.length === 0 && y === lastY ? quiet + 1 : 0;
    lastY = y;
    if (quiet >= 2) return { settled: true, ms: Date.now() - start, continuous: [...counts].filter(([k]) => continuous(k)).length };
  }
  return { settled: false, ms: Date.now() - start };
}

// Wait only for the scroll position to stop moving (smooth-scroll easing): cheap, usually 100-600ms.
async function scrollSettled(page, maxMs = 1500) {
  const start = Date.now();
  let last = null, same = 0;
  while (Date.now() - start < maxMs) {
    const y = await withTimeout(page.evaluate(() => scrollY), 10000, 'scrollY');
    same = y === last ? same + 1 : 0;
    last = y;
    if (same >= 2) break;
    await page.waitForTimeout(50);
  }
  return last;
}
// Smooth-scroll libraries scale wheel input (Lenis wheelMultiplier 0.7 moves 315px for a 450px wheel). Retrying
// with the remainder took 5-6 glides of ~0.9s each per step, which was most of every scoring run. The page's
// scroll-per-wheel-pixel is learned from the first unclamped move and used to size the next wheels, so a step
// is one glide.
const wheelGain = new WeakMap();
export async function wheelTo(page, y, vp, { settle = false } = {}) {
  await page.mouse.move(Math.round(vp.width * 0.02), Math.round(vp.height * 0.98)); // away from hover effects
  const max = await withTimeout(page.evaluate(() => document.documentElement.scrollHeight - innerHeight), 10000, 'scrollMax');
  let at = await scrollSettled(page);
  for (let i = 0; i < 4 && Math.abs(y - at) >= 2; i++) {
    const gain = wheelGain.get(page) || 1;
    const want = y - at;
    await withTimeout(page.mouse.wheel(0, want / gain), 10000, 'wheel');
    const now = await scrollSettled(page);
    const moved = now - at;
    const clamped = now <= 1 || now >= max - 1;
    if (!clamped && Math.abs(want) > 20 && Math.abs(moved) > 5 && Math.sign(moved) === Math.sign(want)) {
      const learned = (gain * moved) / want;
      if (learned > 0.1 && learned < 10) wheelGain.set(page, learned);
    }
    at = now;
  }
  if (Math.abs(at - y) >= 2) { // pages that swallow wheel events
    await withTimeout(page.evaluate((yy) => window.scrollTo(0, yy), y), 10000, 'scrollTo');
    await scrollSettled(page);
  }
  if (settle) await waitStill(page, { timeout: 2000 });
  return withTimeout(page.evaluate(() => scrollY), 10000, 'scrollY');
}
