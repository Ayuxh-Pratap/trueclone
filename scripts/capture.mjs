// Capture a live page as the clone's reference: full-page screenshots, sections, design tokens,
// rendered HTML, CSS/image/font files and a HAR.
// usage: node scripts/capture.mjs <url> [name] [--hide ".cookie-banner,#popup"] [--cdp [endpoint]]
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { VIEWPORTS, parseArgs, siteName, openBrowser, newPage, settle, sectionsOf, mask } from './lib.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [url, nameArg] = pos;
if (!url) {
  console.error('usage: npm run capture -- <url> [name] [--hide "<css selectors>"] [--cdp]');
  process.exit(1);
}
const name = nameArg || siteName(url);
const hide = typeof flags.hide === 'string' ? flags.hide.split(',').map((s) => s.trim()).filter(Boolean) : [];
// --mode template (default): assets are kept as reference only; the clone uses placeholder content.
// --mode exact: the clone may reuse the site's own text and media. Only for sites you own or are
// authorised to copy, so it refuses to run without --permission "<who authorised it>". Output stays in
// sites/ (gitignored), the mirror is noindex with every script removed, and nothing here deploys it.
const mode = flags.mode === 'exact' ? 'exact' : 'template';
const permission = typeof flags.permission === 'string' ? flags.permission : null;
if (mode === 'exact' && !permission) {
  console.error('exact mode copies the site\'s own text and media. Pass --permission "<owner / who authorised this copy>".');
  process.exit(1);
}
const root = path.resolve('sites', name);
const ref = path.join(root, 'reference');
const MAX_ASSET_BYTES = mode === 'exact' ? 200 * 1024 * 1024 : 15 * 1024 * 1024;
const SAVED_TYPES = new Set(['stylesheet', 'image', 'font', 'media']);
// Exact mode also keeps runtime-fetched media: 3D models, textures, video streams, animation files. Never scripts.
const EXTRA_MEDIA = /\.(glb|gltf|bin|hdr|exr|ktx2|basis|mp4|webm|mov|m3u8|ts|m4s|lottie|riv|json)(\?|$)/i;
const keepResponse = (type, url) => SAVED_TYPES.has(type) || (mode === 'exact' && ['fetch', 'xhr', 'other'].includes(type) && EXTRA_MEDIA.test(url));

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
const summary = [];
const rootFontSize = {};
try {
  for (const vp of VIEWPORTS) {
    const desktop = vp.name === 'desktop';
    const { context, page } = await newPage(browser, vp, desktop ? { recordHar: { path: path.join(ref, 'desktop.har'), content: 'omit' } } : {});
    if (desktop) {
      page.on('response', async (res) => {
        const rawType = res.request().resourceType();
        if (!keepResponse(rawType, res.url()) || res.status() >= 300) return;
        const type = SAVED_TYPES.has(rawType) ? rawType : 'media';
        try {
          const body = await res.body();
          if (body.length > MAX_ASSET_BYTES) return;
          const u = new URL(res.url());
          const base = (path.basename(u.pathname) || 'index').replace(/[^a-z0-9._-]/gi, '_').slice(-80);
          const hash = crypto.createHash('sha1').update(res.url()).digest('hex').slice(0, 8);
          const file = path.join('assets', type, `${hash}-${base}`);
          await fs.mkdir(path.join(ref, 'assets', type), { recursive: true });
          await fs.writeFile(path.join(ref, file), body);
          manifest.push({ url: res.url(), type, file: file.replaceAll('\\', '/'), contentType: res.headers()['content-type'], bytes: body.length });
        } catch { /* redirects, data: urls, aborted */ }
      });
    }
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await settle(page, hide);
    await page.screenshot({ path: path.join(ref, `${vp.name}.png`), fullPage: true });
    const sections = await sectionsOf(page);
    await fs.writeFile(path.join(ref, `${vp.name}.sections.json`), JSON.stringify(sections, null, 2));
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    rootFontSize[vp.name] = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
    if (desktop) {
      const html = await page.evaluate(() => {
        const doc = document.documentElement.cloneNode(true);
        doc.querySelector('style[data-lab-freeze]')?.remove();
        return '<!DOCTYPE html>\n' + doc.outerHTML;
      });
      await fs.writeFile(path.join(ref, 'rendered.html'), html);
      await fs.writeFile(path.join(ref, 'tokens.json'), JSON.stringify(await page.evaluate(tokensInPage), null, 2));
    }
    await mask(page);
    await page.screenshot({ path: path.join(ref, `${vp.name}.mask.png`), fullPage: true });
    summary.push({ viewport: vp.name, width: vp.width, pageHeight: height, sections: sections.length });
    await context.close(); // flushes the HAR
  }
} finally {
  if (!flags.cdp) await browser.close();
}

await fs.writeFile(path.join(ref, 'assets', 'manifest.json'), JSON.stringify(manifest, null, 2));
await fs.writeFile(path.join(ref, 'meta.json'), JSON.stringify({ url, name, mode, permission, hide, capturedAt: new Date().toISOString(), rootFontSize, viewports: summary }, null, 2));
if (mode === 'exact') await buildMirror();
console.table(summary);
console.log(`${manifest.length} assets saved. Reference: ${path.relative(process.cwd(), ref)}${mode === 'exact' ? ` (exact mode; mirror in reference/mirror, authorised by: ${permission})` : ''}`);

// ---------- Exact mode: static local mirror of the rendered page ----------
// Same DOM as rendered.html, asset URLs rewritten to the saved copies, every script and inline handler
// removed (we never reuse the site's code), forms disabled, noindex. Static by design: motion is rebuilt
// from the states/motion inventory, not replayed.
async function buildMirror() {
  const mirror = path.join(ref, 'mirror');
  await fs.rm(mirror, { recursive: true, force: true });
  await fs.mkdir(path.join(mirror, 'css'), { recursive: true });
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
    .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (all, q, u) => (u.startsWith('data:') ? all : `url("${local(abs(u, base), fromDir) || abs(u, base) || u}")`))
    .replace(/@import\s+(['"])([^'"]+)\1/g, (all, q, u) => `@import "${local(abs(u, base), fromDir) || u}"`);

  // stylesheets: rewritten copies under mirror/css
  for (const m of manifest.filter((x) => x.type === 'stylesheet')) {
    const css = await fs.readFile(path.join(ref, m.file), 'utf8');
    await fs.writeFile(path.join(mirror, 'css', cssName(m)), rewriteCssUrls(css, m.url, path.join(mirror, 'css')));
  }

  let html = await fs.readFile(path.join(ref, 'rendered.html'), 'utf8');
  html = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<script\b[^>]*\/>/gi, '')
    .replace(/<link\b[^>]*rel=["']?(?:modulepreload|preload)["']?[^>]*as=["']?script["']?[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/<form\b([^>]*?)\saction=("[^"]*"|'[^']*')/gi, '<form$1')
    .replace(/<form\b/gi, '<form action="#"')
    .replace(/\s(src|href|poster|data-src)=("|')([^"']+)\2/gi, (all, attr, q, u) => {
      const l = local(abs(u, url), mirror);
      return l ? ` ${attr}=${q}${l}${q}` : all;
    })
    .replace(/\s(srcset|data-srcset)=("|')([^"']+)\2/gi, (all, attr, q, list) => ` ${attr}=${q}${list.split(',').map((part) => {
      const [u, ...rest] = part.trim().split(/\s+/);
      return [local(abs(u, url), mirror) || u, ...rest].join(' ');
    }).join(', ')}${q}`)
    .replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (all, attrs, css) => `<style${attrs}>${rewriteCssUrls(css, url, mirror)}</style>`)
    .replace(/\sstyle=("|')([^"']*url\([^"']*)\1/gi, (all, q, css) => ` style=${q}${rewriteCssUrls(css, url, mirror)}${q}`)
    .replace(/<head([^>]*)>/i, `<head$1>\n<!-- rea-lab local mirror of ${url}. Authorised by: ${permission.replace(/--/g, '-')}. Local reference only: do not deploy. -->\n<meta name="robots" content="noindex,nofollow">`);
  await fs.writeFile(path.join(mirror, 'index.html'), html);
  const missing = [...html.matchAll(/\s(?:src|href)=["'](https?:[^"']+)["']/gi)].map((m) => m[1]).filter((u) => !/^https?:\/\/[^/]+\/?$/.test(u));
  console.log(`mirror: reference/mirror/index.html (${manifest.length} local assets, ${missing.length} remote URLs left, e.g. links)`);
}
