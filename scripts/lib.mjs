// Shared capture settings so the reference and the clone are rendered identically.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import fsSync, { createReadStream } from 'node:fs';
import http from 'node:http';
import zlib from 'node:zlib';
import path from 'node:path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export { PNG };

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
// Where a score run writes (sites/<name>/<COMPARE>/, <REPORT_FILE>): the HTML clone's by default; `next --verify` sets
// compare-next / REPORT.next.md for the app, so the two never share or move each other's files.
export const COMPARE = process.env.TC_COMPARE || 'compare';

// A route given on the command line ("/about", "about"): Git Bash on Windows rewrites an argument that starts with "/"
// into a path inside its install folder ("C:/Program Files/Git/about"), so that is undone, and the leading slash is
// optional.
export function routeArg(v) {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\\/g, '/').replace(/^[a-z]:\/.*?\/git(\/|$)/i, '/');
  return `/${s.replace(/^\/+/, '')}`.replace(/\/+$/, '') || '/';
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
export async function openBrowser(cdp) {
  if (cdp) return chromium.connectOverCDP(cdp === true ? 'http://127.0.0.1:9222' : cdp);
  if (process.env.LAB_BROWSER !== 'chromium') {
    try { return await chromium.launch({ channel: 'chrome' }); } catch { /* Chrome not installed: fall back */ }
  }
  return chromium.launch();
}

// One locale for every page, so a site that picks its variant by language or region (stripe.com -> /in) shows the
// same one to the capture and to every check. `capture --locale` sets it; score passes it on (TC_LOCALE).
export const LOCALE = process.env.TC_LOCALE || 'en-US';
export async function newPage(browser, vp, extra = {}) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    locale: LOCALE,
    extraHTTPHeaders: { 'accept-language': `${LOCALE},${LOCALE.split('-')[0]};q=0.9` },
    ...extra,
  });
  const page = await context.newPage();
  // Hard limits on Playwright actions: a stuck click or navigation fails loudly instead of hanging for hours.
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(60000);
  // Surface script errors immediately: one uncaught error can stop a clone's whole motion layer and
  // turn every score into noise, which is much harder to diagnose from the numbers alone.
  page.on('pageerror', (e) => console.warn(`PAGE ERROR (${page.url()}): ${e.message}`));
  return { context, page };
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
  const key = crypto.createHash('sha1').update(JSON.stringify({ capturedAt: meta.capturedAt, ...keyObj })).digest('hex').slice(0, 16);
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
export function unrollInPage() {
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
  st.textContent = '[data-tc-unroll]{height:auto!important;max-height:none!important;overflow:visible!important}[data-tc-unroll~="fixed"]{position:absolute!important}';
  document.head.append(st);
  return st.dataset.what;
}
export const unroll = (page) => page.evaluate(unrollInPage).catch(() => null);

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
const MASK_CSS = `*,*::before,*::after{color:transparent!important;text-shadow:none!important;
-webkit-text-stroke-color:transparent!important;text-decoration-color:transparent!important}
::placeholder{color:transparent!important}
img,video{object-position:-99999px -99999px!important;background:#888!important}
svg{background:#888!important} svg *{visibility:hidden!important} iframe{visibility:hidden!important}
canvas{background:#888!important;filter:contrast(0) brightness(1.066)!important}
[data-lab-cliptext]{background:none!important;-webkit-text-fill-color:transparent!important}
[data-lab-bgi]{background-image:none!important;background-color:#888!important}
[data-lab-bgb]::before,[data-lab-bga]::after{background-image:none!important;background-color:#888!important}`; // canvas = media (WebGL heroes, 3D models): flat grey box like images

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
// be at, so two screenshots of the same page differ. Before a still comparison, every infinite animation is put on
// its first frame and paused, on both sides. Continuous motion is scored by the motion checks, not by stills.
export async function freezeLoops(page) {
  await page.evaluate(() => {
    for (const a of document.getAnimations()) {
      if (a.effect?.getTiming().iterations !== Infinity) continue;
      a.currentTime = 0;
      a.pause();
    }
  }).catch(() => {});
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
};

// Port 0 = a free port picked by the OS, so several scoring tools can run side by side; use server.url.
// Serves a clone the way a host would: text compressed (brotli or gzip, as the browser asks), so the load check
// compares the clone with a CDN-served original on equal terms.
const COMPRESSIBLE = /\.(html?|css|m?js|json|svg|txt|xml|map)$/i;
export function serve(dir, port = 0) {
  dir = path.resolve(dir); // forward or back slashes, relative or not: one form, so the containment check holds
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      let file = path.join(dir, p);
      if (file !== dir && !file.startsWith(dir + path.sep)) { res.writeHead(403).end(); return; }
      // An address that is not a file is a route, served like a host does: its own page (/about -> about/index.html,
      // about.html) or, for a single-page app (one document for every address), the app's document.
      if (!path.extname(p) && !(await fs.stat(file).then((s) => s.isFile(), () => false))) {
        for (const c of [path.join(file, 'index.html'), `${file}.html`, path.join(dir, 'index.html')]) {
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
// White-pad so images of different sizes can be compared; the gap counts as mismatch.
export function pad(png, width, height) {
  if (png.width === width && png.height === height) return png;
  const out = new PNG({ width, height });
  out.data.fill(255);
  PNG.bitblt(png, out, 0, 0, png.width, png.height, 0, 0);
  return out;
}

export function crop(png, y, h) {
  const out = new PNG({ width: png.width, height: h });
  PNG.bitblt(png, out, 0, y, png.width, h, 0, 0);
  return out;
}

export const match = (a, b, diff) => pixelmatch(a.data, b.data, diff ? diff.data : null, a.width, a.height, { threshold: 0.1, includeAA: false });

// How alike two canvas regions look, 0-100: what a scene draws rarely matches pixel for pixel (time, physics, random
// seeds), so it is compared by what is drawn rather than where: the colour distribution (64 bins) and how much of the
// region is covered by drawing at all (pixels away from the region's dominant colour). An empty or wrong canvas scores
// low; the same scene a frame apart scores high.
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
