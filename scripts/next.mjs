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
// usage: node scripts/next.mjs <name> [--install] [--build] [--verify [--quick]] [--port 3100]
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { parse, serialize } from 'parse5';
import { fileURLToPath as toPath } from 'node:url';
import { parseArgs } from './lib.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) {
  console.error('usage: npm run next -- <name> [--install] [--build] [--verify] [--port 3100]');
  process.exit(1);
}
const root = path.resolve('sites', name);
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
const fixUrl = (v) => (v.startsWith('assets/') ? '/' + v : v);
const attrString = (n, v) => (/["\\]/.test(v) ? `${n}={${JSON.stringify(v)}}` : `${n}="${v}"`);

let usesStyle = false; // set while converting a component whose style objects need the CSSProperties type (custom properties like --i)
function jsxAttrs(node, inSvg) {
  const parts = [];
  for (const a of node.attrs || []) {
    if (/^on[a-z]+$/.test(a.name)) continue; // inline handlers are strings; the motion script owns behaviour
    // an input's value/checked are its starting state here; as plain props React would make the field read-only
    if (node.tagName === 'input' && a.name === 'value') { parts.push(attrString('defaultValue', a.value)); continue; }
    if (node.tagName === 'input' && a.name === 'checked') { parts.push('defaultChecked'); continue; }
    if (LEGACY.has(a.name) && !inSvg) { parts.push(`{...{ ${JSON.stringify(a.name)}: ${JSON.stringify(a.value)} }}`); continue; }
    // url(assets/…) in an inline style resolves against the page in the clone; the app serves assets at /assets
    if (a.name === 'style') { usesStyle = true; parts.push(`style={${JSON.stringify(styleObject(a.value.replace(/url\((['"]?)(?:\.\.\/)?assets\//g, (m, q) => `url(${q}/assets/`)))} as CSSProperties}`); continue; }
    // SVG elements have no typed boolean props (hidden), so they go through the spread too
    if (BOOL.has(a.name) && (a.value === '' || a.value === a.name)) { parts.push(inSvg ? `{...{ ${JSON.stringify(a.name)}: true }}` : RENAME[a.name] || a.name); continue; }
    let n = RENAME[a.name] || a.name;
    if (!RENAME[a.name] && inSvg && !n.startsWith('data-') && !n.startsWith('aria-')) n = camel(n);
    if (n === 'xmlns:xlink') continue;
    // an empty src/srcset/poster makes the browser request the page itself (React logs an error for each); an
    // empty href means "this page", which # also does without the request
    if (['src', 'srcSet', 'poster'].includes(n) && a.value === '') continue;
    if (n === 'href' && a.value === '') { parts.push('href="#"'); continue; }
    const v = ['src', 'href', 'poster', 'srcSet'].includes(n) ? fixUrl(a.value) : a.value;
    // React types these as numbers: tabIndex="0" fails type-checking, tabIndex={0} is the same attribute
    if (['tabIndex', 'colSpan', 'rowSpan', 'maxLength', 'minLength', 'span', 'size', 'cols', 'rows'].includes(n) && /^-?\d+$/.test(v)) { parts.push(`${n}={${v}}`); continue; }
    parts.push(attrString(n, v));
  }
  return parts.length ? ' ' + parts.join(' ') : '';
}

// JSX trims and collapses whitespace that HTML renders, so text is written to keep exactly what the browser showed:
// verbatim where white-space is preserved (code samples), elsewhere with its edge spaces as {" "}
const BLOCK = new Set(['address', 'article', 'aside', 'blockquote', 'body', 'dd', 'details', 'dialog', 'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hr', 'html', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'summary', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul']);
const SPACE = '{" "}';
const keepsWhitespace = (node) => ['pre', 'textarea', 'listing', 'xmp'].includes(node.tagName)
  || (node.attrs || []).some((a) => (a.name === 'class' && /(^|\s)whitespace-(pre|break-spaces)/.test(a.value)) || (a.name === 'style' && /white-space:\s*(pre|break-spaces)/.test(a.value)));
const textJsx = (s) => (/[{}<>&"']/.test(s) ? `{${JSON.stringify(s)}}` : s);

function toJsx(node, depth, inSvg = false, inPre = false) {
  const pad = '  '.repeat(depth);
  if (node.nodeName === '#comment') return '';
  if (node.nodeName === '#text') {
    if (inPre) return `{${JSON.stringify(node.value)}}`;
    if (!node.value.trim()) {
      // whitespace between two inline things renders as one space; next to a block, or at an edge, it renders nothing
      const sibs = node.parentNode?.childNodes || [];
      const i = sibs.indexOf(node);
      const prev = sibs[i - 1], next = sibs[i + 1];
      return prev && next && !BLOCK.has(prev.tagName) && !BLOCK.has(next.tagName) ? SPACE : '';
    }
    const text = node.value.replace(/\s+/g, ' ');
    return `${/^\s/.test(text) ? SPACE : ''}${textJsx(text.trim())}${/\s$/.test(text) ? SPACE : ''}`;
  }
  if (['script', 'noscript', 'style'].includes(node.nodeName)) return '';
  const tag = node.tagName;
  const svg = inSvg || tag === 'svg';
  const pre = inPre || keepsWhitespace(node);
  const attrs = jsxAttrs(node, svg);
  // a host with a declarative shadow root (<template shadowrootmode>): the browser's HTML parser builds the shadow
  // root from the streamed markup, React must not touch the inside, so the host's content is emitted as raw HTML
  if ((node.childNodes || []).some((c) => c.tagName === 'template' && (c.attrs || []).some((a) => a.name === 'shadowrootmode'))) {
    const inner = serialize(node).replace(/url\((['"]?)(?:\.\.\/)?assets\//g, (m, q) => `url(${q}/assets/`).replace(/(src|href|poster)="assets\//g, '$1="/assets/');
    return `${pad}<${tag}${attrs} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: ${JSON.stringify(inner)} }} />`;
  }
  const kids = (node.childNodes || []).map((c) => toJsx(c, depth + 1, svg, pre)).filter((s) => s !== '');
  if (VOID.has(tag) || !kids.length) return `${pad}<${tag}${attrs} />`;
  const inline = kids.every((k) => !k.startsWith('  ')) && kids.join('').length < 120;
  if (inline) return `${pad}<${tag}${attrs}>${kids.map((k) => k.trim() || ' ').join('')}</${tag}>`;
  return `${pad}<${tag}${attrs}>\n${kids.map((k) => (k.startsWith(' ') && k.trim() ? k : pad + '  ' + k.trim())).join('\n')}\n${pad}</${tag}>`;
}

const pascal = (s) => s.split(/[^a-z0-9]+/i).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('');
const els = (n) => (n.childNodes || []).filter((c) => c.tagName);
const find = (n, tag) => els(n).find((c) => c.tagName === tag);

// ---------------- Generate ----------------
const html = await fs.readFile(path.join(cloneDir, 'index.html'), 'utf8');
const doc = parse(html);
const htmlEl = find(doc, 'html');
const head = find(htmlEl, 'head');
const body = find(htmlEl, 'body');
const title = (els(head).find((e) => e.tagName === 'title')?.childNodes[0]?.value || name).trim();
const fontLinks = els(head).filter((e) => e.tagName === 'link').map((e) => Object.fromEntries(e.attrs.map((a) => [a.name, a.value])))
  .filter((l) => /fonts\.(googleapis|gstatic)\.com/.test(l.href || ''));

await fs.rm(path.join(out, 'app'), { recursive: true, force: true });
await fs.rm(path.join(out, 'components', 'site'), { recursive: true, force: true });
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

// Assets, design system docs, config
await fs.rm(path.join(out, 'public', 'assets'), { recursive: true, force: true });
await fs.cp(path.join(cloneDir, 'assets'), path.join(out, 'public', 'assets'), { recursive: true });
for (const f of ['DESIGN.md', 'design-tokens.json']) await fs.copyFile(path.join(root, f), path.join(out, f)).catch(() => {});
await fs.writeFile(path.join(out, 'package.json'), JSON.stringify(PKG, null, 2) + '\n');
// custom elements (<code-island>, <swiper-container>) have no JSX type: declared here, or `next build` fails
const custom = new Set();
(function walk(n) { if (n.tagName && n.tagName.includes('-')) custom.add(n.tagName); for (const c of n.childNodes || []) walk(c); })(body);
if (custom.size) {
  await fs.writeFile(path.join(out, 'custom-elements.d.ts'), `// Generated by scripts/next.mjs: the page's custom elements, typed for JSX.
import type { DetailedHTMLProps, HTMLAttributes } from 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
${[...custom].map((t) => `      ${JSON.stringify(t)}: DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, unknown>;`).join('\n')}
    }
  }
}
`);
} else await fs.rm(path.join(out, 'custom-elements.d.ts'), { force: true });
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
// - the stylesheets and inline <style> blocks of <head>, in their order, after the shadcn theme; Tailwind's own class
//   scanning is limited to components/ui, because the original's compiled CSS already defines every class in the
//   markup and a second build from a different theme would compete with it;
// - <html> and <body> attributes (font-variable classes, dark mode, color-scheme);
// - the largest body child is split at its first element with 3+ children: each of those becomes a component, the
//   wrappers around them stay in the page with their classes; other body children are components of their own;
// - trueclone's players and script.js are served from public/ and run in order after hydration, with the data
//   blocks they read (script type="application/json") rendered in the page.
async function seededApp() {
  const attrsOf = (n) => Object.fromEntries((n.attrs || []).map((a) => [a.name, a.value]));
  // styles
  await fs.mkdir(path.join(out, 'styles', 'site'), { recursive: true });
  const imports = [];
  let inline = 0, usesTailwind = false;
  // <style> blocks (and stylesheet links) can sit inside <body> too, anywhere in the tree: same cascade, so they
  // follow the head's in document order
  const bodyStyles = [];
  (function walk(n) { for (const c of n.childNodes || []) { if (c.tagName === 'style' || c.tagName === 'link') bodyStyles.push(c); else walk(c); } })(body);
  for (const e of [...els(head), ...bodyStyles]) {
    const a = attrsOf(e);
    let css = null, file = null;
    if (e.tagName === 'link' && a.rel === 'stylesheet' && a.href && !/^(https?:)?\/\//.test(a.href)) {
      css = await fs.readFile(path.join(cloneDir, a.href), 'utf8').catch(() => null);
      file = path.basename(a.href);
    } else if (e.tagName === 'style') {
      css = (e.childNodes || []).map((c) => c.value || '').join('');
      file = `inline-${++inline}.css`;
    }
    if (css === null) continue;
    // stylesheets lived in clone/css/ (assets at ../assets/), inline blocks in the page (assets at assets/)
    css = css.replace(/url\((['"]?)(?:\.\.\/)?assets\//g, (m, q) => `url(${q}/assets/`);
    usesTailwind ||= /--tw-|tailwindcss v\d/.test(css);
    await fs.writeFile(path.join(out, 'styles', 'site', file), css);
    imports.push(`import '../styles/site/${file}';`);
  }
  // globals.css = the shadcn theme only; the original's stylesheets are imported by layout.tsx AFTER it, so they come
  // later in the cascade and win every tie (same layer names, same variable names: the original is often Tailwind too)
  const theme = await fs.readFile(path.join(root, 'globals.css'), 'utf8').catch(() => '@import "tailwindcss";\n');
  // Tailwind's preflight resets what the browser draws by default (form controls, headings, lists); an original built
  // without Tailwind relies on those defaults, so its clone gets Tailwind's theme and utilities but not the reset
  const tailwind = usesTailwind ? '@import "tailwindcss" source(none);'
    : '/* no preflight: the original was not built with Tailwind and relies on browser defaults */\n@layer theme, base, components, utilities;\n@import "tailwindcss/theme.css" layer(theme);\n@import "tailwindcss/utilities.css" layer(utilities) source(none);';
  const scoped = theme.replace('@import "tailwindcss";', `${tailwind}\n@source "../components/ui";`);
  await fs.writeFile(path.join(out, 'app', 'globals.css'), scoped);
  const siteCssImports = imports;

  // markup
  const SKIP_BODY = new Set(['script', 'noscript', 'next-route-announcer', 'template']);
  const kids = els(body).filter((e) => !SKIP_BODY.has(e.tagName));
  const size = (n) => (n.childNodes || []).reduce((s, c) => s + 1 + size(c), 0);
  const content = kids.reduce((x, y) => (size(y) > size(x) ? y : x), kids[0]);
  let container = content;
  while (els(container).length < 3) {
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
    while (used.has(k)) k = `${n}${i++}`;
    used.add(k);
    return k;
  };
  const writeComp = async (compName, node) => {
    usesStyle = false;
    const jsx = toJsx(node, 3);
    const typeImport = usesStyle ? "import type { CSSProperties } from 'react';\n\n" : '';
    await fs.writeFile(path.join(out, 'components', 'site', `${compName}.tsx`), `// Generated from clone/index.html by scripts/next.mjs. Edit the HTML clone and regenerate.\n${typeImport}export default function ${compName}() {\n  return (\n    <>\n${jsx}\n    </>\n  );\n}\n`);
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
      else if (c.tagName && c !== container && !c.childNodes?.some(() => false) && !(contains(c, container))) { usesStyle = false; children.push(toJsx(c, depth + 1)); pageUsesStyle ||= usesStyle; }
      else if (c.tagName) children.push(await wrap(c, depth + 1));
    }
    const body = children.filter((s) => s && s.trim()).join('\n');
    return body ? `${pad}<${node.tagName}${attrs}>\n${body}\n${pad}</${node.tagName}>` : `${pad}<${node.tagName}${attrs} />`;
  };
  const contains = (a, b) => { for (let n = b; n; n = n.parentNode) if (n === a) return true; return false; };
  const pageParts = [];
  for (const k of kids) {
    if (k === content) pageParts.push(await wrap(k, 3));
    else { const n = nameFor(k, 'Part'); await writeComp(n, k); pageParts.push(`      <${n} />`); }
  }
  // data blocks the players read, and the scripts themselves (copied to public/, run in order after hydration)
  const scripts = els(body).filter((e) => e.tagName === 'script');
  const dataBlocks = scripts.filter((s) => /json/.test(attrsOf(s).type || '') && attrsOf(s).id)
    .map((s) => `      <script type="${attrsOf(s).type}" id="${attrsOf(s).id}" dangerouslySetInnerHTML={{ __html: ${JSON.stringify((s.childNodes || []).map((c) => c.value || '').join(''))} }} />`);
  // the scripts, copied to public/ at their own relative paths (a script that loads a sibling file keeps working),
  // with the files their import statements and import() calls name; a module script stays a module
  // in document order: files (copied) and inline scripts (run as written); data blocks are rendered in the page
  const scriptTags = scripts.map((s) => ({ ...attrsOf(s), code: (s.childNodes || []).map((c) => c.value || '').join('') }))
    .filter((a) => !/json/.test(a.type || '') && (a.src ? !/^(https?:)?\/\//.test(a.src) : a.code.trim()));
  const copied = new Set();
  const copyScript = async (rel, depth = 0) => {
    const clean = rel.split(/[?#]/)[0].replace(/^\.\//, '');
    if (copied.has(clean) || depth > 4) return;
    copied.add(clean);
    const from = path.join(cloneDir, clean);
    const text = await fs.readFile(from, 'utf8').catch(() => null);
    if (text === null) { console.warn(`WARNING script referenced but not in clone/: ${clean}`); return; }
    await fs.mkdir(path.dirname(path.join(out, 'public', clean)), { recursive: true });
    await fs.copyFile(from, path.join(out, 'public', clean));
    for (const m of text.matchAll(/(?:^|[^\w$.])import\s*(?:[\w$*{},\s]+from\s*)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const spec = m[1] || m[2];
      if (!spec || /^(https?:)?\/\//.test(spec) || !/^[./]/.test(spec)) continue;
      await copyScript(path.posix.join(path.posix.dirname(clean), spec), depth + 1);
    }
    // a script file named in a string (new URL('vendor/three.module.min.js', here), a worker, a lazy loader)
    for (const m of text.matchAll(/['"]([\w./-]+\.m?js)['"]/g)) {
      const rel = path.posix.join(path.posix.dirname(clean), m[1].replace(/^\//, ''));
      if (!copied.has(rel) && await fs.stat(path.join(cloneDir, rel)).then(() => true, () => false)) await copyScript(rel, depth + 1);
    }
  };
  for (const a of scriptTags) if (a.src) await copyScript(a.src);
  const scriptList = scriptTags.map((a) => ({ ...(a.src ? { src: '/' + a.src.split(/[?#]/)[0].replace(/^\.\//, '') } : { code: a.code }), ...(a.type === 'module' ? { type: 'module' } : {}) }));
  await fs.writeFile(path.join(out, 'components', 'site', 'SiteScripts.tsx'), `'use client';
// Generated by scripts/next.mjs: runs the clone's scripts (trueclone's players, inline scripts, script.js) in order,
// once, the moment hydration is done. The HTML clone runs them as deferred scripts right after parsing; a component
// app cannot (hydration would re-render what they change), so the files are preloaded from the first byte (see
// layout.tsx), inserted together with async=false (ordered execution, parallel fetch), and the boot contract
// (<html class="tc-boot">, seed) keeps script-built regions hidden until the last one has run.
import { useLayoutEffect } from 'react';

const SCRIPTS: { src?: string; code?: string; type?: string }[] = ${JSON.stringify(scriptList)};

export default function SiteScripts() {
  useLayoutEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    if (w.__siteScripts) return; // React strict mode runs effects twice in dev
    w.__siteScripts = true;
    w.__tcInjected = true;
    let last: HTMLScriptElement | null = null;
    for (const { src, code, type } of SCRIPTS) {
      const s = document.createElement('script');
      if (type) s.type = type;
      if (src) { s.src = src; s.async = false; } else { s.textContent = code || ''; }
      document.body.appendChild(s);
      if (src) last = s;
    }
    const boot = () => { const b = (w as { tcBoot?: { release: () => void } }).tcBoot; if (b) b.release(); else requestAnimationFrame(() => document.documentElement.classList.remove('tc-boot')); };
    if (last) last.addEventListener('load', boot), last.addEventListener('error', boot); else boot();
  }, []);
  return null;
}
`);
  // layout: the original's <html> and <body> attributes
  usesStyle = false;
  const htmlAttrs = jsxAttrs(htmlEl, false);
  const bodyAttrs = jsxAttrs(body, false);
  const layoutStyle = usesStyle;
  await fs.writeFile(path.join(out, 'app', 'layout.tsx'), `// Generated by scripts/next.mjs
import type { Metadata } from 'next';
${layoutStyle ? "import type { CSSProperties } from 'react';\n" : ''}import './globals.css';
// the original's stylesheets, in its <head> order, after the theme
${siteCssImports.join('\n')}

export const metadata: Metadata = {
  title: ${JSON.stringify(title)},
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html${htmlAttrs} suppressHydrationWarning>
      <head>
        {/* the clone's scripts start downloading with the page; SiteScripts runs them the moment hydration is done */}
${scriptList.filter((s) => s.src).map((s) => `        <link rel="${s.type === 'module' ? 'modulepreload' : 'preload'}" href=${JSON.stringify(s.src)}${s.type === 'module' ? '' : ' as="script"'} />`).join('\n')}
      </head>
      <body${bodyAttrs} suppressHydrationWarning>{children}</body>
    </html>
  );
}
`);
  await fs.writeFile(path.join(out, 'app', 'page.tsx'), `// Generated by scripts/next.mjs from a seeded clone: the original's structure, one component per section.
${pageUsesStyle ? "import type { CSSProperties } from 'react';\n" : ''}${names.map((c) => `import ${c} from '@/components/site/${c}';`).join('\n')}
import SiteScripts from '@/components/site/SiteScripts';

export default function Page() {
  return (
    <>
${pageParts.join('\n')}
${dataBlocks.join('\n')}
      <SiteScripts />
    </>
  );
}
`);
  return names;
}

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
// A server left running on the port would keep serving the OLD build (or a half-deleted one after a rebuild)
// and the scores would describe the wrong thing. Always verify on a port that is actually free.
const freePort = async (start) => {
  for (let p = start; p < start + 50; p++) {
    const ok = await new Promise((resolve) => { const t = net.createServer().once('error', () => resolve(false)).once('listening', () => t.close(() => resolve(true))).listen(p, '127.0.0.1'); });
    if (ok) return p;
  }
  throw new Error('no free port');
};
if (flags.verify) {
  const verifyPort = await freePort(port);
  if (verifyPort !== port) console.warn(`port ${port} is busy (another server?) - verifying on ${verifyPort}`);
  const server = spawnCmd('npx', ['next', 'start', '-p', String(verifyPort)], { cwd: out, stdio: 'ignore' });
  const url = `http://127.0.0.1:${verifyPort}/`;
  for (let i = 0; i < 60; i++) { try { if ((await fetch(url)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 1000)); }
  const lab = path.resolve('.');
  const score = (args) => run('node', args, { cwd: lab });
  try {
    // same scoring entry point as the HTML clone: time limit per step, summary at the end
    await score([path.join(path.dirname(toPath(import.meta.url)), 'score.mjs'), name, '--url', url, ...(flags.quick ? ['--quick'] : [])]);
  } finally {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(server.pid), '/T', '/F']);
    else server.kill();
  }
}
