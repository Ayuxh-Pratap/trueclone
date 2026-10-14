// Capture a live page as the clone's reference: full-page screenshots, sections, design tokens,
// rendered HTML, CSS/image/font files and a HAR.
// usage: node scripts/capture.mjs <url> [name] [--hide ".cookie-banner,#popup"] [--cdp [endpoint]] [--mode exact --permission "<owner>"]
//        node scripts/capture.mjs <url> <name> --mirror-only   (rebuild reference/mirror from the saved capture)
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { SCORED, VIEWPORTS, HELD_OUT, parseArgs, siteName, openBrowser, newPage, settle, sectionsOf, mask } from './lib.mjs';
import { startScriptEvidence } from './scripts-evidence.mjs';

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

// --mirror-only: rebuild reference/mirror from an existing capture (no new screenshots, caches stay valid)
if (flags['mirror-only']) {
  const meta = JSON.parse(await fs.readFile(path.join(ref, 'meta.json'), 'utf8'));
  const saved = JSON.parse(await fs.readFile(path.join(ref, 'assets', 'manifest.json'), 'utf8'));
  await buildMirror(saved, meta.url, meta.mode === 'exact' ? `Exact mode, authorised by: ${meta.permission}.` : "Template mode: the site's own content, kept as a reference only.");
  process.exit(0);
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
const summary = [];
const rootFontSize = {};
const inlineStyles = {};
const scriptQueries = new Set(); // media queries the page's scripts asked (matchMedia), at any size
try {
  // the seed sizes and the held-out sizes: the held-out ones are shot and measured for scoring, nothing else
  for (const vp of SCORED) {
    const desktop = vp.name === 'desktop';
    const { context, page } = await newPage(browser, vp, desktop ? { recordHar: { path: path.join(ref, 'desktop.har'), content: 'omit' } } : {});
    await page.addInitScript(recordMediaQueries);
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
    // desktop: the page's own scripts and what ran, saved as evidence (reference/scripts/)
    const finishEvidence = desktop ? await startScriptEvidence(page, url).catch(() => null) : null;
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
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
    // inline styles at this size, by element path: scripts size and place things from the viewport (a grid's computed
    // cells, a pin's distance), and the rendered HTML only keeps one size's values. With the extra sizes read below,
    // the seed tells a function of the viewport from a constant. Read here, settled and before any screenshot, in the
    // same state as the extra sizes (a full-page shot mounts content and fires reveals).
    if (!vp.heldOut) inlineStyles[`${vp.width}x${vp.height}`] = await page.evaluate(readInlineStyles);
    for (const q of await page.evaluate(() => window.__tcMediaQueries || []).catch(() => [])) scriptQueries.add(q);
    if (finishEvidence) {
      const ev = await finishEvidence(path.join(ref, 'scripts')).catch((e) => { console.warn(`WARNING scripts not saved: ${e.message}`); return null; });
      if (ev) console.log(`scripts: ${ev.scripts} saved to reference/scripts/ (${ev.ran} ran during load and scroll), ${ev.listeners} event-listener handlers located (INDEX.md)`);
    }
    // A full-page screenshot brings the whole page into view at once, which mounts view-mounted components and starts
    // their reveals: shoot until two shots agree, so the reference shows a settled page, not a fade caught at 0%.
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
      const html = await page.evaluate(() => {
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
        console.log(`tc-rich: restored ${restore.length} view-mounted element(s)`);
        return '<!DOCTYPE html>\n' + doc.outerHTML;
      });
      await fs.writeFile(path.join(ref, 'rendered.html'), html);
      await fs.writeFile(path.join(ref, 'tokens.json'), JSON.stringify(await page.evaluate(tokensInPage), null, 2));
    }
    await mask(page);
    await page.screenshot({ path: path.join(ref, `${vp.name}.mask.png`), fullPage: true });
    summary.push({ viewport: vp.name, width: vp.width, height: vp.height, ...(vp.heldOut ? { heldOut: true } : {}), pageHeight: height, sections: sections.length });
    await context.close(); // flushes the HAR
  }
} finally {
  if (!flags.cdp) await browser.close();
}

await fs.writeFile(path.join(ref, 'assets', 'manifest.json'), JSON.stringify(manifest, null, 2));

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
        const { context, page } = await newPage(browser2, { name: `fit${s.width}`, width: s.width, height: s.height });
        try {
          await page.goto(url, { waitUntil: 'load', timeout: 60000 });
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
await fs.writeFile(path.join(ref, 'inline-styles.json'), JSON.stringify({ breakpoints, scriptQueries: [...scriptQueries], sizes: Object.keys(inlineStyles), styles: inlineStyles }));
console.log(`inline styles read at ${Object.keys(inlineStyles).length} sizes (site breakpoints: ${breakpoints.join(', ') || 'none found'}; ${scriptQueries.size} width quer${scriptQueries.size === 1 ? 'y' : 'ies'} asked by its scripts)`);
await fs.writeFile(path.join(ref, 'meta.json'), JSON.stringify({ url, name, mode, permission, hide, capturedAt: new Date().toISOString(), rootFontSize, viewports: summary }, null, 2));
await buildMirror(manifest, url, mode === 'exact' ? `Exact mode, authorised by: ${permission}.` : "Template mode: the site's own content, kept as a reference only.");
console.table(summary);
console.log(`${manifest.length} assets saved. Reference: ${path.relative(process.cwd(), ref)}, mirror in reference/mirror${mode === 'exact' ? ` (exact mode, authorised by: ${permission})` : ''}`);

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

async function renderMirror(manifest, url, note, mirror) {
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
    // url(#id) points inside the document (SVG gradients, filters, masks): never resolve it against the stylesheet
    .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (all, q, u) => (u.startsWith('data:') || u.trim().startsWith('#') ? all : `url("${local(abs(u, base), fromDir) || abs(u, base) || u}")`))
    .replace(/@import\s+(['"])([^'"]+)\1/g, (all, q, u) => `@import "${local(abs(u, base), fromDir) || u}"`);

  // stylesheets: rewritten copies under mirror/css
  const css = new Map();
  for (const m of manifest.filter((x) => x.type === 'stylesheet')) {
    const text = await fs.readFile(path.join(ref, m.file), 'utf8').catch(() => null);
    if (text !== null) css.set(cssName(m), rewriteCssUrls(text, m.url, path.join(mirror, 'css')));
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
    // a subresource-integrity hash belongs to the bytes at the original URL; after the rewrite it only makes the
    // browser refuse the local copy (and the whole stylesheet with it)
    .replace(/<link\b[^>]*>/gi, (tag) => tag.replace(/\s(?:integrity|crossorigin)(?:=("[^"]*"|'[^']*'|[^\s>]+))?/gi, ''))
    .replace(/\s(srcset|data-srcset)=("|')([^"']+)\2/gi, (all, attr, q, list) => ` ${attr}=${q}${list.split(',').map((part) => {
      const [u, ...rest] = part.trim().split(/\s+/);
      return [local(abs(u, url), mirror) || u, ...rest].join(' ');
    }).join(', ')}${q}`)
    .replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (all, attrs, css) => `<style${attrs}>${rewriteCssUrls(css, url, mirror)}</style>`)
    // quotes inside a style attribute are HTML-escaped (url(&quot;…&quot;)): unescape before rewriting, re-escape after
    .replace(/\sstyle=(?:"([^"]*)"|'([^']*)')/gi, (all, d, s) => {
      const value = d ?? s;
      if (!/url\(/i.test(value)) return all;
      const plain = value.replaceAll('&quot;', '"').replaceAll('&#39;', "'");
      return ` style="${rewriteCssUrls(plain, url, mirror).replaceAll('"', '&quot;')}"`;
    })
    .replace(/<head([^>]*)>/i, `<head$1>\n<!-- trueclone local mirror of ${url}. ${note.replace(/--/g, '-')} Local reference only: do not deploy. -->\n<meta name="robots" content="noindex,nofollow">`);
  return { html, css };
}

// Media the page still points at on the network after the rewrite: image/video/font/stylesheet URLs in src, srcset,
// poster, data-src, <link> hrefs and CSS url(). Links to other pages (<a href>) are not media.
function findRemoteMedia({ html, css }) {
  const urls = new Set();
  const media = (u) => u && /^https?:\/\//.test(u) && !/^https?:\/\/[^/]+\/?$/.test(u) && !/\.(js|mjs|json|html?)(\?|$)/i.test(u);
  const add = (u) => { if (media(u)) urls.add(u.replaceAll('&amp;', '&')); };
  for (const m of html.matchAll(/\s(?:src|poster|data-src)=["']([^"']+)["']/gi)) add(m[1]);
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
        const parsed = new URL(u);
        const base = (path.basename(parsed.pathname) || 'index').replace(/[^a-z0-9._-]/gi, '_').slice(-80);
        const hash = crypto.createHash('sha1').update(u).digest('hex').slice(0, 8);
        const file = path.join('assets', type, `${hash}-${base}`);
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

// Inline styles and classes of every styled element, by element path, with the size actually laid out (clientWidth
// excludes a classic scrollbar; scripts measure that, not the window).
function readInlineStyles() {
  const SKIP = new Set(['SCRIPT', 'NOSCRIPT', 'TEMPLATE', 'STYLE', 'LINK', 'META']);
  const pathOf = (el) => {
    const parts = [];
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const sibs = [...n.parentElement.children].filter((c) => !SKIP.has(c.tagName));
      parts.unshift(`${n.tagName.toLowerCase()}:${sibs.indexOf(n) + 1}`);
    }
    return parts.join('>');
  };
  const styles = {};
  for (const el of document.body.querySelectorAll('[style]')) {
    if (SKIP.has(el.tagName) || (el.closest('svg') && el.tagName !== 'svg')) continue;
    styles[pathOf(el)] = [el.getAttribute('style'), String(el.getAttribute('class') || '')];
  }
  return { w: document.documentElement.clientWidth, h: innerHeight, styles };
}

// Every media query the page's scripts ask (GSAP matchMedia, Webflow, a component's own breakpoint): what a script
// does can switch at a width no stylesheet mentions.
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
