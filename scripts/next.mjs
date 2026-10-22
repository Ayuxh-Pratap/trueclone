// Next.js mode: turn a verified HTML clone into a Next.js (App Router) + Tailwind v4 + shadcn-ready project.
//   sites/<name>/next/
//     app/globals.css      the generated shadcn theme (from design-tokens.json) + the clone's tokens.css + site.css
//     app/layout.tsx       fonts, metadata (noindex), early `js` class
//     app/page.tsx         composes one component per section
//     components/site/*    each section converted from the clone's HTML to JSX
//     components/site/SiteMotion.tsx   client component: npm GSAP/ScrollTrigger/SplitText, Lenis, Swiper, three.js
//     lib/site-script.js   the clone's motion/interaction script, unchanged logic, exported as initSite()
//     components.json + lib/utils.ts   so `npx shadcn add <component>` works out of the box
// The HTML clone stays the source of truth: regenerate after every change, then verify the build with the same
// four scores (`npm run next -- <name> --verify`).
//
// usage: node scripts/next.mjs <name> [--install] [--build] [--verify] [--port 3100]
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import { parse, serialize } from 'parse5';
import { fileURLToPath as toPath } from 'node:url';
import { parseArgs, siteDir } from './lib.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) {
  console.error('usage: npm run next -- <name> [--install] [--build] [--verify] [--port 3100]');
  process.exit(1);
}
const root = siteDir(name);
const cloneDir = path.join(root, 'clone');
const out = path.join(root, 'next');
const port = Number(flags.port || 3100);

// Two kinds of clone. A hand-built one (styles.css + one script.js using GSAP/Lenis/Swiper/three from npm) is
// converted section by section; a seeded one (trueclone seed: the original's own stylesheets, trueclone's players, a
// script.js and the libraries it vendored) goes through seededApp() and needs no motion library from npm.
const seeded = await fs.stat(path.join(cloneDir, 'css')).then(() => true, () => false);
// Versions: motion libraries pinned to what the verified hand-built HTML clone loads, so behaviour is identical.
const PKG = {
  name: `${name}-next`, private: true, version: '0.1.0',
  scripts: { dev: 'next dev', build: 'next build', start: `next start -p ${port}` },
  dependencies: {
    next: '16.4.0', react: '19.3.0', 'react-dom': '19.3.0',
    ...(seeded ? {} : { gsap: '3.13.0', lenis: '1.1.18', swiper: '11.2.6', three: '0.128.0' }),
    clsx: '2.1.1', 'tailwind-merge': '3.7.0',
  },
  devDependencies: {
    tailwindcss: '4.3.3', '@tailwindcss/postcss': '4.3.3', 'tw-animate-css': '1.4.0',
    typescript: '5.9.3', '@types/react': '19.3.0', '@types/node': '22.18.0',
  },
};

// ---------------- HTML -> JSX ----------------
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RENAME = {
  class: 'className', for: 'htmlFor', tabindex: 'tabIndex', readonly: 'readOnly', nomodule: 'noModule', formnovalidate: 'formNoValidate', itemscope: 'itemScope', maxlength: 'maxLength', minlength: 'minLength',
  crossorigin: 'crossOrigin', autoplay: 'autoPlay', playsinline: 'playsInline', srcset: 'srcSet', autocomplete: 'autoComplete',
  enctype: 'encType', colspan: 'colSpan', rowspan: 'rowSpan', contenteditable: 'contentEditable', spellcheck: 'spellCheck',
  novalidate: 'noValidate', allowfullscreen: 'allowFullScreen', frameborder: 'frameBorder', inputmode: 'inputMode', datetime: 'dateTime',
  cellpadding: 'cellPadding', cellspacing: 'cellSpacing', charset: 'charSet', accesskey: 'accessKey', usemap: 'useMap',
  formaction: 'formAction', marginwidth: 'marginWidth', marginheight: 'marginHeight', hreflang: 'hrefLang', srclang: 'srcLang',
  srcdoc: 'srcDoc', referrerpolicy: 'referrerPolicy', fetchpriority: 'fetchPriority', enterkeyhint: 'enterKeyHint',
  itemprop: 'itemProp', itemscope: 'itemScope', itemtype: 'itemType', 'accept-charset': 'acceptCharset', 'http-equiv': 'httpEquiv',
};
// Legacy presentational attributes (email-style tables) that React has no typed prop for: passed through a spread,
// which React renders as-is and TypeScript doesn't reject.
const LEGACY = new Set(['valign', 'bgcolor', 'background', 'nowrap', 'hspace', 'vspace', 'clear', 'char', 'charoff', 'compact', 'frame', 'rules', 'axis']);
const BOOL = new Set(['muted', 'loop', 'playsinline', 'autoplay', 'controls', 'disabled', 'checked', 'required', 'hidden', 'novalidate', 'readonly', 'multiple', 'selected', 'allowfullscreen', 'open', 'default', 'reversed', 'async', 'defer', 'nomodule', 'formnovalidate', 'inert', 'itemscope']);
const camel = (s) => s.replace(/[-:]([a-z])/g, (m, c) => c.toUpperCase());
const styleObject = (css) => {
  const o = {};
  for (const decl of css.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const k = decl.slice(0, i).trim();
    if (k) o[k.startsWith('--') ? k : camel(k)] = decl.slice(i + 1).trim();
  }
  return o;
};
// A relative reference resolves against the page's folder (or its <base href>) in the HTML clone; the app serves the
// same files from public/ at every route, so it is written root-relative: assets/x.png on /work/x stays /assets/x.png.
// Absolute, protocol-relative, data:, in-page (#x) and query-only references are left as they are.
let pageBase = '/';
const fixUrl = (v) => {
  const t = v.trim();
  if (!t || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\?)/i.test(t)) return v;
  if (t.startsWith('/')) return t;
  const u = new URL(t, `http://h${pageBase}`);
  return u.pathname + u.search + u.hash;
};
const fixSrcset = (v) => (/^\s*data:/i.test(v) ? v : v.split(',').map((part) => { const [u, ...rest] = part.trim().split(/\s+/); return [fixUrl(u), ...rest].join(' '); }).join(', '));
// url() in CSS text, token by token: a quoted value is read whole, so a url(%23n) inside a data: URI is never touched
const cssUrls = (css) => css.replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|&quot;(.*?)&quot;|([^'")\s]*))\s*\)/g, (m, d, s, e, u) => {
  const v = d ?? s ?? e ?? u;
  return !v || /^\s*data:/i.test(v) ? m : m.replace(v, () => fixUrl(v));
});
// raw markup (a <template>'s content, a shadow root): the same references, in attributes and inline styles
const rawHtml = (h) => cssUrls(h
  .replace(/(\s(?:src|href|poster|data-src))=("|')([^"']*)\2/gi, (m, a, q, u) => `${a}=${q}${fixUrl(u)}${q}`)
  .replace(/(\s(?:srcset|data-srcset))=("|')([^"']*)\2/gi, (m, a, q, u) => `${a}=${q}${fixSrcset(u)}${q}`));
const attrString = (n, v) => (/["\\]/.test(v) ? `${n}={${JSON.stringify(v)}}` : `${n}="${v}"`);

let usesStyle = false; // set while converting a component whose style objects need the CSSProperties type (custom properties like --i)
function jsxAttrs(node, inSvg) {
  const parts = [];
  for (const a of node.attrs || []) {
    if (/^on[a-z]+$/.test(a.name)) continue; // inline handlers are strings; the motion script owns behaviour
    // React reserves ref and key and never renders them as attributes (a Vue template's ref="footer" is inert markup)
    if (a.name === 'ref' || a.name === 'key') continue;
    // an input's value/checked are its starting state here; as plain props React would make the field read-only
    if (node.tagName === 'input' && a.name === 'value') { parts.push(attrString('defaultValue', a.value)); continue; }
    if (node.tagName === 'input' && a.name === 'checked') { parts.push('defaultChecked'); continue; }
    if (LEGACY.has(a.name) && !inSvg) { parts.push(`{...{ ${JSON.stringify(a.name)}: ${JSON.stringify(a.value)} }}`); continue; }
    // url(assets/…) in an inline style resolves against the page in the clone; the app serves assets at /assets
    if (a.name === 'style') { usesStyle = true; parts.push(`style={${JSON.stringify(styleObject(cssUrls(a.value)))} as CSSProperties}`); continue; }
    // SVG elements have no typed boolean props (hidden), so they go through the spread too
    // in HTML a boolean attribute is on whatever its value (disabled="true", even disabled="false"); hidden="until-found"
    // is the one with a meaning of its own
    if (a.name === 'hidden' && a.value === 'until-found') { parts.push(`{...({ hidden: "until-found" } as object)}`); continue; }
    if (BOOL.has(a.name)) { parts.push(inSvg ? `{...{ ${JSON.stringify(a.name)}: true }}` : RENAME[a.name] || a.name); continue; }
    let n = RENAME[a.name] || a.name;
    // namespaced names are not JSX: in SVG, React spells xlink:href / xml:space as xlinkHref / xmlSpace; anywhere
    // else (xmlns on <html>, xml:lang, xmlns:og) the browser ignores them in HTML anyway
    if (n.includes(':') || n === 'xmlns') {
      if (inSvg && /^(xlink|xml):[a-z]+$/.test(n)) n = n.replace(/:([a-z])/, (m, c) => c.toUpperCase());
      else continue;
    }
    if (!RENAME[a.name] && inSvg && !n.startsWith('data-') && !n.startsWith('aria-')) n = camel(n);
    // an empty src/srcset/poster makes the browser request the page itself (React logs an error for each); an
    // empty href means "this page", which # also does without the request
    if (['src', 'srcSet', 'poster'].includes(n) && a.value === '') continue;
    if (n === 'href' && a.value === '') { parts.push('href="#"'); continue; }
    const v = n === 'srcSet' ? fixSrcset(a.value) : ['src', 'href', 'poster'].includes(n) ? fixUrl(a.value) : a.value;
    // React types these as numbers: tabIndex="0" fails type-checking, tabIndex={0} is the same attribute
    if (['tabIndex', 'colSpan', 'rowSpan', 'maxLength', 'minLength', 'span', 'size', 'cols', 'rows'].includes(n) && /^-?\d+$/.test(v)) { parts.push(`${n}={${v}}`); continue; }
    // and these ARIA properties too (aria-valuenow="3" fails type-checking; the number is the same attribute)
    if (/^aria-(value(min|max|now)|level|posinset|setsize|(col|row)(count|index|span))$/.test(n)) {
      // a non-number there (aria-valuenow="NaN" before a script sets it) is still the page's attribute: written
      // through an untyped spread so the markup stays exactly the original's
      parts.push(/^-?\d+(\.\d+)?$/.test(v) ? `${n}={${v}}` : `{...({ ${JSON.stringify(n)}: ${JSON.stringify(v)} } as object)}`);
      continue;
    }
    parts.push(attrString(n, v));
  }
  return parts.length ? ' ' + parts.join(' ') : '';
}

// JSX trims and collapses whitespace that HTML renders, so text is written to keep exactly what the browser showed:
// verbatim where white-space is preserved (code samples), elsewhere with its edge spaces as {" "}
const SPACE = '{" "}';
const TABLE_PARTS = new Set(['table', 'thead', 'tbody', 'tfoot', 'tr', 'colgroup', 'select', 'optgroup', 'html', 'head', 'frameset']);
const keepsWhitespace = (node) => ['pre', 'textarea', 'listing', 'xmp'].includes(node.tagName)
  || (node.attrs || []).some((a) => (a.name === 'class' && /(^|\s)whitespace-(pre|break-spaces)/.test(a.value)) || (a.name === 'style' && /white-space:\s*(pre|break-spaces)/.test(a.value)));
const textJsx = (s) => (/[{}<>&"']/.test(s) ? `{${JSON.stringify(s)}}` : s);

function toJsx(node, depth, inSvg = false, inPre = false) {
  const pad = '  '.repeat(depth);
  if (node.nodeName === '#comment') return '';
  if (node.nodeName === '#text') {
    if (inPre) return `{${JSON.stringify(node.value)}}`;
    if (!node.value.trim()) {
      // Whitespace between two siblings is kept as one space wherever the HTML had it: whether it renders depends on
      // the CSS (between two divs it shows if they are inline-block, as split words are), and where it does not
      // render, the browser drops it the same way. Only table structure and edges never get one (React rejects text
      // inside <tr>/<tbody>, and a space at a block's edge never renders).
      const sibs = node.parentNode?.childNodes || [];
      const i = sibs.indexOf(node);
      const prev = sibs[i - 1], next = sibs[i + 1];
      if (TABLE_PARTS.has(node.parentNode?.tagName)) return '';
      return prev && next && prev.nodeName !== '#comment' && next.nodeName !== '#comment' ? SPACE : '';
    }
    const text = node.value.replace(/\s+/g, ' ');
    return `${/^\s/.test(text) ? SPACE : ''}${textJsx(text.trim())}${/\s$/.test(text) ? SPACE : ''}`;
  }
  if (['script', 'noscript', 'style'].includes(node.nodeName)) return '';
  // a seeded clone's stylesheets are written into <head> in their document order (seededApp)
  if (seeded && node.tagName === 'link' && (node.attrs || []).some((a) => a.name === 'rel' && /\bstylesheet\b/i.test(a.value))) return '';
  const tag = node.tagName;
  const svg = inSvg || tag === 'svg';
  const pre = inPre || keepsWhitespace(node);
  const attrs = jsxAttrs(node, svg);
  // a host with a declarative shadow root (<template shadowrootmode>): the browser's HTML parser builds the shadow
  // root from the streamed markup, React must not touch the inside, so the host's content is emitted as raw HTML
  if ((node.childNodes || []).some((c) => c.tagName === 'template' && (c.attrs || []).some((a) => a.name === 'shadowrootmode'))) {
    return `${pad}<${tag}${attrs} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: ${JSON.stringify(rawHtml(serialize(node)))} }} />`;
  }
  // a <template> (content a script clones: a case study's body, a card) keeps its content as it is: inert markup,
  // never rendered by React
  if (tag === 'template') return `${pad}<template${attrs} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: ${JSON.stringify(rawHtml(serialize(node.content)))} }} />`;
  const kids = (node.childNodes || []).map((c) => toJsx(c, depth + 1, svg, pre)).filter((s) => s !== '');
  if (VOID.has(tag) || !kids.length) return `${pad}<${tag}${attrs} />`;
  const inline = kids.every((k) => !k.startsWith('  ')) && kids.join('').length < 120;
  if (inline) return `${pad}<${tag}${attrs}>${kids.map((k) => k.trim() || ' ').join('')}</${tag}>`;
  return `${pad}<${tag}${attrs}>\n${kids.map((k) => (k.startsWith(' ') && k.trim() ? k : pad + '  ' + k.trim())).join('\n')}\n${pad}</${tag}>`;
}

const pascal = (s) => s.split(/[^a-z0-9]+/i).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('');
const els = (n) => (n.childNodes || []).filter((c) => c.tagName);
const find = (n, tag) => els(n).find((c) => c.tagName === tag);

// ---------------- An own-bundle clone (app mode, exact) ----------------
// The clone is the site's own code on its recorded files, served through its service worker (scripts/bundle.mjs): the
// Next.js app serves exactly those files from public/ (the bootstrap at the site's addresses, the worker at /tc-sw.js,
// the documents and everything else at their paths). There is no markup to turn into components: the page is the
// site's renderer. A route of the app (app/tc/) keeps the project a normal Next.js app to grow from.
const bundled = await fs.stat(path.join(cloneDir, 'tc-sw.js')).then(() => true, () => false);
if (bundled) {
  const siteMeta = JSON.parse(await fs.readFile(path.join(root, 'reference', 'meta.json'), 'utf8'));
  await fs.rm(path.join(out, 'app'), { recursive: true, force: true });
  await fs.rm(path.join(out, 'components', 'site'), { recursive: true, force: true });
  await fs.rm(path.join(out, 'public'), { recursive: true, force: true });
  await fs.mkdir(path.join(out, 'app', 'tc'), { recursive: true });
  await fs.cp(cloneDir, path.join(out, 'public'), { recursive: true, filter: (src) => !path.basename(src).startsWith('.') && path.basename(src) !== 'patches' });
  const startPath = new URL(siteMeta.finalUrl || siteMeta.url).pathname.replace(/\/+$/, '') || '/';
  const rewrites = [{ source: '/', destination: '/index.html' }, ...(startPath !== '/' ? [{ source: startPath, destination: '/index.html' }] : [])];
  await fs.writeFile(path.join(out, 'next.config.mjs'), `import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
// Generated by scripts/next.mjs (app mode, own bundle): the site's own code is served from public/ as recorded; its
// addresses answer with the first-visit bootstrap, which registers the service worker that serves the rest offline.
export default {
  reactStrictMode: true, turbopack: { root }, outputFileTracingRoot: root,
  async rewrites() { return { beforeFiles: ${JSON.stringify(rewrites)} }; },
  async headers() { return [{ source: '/tc-sw.js', headers: [{ key: 'Service-Worker-Allowed', value: '/' }, { key: 'Cache-Control', value: 'no-cache' }] }]; },
};
`);
  await fs.writeFile(path.join(out, 'app', 'layout.tsx'), `// Generated by scripts/next.mjs (app mode, own bundle)
import type { Metadata } from 'next';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`);
  await fs.writeFile(path.join(out, 'app', 'tc', 'page.tsx'), `// Generated by scripts/next.mjs: the clone itself is the site's own bundle in public/, served at the site's addresses
// (next.config.mjs). This route is the app's own, to build on.
export default function Page() {
  return <p>The clone is served at <a href="/">/</a>.</p>;
}
`);
  for (const f of ['DESIGN.md', 'design-tokens.json']) await fs.copyFile(path.join(root, f), path.join(out, f)).catch(() => {});
  await fs.writeFile(path.join(out, 'package.json'), JSON.stringify({ ...PKG, devDependencies: { typescript: PKG.devDependencies.typescript, '@types/react': PKG.devDependencies['@types/react'], '@types/node': PKG.devDependencies['@types/node'] } }, null, 2) + '\n');
  await fs.rm(path.join(out, 'postcss.config.mjs'), { force: true });
  await fs.writeFile(path.join(out, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2017', lib: ['dom', 'dom.iterable', 'esnext'], allowJs: true, skipLibCheck: true, strict: false, noEmit: true,
      esModuleInterop: true, module: 'esnext', moduleResolution: 'bundler', resolveJsonModule: true, isolatedModules: true,
      jsx: 'react-jsx', incremental: true, plugins: [{ name: 'next' }], paths: { '@/*': ['./*'] },
    },
    include: ['next-env.d.ts', 'app/**/*.ts', 'app/**/*.tsx', '.next/types/**/*.ts', '.next/dev/types/**/*.ts'],
    exclude: ['node_modules', 'public'],
  }, null, 2) + '\n');
  await fs.writeFile(path.join(out, '.gitignore'), 'node_modules/\n.next/\nnext-env.d.ts\n*.tsbuildinfo\n');
  console.log(`generated ${path.relative(process.cwd(), out)} (app mode, own bundle): the site's code and files in public/, served at ${rewrites.map((r) => r.source).join(', ')}`);
} else {

// ---------------- Generate ----------------
const html = await fs.readFile(path.join(cloneDir, 'index.html'), 'utf8');
const doc = parse(html);
const htmlEl = find(doc, 'html');
const head = find(htmlEl, 'head');
const body = find(htmlEl, 'body');
const title = (els(head).find((e) => e.tagName === 'title')?.childNodes[0]?.value || name).trim();
const fontLinks = els(head).filter((e) => e.tagName === 'link').map((e) => Object.fromEntries(e.attrs.map((a) => [a.name, a.value])))
  .filter((l) => /fonts\.(googleapis|gstatic)\.com/.test(l.href || ''));
const docBodies = [body]; // every page's <body> (a site of separate pages adds its other pages in seededApp)

await fs.rm(path.join(out, 'app'), { recursive: true, force: true });
await fs.rm(path.join(out, 'components', 'site'), { recursive: true, force: true });
await fs.rm(path.join(out, 'styles', 'site'), { recursive: true, force: true }); // stylesheets were imported from here before 0.5
for (const d of ['app', 'components/site', 'lib', 'styles', 'public']) await fs.mkdir(path.join(out, d), { recursive: true });

let components = [];
if (seeded) components = await seededApp();
else {
// Sections: everything before <main> is "chrome" (nav, menu, intro, cursor); each child of <main> is a section.
const mainEl = find(body, 'main');
const chrome = els(body).filter((e) => e !== mainEl && e.tagName !== 'script');
const sections = mainEl ? els(mainEl) : [];
const used = new Set();
const writeComponent = async (compName, nodes, depth = 2) => {
  usesStyle = false;
  const jsx = nodes.map((n) => toJsx(n, depth)).filter(Boolean).join('\n');
  const typeImport = usesStyle ? "import type { CSSProperties } from 'react';\n\n" : '';
  const file = `// Generated from clone/index.html by scripts/next.mjs. Edit the HTML clone and regenerate.\n${typeImport}export default function ${compName}() {\n  return (\n    <>\n${jsx}\n    </>\n  );\n}\n`;
  await fs.writeFile(path.join(out, 'components', 'site', `${compName}.tsx`), file);
};
await writeComponent('SiteChrome', chrome, 3);
for (const s of sections) {
  const id = s.attrs.find((a) => a.name === 'id')?.value;
  const cls = (s.attrs.find((a) => a.name === 'class')?.value || s.tagName).split(/\s+/)[0];
  let compName = pascal(id || cls) || 'Section';
  if (/^\d/.test(compName)) compName = 'S' + compName;
  while (used.has(compName)) compName += 'X';
  used.add(compName);
  components.push(compName);
  await writeComponent(compName, [s], 3);
}

// Motion: the clone's script, wrapped as initSite(); libraries come from npm instead of CDN script tags.
let script = await fs.readFile(path.join(cloneDir, 'script.js'), 'utf8');
const startIdx = script.indexOf('(() => {');
const endIdx = script.lastIndexOf('})();');
if (startIdx < 0 || endIdx < 0) throw new Error('clone/script.js must be a single (() => { ... })(); IIFE');
script = script.slice(0, startIdx) + 'export default function initSite() {' + script.slice(startIdx + '(() => {'.length, endIdx) + '}\n';
script = script.replace(/(['"`])assets\//g, (m, q) => `${q}/assets/`);
await fs.writeFile(path.join(out, 'lib', 'site-script.js'), `// Generated from clone/script.js by scripts/next.mjs. Edit the HTML clone and regenerate.\n${script}`);
await fs.writeFile(path.join(out, 'components', 'site', 'SiteMotion.tsx'), `'use client';
// Generated by scripts/next.mjs: loads the motion libraries from npm (same versions the HTML clone uses),
// exposes them the way the clone's script expects, then runs it once after hydration.
import { useEffect } from 'react';

export default function SiteMotion() {
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    if (w.__siteInit) return; // React strict mode runs effects twice in dev
    w.__siteInit = true;
    (async () => {
      const [{ gsap }, { ScrollTrigger }, { SplitText }, lenis, swiper, three] = await Promise.all([
        import('gsap'), import('gsap/ScrollTrigger'), import('gsap/SplitText'), import('lenis'), import('swiper/bundle'), import('three'),
      ]);
      Object.assign(w, { gsap, ScrollTrigger, SplitText, Lenis: lenis.default, Swiper: swiper.default, THREE: three });
      const { default: initSite } = await import('@/lib/site-script.js');
      initSite();
    })();
  }, []);
  return null;
}
`);

// Styles: shadcn theme first (Tailwind + tokens as utilities), then the clone's own tokens and stylesheet.
const globals = await fs.readFile(path.join(root, 'globals.css'), 'utf8');
const siteCss = (await fs.readFile(path.join(cloneDir, 'styles.css'), 'utf8')).replace(/@import url\(["']?tokens\.css["']?\);\s*/, '').replace(/url\((['"]?)assets\//g, (m, q) => `url(${q}/assets/`);
await fs.writeFile(path.join(out, 'styles', 'site.css'), siteCss);
await fs.copyFile(path.join(cloneDir, 'tokens.css'), path.join(out, 'styles', 'tokens.css'));
// Library stylesheets the HTML loads from an npm CDN become package imports, placed BEFORE the site
// stylesheet exactly like in the HTML <head>: same cascade order, same winners (e.g. .media-card vs .swiper-slide).
const libCss = els(head).filter((e) => e.tagName === 'link').map((e) => Object.fromEntries(e.attrs.map((a) => [a.name, a.value])))
  .filter((l) => l.rel === 'stylesheet' && /cdn\.jsdelivr\.net\/npm\/|unpkg\.com\//.test(l.href || ''))
  .map((l) => {
    const m = /\/npm\/((?:@[^/]+\/)?[^@/]+)@[^/]+\/(.+)$/.exec(l.href) || /unpkg\.com\/((?:@[^/]+\/)?[^@/]+)@[^/]+\/(.+)$/.exec(l.href);
    if (!m) return null;
    const [, pkgName, file] = m;
    if (pkgName === 'swiper') return 'swiper/css/bundle'; // swiper's package exports expose its CSS under css/
    return `${pkgName}/${file}`;
  }).filter(Boolean);
const importLines = libCss.map((p) => `@import "${p}";\n`).join('') + '@import "../styles/tokens.css";\n@import "../styles/site.css";\n';
// Preflight parity: Tailwind's reset gives media elements display:block, vertical-align:middle and
// (img/video) max-width:100% + height:auto. The HTML clone was verified without that reset, so restore the
// browser defaults where they differ; the site stylesheet (unlayered) still wins wherever it sets a value.
const parity = `
/* Preflight parity (scripts/next.mjs): render media like the verified HTML clone */
@layer base {
  svg, video, canvas, audio, iframe, embed, object { display: revert; vertical-align: revert; }
  video { max-width: revert; height: revert; }
}
`;
const globalsOut = globals.includes('@import "tw-animate-css";')
  ? globals.replace('@import "tw-animate-css";', () => '@import "tw-animate-css";\n' + importLines)
  : importLines + globals;
await fs.writeFile(path.join(out, 'app', 'globals.css'), globalsOut + parity);

// App shell
await fs.writeFile(path.join(out, 'app', 'layout.tsx'), `// Generated by scripts/next.mjs
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: ${JSON.stringify(title)},
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* the clone hides reveal targets and shows its intro only when JS runs: flag it before first paint */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
${fontLinks.map((l) => `        <link ${Object.entries(l).map(([k, v]) => (k === 'crossorigin' ? 'crossOrigin=""' : `${k}="${v}"`)).join(' ')} />`).join('\n')}
      </head>
      <body>{children}</body>
    </html>
  );
}
`);
await fs.writeFile(path.join(out, 'app', 'page.tsx'), `// Generated by scripts/next.mjs: one component per section of the verified HTML clone.
import SiteChrome from '@/components/site/SiteChrome';
${components.map((c) => `import ${c} from '@/components/site/${c}';`).join('\n')}
import SiteMotion from '@/components/site/SiteMotion';

export default function Page() {
  return (
    <>
      <SiteChrome />
      <main>
${components.map((c) => `        <${c} />`).join('\n')}
      </main>
      <SiteMotion />
    </>
  );
}
`);
}

// Assets, design system docs, config. A seeded clone's files are all served as they are (stylesheets, scripts,
// patches, media at the clone's root or in folders of their own): everything but the pages themselves (they are the
// app's routes) and the seed's working files (dotfiles); folders left with nothing to serve are dropped.
const notServed = (p) => /\.html?$/i.test(p) || path.basename(p).startsWith('.');
const prune = async (dir) => {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) if (e.isDirectory()) await prune(path.join(dir, e.name));
  if (!(await fs.readdir(dir)).length) await fs.rmdir(dir);
};
for (const e of seeded ? await fs.readdir(cloneDir, { withFileTypes: true }) : [{ name: 'assets', isDirectory: () => true }]) {
  if (notServed(e.name)) continue;
  const to = path.join(out, 'public', e.name);
  await fs.rm(to, { recursive: true, force: true });
  await fs.cp(path.join(cloneDir, e.name), to, { recursive: true, filter: (src) => !notServed(src) });
  if (e.isDirectory()) await prune(to);
}
for (const f of ['DESIGN.md', 'design-tokens.json']) await fs.copyFile(path.join(root, f), path.join(out, f)).catch(() => {});
await fs.writeFile(path.join(out, 'package.json'), JSON.stringify(PKG, null, 2) + '\n');
// custom elements (<code-island>, <swiper-container>) have no JSX type: declared here, or `next build` fails
// Types for what the page uses that React's typings don't know: custom elements (<code-island>), and HTML attributes
// newer than the typings or outside them (command, commandfor, popovertarget, a framework's own): an HTML attribute
// is valid markup whether React lists it or not, so every element accepts any attribute here.
const custom = new Set();
for (const b of docBodies) (function walk(n) { if (n.tagName && n.tagName.includes('-')) custom.add(n.tagName); for (const c of n.childNodes || []) walk(c); })(b);
await fs.rm(path.join(out, 'custom-elements.d.ts'), { force: true });
await fs.writeFile(path.join(out, 'html-types.d.ts'), `// Generated by scripts/next.mjs: the page's markup, typed for JSX as the browser accepts it.
import type { DetailedHTMLProps, HTMLAttributes as ReactHTMLAttributes } from 'react';

declare module 'react' {
  interface HTMLAttributes<T> {
    [attribute: string]: unknown;
  }
${custom.size ? `  namespace JSX {
    interface IntrinsicElements {
${[...custom].map((t) => `      ${JSON.stringify(t)}: DetailedHTMLProps<ReactHTMLAttributes<HTMLElement>, HTMLElement>;`).join('\n')}
    }
  }
` : ''}}
`);
await fs.writeFile(path.join(out, 'postcss.config.mjs'), "export default { plugins: { '@tailwindcss/postcss': {} } };\n");
await fs.writeFile(path.join(out, 'next.config.mjs'), `import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
// Pin the project root: the lab folder above has its own lockfile.
export default { reactStrictMode: true, turbopack: { root }, outputFileTracingRoot: root };
`);
await fs.writeFile(path.join(out, 'tsconfig.json'), JSON.stringify({
  compilerOptions: {
    target: 'ES2017', lib: ['dom', 'dom.iterable', 'esnext'], allowJs: true, skipLibCheck: true, strict: false, noEmit: true,
    esModuleInterop: true, module: 'esnext', moduleResolution: 'bundler', resolveJsonModule: true, isolatedModules: true,
    jsx: 'react-jsx', incremental: true, plugins: [{ name: 'next' }], paths: { '@/*': ['./*'] },
  },
  include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '**/*.js', '.next/types/**/*.ts', '.next/dev/types/**/*.ts'],
  exclude: ['node_modules'],
}, null, 2) + '\n');
await fs.writeFile(path.join(out, 'components.json'), JSON.stringify({
  $schema: 'https://ui.shadcn.com/schema.json', style: 'new-york', rsc: true, tsx: true,
  tailwind: { config: '', css: 'app/globals.css', baseColor: 'neutral', cssVariables: true, prefix: '' },
  aliases: { components: '@/components', utils: '@/lib/utils', ui: '@/components/ui', lib: '@/lib', hooks: '@/hooks' },
  iconLibrary: 'lucide',
}, null, 2) + '\n');
await fs.writeFile(path.join(out, 'lib', 'utils.ts'), "import { clsx, type ClassValue } from 'clsx';\nimport { twMerge } from 'tailwind-merge';\n\nexport function cn(...inputs: ClassValue[]) {\n  return twMerge(clsx(inputs));\n}\n");
await fs.writeFile(path.join(out, '.gitignore'), 'node_modules/\n.next/\nnext-env.d.ts\n*.tsbuildinfo\n');
console.log(`generated ${path.relative(process.cwd(), out)} (${seeded ? 'seeded clone' : 'hand-built clone'}): ${components.length} components + ${seeded ? 'SiteScripts' : 'SiteChrome + SiteMotion'}`);

// ---------------- Seeded clones ----------------
// The page is the original's markup and stylesheets (trueclone seed), so the app keeps them as they are:
// - every file the clone serves (stylesheets, scripts, patches, media) is copied to public/ at the same path, and the
//   stylesheets and <style> blocks are written into <head> in document order, after the shadcn theme, as the browser
//   loads them in the HTML clone: no CSS pipeline in between (Next's would merge `transform` and `scale`, reject an
//   @import the browser accepts, and fail the build on a declaration the browser ignores). Tailwind's own class
//   scanning is limited to components/ui, because the original's compiled CSS already defines every class in the
//   markup and a second build from a different theme would compete with it;
// - <html> and <body> attributes (font-variable classes, dark mode, color-scheme), <base>, the title;
// - the largest body child is split at its first element with 3+ children: each of those becomes a component, the
//   wrappers around them stay in the page with their classes; other body children are components of their own;
//   <template> elements stay in the page as they are (a script clones them);
// - trueclone's players and script.js are served from public/ and run in order after hydration, with the data
//   blocks they read (script type="application/json") rendered in the page.
// A site of separate pages (meta.app "pages") gets one route per page, each with its own root layout (a route group:
// its own <head>, stylesheets, <html>/<body> attributes and title), exactly as each document of the HTML clone. A
// single-page app with routes gets one page for every address (an optional catch-all), as its host serves it.
async function seededApp() {
  const attrsOf = (n) => Object.fromEntries((n.attrs || []).map((a) => [a.name, a.value]));
  const siteMeta = JSON.parse(await fs.readFile(path.join(root, 'reference', 'meta.json'), 'utf8').catch(() => '{}'));
  const routes = siteMeta.routes || [];
  const spa = routes.length > 1 && siteMeta.app === 'single-page app';
  const separate = siteMeta.app === 'pages' ? routes.filter((r) => r.slug && !r.sameDocument) : [];

  // the documents: the captured page, and every separate page of the site (clone/<route>/index.html)
  const pages = [{ path: '/', slug: '', parts: [], head, body, htmlEl, title }];
  for (const r of separate) {
    const parts = r.path.split('/').filter(Boolean);
    // a folder named (x), [x], @x or _x is route syntax to Next, not an address
    if (!parts.length || parts.some((p) => /^[([@_]/.test(p))) { console.warn(`WARNING ${r.path}: not a Next.js route folder name, left out`); continue; }
    const text = await fs.readFile(path.join(cloneDir, ...parts, 'index.html'), 'utf8').catch(() => null);
    if (text === null) { console.warn(`WARNING ${r.path}: no clone/${parts.join('/')}/index.html (seed the site again)`); continue; }
    const d = parse(text);
    const h = find(d, 'html');
    const hd = find(h, 'head');
    pages.push({ path: r.path, slug: r.slug, parts, head: hd, body: find(h, 'body'), htmlEl: h, title: (els(hd).find((e) => e.tagName === 'title')?.childNodes[0]?.value || title).trim() });
  }
  docBodies.push(...pages.slice(1).map((pg) => pg.body));
  // where each page's relative references point: its own folder, or its <base href>
  for (const pg of pages) {
    const dir = '/' + pg.parts.map((p) => p + '/').join('');
    const base = attrsOf(els(pg.head).find((e) => e.tagName === 'base') || {}).href;
    pg.base = dir;
    if (base) { const u = new URL(base, `http://h${dir}`); if (u.host === 'h') pg.base = u.pathname.replace(/[^/]*$/, ''); }
  }

  // styles: <style> blocks and stylesheet links can sit inside <body> too, anywhere in the tree: same cascade, so they
  // follow the head's in document order
  const stylesOf = (pg) => {
    const found = [];
    (function walk(n) { for (const c of n.childNodes || []) { if (c.tagName === 'style' || (c.tagName === 'link' && /\bstylesheet\b/i.test(attrsOf(c).rel || ''))) found.push(c); else if (c.tagName !== 'template') walk(c); } })(pg.body);
    return found;
  };
  const layerOrder = []; // the site's own cascade layers, in the order its stylesheets first declare them
  let usesTailwind = false;
  const readsCss = (css) => {
    for (const m of css.matchAll(/@layer\s+([\w-]+(?:\s*,\s*[\w-]+)*)\s*[;{]/g)) for (const l of m[1].split(',').map((x) => x.trim())) if (!layerOrder.includes(l)) layerOrder.push(l);
    usesTailwind ||= /--tw-|tailwindcss v\d/.test(css);
  };
  const localFile = (href) => (/^\/(?!\/)/.test(href) ? path.join(cloneDir, ...decodeURIComponent(href.split(/[?#]/)[0]).split('/').filter(Boolean)) : null);
  const exists = (f) => fs.stat(f).then(() => true, () => false);
  const headAttr = (k, v) => `${k === 'crossorigin' ? 'crossOrigin' : k === 'hreflang' ? 'hrefLang' : k === 'referrerpolicy' ? 'referrerPolicy' : k === 'fetchpriority' ? 'fetchPriority' : k === 'imagesrcset' ? 'imageSrcSet' : k === 'imagesizes' ? 'imageSizes' : k}=${JSON.stringify(k === 'crossorigin' && v === '' ? 'anonymous' : v)}`;
  const linkTag = (a) => `<link ${Object.entries(a).filter(([k]) => !/^on/.test(k)).map(([k, v]) => headAttr(k, v)).join(' ')} />`;

  // the page's <head> as the HTML clone has it, in its order: <base>, stylesheets and <style> blocks (then the ones
  // in <body>), the seed's small head scripts (tc-vw keeps --tc-vw at 1% of the layout width: before paint), and the
  // other head links (icons, font preloads, preconnects, a manifest); local files are served from public/
  const headOf = async (pg) => {
    pageBase = pg.base;
    const lines = [];
    for (const e of [...els(pg.head), ...stylesOf(pg)]) {
      const a = attrsOf(e);
      const rel = String(a.rel || '').toLowerCase();
      if (e.tagName === 'base' && a.href) lines.push(`<base href=${JSON.stringify(a.href)} />`);
      else if (e.tagName === 'style') {
        const css = (e.childNodes || []).map((c) => c.value || '').join('');
        if (!css.trim()) continue;
        readsCss(css);
        const keep = Object.entries(a).filter(([k]) => ['id', 'media', 'title', 'nonce'].includes(k)).map(([k, v]) => `${k}=${JSON.stringify(v)} `).join('');
        lines.push(`<style ${keep}dangerouslySetInnerHTML={{ __html: ${JSON.stringify(cssUrls(css))} }} />`);
      } else if (e.tagName === 'link' && /\bstylesheet\b/.test(rel) && a.href) {
        const href = fixUrl(a.href);
        const file = localFile(href);
        if (file) {
          const css = await fs.readFile(file, 'utf8').catch(() => null);
          if (css === null) console.warn(`WARNING stylesheet ${a.href} not in clone/`);
          else readsCss(css);
        }
        lines.push(linkTag({ ...a, href }));
      } else if (e.tagName === 'script' && !/json|template/i.test(a.type || '')) {
        // every script of the head runs where the clone runs it, before paint: the seed's runtime (tc-*), the site's
        // boot scripts (scroll restoration, a theme class) and the head-*.html patches; a file is served from public/
        const keep = Object.entries(a).filter(([k]) => ['id', 'type', 'async', 'defer', 'nomodule', 'crossorigin'].includes(k) || /^data-/.test(k)).map(([k, v]) => (['async', 'defer', 'nomodule'].includes(k) ? (k === 'nomodule' ? 'noModule' : k) : `${k === 'crossorigin' ? 'crossOrigin' : k}=${JSON.stringify(v)}`)).join(' ');
        if (a.src) lines.push(`<script src=${JSON.stringify(/^(https?:)?\/\//.test(a.src) ? a.src : fixUrl(a.src))}${keep ? ` ${keep}` : ''} />`);
        else lines.push(`<script${keep ? ` ${keep}` : ''} dangerouslySetInnerHTML={{ __html: ${JSON.stringify((e.childNodes || []).map((c) => c.value || '').join(''))} }} />`);
      } else if (e.tagName === 'link' && a.href && /\b(icon|apple-touch-icon|mask-icon|preload|modulepreload|prefetch|preconnect|dns-prefetch|manifest)\b/.test(rel)) {
        if (/\b(preload|modulepreload)\b/.test(rel) && (a.as === 'script' || rel === 'modulepreload') && localFile(fixUrl(a.href))) continue; // the scripts' own preloads are written below
        lines.push(linkTag({ ...a, href: a.href.startsWith('data:') ? a.href : fixUrl(a.href) }));
      }
    }
    return lines;
  };

  // markup: each page's sections as components (components/site/ for the captured page, components/site/<slug>/ for
  // a separate page), the page itself in app/
  const SKIP_BODY = new Set(['script', 'noscript', 'next-route-announcer', 'style', 'link']);
  const size = (n) => (n.childNodes || []).reduce((s, c) => s + 1 + size(c), 0);
  const contains = (a, b) => { for (let n = b; n; n = n.parentNode) if (n === a) return true; return false; };
  const allNames = [];
  const markupOf = async (pg) => {
    pageBase = pg.base;
    const compDir = pg.slug ? `site/${pg.slug}` : 'site';
    await fs.mkdir(path.join(out, 'components', compDir), { recursive: true });
    const kids = els(pg.body).filter((e) => !SKIP_BODY.has(e.tagName));
    const content = kids.reduce((x, y) => (size(y) > size(x) ? y : x), kids[0]);
    let container = content;
    while (container && els(container).length < 3) {
      const inner = els(container);
      if (!inner.length) break;
      container = inner.reduce((x, y) => (size(y) > size(x) ? y : x));
    }
    const used = new Set();
    const names = [];
    // names: the element's id when it has one, otherwise its tag and position (utility classes such as "mx-auto" and
    // placeholder headings say nothing about what a section is)
    let counter = 0;
    const nameFor = (node, fallback) => {
      counter++;
      const id = attrsOf(node).id;
      let n = id ? pascal(id) : `${pascal(node.tagName) || fallback}${String(counter).padStart(2, '0')}`;
      if (/^\d/.test(n)) n = 'S' + n;
      n = n.slice(0, 40) || fallback;
      let k = n, i = 2;
      while (used.has(k) || k === 'SiteScripts') k = `${n}${i++}`;
      used.add(k);
      return k;
    };
    const from = pg.slug ? `clone/${pg.parts.join('/')}/index.html` : 'clone/index.html';
    const writeComp = async (compName, node) => {
      usesStyle = false;
      const jsx = toJsx(node, 3);
      const typeImport = usesStyle ? "import type { CSSProperties } from 'react';\n\n" : '';
      await fs.writeFile(path.join(out, 'components', compDir, `${compName}.tsx`), `// Generated from ${from} by scripts/next.mjs. Edit the HTML clone and regenerate.\n${typeImport}export default function ${compName}() {\n  return (\n    <>\n${jsx}\n    </>\n  );\n}\n`);
      names.push(compName);
    };
    // the page: wrappers kept inline down to the container, the container's children as components
    let pageUsesStyle = false;
    const wrap = async (node, depth) => {
      const pad = '  '.repeat(depth);
      if (node.nodeName === '#text' || node.nodeName === '#comment') return toJsx(node, depth);
      usesStyle = false;
      const attrs = jsxAttrs(node, false);
      pageUsesStyle ||= usesStyle;
      const children = [];
      for (const c of node.childNodes || []) {
        if (node === container && c.tagName) { const n = nameFor(c, 'Section'); await writeComp(n, c); children.push(`${pad}  <${n} />`); }
        else if (c.tagName && c !== container && !contains(c, container)) { usesStyle = false; children.push(toJsx(c, depth + 1)); pageUsesStyle ||= usesStyle; }
        else if (c.tagName) children.push(await wrap(c, depth + 1));
      }
      const inner = children.filter((s) => s && s.trim()).join('\n');
      return inner ? `${pad}<${node.tagName}${attrs}>\n${inner}\n${pad}</${node.tagName}>` : `${pad}<${node.tagName}${attrs} />`;
    };
    const parts = [];
    for (const k of kids) {
      if (k === content) parts.push(await wrap(k, 3));
      else { const n = nameFor(k, 'Part'); await writeComp(n, k); parts.push(`      <${n} />`); }
    }
    // data blocks the players read, and the scripts (served from public/, run in order after hydration): files and
    // inline scripts in document order; a module script stays a module
    const scripts = [];
    (function walk(n) { for (const c of n.childNodes || []) { if (c.tagName === 'script') scripts.push(c); else if (c.tagName !== 'template') walk(c); } })(pg.body);
    const dataBlocks = scripts.filter((s) => /json/.test(attrsOf(s).type || '') && attrsOf(s).id)
      .map((s) => `      <script type="${attrsOf(s).type}" id="${attrsOf(s).id}" dangerouslySetInnerHTML={{ __html: ${JSON.stringify((s.childNodes || []).map((c) => c.value || '').join(''))} }} />`);
    const scriptList = [];
    for (const s of scripts) {
      const a = { ...attrsOf(s), code: (s.childNodes || []).map((c) => c.value || '').join('') };
      if (/json/.test(a.type || '') || (a.src ? /^(https?:)?\/\//.test(a.src) : !a.code.trim())) continue;
      if (a.src) {
        const src = fixUrl(a.src).split(/[?#]/)[0];
        if (!localFile(src) || !(await exists(localFile(src)))) console.warn(`WARNING script referenced but not in clone/: ${a.src}`);
        scriptList.push({ src, ...(a.type === 'module' ? { type: 'module' } : {}) });
      } else scriptList.push({ code: a.code, ...(a.type === 'module' ? { type: 'module' } : {}) });
    }
    allNames.push(...names);
    return { compDir, names, parts, pageUsesStyle, dataBlocks, scriptList };
  };

  // globals.css = the shadcn theme only; the original's stylesheets come after it in <head>, so they come later in
  // the cascade and win every tie (same layer names, same variable names: the original is often Tailwind too)
  const heads = [];
  for (const pg of pages) heads.push(await headOf(pg));
  const theme = await fs.readFile(path.join(root, 'globals.css'), 'utf8').catch(() => '@import "tailwindcss";\n');
  // Tailwind's preflight resets what the browser draws by default (form controls, headings, lists); an original built
  // without Tailwind relies on those defaults, so its clone gets Tailwind's theme and utilities but not the reset
  const tailwind = usesTailwind ? '@import "tailwindcss" source(none);'
    : '/* no preflight: the original was not built with Tailwind and relies on browser defaults */\n@layer theme, base, components, utilities;\n@import "tailwindcss/theme.css" layer(theme);\n@import "tailwindcss/utilities.css" layer(utilities) source(none);';
  const scoped = theme.replace('@import "tailwindcss";', `${tailwind}\n@source "../components/ui";`);
  // Cascade layers are ordered by their first declaration anywhere in the page. globals.css loads first, so the site's
  // own order goes at its very top: otherwise Tailwind's "base" is declared before the site's "reset", and the site's
  // reset ends up overriding its own base.
  const layerHead = layerOrder.length ? `/* the original's cascade layer order, declared first (see scripts/next.mjs) */\n@layer ${layerOrder.join(', ')};\n` : '';
  await fs.writeFile(path.join(out, 'app', 'globals.css'), layerHead + scoped);

  await fs.writeFile(path.join(out, 'components', 'site', 'SiteScripts.tsx'), `'use client';
// Generated by scripts/next.mjs: runs the clone's scripts (trueclone's players, inline scripts, script.js) in order,
// once, the moment hydration is done. The HTML clone runs them as deferred scripts right after parsing; a component
// app cannot (hydration would re-render what they change), so the files are preloaded from the first byte (see
// layout.tsx), inserted together with async=false (ordered execution, parallel fetch), and the boot contract
// (<html class="tc-boot">, seed) keeps script-built regions hidden until the last one has run.
import { useLayoutEffect } from 'react';

export type SiteScript = { src?: string; code?: string; type?: string };

export default function SiteScripts({ scripts }: { scripts: SiteScript[] }) {
  useLayoutEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    if (w.__siteScripts) return; // React strict mode runs effects twice in dev
    w.__siteScripts = true;
    w.__tcInjected = true;
    // Next renders its metadata outlet, an empty <div hidden> holding only Suspense markers, as the body's first
    // child; the page's scripts may address elements by position (body > :nth-child(3), children[i]) as in the HTML
    // clone, so it goes after the page
    const outlet = document.body.firstElementChild as HTMLElement | null;
    if (outlet && outlet.tagName === 'DIV' && outlet.hidden && outlet.attributes.length === 1 && outlet.childNodes.length && [...outlet.childNodes].every((n) => n.nodeType === Node.COMMENT_NODE)) document.body.appendChild(outlet);
    let last: HTMLScriptElement | null = null;
    for (const { src, code, type } of scripts) {
      const s = document.createElement('script');
      if (type) s.type = type;
      if (src) { s.src = src; s.async = false; } else { s.textContent = code || ''; }
      document.body.appendChild(s);
      if (src) last = s;
    }
    const boot = () => { const b = (w as { tcBoot?: { release: () => void } }).tcBoot; if (b) b.release(); else requestAnimationFrame(() => document.documentElement.classList.remove('tc-boot')); };
    if (last) last.addEventListener('load', boot), last.addEventListener('error', boot); else boot();
  }, [scripts]);
  return null;
}
`);

  for (const [i, pg] of pages.entries()) {
    const m = await markupOf(pg);
    // where this page lives: a single page at app/; a single-page app at app/[[...slug]]/ (every address); a site of
    // separate pages in one route group per page, app/(home)/ and app/(<slug>)/<route>/, each with its own root layout
    const group = separate.length ? path.join('app', pg.slug ? `(${pg.slug})` : '(home)') : 'app';
    const pageDir = path.join(out, group, ...pg.parts, ...(spa ? ['[[...slug]]'] : []));
    const layoutDir = path.join(out, group);
    await fs.mkdir(pageDir, { recursive: true });
    const globalsImport = path.relative(layoutDir, path.join(out, 'app', 'globals.css')).split(path.sep).join('/');
    usesStyle = false;
    pageBase = pg.base;
    const htmlAttrs = jsxAttrs(pg.htmlEl, false);
    const bodyAttrs = jsxAttrs(pg.body, false);
    const layoutStyle = usesStyle;
    const preloads = m.scriptList.filter((s) => s.src).map((s) => `        <link rel="${s.type === 'module' ? 'modulepreload' : 'preload'}" href=${JSON.stringify(s.src)}${s.type === 'module' ? '' : ' as="script"'} />`);
    await fs.writeFile(path.join(layoutDir, 'layout.tsx'), `// Generated by scripts/next.mjs: the <html>, <head> and <body> of ${pg.slug ? `clone/${pg.parts.join('/')}/index.html` : 'clone/index.html'}
import type { Metadata } from 'next';
${layoutStyle ? "import type { CSSProperties } from 'react';\n" : ''}import '${globalsImport.startsWith('.') ? globalsImport : './' + globalsImport}';

// no title here: Next streams a metadata title in after hydration, over the one the clone's script sets for the
// address (a case study's own title); the page's <title> is plain markup below, and the script owns it
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html${htmlAttrs} suppressHydrationWarning>
      <head>
        <title>{${JSON.stringify(pg.title)}}</title>
        {/* the seed's head runtime (tc-runtime) leaves the boot to SiteScripts, which runs the clone's scripts after hydration */}
        <script dangerouslySetInnerHTML={{ __html: "window.__tcInjected = true" }} />
        {/* the original's head, in its order, after the theme: stylesheets as the browser loads them (no CSS pipeline) */}
${heads[i].map((l) => `        ${l}`).join('\n')}
        {/* the clone's scripts start downloading with the page; SiteScripts runs them the moment hydration is done */}
${preloads.join('\n')}
      </head>
      <body${bodyAttrs} suppressHydrationWarning>{children}</body>
    </html>
  );
}
`);
    await fs.writeFile(path.join(pageDir, 'page.tsx'), `// Generated by scripts/next.mjs from a seeded clone: the original's structure, one component per section.
${m.pageUsesStyle ? "import type { CSSProperties } from 'react';\n" : ''}${m.names.map((c) => `import ${c} from '@/components/${m.compDir}/${c}';`).join('\n')}
import SiteScripts from '@/components/site/SiteScripts';

const SCRIPTS = ${JSON.stringify(m.scriptList)};

export default function Page() {
  return (
    <>
${m.parts.join('\n')}
${m.dataBlocks.join('\n')}
      <SiteScripts scripts={SCRIPTS} />
    </>
  );
}
`);
  }
  // the captured page at its own address too (/products/x, /en/getting-started), as in the clone: a link, Back or a
  // reload there finds the page (a single-page app already answers every address)
  const startParts = (() => { try { return new URL(siteMeta.finalUrl || siteMeta.url).pathname.split('/').filter(Boolean).map(decodeURIComponent); } catch { return []; } })();
  if (!spa && startParts.length && !startParts.some((p) => /^[([@_.]|[\\:*?"<>|]/.test(p))) {
    const group = separate.length ? '(home)' : '';
    const dir = path.join(out, 'app', ...(group ? [group] : []), ...startParts);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'page.tsx'), `// Generated by scripts/next.mjs: the captured page at its own address (${'/' + startParts.join('/')}), as at the app's root.\nexport { default } from '@/app/${group ? `${group}/` : ''}page';\n`);
  }
  if (spa) console.log(`routes: ${routes.map((r) => r.path).join(', ')} all served by app/[[...slug]]/page.tsx (a single-page app: the clone's script shows the view for the address)`);
  if (separate.length) console.log(`routes: ${pages.map((pg) => pg.path).join(', ')}, one Next.js route each (a site of separate pages, each with its own root layout)`);
  pageBase = '/';
  return allNames;
}

} // end of the document generation (an own-bundle clone took the branch above)

// ---------------- Install / build / verify ----------------
// npm/npx are .cmd files on Windows and need a shell; Node warns (DEP0190) when a shell gets separate arguments, so
// build one quoted command line there instead
const spawnCmd = (cmd, args, opts = {}) => (process.platform === 'win32'
  ? spawn([cmd, ...args].map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)).join(' '), { ...opts, shell: true })
  : spawn(cmd, args, opts));
const run = (cmd, args, opts = {}) => new Promise((resolve, reject) => {
  const p = spawnCmd(cmd, args, { cwd: out, stdio: 'inherit', ...opts });
  p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`))));
});
if (flags.install || flags.build || flags.verify) await run('npm', ['install', '--no-audit', '--no-fund']);
if (flags.build || flags.verify) await run('npx', ['next', 'build']);
// A server left running on the port would keep serving the OLD build (or a half-deleted one after a rebuild), and
// another app on the machine can hold the port on another interface (0.0.0.0 while we probe 127.0.0.1): the scores
// would describe the wrong thing. The port must be free on every interface, and the page served must be this app.
const freeOn = (p, host) => new Promise((resolve) => { const t = net.createServer().once('error', () => resolve(false)).once('listening', () => t.close(() => resolve(true))).listen(p, host); });
const freePort = async (start) => {
  for (let p = start; p < start + 50; p++) {
    if ((await freeOn(p, '127.0.0.1')) && (await freeOn(p, '0.0.0.0')) && (await freeOn(p, '::').catch(() => true))) return p;
  }
  throw new Error('no free port');
};
if (flags.verify) {
  const verifyPort = await freePort(port);
  if (verifyPort !== port) console.warn(`port ${port} is busy (another server?) - verifying on ${verifyPort}`);
  // the app identifies itself: a token in public/ that only this build serves
  const token = `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await fs.mkdir(path.join(out, 'public'), { recursive: true });
  await fs.writeFile(path.join(out, 'public', 'trueclone-app.txt'), token);
  const server = spawnCmd('npx', ['next', 'start', '-p', String(verifyPort)], { cwd: out, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  server.stdout.on('data', (d) => { log += d; });
  server.stderr.on('data', (d) => { log += d; });
  const url = `http://127.0.0.1:${verifyPort}/`;
  let ours = false;
  for (let i = 0; i < 60 && !ours; i++) {
    try { ours = (await (await fetch(`${url}trueclone-app.txt`)).text()).trim() === token; } catch { /* starting */ }
    if (!ours) await new Promise((r) => setTimeout(r, 1000));
  }
  // synchronous: the process may exit right after, and an async taskkill can lose the race (a server left behind)
  const stop = () => (process.platform === 'win32' ? spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' }) : server.kill());
  if (!ours) {
    stop();
    console.error(`the Next.js app did not come up as itself on ${url} (not scored). Server output:\n${log.split('\n').slice(-15).join('\n')}`);
    process.exit(1);
  }
  const lab = path.resolve('.');
  const meta = JSON.parse(await fs.readFile(path.join(root, 'reference', 'meta.json'), 'utf8'));
  // Same checks, same entry point as the HTML clone, written straight to compare-next/ and REPORT.next.md (lib.mjs
  // COMPARE / REPORT_FILE): the HTML clone's compare/ and REPORT.md are never touched or moved.
  try {
    // every check, every size, on the app as built (no quick mode: an app verdict is a whole verdict, never older
    // results paired with newer ones). The units carry the app's own content hash (identity.mjs, next/), so an app
    // changed after this verification is stale, and the delivered app is the one verified.
    await run('node', [path.join(path.dirname(toPath(import.meta.url)), 'score.mjs'), name, '--url', url, '--fresh'], { cwd: lab, env: { ...process.env, TC_COMPARE: 'compare-next', TC_REPORT: 'REPORT.next.md' } });
    // the app looked at next to the original too, frame by frame, at the widest and a phone size, on every route
    // (compare-next/review/): a frame where the app differs from the clone's is reviewed by eye like any other. A review
    // that cannot run is a failed verification, not a warning.
    if (!meta.canvasApp) {
      const routePaths = [null, ...(meta.routes || []).filter((r) => r.slug).map((r) => r.path)];
      for (const r of routePaths) for (const size of ['wide', 'mobile']) {
        await run('node', [path.join(path.dirname(toPath(import.meta.url)), 'review.mjs'), name, '--size', size, '--url', url, ...(r ? ['--route', r] : [])], { cwd: lab, env: { ...process.env, TC_COMPARE: 'compare-next', TC_REPORT: 'REPORT.next.md' } });
      }
      await run('node', [path.join(path.dirname(toPath(import.meta.url)), 'report.mjs'), name], { cwd: lab, env: { ...process.env, TC_COMPARE: 'compare-next', TC_REPORT: 'REPORT.next.md' } });
    }
  } finally {
    stop();
    console.log(`Next.js app scores: ${path.relative(process.cwd(), path.join(root, 'REPORT.next.md'))} (details in compare-next/); the HTML clone's REPORT.md is unchanged`);
  }
}
