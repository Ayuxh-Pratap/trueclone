// A Next.js conversion of a finished HTML clone (workflow B, a separate request: convert.mjs): its project scaffold, its
// automated source checks, its review criteria, and its evaluation. The fidelity of the app is measured like the
// clone's, against the original reference (verdict.mjs, side 'app', compare-nextjs/); what is here is what makes it an
// application a Next.js developer can maintain, and the record of how it was asked for.
//
// What the conversion must be (the user's contract): App Router routes and layouts; components with clear
// responsibilities; TypeScript, strict; Tailwind as the primary styling, focused CSS where it is clearer; content,
// assets, hooks and utilities organised; server components by default, client components where interaction needs them;
// listeners, observers, timers and animations started in effects or handlers, scoped by refs and cleaned up; semantic,
// accessible markup; working dev and production builds; a README that says where to change content, styling,
// behaviour and routes. Never: the clone copied into public/ as pages, an iframe of the clone or the live site, raw
// HTML strings as components, positional component names, a global script loader that rebuilds the page after
// hydration, type checks turned off, Tailwind configured and unused. A canvas, WebGL or animation runtime may stay as
// it is inside a named component, its ownership and cleanup documented.
//
// What can be checked reliably by reading the source is checked here (lintConversion: each rule names its file and
// line). What a rule cannot establish (are the components' boundaries meaningful? is the content where an editor
// looks?) is judged against explicit criteria (CRITERIA), answered in notes.md under "## Conversion review [<token>]"
// with evidence, and given to the source as it is (the token is the app's content hash: a changed app is reviewed again).
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { subjectHash } from './identity.mjs';
import { capturedPaths } from './scope.mjs';
import { canonicalPath, segmentsOf } from './routes.mjs';
import { APP_COMPARE } from './lib.mjs';

export const APP_DIR = 'nextjs';
export const REQUEST_FILE = `${APP_COMPARE}/request.json`;
export const BUILD_FILE = `${APP_COMPARE}/build.json`;
export const SCAFFOLD_FILE = `${APP_COMPARE}/scaffold.json`;
export const OUTCOME_FILE = `${APP_COMPARE}/outcome.json`;
const sha1 = (t) => crypto.createHash('sha1').update(t).digest('hex');
const readJson = (p, d = null) => fs.readFile(p, 'utf8').then(JSON.parse, () => d);

// ---------------- the project a conversion starts from ----------------
// A conventional, empty Next.js project (the shape create-next-app 16.4.2 gives a TypeScript + Tailwind + ESLint app),
// with one placeholder page. Nothing of the clone is in it: the conversion is written, not generated. Versions pinned:
// next 16.4.2, not 16.4.0 (npm's advisory feed lists next >=16.0.0 <=16.4.0 under critical advisories; rc.7).
export const VERSIONS = { next: '16.4.2', react: '19.3.0', 'react-dom': '19.3.0', typescript: '5.9.3', '@types/react': '19.3.0', '@types/react-dom': '19.3.0', '@types/node': '22.20.5', tailwindcss: '4.3.3', '@tailwindcss/postcss': '4.3.3', eslint: '9.39.5', 'eslint-config-next': '16.4.2' };
export const PLACEHOLDER_MARK = 'trueclone: placeholder page';
export function scaffoldFiles(name, meta) {
  const pkgName = `${String(name).toLowerCase().replace(/[^a-z0-9-]+/g, '-')}-next`;
  return {
    'package.json': `${JSON.stringify({
      name: pkgName, version: '0.1.0', private: true,
      scripts: { dev: 'next dev', build: 'next build', start: 'next start', lint: 'eslint .', typecheck: 'tsc --noEmit' },
      dependencies: { next: VERSIONS.next, react: VERSIONS.react, 'react-dom': VERSIONS['react-dom'] },
      devDependencies: { '@tailwindcss/postcss': VERSIONS['@tailwindcss/postcss'], '@types/node': VERSIONS['@types/node'], '@types/react': VERSIONS['@types/react'], '@types/react-dom': VERSIONS['@types/react-dom'], eslint: VERSIONS.eslint, 'eslint-config-next': VERSIONS['eslint-config-next'], tailwindcss: VERSIONS.tailwindcss, typescript: VERSIONS.typescript },
    }, null, 2)}\n`,
    'tsconfig.json': `${JSON.stringify({
      compilerOptions: { target: 'ES2017', lib: ['dom', 'dom.iterable', 'esnext'], allowJs: false, skipLibCheck: true, strict: true, noEmit: true, esModuleInterop: true, module: 'esnext', moduleResolution: 'bundler', resolveJsonModule: true, isolatedModules: true, jsx: 'react-jsx', incremental: true, plugins: [{ name: 'next' }], paths: { '@/*': ['./*'] } },
      include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts', '.next/dev/types/**/*.ts', '**/*.mts'],
      exclude: ['node_modules'],
    }, null, 2)}\n`,
    // This project sits inside another (sites/<name>/ under the folder trueclone was installed in, with its own
    // package-lock.json): its root is set, so Next does not infer the outer folder. Next 16.4's upgrade reminders are
    // off: under a coding agent they make `next build` fail and pass in turn by who runs it (rc.7 probe), which no
    // verification can rest on; keep Next up to date like any app.
    'next.config.ts': `import type { NextConfig } from "next";

// npm runs every script from this folder: it is the project's root (it lives inside another project's folder)
const root = process.cwd();

const nextConfig: NextConfig = {
  turbopack: { root },
  outputFileTracingRoot: root,
  experimental: { agentUpgrade: false },
};

export default nextConfig;
`,
    'postcss.config.mjs': 'const config = {\n  plugins: {\n    "@tailwindcss/postcss": {},\n  },\n};\n\nexport default config;\n',
    'eslint.config.mjs': `import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
`,
    '.gitignore': '/node_modules\n/.next/\n/out/\n/build\n*.tsbuildinfo\nnext-env.d.ts\n.env*\n',
    'app/globals.css': '@import "tailwindcss";\n',
    'app/layout.tsx': `import type { Metadata } from "next";
import "./globals.css";

// A local conversion of ${meta?.finalUrl || meta?.url || 'a website'}: not for indexing.
export const metadata: Metadata = {
  title: ${JSON.stringify(name)},
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`,
    'app/page.tsx': `// ${PLACEHOLDER_MARK}: replace it with the converted page (see sites/${name}/clone/ and the trueclone skill)
export default function Home() {
  return <main />;
}
`,
    'README.md': `# ${name}: Next.js application

Converted from the trueclone HTML clone of ${meta?.finalUrl || meta?.url || 'the site'}.

## Run

TODO: the commands to develop, build and start the app.

## Routes

TODO: each route, its file under app/, and the layout it shares.

## Where to change content

TODO: where the text, links and data of each section live.

## Styling

TODO: how Tailwind is used, the theme, and what any CSS file holds and why.

## Behaviour and animation

TODO: each interaction and animation, the component that owns it, and how it is cleaned up.

## Assets

TODO: where images, fonts and media live.
`,
  };
}

// Writes the files that are missing, never one that exists (a conversion's work is never overwritten); records what it
// wrote and their hashes (compare-nextjs/scaffold.json), so a placeholder still unchanged can be told from work
export async function scaffold(root, name, meta) {
  const dir = path.join(root, APP_DIR);
  const files = scaffoldFiles(name, meta);
  const rec = await readJson(path.join(root, SCAFFOLD_FILE), { files: {} });
  const created = [], kept = [];
  for (const [rel, text] of Object.entries(files)) {
    const p = path.join(dir, ...rel.split('/'));
    if (fsSync.existsSync(p)) { kept.push(rel); continue; }
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, text, { flag: 'wx' }).catch((e) => { if (e.code !== 'EEXIST') throw e; });
    rec.files[rel] = sha1(text);
    created.push(rel);
  }
  if (created.length) { rec.at = new Date().toISOString(); await fs.mkdir(path.join(root, APP_COMPARE), { recursive: true }); await fs.writeFile(path.join(root, SCAFFOLD_FILE), JSON.stringify(rec, null, 1)); }
  return { created, kept };
}

// ---------------- the automated source checks ----------------
const SKIP = new Set(['node_modules', '.next', 'out', 'build', '.git', '.turbo', 'coverage']);
// in name order on every system: findings (and their accounting ids) come out the same wherever they are read
async function walk(dir, base = dir, out = []) {
  for (const e of (await fs.readdir(dir, { withFileTypes: true }).catch(() => [])).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP.has(e.name)) await walk(p, base, out); } else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}
const SOURCE = /\.(tsx?|jsx?|mjs|cjs|mts)$/i;
const CONFIG = /^(next\.config|postcss\.config|eslint\.config|tailwind\.config)\.[a-z]+$|(^|\/)next-env\.d\.ts$/;
const lineOf = (text, index) => text.slice(0, index).split('\n').length;
// the class tokens of className="..." and className={`...`} / cn("...") literals
const CLASS_LITERALS = /className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*`([^`]*)`\s*\})|\b(?:cn|clsx|cx|twMerge)\(([^)]*)\)/g;
// A Tailwind utility (after its variants, an optional "!" and "-"): a standalone utility (flex, sr-only), an arbitrary
// property ([mask-type:luminance]), or a utility family followed by a value Tailwind understands: a number or fraction,
// a theme keyword (full, lg, black, tight), a palette shade (slate-900), an arbitrary value ([37px]) or a variable
// ((--x)), with an opacity modifier (/50). A site's own class names are not, even when they start like one: Webflow's
// w-nav, w-container, w-inline-block; BEM names; is-active.
const STANDALONE = new Set('container flex grid block inline inline-block inline-flex inline-grid inline-table hidden contents flow-root table table-row table-cell list-item absolute relative fixed sticky static isolate visible invisible collapse truncate underline overline line-through no-underline uppercase lowercase capitalize normal-case italic not-italic antialiased subpixel-antialiased sr-only not-sr-only grow shrink transform transform-gpu filter grayscale invert sepia ring shadow border rounded outline transition resize blur backdrop-blur ordinal tabular-nums lining-nums diagonal-fractions proportional-nums oldstyle-nums slashed-zero snap-start snap-end snap-center snap-always snap-normal break-words break-all break-keep peer group'.split(' '));
const FAMILIES = ['inset-x', 'inset-y', 'inset', 'top', 'right', 'bottom', 'left', 'start', 'end', 'z', 'order', 'grid-cols', 'grid-rows', 'grid-flow', 'auto-cols', 'auto-rows', 'col-span', 'col-start', 'col-end', 'row-span', 'row-start', 'row-end', 'col', 'row', 'gap-x', 'gap-y', 'gap', 'space-x', 'space-y', 'p', 'px', 'py', 'pt', 'pr', 'pb', 'pl', 'ps', 'pe', 'm', 'mx', 'my', 'mt', 'mr', 'mb', 'ml', 'ms', 'me', 'w', 'h', 'min-w', 'min-h', 'max-w', 'max-h', 'size', 'text', 'font', 'leading', 'tracking', 'whitespace', 'break', 'bg', 'from', 'via', 'to', 'border-x', 'border-y', 'border-t', 'border-r', 'border-b', 'border-l', 'border', 'rounded-t', 'rounded-r', 'rounded-b', 'rounded-l', 'rounded-tl', 'rounded-tr', 'rounded-bl', 'rounded-br', 'rounded', 'ring-offset', 'ring', 'outline-offset', 'outline', 'shadow', 'inset-shadow', 'inset-ring', 'text-shadow', 'opacity', 'mix-blend', 'bg-blend', 'blur', 'backdrop-blur', 'backdrop-brightness', 'backdrop-opacity', 'backdrop-saturate', 'transition', 'duration', 'ease', 'delay', 'animate', 'translate-x', 'translate-y', 'translate-z', 'translate', 'rotate-x', 'rotate-y', 'rotate', 'scale-x', 'scale-y', 'scale', 'skew-x', 'skew-y', 'origin', 'overflow-x', 'overflow-y', 'overflow', 'overscroll', 'object', 'aspect', 'items', 'justify-items', 'justify-self', 'justify', 'content', 'self', 'place-content', 'place-items', 'place-self', 'basis', 'grow', 'shrink', 'flex', 'cursor', 'pointer-events', 'select', 'fill', 'stroke', 'columns', 'list', 'decoration', 'underline-offset', 'indent', 'align', 'line-clamp', 'hue-rotate', 'saturate', 'contrast', 'brightness', 'drop-shadow', 'will-change', 'appearance', 'scroll-m', 'scroll-p', 'scroll', 'snap', 'touch', 'accent', 'caret', 'clear', 'float', 'box', 'divide-x', 'divide-y', 'divide', 'placeholder', 'perspective', 'backface', 'mask', 'bg-linear-to', 'bg-linear', 'bg-radial', 'bg-conic', 'font-stretch', 'wrap', 'hyphens', 'scheme', 'table', 'caption', 'sr', 'stroke-width'].sort((a, b) => b.length - a.length);
const KEYWORDS = new Set('full screen auto px min max fit none svh lvh dvh svw lvw dvw lh prose xs sm md lg xl 2xs base tight tighter snug normal relaxed loose wide wider widest thin extralight light medium semibold bold extrabold black white transparent current inherit center start end between around evenly stretch baseline left right top bottom x y t b l r s e tl tr bl br hidden visible scroll clip contain cover fill row col wrap nowrap reverse square video pointer default linear in out spin ping pulse bounce all colors opacity shadow transform dense first last justify sans serif mono solid dashed dotted double inner outline pre line spaces words keep balance pretty clip-padding border padding content not-allowed grab grabbing move text wait help crosshair zoom-in zoom-out manual smooth mandatory proximity both vertical horizontal hairline offset auto-fit auto-fill subgrid lowercase uppercase decimal disc inside outside middle sub super nums fraction ellipsis fixed local repeat no-repeat round space cols rows span grow shrink safe none-repeat'.split(' '));
const PALETTE = /^(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|mauve|olive|mist|taupe)-(?:50|[1-9]00|950)$/;
const valueOk = (raw) => {
  const v = raw.replace(/\/(?:\d+|\[[^\]]+\]|\([^)]+\))$/, '');
  if (/^\[[^\]]+\]$/.test(v) || /^\([^)]+\)$/.test(v) || /^\d+(\.\d+)?(\/\d+)?%?$/.test(v) || PALETTE.test(v)) return true;
  return v.split('-').every((p) => KEYWORDS.has(p) || /^\d+(\.\d+)?$/.test(p) || /^\d+xl$/.test(p));
};
export function isTailwind(token) {
  // the utility after its variants (md:, hover:, data-[state=open]:, group-hover/x:), a colon inside brackets kept
  let depth = 0, cut = 0;
  for (let i = 0; i < token.length; i++) { const ch = token[i]; if (ch === '[' || ch === '(') depth++; else if (ch === ']' || ch === ')') depth--; else if (ch === ':' && !depth) cut = i + 1; }
  const u = token.slice(cut).replace(/^!/, '').replace(/!$/, '').replace(/^-/, '');
  if (!u) return false;
  if (STANDALONE.has(u) || /^\[[\w-]+:[^\]]+\]$/.test(u)) return true;
  const fam = FAMILIES.find((f) => u.startsWith(`${f}-`));
  return Boolean(fam && valueOk(u.slice(fam.length + 1)));
}

// the URL patterns the app's pages serve: (group) and @slot folders are left out, [x] one segment, [...x] one or more,
// [[...x]] none or more; a _private folder is not routed
async function pagePatterns(dir) {
  const files = (await walk(path.join(dir, 'app'))).filter((f) => /(^|\/)page\.(tsx|ts|jsx|js|mdx)$/.test(f));
  const out = [];
  for (const f of files) {
    const segs = f.split('/').slice(0, -1);
    if (segs.some((s) => s.startsWith('_'))) continue;
    out.push(segs.filter((s) => !/^\(.*\)$/.test(s) && !s.startsWith('@')));
  }
  return out;
}
const dec = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
function matches(pattern, routeSegs) {
  const walkM = (i, j) => {
    if (i === pattern.length) return j === routeSegs.length;
    const p = pattern[i];
    if (/^\[\[\.\.\..+\]\]$/.test(p)) return true;
    if (/^\[\.\.\..+\]$/.test(p)) return j < routeSegs.length;
    if (j >= routeSegs.length) return false;
    if (/^\[.+\]$/.test(p) || p === routeSegs[j] || dec(p) === dec(routeSegs[j])) return walkM(i + 1, j + 1);
    return false;
  };
  return walkM(0, 0);
}

// Every rule the source can be checked against reliably. A finding: { rule, file, line, what }.
export async function lintConversion(root, meta) {
  const dir = path.join(root, APP_DIR);
  const findings = [];
  const add = (rule, file, what, line = null) => findings.push({ rule, file: `${APP_DIR}/${file}`, line, what });
  if (!fsSync.existsSync(dir)) return [{ rule: 'project', file: `${APP_DIR}/`, line: null, what: 'no Next.js project yet' }];
  const files = await walk(dir);
  const read = (f) => fs.readFile(path.join(dir, f), 'utf8').catch(() => '');
  const host = (() => { try { return new URL(meta.finalUrl || meta.url).host.replace(/^www\./, ''); } catch { return null; } })();
  const routes = capturedPaths(meta);
  const depSrcs = new Set((meta.dependencies || []).map((d) => String(d.src).split('#')[0]));

  // the project: its scripts, dependencies and strictness
  const pkg = await readJson(path.join(dir, 'package.json'), null);
  if (!pkg) add('project', 'package.json', 'no package.json');
  else {
    for (const s of ['dev', 'build', 'start', 'lint']) if (!pkg.scripts?.[s]) add('project', 'package.json', `no "${s}" script: the app must run in development and production, and be linted`);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const d of ['next', 'react', 'react-dom', 'typescript', 'tailwindcss']) if (!deps[d]) add('project', 'package.json', `${d} is not a dependency`);
  }
  const tsconfig = await readJson(path.join(dir, 'tsconfig.json'), null);
  if (!tsconfig) add('types', 'tsconfig.json', 'no tsconfig.json: the app is TypeScript');
  else {
    const co = tsconfig.compilerOptions || {};
    if (co.strict !== true) add('types', 'tsconfig.json', '"strict" is not true: type checking stays on, in full');
    for (const k of ['noImplicitAny', 'strictNullChecks', 'strictFunctionTypes']) if (co[k] === false) add('types', 'tsconfig.json', `"${k}": false turns part of strict mode off`);
  }
  for (const f of files.filter((x) => /^next\.config\./.test(x))) {
    const t = await read(f);
    if (/ignoreBuildErrors\s*:\s*true|ignoreDuringBuilds\s*:\s*true/.test(t)) add('types', f, 'type or lint errors are ignored at build: the build must check them');
  }
  // Tailwind: configured, and what carries the styling
  const cssFiles = files.filter((f) => /\.css$/i.test(f) && !f.startsWith('public/'));
  const cssTexts = await Promise.all(cssFiles.map(read));
  if (!cssTexts.some((t) => /@import\s+["']tailwindcss["']/.test(t))) add('styling', cssFiles[0] || 'app/globals.css', 'no stylesheet imports Tailwind (@import "tailwindcss")');
  const postcss = files.find((f) => /^postcss\.config\./.test(f));
  if (!postcss || !/@tailwindcss\/postcss/.test(await read(postcss))) add('styling', postcss || 'postcss.config.mjs', 'Tailwind\'s PostCSS plugin (@tailwindcss/postcss) is not configured');
  for (const [i, f] of cssFiles.entries()) {
    const t = cssTexts[i];
    if (t.length > 60 * 1024) add('styling', f, `${Math.round(t.length / 1024)} KB of CSS: a site's whole stylesheet carried over; Tailwind first, focused CSS only for what it cannot express`);
    if (t.split('\n').some((l) => l.length > 2000)) add('styling', f, 'minified CSS: the app\'s styles are source a developer edits');
  }
  let twTokens = 0, otherTokens = 0;
  const otherSample = new Set();

  // (declaration files too: the retired generator turned attribute checking off in html-types.d.ts)
  const sources = files.filter((f) => SOURCE.test(f) && !f.startsWith('public/') && !CONFIG.test(f));
  const componentOf = (f) => /\.(tsx|jsx)$/.test(f);
  for (const f of sources) {
    const t = await read(f);
    const at = (re) => { const m = re.exec(t); return m ? lineOf(t, m.index) : null; };
    // raw HTML shortcuts
    for (const m of t.matchAll(/dangerouslySetInnerHTML/g)) {
      const lineText = t.split('\n')[lineOf(t, m.index) - 1] || '';
      const near = t.slice(Math.max(0, m.index - 300), m.index + 300);
      if (!/application\/ld\+json/.test(near)) add('html-strings', f, 'dangerouslySetInnerHTML: markup is JSX, not an HTML string (only JSON-LD may be injected this way)', lineOf(t, m.index));
      void lineText;
    }
    for (const m of t.matchAll(/(["'`])((?:\\[\s\S]|(?!\1)[^\\]){1000,}?)\1/g)) {
      if (/<([a-z][\w-]*)\b[^>]*>[\s\S]*<\/\1>/i.test(m[2]) && (m[2].match(/<[a-z]/gi) || []).length >= 8) { add('html-strings', f, `a ${Math.round(m[2].length / 1024)} KB string of HTML markup: write it as JSX components`, lineOf(t, m.index)); break; }
    }
    if (componentOf(f) && t.length > 50 * 1024 && /[{[]\s*"[\w-]+"\s*:/.test(t)) add('content', f, `${Math.round(t.length / 1024)} KB in one component file: data belongs in a typed module (content/, data/), components stay readable`);
    // frames of the clone or of the site itself (a first-party document the page embeds, recorded by the capture as a
    // dependency, may stay the embed it is)
    for (const m of t.matchAll(/<iframe\b[^>]*\bsrc\s*=\s*(?:\{\s*)?["'`]([^"'`]+)["'`]/gi)) {
      const src = m[1];
      if (depSrcs.has(src.split('#')[0])) continue;
      let bad = /\.html?(\?|#|$)/i.test(src) || /localhost|127\.0\.0\.1|\/clone\//i.test(src) || src.startsWith('/');
      try { const u = new URL(src, 'http://x.invalid'); if (host && u.host.replace(/^www\./, '') === host) bad = true; } catch { /* relative */ }
      if (bad) add('iframe', f, `<iframe src="${src.slice(0, 80)}">: the page is the app's own components, never a frame of the clone or of the site`, lineOf(t, m.index));
    }
    // whole-page script loaders
    const loader = at(/document\.createElement\(\s*["'`]script["'`]\s*\)/);
    if (loader) add('scripts', f, 'creates <script> elements: behaviour is imported modules started in effects, not scripts injected after hydration', loader);
    for (const m of t.matchAll(/<(?:script|Script)\b[^>]*\bsrc\s*=\s*\{?\s*["'`](\/?[^"'`]+)["'`]/g)) if (!/^https?:\/\//.test(m[1]) || (host && m[1].includes(host))) add('scripts', f, `a script tag loads "${m[1].slice(0, 60)}": the site's behaviour is ported into components, libraries come from npm`, lineOf(t, m.index));
    const flag = at(/\bwindow\.__\w+\s*=|\(window as [^)]*\)\.__\w+\s*=/);
    if (flag) add('scripts', f, 'a global run-once flag on window: components set up and tear down with their lifecycle', flag);
    // type checks off
    const nocheck = at(/@ts-nocheck/);
    if (nocheck) add('types', f, '@ts-nocheck turns type checking off for the file', nocheck);
    for (const m of t.matchAll(/@ts-ignore/g)) add('types', f, '@ts-ignore hides a type error (use @ts-expect-error with the reason, or fix the type)', lineOf(t, m.index));
    const openAttrs = at(/\[\s*(?:attr|attribute|key|name)\s*:\s*string\s*\]\s*:\s*(?:unknown|any)/);
    if (openAttrs && /IntrinsicElements|HTMLAttributes|JSX/.test(t)) add('types', f, 'an index signature that accepts any attribute on any element turns JSX attribute checking off', openAttrs);
    // component names: what a thing is, not where it sat in the page
    const POSITIONAL = /^(?:div|section|span|img|image|svg|a|ul|ol|li|p|h[1-6]|header|footer|main|nav|article|aside|button|component|block|element|node|wrapper|container|part|piece|code-?island|island|group|item)[-_]?\d+$/i;
    const base = path.basename(f).replace(/\.[^.]+$/, '');
    if (componentOf(f) && POSITIONAL.test(base)) add('naming', f, `"${base}" names a position, not a responsibility: name components for what they are (Hero, PricingTable)`);
    for (const m of t.matchAll(/export\s+(?:default\s+)?function\s+([A-Z]\w*)/g)) if (POSITIONAL.test(m[1]) && m[1] !== base) add('naming', f, `component "${m[1]}" names a position, not a responsibility`, lineOf(t, m.index));
    // client components: needed, and cleaned up
    const client = /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(t);
    if (client) {
      if (/(^|\/)layout\.(tsx|jsx)$/.test(f) && /^app\/layout\./.test(f)) add('boundaries', f, 'the root layout is a client component: keep layouts on the server, put interaction in the components that need it');
      const needs = /\buse[A-Z]\w*\s*\(|\bon[A-Z]\w+\s*=|\bwindow\.|\bdocument\.|addEventListener|Observer\s*\(|requestAnimationFrame|localStorage|sessionStorage|navigator\./.test(t);
      if (!needs) add('boundaries', f, '"use client" in a file that uses no state, effect, handler or browser API: it can stay a server component');
      const count = (re) => (t.match(re) || []).length;
      const adds = count(/\.addEventListener\s*\(/g), removes = count(/\.removeEventListener\s*\(/g), signals = count(/\bsignal\s*[:,}]/g), once = count(/once\s*:\s*true/g), aborts = count(/\.abort\s*\(/g);
      if (adds > removes + once + (aborts ? signals : 0)) add('lifecycle', f, `${adds} addEventListener, ${removes} removeEventListener${signals ? `, ${signals} abort signal(s)${aborts ? '' : ' never aborted'}` : ''}: every listener is removed when its component unmounts`, at(/\.addEventListener\s*\(/));
      const observers = count(/new\s+(?:Intersection|Resize|Mutation|Performance)Observer\s*\(/g), disconnects = count(/\.disconnect\s*\(/g);
      if (observers > disconnects) add('lifecycle', f, `${observers} observer(s), ${disconnects} disconnect(): every observer is disconnected on unmount`, at(/new\s+(?:Intersection|Resize|Mutation|Performance)Observer/));
      if (count(/\bsetInterval\s*\(/g) > count(/\bclearInterval\s*\(/g)) add('lifecycle', f, 'setInterval without clearInterval: every timer is cleared on unmount', at(/\bsetInterval\s*\(/));
      if (count(/\brequestAnimationFrame\s*\(/g) && !count(/\bcancelAnimationFrame\s*\(/g)) add('lifecycle', f, 'requestAnimationFrame without cancelAnimationFrame: an animation loop stops when its component unmounts', at(/\brequestAnimationFrame\s*\(/));
      if (/\bgsap\.(to|from|fromTo|timeline|set)\s*\(|ScrollTrigger\.create\s*\(/.test(t) && !/gsap\.context\s*\(|useGSAP\s*\(|\.revert\s*\(|\.kill\s*\(/.test(t)) add('lifecycle', f, 'GSAP tweens or triggers with no gsap.context()/useGSAP()/revert()/kill(): they outlive the component', at(/\bgsap\.|ScrollTrigger\./));
      for (const m of t.matchAll(/document\.(?:querySelector(?:All)?|getElementById|getElementsByClassName|getElementsByTagName)\s*\(/g)) add('dom', f, 'reaches into the document by selector: a component works on its own elements through refs', lineOf(t, m.index));
    }
    // links to the app's own routes, and accessibility a reader can check
    if (componentOf(f)) {
      for (const m of t.matchAll(/<a\b[^>]*\bhref\s*=\s*["'](\/[^"'#?]*)/g)) if (routes.some((r) => canonicalPath(r) === canonicalPath(m[1]))) add('links', f, `<a href="${m[1]}"> to a route of the app: use next/link`, lineOf(t, m.index));
      for (const m of t.matchAll(/<img\b(?![^>]*\balt\s*=)[^>]*>/g)) add('a11y', f, '<img> without alt (alt="" when it is decoration)', lineOf(t, m.index));
      for (const m of t.matchAll(/<(div|span|li|section)\b(?=[^>]*\bonClick\s*=)(?![^>]*\brole\s*=)[^>]*>/g)) add('a11y', f, `<${m[1]} onClick> without a role and keyboard access: use a <button>, or add role, tabIndex and a key handler`, lineOf(t, m.index));
      for (const m of t.matchAll(CLASS_LITERALS)) {
        // a helper's arguments: only its string literals are class names (isOpen && "block": "block")
        const literal = m[4] !== undefined ? (m[4].match(/(["'`])((?:(?!\1).)*)\1/g) || []).map((s) => s.slice(1, -1)).join(' ') : (m[1] ?? m[2] ?? m[3] ?? '');
        for (const tok of literal.replace(/\$\{[^}]*\}/g, ' ').split(/\s+/).filter(Boolean)) {
          if (isTailwind(tok)) twTokens++; else { otherTokens++; if (otherSample.size < 8) otherSample.add(tok); }
        }
      }
    }
  }
  if (twTokens + otherTokens === 0) add('styling', 'app/', 'no class names in any component: the app\'s styling is Tailwind utilities on its elements');
  else if (twTokens < 0.6 * (twTokens + otherTokens)) add('styling', 'app/', `${twTokens} of ${twTokens + otherTokens} class names are Tailwind utilities (${Math.round((100 * twTokens) / (twTokens + otherTokens))}%; others: ${[...otherSample].join(', ')}): Tailwind is the primary styling (at least 60% of class names), focused CSS for what it cannot express`);
  // the root layout says the page's language
  const rootLayout = files.find((f) => /^app\/layout\.(tsx|jsx)$/.test(f));
  if (!rootLayout) add('routes', 'app/layout.tsx', 'no root layout (app/layout.tsx)');
  else if (!/<html\b[^>]*\blang\s*=/.test(await read(rootLayout))) add('a11y', rootLayout, '<html> without lang');
  // public/: assets only, never pages or scripts
  for (const f of files.filter((x) => x.startsWith('public/'))) {
    if (/\.html?$/i.test(f)) add('public', f, 'an HTML page in public/: every page is an App Router route');
    else if (/\.(m?js|cjs)$/i.test(f) && !/(^|\/)(sw|service-worker)\.js$/i.test(f)) add('public', f, 'a script in public/: behaviour is source modules, libraries come from npm');
  }
  // every route of the scope is a page of the app (or reached by a rewrite in next.config, checked when served)
  const patterns = await pagePatterns(dir);
  const config = (await Promise.all(files.filter((f) => /^next\.config\./.test(f)).map(read))).join('\n');
  for (const r of routes) if (!patterns.some((p) => matches(p, segmentsOf(canonicalPath(r))))) {
    if (/\brewrites\b/.test(config)) continue;
    add('routes', 'app/', `no App Router page serves ${r} (app/${segmentsOf(canonicalPath(r)).join('/')}${segmentsOf(canonicalPath(r)).length ? '/' : ''}page.tsx)`);
  }
  // the README a developer starts from
  const readme = files.find((f) => /^readme\.md$/i.test(f));
  if (!readme) add('docs', 'README.md', 'no README.md');
  else {
    const t = await read(readme);
    if (/\bTODO\b/.test(t)) add('docs', readme, 'the README still has TODO sections: fill in run commands, routes, content, styling, behaviour and assets');
    for (const [k, re] of [['how to run it', /^#+\s.*\b(run|develop|getting started|scripts)\b/im], ['routes', /^#+\s.*\broutes?\b/im], ['where to change content', /^#+\s.*\bcontent\b/im], ['styling', /^#+\s.*\bstyl/im], ['behaviour', /^#+\s.*\b(behaviou?r|interaction|animation)/im]]) if (!re.test(t)) add('docs', readme, `the README has no section on ${k}`);
  }
  return findings;
}

// ---------------- the review criteria (judged by reading the source; answered with evidence) ----------------
export const CRITERIA = [
  ['C1', 'components', 'each component has one clear responsibility and is named for what it is (Hero, PricingTable), not where it sat'],
  ['C2', 'data', 'repeated content (cards, rows, links, slides) is rendered from typed data with .map(), not copied markup'],
  ['C3', 'content', 'text, links and data live where an editor looks for them (content modules or the page), and the README says where'],
  ['C4', 'styling', 'Tailwind utilities carry the styling; any CSS file holds only what Tailwind cannot express clearly, and says why'],
  ['C5', 'boundaries', 'server components by default; "use client" only on components that need interaction or browser APIs'],
  ['C6', 'behaviour', 'every interaction, observer, timer and animation starts in an effect or a handler, works through refs and is cleaned up on unmount; a canvas, WebGL or animation runtime sits in a named component whose ownership and cleanup are documented'],
  ['C7', 'routes', 'each route of the scope is an App Router route, shared chrome is a layout, links between routes use next/link'],
  ['C8', 'accessibility', 'semantic landmarks and headings, alt text, keyboard-operable controls, and reduced motion respected where the site respects it'],
  ['C9', 'docs', 'the README explains how to run the app and where to change content, styling, behaviour and routes'],
  ['C10', 'edits', 'changing a section\'s text, changing a hover and adding a page each take one obvious file (name the three)'],
];
export const REVIEW_TITLE = 'Conversion review';
// the token a review is given to: the app's content hash, so a changed app is reviewed again
export const reviewToken = (appHash) => (appHash ? String(appHash).slice(0, 8) : null);
export function parseCriteria(notes, appHash, root) {
  const m = new RegExp(`^## ${REVIEW_TITLE}\\s*(?:\\[([a-z0-9]+)\\])?[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'im').exec(notes || '');
  const token = m?.[1] || null;
  const lines = m ? m[2].replace(/<!--[\s\S]*?-->/g, '').split('\n').map((l) => l.trim()).filter((l) => /^[-*]\s+C\d+\b/i.test(l)).map((l) => l.replace(/^[-*]\s+/, '')) : [];
  const stale = Boolean(m) && token !== reviewToken(appHash);
  return CRITERIA.map(([id, key, text]) => {
    const line = lines.find((l) => new RegExp(`^${id}\\b`, 'i').test(l));
    if (!line) return { id, key, text, state: 'missing', why: 'not answered yet' };
    const x = /^C\d+\b[^:]*:\s*(not met|met)\b\s*:?\s*(.*)$/i.exec(line);
    if (!x) return { id, key, text, state: 'missing', why: `"${line.slice(0, 80)}": answer "met: <evidence>" or "not met: <why>"` };
    if (stale) return { id, key, text, state: 'stale', why: `given to an earlier version of the app (token ${token || 'none'}, now ${reviewToken(appHash)})`, answer: x[2] };
    if (/^not met$/i.test(x[1])) return { id, key, text, state: 'not-met', why: x[2] || 'not met', answer: x[2] };
    const cited = [...x[2].matchAll(/\bnextjs\/[\w@()[\]./-]+/g)].map((c) => c[0].replace(/[.,;:)]+$/, ''));
    const exists = cited.filter((c) => fsSync.existsSync(path.join(root, c)));
    if (!exists.length) return { id, key, text, state: 'missing', why: cited.length ? `the evidence cited does not exist (${cited.slice(0, 2).join(', ')})` : 'met, without evidence: cite the files that show it (nextjs/...)', answer: x[2] };
    return { id, key, text, state: 'met', evidence: exists, answer: x[2] };
  });
}

// ---------------- the conversion's own evaluation ----------------
export async function evaluateConversion(root, { readOnly = false } = {}) {
  const meta = await readJson(path.join(root, 'reference', 'meta.json'), null);
  const request = await readJson(path.join(root, REQUEST_FILE), null);
  const dir = path.join(root, APP_DIR);
  const present = fsSync.existsSync(dir);
  const appHash = present ? await subjectHash(root, 'app', { readOnly }) : null;
  const cloneHash = await subjectHash(root, 'clone', { readOnly });
  const htmlOutcome = await readJson(path.join(root, 'compare', 'outcome.json'), null);
  const scaffoldRec = await readJson(path.join(root, SCAFFOLD_FILE), { files: {} });
  const pageText = await fs.readFile(path.join(dir, 'app', 'page.tsx'), 'utf8').catch(() => null);
  const placeholder = Boolean(pageText && (pageText.includes(PLACEHOLDER_MARK) || sha1(pageText) === scaffoldRec.files?.['app/page.tsx']));
  const lint = meta && present ? await lintConversion(root, meta) : [];
  const build = await readJson(path.join(root, BUILD_FILE), null);
  const buildCurrent = Boolean(build && appHash && build.subjectHash === appHash);
  const notes = await fs.readFile(path.join(root, 'notes.md'), 'utf8').catch(() => '');
  const criteria = parseCriteria(notes, appHash, root);
  return {
    meta, request, present, appHash, placeholder, lint, build, buildCurrent, criteria,
    baseline: request ? { ...request.baseline, cloneChanged: Boolean(request.baseline?.subjectHash && cloneHash && request.baseline.subjectHash !== cloneHash), htmlNow: htmlOutcome ? { outcome: htmlOutcome.outcome, current: htmlOutcome.subjectHash === cloneHash } : null } : null,
  };
}

// The build steps a conversion must pass, as recorded by convert --verify (compare-nextjs/build.json)
export const BUILD_STEPS = ['install', 'typecheck', 'lint', 'build', 'serve'];
// conversion items for the accounting (accounting.mjs items, side 'app'): the project's checks, the source checks and
// the review criteria. Their dispositions follow the same rules: passed, unresolved (judged not met), pending.
export function conversionItems(c) {
  const items = [];
  const it = (kind, rest, label, state, disposition, reason = null) => items.push({ id: `app:${kind}:${rest}`, side: 'app', kind, label, state, disposition, owner: disposition === 'passed' ? null : 'app', reason });
  for (const s of BUILD_STEPS) {
    const r = c.buildCurrent ? c.build.steps?.[s] : null;
    it('build', s, `Next.js app: ${s}`, r ? (r.ok ? 'pass' : 'fail') : c.build ? 'stale' : 'missing', r?.ok ? 'passed' : 'pending', r ? (r.ok ? null : r.error || `exit ${r.exit}`) : c.build ? 'the app changed after it was built' : 'not built yet');
  }
  for (const [k, f] of c.lint.entries()) it('source', `${f.rule}|${f.file}|${f.line ?? ''}|${k}`, `Next.js app source (${f.rule}): ${f.file}${f.line ? `:${f.line}` : ''}`, 'fail', 'pending', f.what);
  for (const cr of c.criteria) it('criterion', cr.id, `Next.js app review ${cr.id} (${cr.key})`, cr.state, cr.state === 'met' ? 'passed' : cr.state === 'not-met' ? 'unresolved' : 'pending', cr.state === 'met' ? null : cr.why);
  return items;
}

// The conversion's section of REPORT.nextjs.md
export function conversionMarkdown(c) {
  const b = c.baseline;
  const req = c.request ? `Requested ${c.request.requestedAt} (\`trueclone convert\`), from the HTML clone ${b?.outcome === 'verified' ? '**Verified**' : `**${b?.outcome || 'unknown'}**`} on content ${b?.subjectHash || '–'}${b?.accepted ? `, converted anyway at the user's request ("${b.accepted}"): its limitations stay disclosed below` : ''}.${b?.cloneChanged ? ` The HTML clone has changed since (its outcome now: ${b.htmlNow ? `${b.htmlNow.outcome}${b.htmlNow.current ? '' : ', not current'}` : 'none'}); the app is measured against the original reference either way.` : ''}` : 'Not requested.';
  const lim = (b?.limitations || []).length ? `\n\nLimitations of the HTML clone it started from (not inherited as passes: the app is measured against the original reference):\n${b.limitations.slice(0, 30).map((l) => `- ${l}`).join('\n')}` : '';
  const steps = BUILD_STEPS.map((s) => { const r = c.buildCurrent ? c.build.steps?.[s] : null; return `| ${s} | ${r ? (r.ok ? 'pass' : `**fail**: ${String(r.error || `exit ${r.exit}`).slice(0, 140)}`) : c.build ? 'stale (the app changed since)' : 'not run'} |`; }).join('\n');
  const served = c.buildCurrent && c.build.routes?.length ? `\n\nRoutes served by the production build: ${c.build.routes.map((r) => `\`${r.path}\` ${r.status}`).join(', ')}.` : '';
  const lint = c.lint.length ? c.lint.slice(0, 60).map((f) => `- **${f.rule}** ${f.file}${f.line ? `:${f.line}` : ''}: ${f.what}`).join('\n') + (c.lint.length > 60 ? `\n- …and ${c.lint.length - 60} more` : '') : 'Every automated source check passes.';
  const crit = c.criteria.map((cr) => `| ${cr.id} ${cr.key} | ${cr.text} | ${cr.state === 'met' ? `met: ${String(cr.answer || '').replace(/\|/g, '/').slice(0, 160)}` : cr.state === 'not-met' ? `**not met**: ${String(cr.why).replace(/\|/g, '/').slice(0, 160)}` : cr.state} |`).join('\n');
  return `## Conversion

${req}${lim}

### Project checks (\`trueclone convert --verify\`)

| Step | Result |
|---|---|
${steps}${served}

### Source checks (automated)

${lint}

### Review criteria (judged by reading the source; notes.md "## ${REVIEW_TITLE} [<token>]")

| Criterion | What it asks | Answer |
|---|---|---|
${crit}
`;
}
