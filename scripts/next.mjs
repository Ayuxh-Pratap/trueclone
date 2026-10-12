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
import { parse } from 'parse5';
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

// Versions: motion libraries pinned to what the verified HTML clone loads, so behaviour is identical.
const PKG = {
  name: `${name}-next`, private: true, version: '0.1.0',
  scripts: { dev: 'next dev', build: 'next build', start: `next start -p ${port}` },
  dependencies: {
    next: '16.4.0', react: '19.3.0', 'react-dom': '19.3.0',
    gsap: '3.13.0', lenis: '1.1.18', swiper: '11.2.6', three: '0.128.0',
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
  class: 'className', for: 'htmlFor', tabindex: 'tabIndex', readonly: 'readOnly', maxlength: 'maxLength', minlength: 'minLength',
  crossorigin: 'crossOrigin', autoplay: 'autoPlay', playsinline: 'playsInline', srcset: 'srcSet', autocomplete: 'autoComplete',
  enctype: 'encType', colspan: 'colSpan', rowspan: 'rowSpan', contenteditable: 'contentEditable', spellcheck: 'spellCheck',
  novalidate: 'noValidate', allowfullscreen: 'allowFullScreen', frameborder: 'frameBorder', inputmode: 'inputMode', datetime: 'dateTime',
};
const BOOL = new Set(['muted', 'loop', 'playsinline', 'autoplay', 'controls', 'disabled', 'checked', 'required', 'hidden', 'novalidate', 'readonly', 'multiple', 'selected', 'allowfullscreen']);
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
    if (a.name === 'style') { usesStyle = true; parts.push(`style={${JSON.stringify(styleObject(a.value))} as CSSProperties}`); continue; }
    if (BOOL.has(a.name) && (a.value === '' || a.value === a.name)) { parts.push(RENAME[a.name] || a.name); continue; }
    let n = RENAME[a.name] || a.name;
    if (!RENAME[a.name] && inSvg && !n.startsWith('data-') && !n.startsWith('aria-')) n = camel(n);
    if (n === 'xmlns:xlink') continue;
    const v = ['src', 'href', 'poster', 'srcSet'].includes(n) ? fixUrl(a.value) : a.value;
    parts.push(attrString(n, v));
  }
  return parts.length ? ' ' + parts.join(' ') : '';
}

function toJsx(node, depth, inSvg = false) {
  const pad = '  '.repeat(depth);
  if (node.nodeName === '#comment') return '';
  if (node.nodeName === '#text') {
    if (!node.value.trim()) return node.value.includes('\n') ? '' : ' ';
    const text = node.value.replace(/\s+/g, ' ');
    return /[{}<>&"']/.test(text) ? `{${JSON.stringify(text)}}` : text;
  }
  if (['script', 'noscript', 'style'].includes(node.nodeName)) return '';
  const tag = node.tagName;
  const svg = inSvg || tag === 'svg';
  const attrs = jsxAttrs(node, svg);
  const kids = (node.childNodes || []).map((c) => toJsx(c, depth + 1, svg)).filter((s) => s !== '');
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

// Sections: everything before <main> is "chrome" (nav, menu, intro, cursor); each child of <main> is a section.
const mainEl = find(body, 'main');
const chrome = els(body).filter((e) => e !== mainEl && e.tagName !== 'script');
const sections = mainEl ? els(mainEl) : [];
const used = new Set();
const components = [];
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

// Assets, design system docs, config
await fs.rm(path.join(out, 'public', 'assets'), { recursive: true, force: true });
await fs.cp(path.join(cloneDir, 'assets'), path.join(out, 'public', 'assets'), { recursive: true });
for (const f of ['DESIGN.md', 'design-tokens.json']) await fs.copyFile(path.join(root, f), path.join(out, f)).catch(() => {});
await fs.writeFile(path.join(out, 'package.json'), JSON.stringify(PKG, null, 2) + '\n');
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
console.log(`generated ${path.relative(process.cwd(), out)}: ${components.length} section components + SiteChrome + SiteMotion`);

// ---------------- Install / build / verify ----------------
const run = (cmd, args, opts = {}) => new Promise((resolve, reject) => {
  const p = spawn(cmd, args, { cwd: out, stdio: 'inherit', shell: process.platform === 'win32', ...opts });
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
  const server = spawn('npx', ['next', 'start', '-p', String(verifyPort)], { cwd: out, shell: process.platform === 'win32', stdio: 'ignore' });
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
