// Capture a live page as the clone's reference: full-page screenshots, sections, design tokens,
// rendered HTML, CSS/image/font files and a HAR.
// usage: node scripts/capture.mjs <url> [name] [--routes <n> | --routes "/,/about"] [--locale en-US] [--hide ".cookie-banner,#popup"]
//        [--cookie "consent=1; region=us"] [--mode exact --permission "<owner>"] [--cdp [endpoint]]
//        node scripts/capture.mjs <url> <name> --mirror-only   (rebuild reference/mirror from the saved capture)
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { SCORED, VIEWPORTS, HELD_OUT, LOCALE, parseArgs, siteName, openBrowser, newPage, settle, sectionsOf, mask, siteDir, setReferenceProfile, parseCookies, matchPct, PNG, recordBundle, STABILISERS, holdStill, bundleIntegrity, MASK_VERSION, loadLive } from './lib.mjs';
import { startScriptEvidence } from './scripts-evidence.mjs';
import { detectInPage, operable } from './interactions-auto.mjs';
import { canonicalPath, routeKey, routeDir, dirKey, uniqueSlugs, routeUrl } from './routes.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [url, nameArg] = pos;
if (!url) {
  console.error('usage: trueclone capture <url> [name] [--routes <n>|"/,/about"] [--locale en-US] [--hide "<css selectors>"] [--cookie "<name=value; ...>"] [--mode exact --permission "<owner>"] [--cdp]');
  process.exit(1);
}
const name = nameArg || siteName(url);
const hide = typeof flags.hide === 'string' ? flags.hide.split(',').map((s) => s.trim()).filter(Boolean) : [];
// --cookie "consent=1; region=us": a choice any visitor makes (a consent banner answered, a region picked), sent with
// every request to the site by the capture and by every check after it (meta.cookies, lib.mjs). Never a login.
const cookies = parseCookies(flags.cookie);
if (cookies.some((c) => /sess|auth|token|login|jwt|sid$/i.test(c.name))) {
  console.error(`--cookie is for a visitor's choices (consent, region), never a signed-in session: ${cookies.map((c) => c.name).join(', ')}`);
  process.exit(1);
}
// Third-party content (decision D3, docs/policy.md): a widget another origin's script puts on the page (an assistant, a
// chat launcher, a reviews badge) is excluded on both sides by default, found below and listed in meta.ignore and
// REPORT. --ignore "<sel>,…" excludes more by hand; --include "<sel>,…" keeps a found widget in (it is then cloned and
// verified like the rest). An exclusion never covers the page's own content (a main, a heading, most of the window).
const ignoreAsked = typeof flags.ignore === 'string' ? flags.ignore.split(',').map((s) => s.trim()).filter(Boolean) : [];
const include = typeof flags.include === 'string' ? flags.include.split(',').map((s) => s.trim()).filter(Boolean) : [];
let ignore = ignoreAsked.map((sel) => ({ sel, why: 'excluded by hand (capture --ignore)' }));
let thirdParty = [];
let scriptOrigins = null;
// unroll "y": an app shell is unrolled vertically only (lib.mjs); recorded in meta so every check unrolls the clone alike
setReferenceProfile({ url, hide, cookies, unroll: 'y', ignore: ignore.map((i) => i.sel) });
// --mode template (default): assets are kept as reference only; the clone uses placeholder content.
// --mode exact: the clone may reuse the site's own text and media. Only for sites you own or are
// authorised to copy, so it refuses to run without --permission "<who authorised it>". Output stays in
// sites/ (gitignored), the mirror is noindex with every script removed, and nothing here deploys it.
const mode = flags.mode === 'exact' ? 'exact' : 'template';
const permission = typeof flags.permission === 'string' ? flags.permission.trim() : null;
if (mode === 'exact' && !permission) {
  console.error('exact mode copies the site\'s own text and media. Pass --permission "<owner / who authorised this copy>".');
  process.exit(1);
}
// RC6-20: a launcher's quoting cut varsity's permission to `"site` and the capture recorded that as who authorised the
// copy. A permission is the full name of who authorised it: not empty, no stray quote at either end, quotes balanced.
{
  const why = permissionProblem(permission);
  if (flags.permission !== undefined && why) {
    console.error(`--permission ${JSON.stringify(flags.permission)} ${why}: pass the full name of who authorised this copy, quoted once (--permission "Jane Doe, owner of example.com")`);
    process.exit(1);
  }
}
const root = siteDir(name);
const ref = path.join(root, 'reference');
const MAX_ASSET_BYTES = mode === 'exact' ? 200 * 1024 * 1024 : 15 * 1024 * 1024;
// A saved asset's file name: hash + the URL's base name, with the extension its type needs. A URL like
// /wss/fonts?families=… has none, and a host picks the content type by extension: a stylesheet saved as "fonts" is
// served as octet-stream and silently dropped.
const EXT_OF = { 'text/css': '.css', 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/avif': '.avif', 'image/gif': '.gif', 'image/svg+xml': '.svg', 'font/woff2': '.woff2', 'font/woff': '.woff', 'font/ttf': '.ttf', 'font/otf': '.otf', 'application/font-woff2': '.woff2', 'application/font-woff': '.woff', 'video/mp4': '.mp4', 'video/webm': '.webm', 'audio/mpeg': '.mp3', 'application/json': '.json', 'model/gltf-binary': '.glb' };
function assetName(url, type, contentType = '') {
  const base = (path.basename(new URL(url).pathname) || 'index').replace(/[^a-z0-9._-]/gi, '_').slice(-80);
  const hash = crypto.createHash('sha1').update(url).digest('hex').slice(0, 8);
  const want = type === 'stylesheet' ? '.css' : EXT_OF[String(contentType).split(';')[0].trim().toLowerCase()];
  const ext = path.extname(base).toLowerCase();
  const fix = want && ext !== want && !(want === '.jpg' && ext === '.jpeg') && (type === 'stylesheet' || !ext);
  return `${hash}-${base}${fix ? want : ''}`;
}
const SAVED_TYPES = new Set(['stylesheet', 'image', 'font', 'media']);
// an address that names a medium by its extension (a data-* attribute holding one is a lazy loader's source)
const MEDIA_EXT = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico|mp4|webm|mov|m4v)([?#]|$)/i;
// Exact mode also keeps runtime-fetched media: 3D models, textures, video streams, animation files. Never scripts.
const EXTRA_MEDIA = /\.(glb|gltf|bin|hdr|exr|ktx2|basis|mp4|webm|mov|m3u8|ts|m4s|lottie|riv|json)(\?|$)/i;
const keepResponse = (type, url) => SAVED_TYPES.has(type) || (mode === 'exact' && ['fetch', 'xhr', 'other'].includes(type) && EXTRA_MEDIA.test(url));

// --mirror-only: rebuild reference/mirror from an existing capture (no new screenshots, caches stay valid)
if (flags['mirror-only']) {
  const meta = JSON.parse(await fs.readFile(path.join(ref, 'meta.json'), 'utf8'));
  const saved = JSON.parse(await fs.readFile(path.join(ref, 'assets', 'manifest.json'), 'utf8'));
  await buildMirror(saved, meta.url, meta.mode === 'exact' ? `Exact mode, authorised by: ${meta.permission}.` : "Template mode: the site's own content, kept as a reference only.");
  process.exit(0);
}

// A capture in progress is not a reference: the previous capture (if any) is marked incomplete before anything is
// overwritten, and only the end of this run marks the new one complete. A capture that crashes or is stopped part-way
// therefore never passes for the earlier, complete one (status asks for the capture again).
{
  const prev = JSON.parse(await fs.readFile(path.join(ref, 'meta.json'), 'utf8').catch(() => 'null'));
  if (prev) await fs.writeFile(path.join(ref, 'meta.json'), JSON.stringify({ ...prev, complete: false, capturingSince: new Date().toISOString() }, null, 2));
}
// Only clear what capture owns; states/, motion.*, *.spec.json come from other scripts and stay.
await fs.rm(path.join(ref, 'assets'), { recursive: true, force: true });
await fs.rm(path.join(ref, 'mirror'), { recursive: true, force: true });
await fs.mkdir(path.join(ref, 'assets'), { recursive: true });

function tokensInPage() {
  const count = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  const colors = new Map(), bgs = new Map(), fonts = new Map(), type = new Map(), radii = new Map(), shadows = new Map();
  for (const el of [...document.querySelectorAll('body *')].slice(0, 8000)) {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') continue;
    if ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) {
      count(colors, s.color);
      count(fonts, s.fontFamily);
      count(type, `${s.fontSize} / ${s.lineHeight} / ${s.fontWeight} / ${s.letterSpacing}`);
    }
    if (s.backgroundColor !== 'rgba(0, 0, 0, 0)') count(bgs, s.backgroundColor);
    if (s.backgroundImage !== 'none') count(bgs, s.backgroundImage.slice(0, 200));
    if (s.borderRadius !== '0px') count(radii, s.borderRadius);
    if (s.boxShadow !== 'none') count(shadows, s.boxShadow);
  }
  const top = (m) => [...m].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([value, uses]) => ({ value, uses }));
  const cssVariables = {};
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (rule.selectorText === ':root' || rule.selectorText === 'html') {
          for (const p of rule.style) if (p.startsWith('--')) cssVariables[p] = rule.style.getPropertyValue(p).trim();
        }
      }
    } catch { /* cross-origin sheet */ }
  }
  return {
    title: document.title,
    lang: document.documentElement.lang,
    bodyBackground: getComputedStyle(document.body).backgroundColor,
    textColors: top(colors),
    backgrounds: top(bgs),
    fontFamilies: top(fonts),
    typeScale: top(type),
    radii: top(radii),
    shadows: top(shadows),
    cssVariables,
    fontsLoaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight} ${f.style}`),
  };
}

const browser = await openBrowser(flags.cdp);
const manifest = [];
// every asset a captured page loads (the captured page, and each separate page of the site), saved once
const recordAsset = async (res) => {
  const rawType = res.request().resourceType();
  if (!keepResponse(rawType, res.url()) || res.status() >= 300 || manifest.some((m) => m.url === res.url())) return;
  const type = SAVED_TYPES.has(rawType) ? rawType : 'media';
  try {
    const body = await res.body();
    if (body.length > MAX_ASSET_BYTES) return;
    const file = path.join('assets', type, assetName(res.url(), type, res.headers()['content-type']));
    await fs.mkdir(path.join(ref, 'assets', type), { recursive: true });
    await fs.writeFile(path.join(ref, file), body);
    manifest.push({ url: res.url(), type, file: file.replaceAll('\\', '/'), contentType: res.headers()['content-type'], bytes: body.length });
  } catch { /* redirects, data: urls, aborted */ }
};
const summary = [];
// Errors the site's own scripts threw while it was captured, per route ('' is the captured page): meta.pageErrors
// { route, count, first: up to 5 distinct messages }, for the report and the auditor. RC6 allbirds logged ~70 "Cannot
// read properties of undefined (reading 'call')" that were kept nowhere but the transcript. They never fail a capture.
const pageErrors = new Map();
const watchErrors = (page, route) => page.on('pageerror', (e) => {
  const r = pageErrors.get(route) || { count: 0, first: [] };
  const m = String(e?.message ?? e).split('\n')[0].slice(0, 300);
  r.count++;
  if (r.first.length < 5 && !r.first.includes(m)) r.first.push(m);
  pageErrors.set(route, r);
});
const rootFontSize = {};
const inlineStyles = {};
const scriptQueries = new Set(); // media queries the page's scripts asked (matchMedia), at any size
const autoScenarios = []; // interaction scenarios found on the page (interactions-auto.mjs)
const droppedScenarios = []; // found, but their element cannot be operated on the reference (listed, never scored)
// the language and region the page is asked for (meta.locale; every later step uses the same, see lib.mjs LOCALE)
const locale = typeof flags.locale === 'string' ? flags.locale : LOCALE;
const asked = { locale, extraHTTPHeaders: { 'accept-language': `${locale},${locale.split('-')[0]};q=0.9` } };
let finalUrl = null; // where the page ended up, when that is not the URL asked for (a geo or consent redirect)
let linkHrefs = []; // the page's links, for the routes
let overlaysAtLoad = []; // dialogs over the page at load that were not hidden (see the warning below)
let canvasApp = null; // a full-window canvas driven by input, the document not scrolling (see below)
let bundleDone = null; // own-bundle recording (exact mode, desktop)
try {
  // the seed sizes and the held-out sizes: the held-out ones are shot and measured for scoring, nothing else
  // desktop first: what it finds (third-party widgets to exclude) applies to every size shot after it
  for (const vp of [...SCORED.filter((v) => v.name === 'desktop'), ...SCORED.filter((v) => v.name !== 'desktop')]) {
    const desktop = vp.name === 'desktop';
    const { context, page } = await newPage(browser, vp, { ...asked, ...(desktop ? { recordHar: { path: path.join(ref, 'desktop.har'), content: 'omit' } } : {}) });
    await page.addInitScript(recordMediaQueries);
    watchErrors(page, '');
    if (desktop) await page.addInitScript(trackOriginsInPage);
    // at every size: a phone gets its own sources (<picture>, srcset, a mobile-only photo)
    page.on('response', recordAsset);
    // desktop: the page's own scripts and what ran, saved as evidence (reference/scripts/)
    const finishEvidence = desktop ? await startScriptEvidence(page, url).catch(() => null) : null;
    // exact mode, desktop: everything the page loads, at its own address (kept only for a canvas app, or --bundle:
    // the clone then runs the site's own code; see lib.mjs recordBundle)
    if (desktop && mode === 'exact') { await fs.rm(path.join(ref, 'bundle'), { recursive: true, force: true }); bundleDone = recordBundle(page, ref); }
    // the load event, waited for as long as the page keeps loading (lib.mjs loadLive: RC7 elise, a 21 MB page on a
    // slow link, overran a fixed 60 s limit at every size)
    await loadLive(page, url);
    if (desktop) {
      const norm = (u) => { const x = new URL(u); return `${x.host.replace(/^www\./, '')}${x.pathname.replace(/\/$/, '')}`; };
      if (norm(page.url()) !== norm(url)) {
        finalUrl = page.url();
        console.warn(`WARNING the page redirected: ${url} -> ${finalUrl} (language/region or consent). This capture is of that page; capture again with --locale <xx-YY> or the final URL if it is not the one meant`);
      }
    }
    // Components that mount only while in view (a lazy wordmark, an embed) are often unmounted again by the time
    // the DOM is saved. Watch from load: an element that was empty, got content while scrolled into view and is empty
    // again at snapshot time is saved with the fullest content it had. Things that start full and empty out (a
    // loader) are left alone.
    if (desktop) await page.evaluate(() => {
      const count = (el) => el.getElementsByTagName('*').length;
      const initial = new WeakMap();
      for (const el of document.body.getElementsByTagName('*')) initial.set(el, count(el));
      window.__tcRich = new Map();
      new MutationObserver((records) => {
        for (const r of records) {
          for (let el = r.target, up = 0; el instanceof Element && el !== document.body && up < 8; el = el.parentElement, up++) {
            const start = initial.has(el) ? initial.get(el) : 0;
            const n = count(el);
            if (start > 0 || n === 0) continue;
            const best = window.__tcRich.get(el);
            if (!best || n > best.n) window.__tcRich.set(el, { n, html: el.innerHTML });
          }
        }
      }).observe(document.body, { subtree: true, childList: true });
    });
    await settle(page, hide);
    // A popup over the page at load (a cookie wall, a region or newsletter dialog): every check would compare the
    // clone with it. Found by what it does, not only by its name: a fixed layer over most of the window that is on top
    // at the centre (it takes the pointer), and that is a dialog by role, says so in any of its names or data-*
    // attributes, or dims the page behind it (a translucent backdrop: an app's own full-window pane is opaque). Looked
    // for again a few seconds after load: region and newsletter dialogs often arrive late.
    if (desktop) {
      const findOverlays = () => page.evaluate(() => {
        const out = [];
        const top = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
        const alpha = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return 1; const p = m[1].split(/[,\s/]+/).filter(Boolean); return p.length > 3 ? Number(p[3]) : 1; };
        for (const el of document.body.querySelectorAll('*')) {
          const s = getComputedStyle(el);
          if (s.position !== 'fixed' || s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.1) continue;
          if (out.some((o) => o.el.contains(el))) continue;
          const r = el.getBoundingClientRect();
          const share = (Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0))) / (innerWidth * innerHeight);
          if (share < 0.3) continue;
          const names = [el.id, String(el.className?.baseVal ?? el.className), ...[...el.attributes].filter((a) => /^(data-|aria-label)/.test(a.name)).map((a) => a.value)].join(' ');
          const dialog = el.matches('dialog, [role="dialog"], [role="alertdialog"], [aria-modal="true"]') || Boolean(el.querySelector('[role="dialog"], [aria-modal="true"], dialog[open]'));
          const named = /modal|popup|pop-up|overlay|cookie|consent|gdpr|geo|locale|region|country|newsletter|signup|subscribe|interstitial/i.test(names);
          const backdrop = [el, ...el.children].slice(0, 4).some((n) => { const a = alpha(getComputedStyle(n).backgroundColor); return a > 0.05 && a < 0.95; }) || /blur\(/.test(s.backdropFilter || '');
          const onTop = Boolean(top && el.contains(top));
          if ((dialog || named) || (onTop && share >= 0.5 && backdrop)) {
            const dataName = [...el.attributes].find((a) => /^data-(testid|section-type|modal|popup)$/.test(a.name));
            out.push({ el, share: Math.round(share * 100), sel: el.id ? `#${CSS.escape(el.id)}` : dataName ? `[${dataName.name}='${CSS.escape(dataName.value)}']` : `${el.tagName.toLowerCase()}${[...el.classList].slice(0, 2).map((c) => `.${CSS.escape(c)}`).join('')}` });
          }
        }
        return out.map(({ sel, share }) => ({ sel, share }));
      }).catch(() => []);
      const overlays = await findOverlays();
      await page.waitForTimeout(4000);
      for (const o of await findOverlays()) if (!overlays.some((x) => x.sel === o.sel)) overlays.push(o);
      for (const o of overlays.filter((x) => !hide.includes(x.sel))) console.warn(`WARNING \`${o.sel}\` covers ${o.share}% of the window at load (a popup?). If a visitor sees it only until a first choice, capture again with --hide "${o.sel}" (or --cookie "<the choice's cookie>"): otherwise every check compares the clone with it`);
      // kept in meta.json too: status asks for the re-capture instead of letting every check run against the popup
      if (overlays.length) overlaysAtLoad = overlays.filter((x) => !hide.includes(x.sel));
      // third-party widgets, found after the same wait (they arrive late too): excluded on both sides unless included
      thirdParty = await page.evaluate(thirdPartyInPage, new URL(page.url()).hostname).catch(() => []);
      for (const t of thirdParty) {
        t.decision = t.core ? 'kept: page content' : !t.sel ? `kept: no stable selector${t.noSel ? `, ${t.noSel}` : ''} (capture --ignore "<selector>" to exclude it)` : include.includes(t.sel) ? 'kept: capture --include' : 'excluded on both sides';
        if (t.decision.startsWith('excluded') && !ignore.some((i) => i.sel === t.sel)) ignore.push({ sel: t.sel, why: `third-party widget from ${t.origin}`, origin: t.origin, auto: true });
        console.log(`third-party: ${t.sel || t.label} from ${t.origin}: ${t.decision}`);
      }
      // where the page's scripts came from: drift compares it on every score (a third-party script added or gone)
      scriptOrigins = await page.evaluate(() => {
        const o = new Set();
        for (const e of performance.getEntriesByType('resource')) if (e.initiatorType === 'script') { try { o.add(new URL(e.name).origin); } catch { /* not an address */ } }
        for (const s of document.scripts) if (s.src) { try { o.add(new URL(s.src).origin); } catch { /* not an address */ } }
        return [...o].sort();
      }).catch(() => null);
      if (ignore.length) {
        setReferenceProfile({ url, hide, cookies, unroll: 'y', ignore: ignore.map((i) => i.sel) });
        // the tool's own stylesheet, marked: serializeInPage leaves it out of rendered.html (RC6-05: saved there, it was
        // copied into every clone page by the seed, and the clone lint flagged the origin in its selector)
        const tag = await page.addStyleTag({ content: ignore.map((i) => `${i.sel}{display:none!important}`).join('\n') }).catch(() => null);
        await tag?.evaluate((el) => el.setAttribute('data-tc-ignore', '')).catch(() => {});
      }
    }
    // A canvas app (why.zero.university): a canvas fills the window, the document does not scroll, and the site's own
    // code drives what a visitor sees (wheel, touch, a gesture) inside the canvas. The seed would copy a loading
    // screen and every scroll measure one frame: recorded, so status says what 0.5 can and cannot do here.
    if (desktop) {
      canvasApp = await page.evaluate(() => {
        const doc = document.scrollingElement || document.documentElement;
        if (doc.scrollHeight > innerHeight + 40) return null;
        const c = [...document.querySelectorAll('canvas')].find((x) => { const r = x.getBoundingClientRect(); return r.width * r.height >= innerWidth * innerHeight * 0.7; });
        if (!c) return null;
        return { canvas: `canvas${c.id ? `#${c.id}` : ''}${c.getAttribute('data-engine') ? `[data-engine="${c.getAttribute('data-engine')}"]` : ''}`, engine: c.getAttribute('data-engine') || (window.__THREE__ ? `three.js r${window.__THREE__}` : null), bodyOverflow: getComputedStyle(document.body).overflow };
      }).catch(() => null);
      if (canvasApp) console.warn(`WARNING this page is a canvas app: ${canvasApp.canvas}${canvasApp.engine ? ` (${canvasApp.engine})` : ''} fills the window and the page does not scroll; what a visitor sees is drawn by the site's code from wheel, touch and pointer input. It takes the app path: its states are the checkpoints of a journey (status names the steps, journey --draft first)${mode === 'exact' ? '; exact mode keeps the site\'s own bundle for the clone' : '; template mode: the scenes are ported'}.`);
    }
    // every link on the page, hidden views' included: the site's routes are found from them (and sitemap.xml)
    if (desktop) linkHrefs = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.href)).catch(() => []);
    // inline styles at this size, by element path: scripts size and place things from the viewport (a grid's computed
    // cells, a pin's distance), and the rendered HTML only keeps one size's values. With the extra sizes read below,
    // the seed tells a function of the viewport from a constant. Read here, settled and before any screenshot, in the
    // same state as the extra sizes (a full-page shot mounts content and fires reveals).
    if (!vp.heldOut) inlineStyles[`${vp.width}x${vp.height}`] = await page.evaluate(readInlineStyles);
    for (const q of await page.evaluate(() => window.__tcMediaQueries || []).catch(() => [])) scriptQueries.add(q);
    // what a visitor can operate at this size (scrollers, carousels, tabs, accordions, menus, dialogs): scored by the
    // interaction check whether or not the agent writes scenarios (reference/interactions.auto.json)
    if (!vp.heldOut) {
      const top = await page.evaluate(() => scrollY);
      await page.evaluate(() => scrollTo(0, 0));
      const found = await page.evaluate(detectInPage, [vp.name, mode === 'exact' ? 'visual' : 'structure', 48]).catch((e) => { console.warn(`WARNING interactions not detected at ${vp.name}: ${e.message.split('\n')[0]}`); return []; });
      const { kept, dropped } = await operable(page, found);
      autoScenarios.push(...kept);
      droppedScenarios.push(...dropped);
      await page.evaluate((y) => scrollTo(0, y), top);
    }
    if (finishEvidence) {
      const ev = await finishEvidence(path.join(ref, 'scripts')).catch((e) => { console.warn(`WARNING scripts not saved: ${e.message}`); return null; });
      if (ev) console.log(`scripts: ${ev.scripts} saved to reference/scripts/ (${ev.ran} ran during load and scroll), ${ev.listeners} event-listener handlers located (INDEX.md)`);
    }
    // A full-page screenshot brings the whole page into view at once, which mounts view-mounted components and starts
    // their reveals: shoot until two shots agree, so the reference shows a settled page, not a fade caught at 0%.
    // At the top, with what follows the scroll position settled there (a scroll-spy's "current section", a header
    // state): the saved page (rendered.html, after the shots) and the shots show the same moment.
    await page.evaluate(() => { scrollTo(0, 0); dispatchEvent(new Event('scroll')); });
    await page.waitForTimeout(600);
    // at the same page age as every clone shot (lib.mjs holdStill): timers (an autoplay carousel) at the same step
    await holdStill(page);
    let shot = await page.screenshot({ fullPage: true });
    for (let tries = 0; tries < 3; tries++) {
      await page.waitForTimeout(2000);
      const again = await page.screenshot({ fullPage: true });
      const same = again.equals(shot);
      shot = again;
      if (same) break;
    }
    await fs.writeFile(path.join(ref, `${vp.name}.png`), shot);
    const sections = await sectionsOf(page);
    await fs.writeFile(path.join(ref, `${vp.name}.sections.json`), JSON.stringify(sections, null, 2));
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    rootFontSize[vp.name] = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
    if (desktop) {
      // an excluded widget is not part of the page the clone is built from
      if (ignore.length) await page.evaluate((sels) => { for (const s of sels) for (const el of document.querySelectorAll(s)) el.remove(); }, ignore.map((i) => i.sel)).catch(() => {});
      const html = await page.evaluate(serializeInPage);
      await fs.writeFile(path.join(ref, 'rendered.html'), html);
      await fs.writeFile(path.join(ref, 'tokens.json'), JSON.stringify(await page.evaluate(tokensInPage), null, 2));
    }
    await mask(page);
    await page.screenshot({ path: path.join(ref, `${vp.name}.mask.png`), fullPage: true });
    summary.push({ viewport: vp.name, width: vp.width, height: vp.height, ...(vp.heldOut ? { heldOut: true } : {}), pageHeight: height, sections: sections.length });
    if (desktop && bundleDone) await bundleDone();
    await context.close(); // flushes the HAR
  }
} finally {
  if (!flags.cdp) await browser.close();
}

await fs.writeFile(path.join(ref, 'assets', 'manifest.json'), JSON.stringify(manifest, null, 2));

// ---------- Routes: a website is more than one page ----------
// The site's routes: same-host links on the page (every view's) and sitemap.xml, the captured page first, then the
// links found on every route captured (breadth first: RC6-17, a portfolio whose start page links one case study that
// links the other five), capped (--routes N, or --routes "/,/about" for an exact list, --routes 1 for this page only).
// Every page found is recorded (meta.routesFound, with where it was found), and every one left out with why
// (meta.routesNotCaptured, printed at the end). A route is its canonical encoded path (routes.mjs): /Landing%20Page.html.
// Each route's raw HTML is compared with the captured page's: one document for every address is a single-page app (a
// script shows the view for the address), different documents are separate pages. Every other route gets a reference
// of its own at all five sizes in reference/routes/<slug>/ (shots, sections, masks), shot exactly like the captured page.
const home = new URL(finalUrl || url);
const hostOf = (h) => h.replace(/^www\./, '');
const routePath = canonicalPath;
const homePath = routePath(home.pathname);
const skipRoute = (p) => /\.(pdf|png|jpe?g|gif|svg|webp|avif|xml|txt|json|zip|mp4|webm|mp3|ico|css|js)$/i.test(p) || p.startsWith('/cdn-cgi/');
const explicit = typeof flags.routes === 'string' && !/^\d+$/.test(flags.routes) ? [...new Map(flags.routes.split(',').map((s) => routePath(s.trim())).map((p) => [routeKey(p), p])).values()] : null;
const cap = explicit ? explicit.length : flags.routes !== undefined && flags.routes !== true ? Math.max(1, Number(flags.routes) || 1) : 12;
// every same-host page found, deduplicated by canonical path, in the order found: { path, from } (from: "start", the
// path of the page that links it, "sitemap.xml", or "--routes")
const routesFound = [];
const foundKeys = new Set();
const addFound = (u, from) => {
  try {
    const x = new URL(u, home);
    if (!/^https?:$/.test(x.protocol) || hostOf(x.host) !== hostOf(home.host) || skipRoute(x.pathname)) return;
    const p = routePath(x.pathname);
    if (!foundKeys.has(routeKey(p))) { foundKeys.add(routeKey(p)); routesFound.push({ path: p, from }); }
  } catch { /* not a URL */ }
};
addFound(home.href, 'start');
for (const p of explicit || []) addFound(new URL(p, home).href, '--routes');
for (const h of linkHrefs) addFound(h, homePath);
const sitemap = await fetch(new URL('/sitemap.xml', home), { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' }, signal: AbortSignal.timeout(15000) }).then((r) => (r.ok ? r.text() : ''), () => '');
for (const m of sitemap.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) addFound(m[1], 'sitemap.xml');
// the next routes to capture, up to the cap: the exact list, or the pages found in order. Two routes whose clone
// folders would be one (/a%2Fb.html and /a_b.html, /About and /about on Windows) cannot both be cloned: the first keeps it.
const chosen = [];
const clashes = new Map(); // routeKey -> why
const choose = () => {
  const fresh = [];
  for (const p of explicit || routesFound.map((f) => f.path)) {
    if (chosen.length >= cap) break;
    if (chosen.some((c) => routeKey(c) === routeKey(p)) || clashes.has(routeKey(p))) continue;
    const clash = chosen.find((c) => dirKey(c) === dirKey(p));
    if (clash) { clashes.set(routeKey(p), `its clone folder would be clone/${routeDir(clash) || '.'}/, which is ${clash}'s`); continue; }
    chosen.push(p);
    fresh.push(p);
  }
  return fresh;
};
// one document for every address, or separate documents: the raw HTML of each route (nonces aside)
const rawOf = (p) => fetch(new URL(p, home), { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', 'accept-language': asked.extraHTTPHeaders['accept-language'] }, signal: AbortSignal.timeout(20000) })
  .then((r) => r.text(), () => null).then((t) => (t === null ? null : crypto.createHash('sha1').update(t.replace(/nonce="[^"]*"/g, '')).digest('hex')));
const homeDoc = await rawOf(homePath);
const routeInfo = [];
const routeScenarios = []; // what a visitor operates on each other route
// in waves: the routes chosen so far are captured, the links found on them join routesFound, the next wave is chosen
// from those (an exact --routes list is one wave; its routes' links are still recorded)
let browser3 = null; // opened for the first route that has pages to shoot
try {
for (let wave = choose(); wave.length; wave = explicit ? [] : choose()) {
  const slugs = uniqueSlugs(chosen, homePath); // a later route never takes an earlier one's slug (routes.mjs)
  const added = [];
  for (const p of wave) {
    const doc = routeKey(p) === routeKey(homePath) ? homeDoc : await rawOf(p);
    const slug = slugs.get(p);
    added.push({ path: p, slug, dir: slug ? `reference/routes/${slug}` : 'reference', sameDocument: Boolean(doc && doc === homeDoc) });
  }
  routeInfo.push(...added);
  const jobs = added.filter((r) => r.slug).flatMap((r) => SCORED.map((vp) => ({ r, vp })));
  const linksOf = new Map(); // route -> the links on it, read at desktop
  if (jobs.length) {
    browser3 ||= await openBrowser(flags.cdp);
    await Promise.all(Array.from({ length: 3 }, async () => {
      for (let job = jobs.shift(); job; job = jobs.shift()) {
        const { r, vp } = job;
        const dir = path.join(root, r.dir);
        await fs.mkdir(dir, { recursive: true });
        const { context, page } = await newPage(browser3, vp, asked);
        // every route's assets at every size (a view of a single-page app loads its own media: a case study's
        // screenshots); a separate page (its own document) also has its rendered HTML saved, at desktop, for its mirror
        const ownPage = !r.sameDocument && vp.name === 'desktop';
        page.on('response', recordAsset);
        watchErrors(page, r.path);
        // a separate page runs scripts of its own (a table of contents, a progress tracker): their evidence too, merged
        // into reference/scripts/ below, so briefs and the coverage check see them
        const finishPageEvidence = ownPage ? await startScriptEvidence(page, routeUrl(r.path, home, true)).catch(() => null) : null;
        try {
          await loadLive(page, routeUrl(r.path, home, true));
          await settle(page, hide);
          if (finishPageEvidence) await finishPageEvidence(path.join(dir, 'scripts')).catch((e) => console.warn(`WARNING scripts of ${r.path} not saved: ${e.message}`));
          // the links on this route, for the next wave (RC6-17): read from the live DOM (settled, at desktop), as the
          // captured page's own links are, so a page whose links a script writes is followed too
          if (vp.name === 'desktop') linksOf.set(r.path, await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.href)).catch(() => []));
          // at the top, settled there, then shot; the page is saved right after the shot, so both show one moment
          await page.evaluate(() => { scrollTo(0, 0); dispatchEvent(new Event('scroll')); });
          await page.waitForTimeout(600);
          await holdStill(page);
          let shot = await page.screenshot({ fullPage: true });
          for (let tries = 0; tries < 3; tries++) {
            await page.waitForTimeout(2000);
            const again = await page.screenshot({ fullPage: true });
            const same = again.equals(shot);
            shot = again;
            if (same) break;
          }
          await fs.writeFile(path.join(dir, `${vp.name}.png`), shot);
          if (ownPage) await fs.writeFile(path.join(dir, 'rendered.html'), await page.evaluate(serializeInPage));
          const sections = await sectionsOf(page);
          await fs.writeFile(path.join(dir, `${vp.name}.sections.json`), JSON.stringify(sections, null, 2));
          (r.viewports ||= []).push({ viewport: vp.name, width: vp.width, height: vp.height, ...(vp.heldOut ? { heldOut: true } : {}), pageHeight: await page.evaluate(() => document.documentElement.scrollHeight), sections: sections.length });
          // what a visitor operates on this route (a case study's links, a view's own carousel), started from it
          if (!vp.heldOut) {
            const top = await page.evaluate(() => scrollY);
            await page.evaluate(() => scrollTo(0, 0));
            const { kept, dropped } = await operable(page, await page.evaluate(detectInPage, [vp.name, mode === 'exact' ? 'visual' : 'structure', 48]).catch(() => []));
            routeScenarios.push(...kept.map((s) => ({ ...s, path: r.path, name: `${r.path}: ${s.name}` })));
            droppedScenarios.push(...dropped.map((d) => ({ ...d, name: `${r.path}: ${d.name}` })));
            await page.evaluate((y) => scrollTo(0, y), top);
          }
          await mask(page);
          const maskShot = await page.screenshot({ path: path.join(dir, `${vp.name}.mask.png`), fullPage: true });
          // A route that differs from itself (a gallery in random order, a shuffled grid) can never match a clone
          // better than it matches itself: loaded once more at desktop and compared, its own match is recorded
          // (meta.routes[].unstable) and the report holds the clone to that, not to a number no copy can reach.
          if (vp.name === 'desktop') {
            // two more loads: one comparison is one draw of the randomness (a shuffle can come out close by chance);
            // the route is held to the worst of them
            const selfs = [];
            for (let k = 0; k < 2; k++) {
              const again = await newPage(browser3, vp, asked);
              watchErrors(again.page, r.path);
              try {
                await loadLive(again.page, routeUrl(r.path, home, true));
                await settle(again.page, hide);
                await mask(again.page);
                selfs.push(matchPct(PNG.sync.read(maskShot), PNG.sync.read(await again.page.screenshot({ fullPage: true }))).pct);
              } catch { /* a load that fails is a check missed, not the capture */ } finally { await again.context.close(); }
            }
            const self = selfs.length ? Math.min(...selfs) : 100;
            if (self < 99) { r.unstable = { match: self, loads: selfs }; console.log(`route ${r.path}: differs from itself between loads (${selfs.join('%, ')}% at desktop): random content, held to ${self}%`); }
          }
        } catch (e) { (r.failed ||= []).push({ viewport: vp.name, error: e.message.split('\n')[0] }); console.warn(`WARNING route ${r.path} at ${vp.name} not captured: ${e.message.split('\n')[0]}`); }
        finally { await context.close(); }
      }
    }));
  }
  // the links found on this wave's routes, in route order, for the next wave
  for (const r of added) for (const h of linksOf.get(r.path) || []) addFound(h, r.path);
}
} finally {
  if (browser3 && !flags.cdp) await browser3.close();
}
// A route is captured only when it was captured at every size, its own page saved (RC7 elise: /NASA%20(Draft).html
// failed at all five sizes and was still listed, counted "captured at 5 sizes", mirrored and given navigation
// scenarios). One that failed anywhere leaves the routes and is listed as not captured, with the sizes and the error;
// what it left in reference/routes/ is not part of the reference.
const routesFailed = [];
for (let i = routeInfo.length - 1; i >= 0; i--) {
  const r = routeInfo[i];
  if (!r.slug) continue;
  const got = new Set((r.viewports || []).map((v) => v.viewport));
  const missing = SCORED.filter((vp) => !got.has(vp.name)).map((vp) => vp.name);
  const noPage = !r.sameDocument && !(await fs.stat(path.join(root, r.dir, 'rendered.html')).catch(() => null));
  if (!missing.length && !noPage) continue;
  routeInfo.splice(i, 1);
  routesFailed.unshift({ path: r.path, from: null, failed: true, why: missing.length ? `capture failed at ${missing.length === SCORED.length ? 'every size' : missing.join(', ')}: ${r.failed?.[0]?.error || 'not captured'}` : 'its rendered page was not saved' });
}
for (const f of routesFailed) console.warn(`WARNING route ${f.path} not captured (${f.why}): not part of this reference, not verified`);
const appKind = routeInfo.length < 2 ? 'single page' : routeInfo.every((r) => r.sameDocument) ? 'single-page app' : 'pages';
const others = routeInfo.filter((r) => r.slug);
// every page found and not captured, with why (meta.routesNotCaptured; printed at the end)
const routesNotCaptured = [...routesFailed, ...routesFound.filter((f) => !chosen.some((c) => routeKey(c) === routeKey(f.path)))
  .map((f) => ({ path: f.path, from: f.from, why: clashes.get(routeKey(f.path)) || (explicit ? 'not in the --routes list' : `beyond the cap of ${cap} route${cap === 1 ? '' : 's'} (--routes <n> for more)`) }))];
// a route's scenarios join the captured page's, except links the captured page already goes to at that size (the
// same sidebar on every route would otherwise draft the same navigation once per route)
// Navigation is drafted only to routes this capture has: a link to an uncaptured page would be scored against
// nothing the clone could have (the agent retired such scenarios by hand)
// (compared by canonical path: a link spelled /caf%c3%a9 goes to the route /caf%C3%A9)
const captured = new Set(routeInfo.map((r) => routeKey(r.path)));
const navTarget = (s) => routeKey(s.name.replace(/^(?:.*: )?go to (\S+).*/, '$1'));
for (let i = autoScenarios.length - 1; i >= 0; i--) if (autoScenarios[i].navigation && !captured.has(navTarget(autoScenarios[i]))) autoScenarios.splice(i, 1);
// then at most 8 links per size, in the page's order (the cap counts captured routes only)
const navCount = {};
for (let i = 0; i < autoScenarios.length; i++) if (autoScenarios[i].navigation && (navCount[autoScenarios[i].viewport] = (navCount[autoScenarios[i].viewport] || 0) + 1) > 8) autoScenarios.splice(i--, 1);
const homeNav = new Set(autoScenarios.filter((s) => s.navigation).map((s) => `${s.viewport}:${navTarget(s)}`));
for (const s of routeScenarios) {
  if (!captured.has(routeKey(s.path))) continue; // drafted on a route that was not captured at every size
  const target = s.navigation ? navTarget(s) : null;
  if (target && !captured.has(target)) continue;
  // a link back to the captured page is kept (Back and links must find it at its own address in the clone too)
  if (target && homeNav.has(`${s.viewport}:${target}`)) continue;
  if (target) homeNav.add(`${s.viewport}:${target}`);
  autoScenarios.push(s);
}
console.log(`routes: ${routeInfo.length} (${appKind}): ${routeInfo.map((r) => r.path).join(', ')}${others.length ? `; each captured at ${SCORED.length} sizes in reference/routes/` : ''}`);
// The scripts of every separate page joined to the captured page's (reference/scripts/): a script shared by pages has
// one name everywhere (named by its address), so it is saved once; a page's own scripts and listeners are added, the
// listeners marked with their page
{
  const mainDir = path.join(ref, 'scripts');
  const main = JSON.parse(await fs.readFile(path.join(mainDir, 'scripts.json'), 'utf8').catch(() => 'null'));
  const added = [];
  for (const r of others.filter((x) => !x.sameDocument)) {
    const dir = path.join(root, r.dir, 'scripts');
    const pageEv = JSON.parse(await fs.readFile(path.join(dir, 'scripts.json'), 'utf8').catch(() => 'null'));
    if (!main || !pageEv) continue;
    for (const sc of pageEv.scripts || []) {
      if (main.scripts.some((x) => x.file === sc.file)) continue;
      for (const f of [sc.file, sc.pretty].filter(Boolean)) await fs.copyFile(path.join(dir, f), path.join(mainDir, f)).catch(() => {});
      main.scripts.push({ ...sc, page: r.path });
      added.push(`${sc.file} (${r.path})`);
    }
    for (const l of pageEv.listeners || []) if (!main.listeners.some((x) => x.file === l.file && x.line === l.line && x.type === l.type)) main.listeners.push({ ...l, page: r.path });
  }
  if (added.length) {
    await fs.writeFile(path.join(mainDir, 'scripts.json'), JSON.stringify(main, null, 2));
    await fs.appendFile(path.join(mainDir, 'INDEX.md'), `\n## Scripts of the other pages\n\nRun on a separate page of the site, not on the captured one (their listeners are in scripts.json with the page):\n\n${added.map((a) => `- ${a}`).join('\n')}\n`);
    console.log(`scripts: ${added.length} more from the site's other pages (reference/scripts/INDEX.md)`);
  }
}

// The site's own breakpoints (its @media width queries) and extra sizes inside every range they make: inline styles
// read there let the seed fit each value a script set as a function of the viewport (a·vw + b·vh + c) per range, or
// see that it is none and leave it to the agent. Never the held-out sizes: those stay unseen by anything that builds.
const breakpoints = await siteBreakpoints(manifest, [...scriptQueries]);
const fitSizes = sizesForFit(breakpoints);
if (fitSizes.length) {
  const queue = [...fitSizes];
  const browser2 = await openBrowser(flags.cdp);
  try {
    await Promise.all(Array.from({ length: 3 }, async () => {
      for (let s = queue.shift(); s; s = queue.shift()) {
        const { context, page } = await newPage(browser2, { name: `fit${s.width}`, width: s.width, height: s.height }, asked);
        watchErrors(page, '');
        try {
          await loadLive(page, url);
          await settle(page, hide);
          inlineStyles[`${s.width}x${s.height}`] = await page.evaluate(readInlineStyles);
        } catch (e) { console.warn(`WARNING inline styles at ${s.width}x${s.height} not read: ${e.message.split('\n')[0]}`); }
        finally { await context.close(); }
      }
    }));
  } finally {
    if (!flags.cdp) await browser2.close();
  }
}
await fs.writeFile(path.join(ref, 'interactions.auto.json'), JSON.stringify(autoScenarios, null, 2));
await fs.writeFile(path.join(ref, 'interactions.dropped.json'), JSON.stringify(droppedScenarios, null, 2));
if (droppedScenarios.length) console.log(`interactions: ${droppedScenarios.length} found but not operable on the reference, left out (reference/interactions.dropped.json): ${droppedScenarios.slice(0, 3).map((d) => d.name).join('; ')}${droppedScenarios.length > 3 ? '…' : ''}`);
console.log(`interactions: ${autoScenarios.length} scenario(s) found to operate (reference/interactions.auto.json, scored by default)`);
await fs.writeFile(path.join(ref, 'inline-styles.json'), JSON.stringify({ breakpoints, scriptQueries: [...scriptQueries], keys: 'id-path', sizes: Object.keys(inlineStyles), styles: inlineStyles }));
console.log(`inline styles read at ${Object.keys(inlineStyles).length} sizes (site breakpoints: ${breakpoints.join(', ') || 'none found'}; ${scriptQueries.size} width quer${scriptQueries.size === 1 ? 'y' : 'ies'} asked by its scripts)`);
// The own-bundle recording is kept for a canvas app in exact mode (or --bundle): the clone runs the site's own code
// on its own files (the owner's permission covers their code). Any other capture drops it: a document is rebuilt.
const ownBundle = mode === 'exact' && (Boolean(canvasApp) || Boolean(flags.bundle)) && await fs.stat(path.join(ref, 'bundle', 'manifest.json')).then(() => true, () => false);
if (!ownBundle) await fs.rm(path.join(ref, 'bundle'), { recursive: true, force: true });
else {
  const integrity = await bundleIntegrity(ref);
  console.log(`own bundle: ${integrity.entries} files the app loaded, kept in reference/bundle/ (exact mode: the clone runs the site's own code)${integrity.problems.length ? `; ${integrity.problems.length} could not be recorded (status reports them): ${integrity.problems.slice(0, 5).map((p) => `${p.url} (${p.why})`).join('; ')}` : ''}`);
}
await fs.writeFile(path.join(ref, 'meta.json'), JSON.stringify({ url, ...(finalUrl ? { finalUrl } : {}), locale, app: appKind, routes: routeInfo, routesFound, routesNotCaptured, name, mode, permission, hide, ...(cookies.length ? { cookies } : {}), unroll: 'y', stabilise: STABILISERS, maskVersion: MASK_VERSION, ...(ignore.length ? { ignore } : {}), ...(thirdParty.length ? { thirdParty } : {}), ...(scriptOrigins ? { scriptOrigins } : {}), ...(overlaysAtLoad.length ? { overlays: overlaysAtLoad } : {}), ...(canvasApp ? { canvasApp } : {}), ...(ownBundle ? { bundle: true } : {}), ...(pageErrors.size ? { pageErrors: [...pageErrors].map(([route, v]) => ({ route: route || homePath, ...v })) } : {}), capturedAt: new Date().toISOString(), complete: false, rootFontSize, viewports: summary }, null, 2));
await buildMirror(manifest, url, mode === 'exact' ? `Exact mode, authorised by: ${permission}.` : "Template mode: the site's own content, kept as a reference only.");
// Separate pages of the site (their own documents): each mirrored like the captured page, as mirror/routes/<slug>.html
// with the same relative layout (assets at ../assets/, stylesheets in css/), so the seed treats it like index.html.
const ownPages = routeInfo.filter((r) => r.slug && !r.sameDocument);
const mirrored = []; // the pages actually mirrored: the count below is of these, never of the pages attempted
for (const r of ownPages) {
  const rendered = path.join(root, r.dir, 'rendered.html');
  if (!(await fs.stat(rendered).catch(() => null))) { console.warn(`WARNING ${r.path}: no rendered page captured, not mirrored`); continue; }
  const pageUrl = routeUrl(r.path, home, true);
  const note = mode === 'exact' ? `Exact mode, authorised by: ${permission}.` : "Template mode: the site's own content, kept as a reference only.";
  const mirrorDir = path.join(ref, 'mirror');
  let out = await renderMirror(manifest, pageUrl, note, mirrorDir, rendered);
  const missing = findRemoteMedia(out);
  if (missing.length && (await fetchMissing(missing, manifest, pageUrl))) out = await renderMirror(manifest, pageUrl, note, mirrorDir, rendered);
  for (const [file, css] of out.css) await fs.writeFile(path.join(mirrorDir, 'css', file), css);
  await fs.mkdir(path.join(mirrorDir, 'routes'), { recursive: true });
  await fs.writeFile(path.join(mirrorDir, 'routes', `${r.slug}.html`), out.html);
  mirrored.push(r);
}
if (ownPages.length) {
  await fs.writeFile(path.join(ref, 'assets', 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`mirror: ${mirrored.length} of ${ownPages.length} separate page(s) mirrored in reference/mirror/routes/ (${mirrored.map((r) => r.path).join(', ') || 'none'})`);
}
console.table(summary);
// the commit mark: everything above is written, so this capture is a reference
{
  const done = JSON.parse(await fs.readFile(path.join(ref, 'meta.json'), 'utf8'));
  delete done.capturingSince;
  await fs.writeFile(path.join(ref, 'meta.json'), JSON.stringify({ ...done, complete: true }, null, 2));
}
console.log(`${manifest.length} assets saved. Reference: ${path.relative(process.cwd(), ref)}, mirror in reference/mirror${mode === 'exact' ? ` (exact mode, authorised by: ${permission})` : ''}`);
// last, so it is not lost above: the site's pages this reference does not have (RC6-17)
const leftOut = routesNotCaptured.length - routesFailed.length;
if (routesNotCaptured.length) console.log(`routes not captured: ${[routesFailed.length ? `${routesFailed.length} that failed to capture` : '', leftOut ? `${leftOut} of the ${routesFound.length} pages found` : ''].filter(Boolean).join(' and ')} (meta.routesNotCaptured): ${routesNotCaptured.slice(0, 10).map((r) => `${r.path} (${r.why})`).join('; ')}${routesNotCaptured.length > 10 ? '; …' : ''}`);

// ---------- Static local mirror of the rendered page ----------
// Same DOM as rendered.html, asset URLs rewritten to the saved copies, every script and inline handler
// removed (we never reuse the site's code), forms disabled, noindex. Static by design: motion is rebuilt
// from the states/motion inventory, not replayed. Exact mode seeds the clone from it as is; template mode
// seeds it with every text and medium swapped for placeholders (seed.mjs).
async function buildMirror(manifest, url, note) {
  const mirror = path.join(ref, 'mirror');
  await fs.rm(mirror, { recursive: true, force: true });
  await fs.mkdir(path.join(mirror, 'css'), { recursive: true });
  // Rendered twice: the first pass shows which media the capture never saw (lazy images below the fold, hover and
  // state images, sources behind a media query, fonts behind @import); fetchMissing() saves them and the second pass
  // points at the local copies. A page is only as complete as its slowest-loading image.
  let out = await renderMirror(manifest, url, note, mirror);
  const missing = findRemoteMedia(out);
  if (missing.length) {
    const added = await fetchMissing(missing, manifest, url);
    if (added) out = await renderMirror(manifest, url, note, mirror);
    await fs.writeFile(path.join(ref, 'assets', 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(`mirror: fetched ${added}/${missing.length} media the capture had not seen (lazy, hover or conditional sources)`);
  }
  for (const [file, css] of out.css) await fs.writeFile(path.join(mirror, 'css', file), css);
  await fs.writeFile(path.join(mirror, 'index.html'), out.html);
  const left = findRemoteMedia(out);
  console.log(`mirror: reference/mirror/index.html (${manifest.length} local assets${left.length ? `, ${left.length} remote media left: ${left.slice(0, 3).join(', ')}` : ''})`);
}

async function renderMirror(manifest, url, note, mirror, renderedFile = path.join(ref, 'rendered.html')) {
  const byUrl = new Map(manifest.map((m) => [m.url.split('#')[0], m]));
  const abs = (u, base) => { try { return new URL(u.trim().replace(/^['"]|['"]$/g, '').replaceAll('&amp;', '&'), base).href.split('#')[0]; } catch { return null; } };
  const cssName = (m) => path.basename(m.file);
  // where a saved asset lives, seen from a file inside `fromDir`
  const local = (absUrl, fromDir) => {
    const m = absUrl && byUrl.get(absUrl);
    if (!m) return null;
    if (m.type === 'stylesheet') return path.relative(fromDir, path.join(mirror, 'css', cssName(m))).replaceAll('\\', '/');
    return path.relative(fromDir, path.join(ref, m.file)).replaceAll('\\', '/');
  };
  const rewriteCssUrls = (css, base, fromDir) => css
    // url(#id) points inside the document (SVG gradients, filters, masks): never resolve it against the stylesheet.
    // Token by token: a quoted value is read whole, so a data: URI's own url(%23n) (an SVG filter inside it) is part of
    // it, never a reference of its own
    .replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^'")\s]*))\s*\)/g, (all, d, s, bare) => {
      const u = d ?? s ?? bare;
      return !u || /^\s*data:/i.test(u) || u.trim().startsWith('#') ? all : `url("${local(abs(u, base), fromDir) || abs(u, base) || u}")`;
    })
    .replace(/@import\s+(['"])([^'"]+)\1/g, (all, q, u) => `@import "${local(abs(u, base), fromDir) || u}"`);

  // stylesheets: rewritten copies under mirror/css
  const css = new Map();
  for (const m of manifest.filter((x) => x.type === 'stylesheet')) {
    const text = await fs.readFile(path.join(ref, m.file), 'utf8').catch(() => null);
    if (text !== null) css.set(cssName(m), rewriteCssUrls(text, m.url, path.join(mirror, 'css')));
  }

  let html = await fs.readFile(renderedFile, 'utf8');
  // The page's small inline boot scripts in <head> are state, not behaviour, and must run before paint as on the site:
  // history.scrollRestoration (Back lands where the site's does), a theme or "js" class on <html>. Kept (marked
  // data-tc-boot-script); every other script is removed. Nothing that fetches, tracks or writes the document is kept.
  const bootScripts = [];
  html = html.replace(/<head\b[\s\S]*?<\/head>/i, (headPart) => headPart.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (all, attrs, code) => {
    const keep = !/\bsrc=/i.test(attrs) && !/type=["']?(application\/(ld\+)?json|text\/template)/i.test(attrs) && code.length < 4000
      && /scrollRestoration|documentElement\.(classList|className|setAttribute|style|dataset)|prefers-color-scheme/.test(code)
      && !/fetch\(|XMLHttpRequest|sendBeacon|gtag|dataLayer|analytics|_paq|fbq|document\.write|\.src\s*=|createElement\(\s*['"]script/.test(code);
    if (!keep) return all;
    bootScripts.push(`<script data-tc-boot-script${attrs.replace(/\s(nonce|integrity)=("[^"]*"|'[^']*')/gi, '')}>${code}</script>`);
    return `<!--tc-boot-script-${bootScripts.length - 1}-->`;
  }));
  html = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<script\b[^>]*\/>/gi, '')
    .replace(/<link\b[^>]*rel=["']?(?:modulepreload|preload)["']?[^>]*as=["']?script["']?[^>]*>/gi, '')
    // a module preload names a script whether or not it says as="script": the clone never loads the site's code
    .replace(/<link\b[^>]*rel=["']?modulepreload["']?[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/<form\b([^>]*?)\saction=("[^"]*"|'[^']*')/gi, '<form$1')
    .replace(/<form\b/gi, '<form action="#"')
    // a medium the capture did not save is written as its full address, so it counts as missing and is fetched (a
    // relative one would stay pointing at nothing); a link (href) to another page stays as it is
    .replace(/\s(src|href|poster|data-src)=("|')([^"']+)\2/gi, (all, attr, q, u) => {
      const a = abs(u, url);
      const l = local(a, mirror);
      return l ? ` ${attr}=${q}${l}${q}` : attr !== 'href' && a && /^https?:/.test(a) && !/^(data|blob|javascript):/i.test(u.trim()) ? ` ${attr}=${q}${a}${q}` : all;
    })
    // media a script reads from a data-* attribute (a lazy loader's data-bg, data-image, data-poster)
    .replace(/\s(data-[\w-]+)=("|')([^"'\s]+)\2/gi, (all, attr, q, u) => {
      if (/^data-(src|srcset)$/i.test(attr) || !MEDIA_EXT.test(u)) return all;
      const a = abs(u, url);
      return ` ${attr}=${q}${local(a, mirror) || a || u}${q}`;
    })
    // a subresource-integrity hash belongs to the bytes at the original URL; after the rewrite it only makes the
    // browser refuse the local copy (and the whole stylesheet with it)
    .replace(/<link\b[^>]*>/gi, (tag) => tag.replace(/\s(?:integrity|crossorigin)(?:=("[^"]*"|'[^']*'|[^\s>]+))?/gi, ''))
    .replace(/\s(srcset|data-srcset)=("|')([^"']+)\2/gi, (all, attr, q, list) => ` ${attr}=${q}${list.split(',').map((part) => {
      const [u, ...rest] = part.trim().split(/\s+/);
      return [local(abs(u, url), mirror) || abs(u, url) || u, ...rest].join(' ');
    }).join(', ')}${q}`)
    .replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (all, attrs, css) => `<style${attrs}>${rewriteCssUrls(css, url, mirror)}</style>`)
    // quotes inside a style attribute are HTML-escaped (url(&quot;…&quot;)): unescape before rewriting, re-escape after
    .replace(/\sstyle=(?:"([^"]*)"|'([^']*)')/gi, (all, d, s) => {
      const value = d ?? s;
      if (!/url\(/i.test(value)) return all;
      const plain = value.replaceAll('&quot;', '"').replaceAll('&#39;', "'");
      return ` style="${rewriteCssUrls(plain, url, mirror).replaceAll('"', '&quot;')}"`;
    })
    .replace(/<head([^>]*)>/i, `<head$1>\n<!-- trueclone local mirror of ${url}. ${note.replace(/--/g, '-')} Local reference only: do not deploy. -->\n<meta name="robots" content="noindex,nofollow">`)
    // the kept boot scripts back in their places
    .replace(/<!--tc-boot-script-(\d+)-->/g, (m, i) => bootScripts[Number(i)] || '');
  return { html, css };
}

// Media the page still points at on the network after the rewrite: image/video/font/stylesheet URLs in src, srcset,
// poster, data-src, <link> hrefs and CSS url(). Links to other pages (<a href>) are not media.
function findRemoteMedia({ html, css }) {
  const urls = new Set();
  const media = (u) => u && /^https?:\/\//.test(u) && !/^https?:\/\/[^/]+\/?$/.test(u) && !/\.(js|mjs|json|html?)(\?|$)/i.test(u);
  const add = (u) => { if (media(u)) urls.add(u.replaceAll('&amp;', '&')); };
  for (const m of html.matchAll(/\s(?:src|poster|data-src)=["']([^"']+)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/\sdata-[\w-]+=["']([^"'\s]+)["']/gi)) if (MEDIA_EXT.test(m[1])) add(m[1]);
  for (const m of html.matchAll(/\s(?:srcset|data-srcset)=["']([^"']+)["']/gi)) for (const part of m[1].split(',')) add(part.trim().split(/\s+/)[0]);
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = /\srel=["']?([^"'\s>]+)/i.exec(m[0])?.[1] || '';
    const href = /\shref=["']([^"']+)["']/i.exec(m[0])?.[1];
    if (/stylesheet|icon|apple-touch-icon|preload|prefetch/i.test(rel) && !/\sas=["']?(script|document|fetch)/i.test(m[0])) add(href);
  }
  const cssUrls = (text) => { for (const m of text.matchAll(/url\(\s*(?:&quot;|["'])?(https?:\/\/[^)"'&\s]+)/gi)) add(m[1]); };
  cssUrls(html);
  for (const text of css.values()) cssUrls(text);
  return [...urls].slice(0, 300);
}

async function fetchMissing(urls, manifest, pageUrl) {
  const typeOf = (u, contentType = '') => {
    if (/text\/css/.test(contentType) || /\.css(\?|$)/i.test(u)) return 'stylesheet';
    if (/^font\/|application\/(x-)?font|application\/vnd\.ms-fontobject/.test(contentType) || /\.(woff2?|ttf|otf|eot)(\?|$)/i.test(u)) return 'font';
    if (/^image\//.test(contentType) || /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp)(\?|$)/i.test(u)) return 'image';
    return 'media';
  };
  let added = 0;
  const queue = [...urls];
  const worker = async () => {
    for (let u = queue.shift(); u; u = queue.shift()) {
      try {
        const res = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', referer: pageUrl, accept: '*/*' }, signal: AbortSignal.timeout(20000), redirect: 'follow' });
        if (!res.ok) continue;
        const body = Buffer.from(await res.arrayBuffer());
        if (!body.length || body.length > MAX_ASSET_BYTES) continue;
        const contentType = res.headers.get('content-type') || '';
        if (/text\/html/.test(contentType)) continue; // a page, not media (a soft 404)
        const type = typeOf(u, contentType);
        const file = path.join('assets', type, assetName(u, type, contentType));
        await fs.mkdir(path.join(ref, 'assets', type), { recursive: true });
        await fs.writeFile(path.join(ref, file), body);
        manifest.push({ url: u, type, file: file.replaceAll('\\', '/'), contentType, bytes: body.length, fetched: 'mirror' });
        added++;
      } catch { /* offline, blocked, timed out: stays remote and is listed */ }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return added;
}

// Why a --permission value is not a usable name (RC6-20), or null: empty, a stray quote at either end, unbalanced quotes
function permissionProblem(p) {
  if (p === true || p === null || p === undefined) return null; // no value: the exact-mode check above says so
  const s = String(p).trim();
  if (!s) return 'is empty';
  if (/^["'`‘’“”]|["'`‘’“”]$/.test(s)) return `starts or ends with a stray quote (${JSON.stringify(s)}: a launcher's quoting cut it)`;
  for (const q of ['"', '`']) if (s.split(q).length % 2 === 0) return `has an unbalanced ${q} quote`;
  if ((s.match(/[“]/g) || []).length !== (s.match(/[”]/g) || []).length) return 'has unbalanced quotes';
  return null;
}

// Inline styles and classes of every styled element, by a stable key, with the size actually laid out (clientWidth
// excludes a classic scrollbar; scripts measure that, not the window).
// The key (inline-styles.json keys "id-path", read by viewport-fit.mjs and the seed): the element's id when it is unique
// on the page, else tag[n] steps (n-th child of that tag) from the nearest ancestor with a unique id, else from <body>.
// RC6-15: keyed by position among all of <body>'s children, a third-party child arriving late shifted every key after it
// between sizes (allbirds: the pixel container's height:0 was stripped, +750 px). With each record, fp: the tag.first-class
// chain of the steps, so a key that names another element at some size is seen as ambiguous and left alone.
function readInlineStyles() {
  const SKIP = new Set(['SCRIPT', 'NOSCRIPT', 'TEMPLATE', 'STYLE', 'LINK', 'META']);
  const ids = new Map();
  for (const e of document.querySelectorAll('[id]')) ids.set(e.id, (ids.get(e.id) || 0) + 1);
  const keyOf = (el) => {
    const steps = [], fp = [];
    let n = el;
    for (; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      if (n.id && ids.get(n.id) === 1) break;
      let k = 1;
      for (let s = n.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === n.tagName) k++;
      steps.unshift(`${n.tagName.toLowerCase()}[${k}]`);
      fp.unshift(`${n.tagName.toLowerCase()}.${String(n.getAttribute('class') || '').trim().split(/\s+/)[0]}`);
    }
    const anchor = n && n.id && ids.get(n.id) === 1 ? [`#${encodeURIComponent(n.id)}`] : [];
    return [[...anchor, ...steps].join('>'), fp.join('>')];
  };
  // and the old position (tag:n among all children from <body>), which brief.mjs still places script-owned values by
  const posOf = (el) => {
    const parts = [];
    for (let n = el; n && n !== document.body; n = n.parentElement) parts.unshift(`${n.tagName.toLowerCase()}:${[...n.parentElement.children].filter((c) => !SKIP.has(c.tagName)).indexOf(n) + 1}`);
    return parts.join('>');
  };
  const styles = {};
  for (const el of document.body.querySelectorAll('[style]')) {
    if (SKIP.has(el.tagName) || (el.closest('svg') && el.tagName !== 'svg')) continue;
    const [key, fp] = keyOf(el);
    styles[key] = [el.getAttribute('style'), String(el.getAttribute('class') || ''), fp, posOf(el)];
  }
  return { w: document.documentElement.clientWidth, h: innerHeight, styles };
}

// Every media query the page's scripts ask (GSAP matchMedia, Webflow, a component's own breakpoint): what a script
// does can switch at a width no stylesheet mentions.
// Which origin's script put an element on the page: DOM insertions into the body (or beside its children) are wrapped,
// and the first script address in the call stack that is not the page's own marks the element (data-tc-origin).
// Capture only (the desktop pass), never a check, never the clone.
function trackOriginsInPage() {
  const own = location.origin;
  const originOf = () => {
    for (const u of String(new Error().stack || '').match(/https?:\/\/[^\s)]+/g) || []) {
      try { const o = new URL(u).origin; if (o !== own) return o; } catch { /* not an address */ }
    }
    return null;
  };
  const mark = (node) => { if (node instanceof Element && !node.hasAttribute('data-tc-origin')) { const o = originOf(); if (o) node.setAttribute('data-tc-origin', o); } };
  const top = (el) => el === document.body || el === document.documentElement;
  for (const [proto, names] of [[Node.prototype, ['appendChild', 'insertBefore']], [Element.prototype, ['append', 'prepend', 'after', 'before']]]) {
    for (const n of names) {
      const f = proto[n];
      proto[n] = function wrapped(...args) {
        if (top(this) || ((n === 'after' || n === 'before') && this.parentElement && top(this.parentElement))) for (const x of args) mark(x);
        return f.apply(this, args);
      };
    }
  }
}

// The third-party widgets on the page: elements another site's script inserted (marked above) and frames from another
// site. "Another site": another registrable domain (cdn.example.com is example.com's own). Each with a selector that
// names it on any load (an id, or its tag and classes, or a frame's address), and whether it is page content (a main,
// a heading, a navigation, or most of the window), which is never excluded.
function thirdPartyInPage(pageHost) {
  const site = (h) => (/^[\d.]+$|^localhost$|^\[/.test(h) ? h : h.split('.').slice(-2).join('.'));
  const out = [];
  const found = [...document.querySelectorAll('[data-tc-origin]'), ...document.querySelectorAll('iframe[src]')];
  for (const el of found) {
    if (out.some((o) => o.el.contains(el))) continue;
    let origin = el.getAttribute('data-tc-origin');
    if (!origin && el.tagName === 'IFRAME') { try { origin = new URL(el.src).origin; } catch { continue; } }
    // an about:blank or data: frame has the origin "null": no other site's (new URL("null") threw here, and the catch
    // around this function then dropped every widget of the page, the excluded ones too)
    let host;
    try { host = new URL(origin).hostname; } catch { continue; }
    if (!host || site(host) === site(pageHost)) continue;
    const r = el.getBoundingClientRect();
    // a frame in the page's flow (a video, a map in an article) is content; a fixed one (a launcher) is a widget
    let fixed = false;
    for (let p = el; p && p !== document.body; p = p.parentElement) if (/fixed|sticky/.test(getComputedStyle(p).position)) { fixed = true; break; }
    const embed = el.tagName === 'IFRAME' && !fixed && r.width >= 40 && r.height >= 40;
    const core = embed || Boolean(el.querySelector('main, h1, nav, [role="main"]')) || el.matches('main, nav') || r.width * r.height > innerWidth * innerHeight * 0.3;
    const cls = [...el.classList].filter((c) => !/^tc-|^data-tc/.test(c)).slice(0, 2);
    const tag = el.tagName.toLowerCase();
    // A frame by its address only when it has one from that origin: RC6-22, allbirds' Impact iframe (found by its
    // data-tc-origin mark, no src) got iframe[src^="https://utt.impactcdn.com"], which matched nothing on either side.
    // Otherwise a frame is named by its class, name or title; and any selector but an id must match only this widget's
    // own elements (those of its origin), or none is given, with why.
    const src = el.tagName === 'IFRAME' && el.getAttribute('src') ? (() => { try { return new URL(el.src).origin; } catch { return null; } })() : null;
    const attr = (a) => (el.getAttribute(a) ? `${tag}[${a}="${CSS.escape(el.getAttribute(a))}"]` : null);
    let sel = el.id ? `#${CSS.escape(el.id)}` : src === origin ? `iframe[src^="${origin}"]` : cls.length ? `${tag}${cls.map((c) => `.${CSS.escape(c)}`).join('')}` : el.tagName === 'IFRAME' ? attr('name') || attr('title') : null;
    let noSel = sel ? null : el.tagName === 'IFRAME' ? `a frame with no ${el.getAttribute('src') ? 'address on its origin' : 'address'}, id, class, name or title: no selector names it on another load` : 'no id or class: no selector names it on another load';
    if (sel && !el.id) {
      let all = [];
      try { all = [...document.querySelectorAll(sel)]; } catch { /* an invalid selector */ }
      const own = (m) => m === el || m.getAttribute('data-tc-origin') === origin || (m.tagName === 'IFRAME' && (() => { try { return new URL(m.src).origin === origin; } catch { return false; } })());
      if (!all.includes(el) || !all.every(own)) { noSel = `${sel} also matches the page's own elements (or not this one)`; sel = null; }
    }
    out.push({ el, sel, origin, label: `${tag}${el.shadowRoot ? ' (shadow root)' : ''}`, kind: el.tagName === 'IFRAME' ? 'frame' : el.shadowRoot ? 'shadow host' : 'element', core, ...(noSel ? { noSel } : {}) });
  }
  return out.map(({ el, ...t }) => t);
}

function recordMediaQueries() {
  const seen = (window.__tcMediaQueries = []);
  const original = window.matchMedia;
  if (!original) return;
  window.matchMedia = function matchMedia(q) {
    if (typeof q === 'string' && /width/.test(q) && !seen.includes(q)) seen.push(q);
    return original.call(this, q);
  };
}

// The width breakpoints the site's stylesheets use at least twice (min-width: 992px is a boundary at 991), and every
// width its scripts ask about (always kept: a script's breakpoint is behaviour).
async function siteBreakpoints(manifest, scriptQueries = []) {
  const count = new Map();
  for (const q of scriptQueries) {
    for (const m of q.matchAll(/(min|max)-width\s*:\s*([\d.]+)(px|em|rem)/g)) {
      const px = Number(m[2]) * (m[3] === 'px' ? 1 : 16);
      const edge = Math.round(m[1] === 'min' ? px - 1 : px);
      if (edge >= 300 && edge <= 2600) count.set(edge, (count.get(edge) || 0) + 100);
    }
  }
  const texts = [];
  for (const m of manifest.filter((x) => x.type === 'stylesheet')) texts.push(await fs.readFile(path.join(ref, m.file), 'utf8').catch(() => ''));
  const rendered = await fs.readFile(path.join(ref, 'rendered.html'), 'utf8').catch(() => '');
  for (const m of rendered.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) texts.push(m[1]);
  for (const t of texts) {
    for (const q of t.matchAll(/@media[^{]*/g)) {
      for (const m of q[0].matchAll(/(min|max)-width\s*:\s*([\d.]+)(px|em|rem)/g)) {
        const px = Number(m[2]) * (m[3] === 'px' ? 1 : 16);
        const edge = Math.round(m[1] === 'min' ? px - 1 : px);
        if (edge >= 300 && edge <= 2600) count.set(edge, (count.get(edge) || 0) + 1);
      }
    }
  }
  // breakpoints within 2px of each other are one (991 from max-width, 991 from min-width: 992)
  const edges = [...count].filter(([, n]) => n >= 2).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [e, n] of edges) { const last = merged[merged.length - 1]; if (last && e - last.e <= 2) last.n += n; else merged.push({ e, n }); }
  return merged.sort((a, b) => b.n - a.n).slice(0, 9).map((x) => x.e).sort((a, b) => a - b);
}

// Extra sizes for fitting: at least three points in every breakpoint range (counting the seed sizes in it), at
// different heights, so a value that depends on the width, the height or both can be told apart from a constant.
function sizesForFit(breakpoints) {
  const edges = [320, ...breakpoints, 2400];
  const taken = new Set([...VIEWPORTS, ...HELD_OUT].map((v) => `${v.width}x${v.height}`));
  const out = [];
  const heights = [760, 1000, 880];
  for (let i = 0; i < edges.length - 1; i++) {
    const lo = i === 0 ? edges[0] : edges[i] + 1, hi = edges[i + 1];
    if (hi - lo < 8) { // a narrow band (760 and 767 both breakpoints) still has its own rules: sample both edges
      for (const [w, h] of [[lo, heights[i % 3]], [hi, heights[(i + 1) % 3]]]) if (!taken.has(`${w}x${h}`)) { taken.add(`${w}x${h}`); out.push({ width: w, height: h }); }
      continue;
    }
    const seeds = VIEWPORTS.filter((v) => v.width >= lo && v.width <= hi).length;
    const want = Math.max(2, 3 - seeds);
    for (let k = 0; k < want; k++) {
      const w = Math.round(lo + (hi - lo) * [0.25, 0.75, 0.5][k]);
      const h = heights[(i + k) % heights.length];
      if (!taken.has(`${w}x${h}`)) { taken.add(`${w}x${h}`); out.push({ width: w, height: h }); }
    }
  }
  // Two very wide, short screens: most sizes above are taller than 16:9, so a "cover" rule (max(100vw, 177.8vh))
  // would have one point at most on its width side. Two make it checkable (see fitCover in viewport-fit.mjs).
  for (const [w, h] of [[2400, 760], [2200, 900]]) if (!taken.has(`${w}x${h}`)) { taken.add(`${w}x${h}`); out.push({ width: w, height: h }); }
  return out;
}

// The rendered page as HTML, for the mirror: view-mounted content restored, open shadow roots as declarative shadow
// DOM, and none of trueclone's own measuring aids. Used for the captured page and for every separate page of the site.
function serializeInPage() {
  // restore view-mounted content (see above): only elements that are empty again now
  const restore = [];
  let i = 0;
  for (const [el, best] of window.__tcRich || []) {
    if (!el.isConnected || el.getElementsByTagName('*').length > 0) continue;
    el.setAttribute('data-tc-rich', String(i));
    restore[i++] = best.html;
  }
  // open shadow roots (web components, a Webflow code island) are not part of outerHTML: each becomes a
  // declarative <template shadowrootmode="open"> inside its host, which the browser turns back into a shadow
  // root while parsing, no script needed. Deepest first, so a host inside a shadow root is carried too.
  // Constructed stylesheets (adoptedStyleSheets) are written out as a <style> at the top of the template.
  const hosts = [];
  (function find(scope) { for (const el of scope.querySelectorAll('*')) if (el.shadowRoot) { find(el.shadowRoot); hosts.push(el); } })(document);
  for (const host of hosts) {
    const t = document.createElement('template');
    t.setAttribute('shadowrootmode', 'open');
    t.setAttribute('shadowrootserializable', '');
    const adopted = (host.shadowRoot.adoptedStyleSheets || []).map((s) => { try { return [...s.cssRules].map((r) => r.cssText).join('\n'); } catch { return ''; } }).filter(Boolean);
    if (adopted.length) { const st = document.createElement('style'); st.textContent = adopted.join('\n'); t.content.appendChild(st); }
    for (const n of host.shadowRoot.childNodes) t.content.appendChild(n.cloneNode(true));
    host.prepend(t);
    host.setAttribute('data-tc-shadow', '');
  }
  if (hosts.length) console.log(`tc-shadow: serialised ${hosts.length} open shadow root(s) as declarative shadow DOM`);
  const doc = document.documentElement.cloneNode(true);
  for (const el of document.querySelectorAll('[data-tc-rich]')) el.removeAttribute('data-tc-rich');
  for (const el of doc.querySelectorAll('[data-tc-rich]')) {
    el.innerHTML = restore[Number(el.getAttribute('data-tc-rich'))];
    el.removeAttribute('data-tc-rich');
    // marked for the layout diff: a full-page still can't show view-mounted content on either side, so its box
    // is excluded there (the scroll-state check, with a real viewport, scores it)
    el.setAttribute('data-tc-viewmount', '');
  }
  doc.querySelector('style[data-lab-freeze]')?.remove();
  // the exclusion stylesheet capture adds (meta.ignore): the tool's, never the page's (RC6-05)
  for (const s of doc.querySelectorAll('style[data-tc-ignore]')) s.remove();
  // the measuring aids never reach the saved page: the app-shell unroll (lib.mjs unrollInPage)
  doc.querySelector('#tc-unroll')?.remove();
  // the root itself too (<html data-tc-unroll>): querySelectorAll searches only below it
  for (const el of [doc, ...doc.querySelectorAll('[data-tc-unroll]')]) el.removeAttribute('data-tc-unroll');
  console.log(`tc-rich: restored ${restore.length} view-mounted element(s)`);
  return '<!DOCTYPE html>\n' + doc.outerHTML;
}
