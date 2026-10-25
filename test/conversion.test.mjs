// Workflow B, a Next.js conversion (scripts/convert.mjs, scripts/conversion.mjs): it starts only from its own request,
// from a finished HTML clone; it never changes the clone's outcome; it never overwrites the conversion's own source; and
// it is verified only as maintainable source that builds and matches the original reference. The negative fixtures are
// the retired generator's own shapes (docs: the rc.10 audit of next.mjs): the clone copied into public/, raw HTML in
// dangerouslySetInnerHTML, positional components (Div05), a global script loader with a run-once flag, strict: false,
// Tailwind configured and unused. Each must be found by the rule that names it.
import { test, after } from 'node:test';
after(() => { process.exitCode = 0; });
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpProject, verifiedSite, makeSite, measureAll, reviewAll, status, readJson, SCRIPTS } from './helpers/site.mjs';
import { scaffoldFiles, lintConversion, parseCriteria, reviewToken, CRITERIA, PLACEHOLDER_MARK } from '../scripts/conversion.mjs';
import { subjectHash } from '../scripts/identity.mjs';

const convert = (project, name, args = []) => {
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, 'convert.mjs'), name, ...args], { cwd: project, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
const audit = (root, args = []) => spawnSync(process.execPath, [path.join(SCRIPTS, '..', 'tools', 'audit-run.mjs'), root, ...args], { encoding: 'utf8' });
const write = async (root, rel, text) => { const p = path.join(root, rel); await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, text); };
const exists = (p) => fs.stat(p).then(() => true, () => false);

// A conversion a Next.js developer can maintain: routes, a layout, components named for what they are, typed content,
// Tailwind, one client component that cleans up everything it starts, a README that says where to change what
const GOOD = {
  'app/layout.tsx': `import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = { title: "Fixture", robots: { index: false, follow: false } };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="bg-white text-slate-900 antialiased">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
`,
  'app/page.tsx': `import { Hero } from "@/components/Hero";
import { FeatureList } from "@/components/FeatureList";
import { Marquee } from "@/components/Marquee";
import { home } from "@/content/home";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-6xl px-6">
      <Hero title={home.title} lead={home.lead} />
      <FeatureList features={home.features} />
      <Marquee items={home.logos} />
    </main>
  );
}
`,
  'app/about/page.tsx': `export default function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="text-4xl font-semibold tracking-tight">About</h1>
    </main>
  );
}
`,
  'components/SiteHeader.tsx': `import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="flex items-center justify-between px-6 py-4">
      <Link href="/" className="font-medium">Home</Link>
      <nav className="flex gap-6 text-sm">
        <Link href="/about" className="hover:underline">About</Link>
        <a href="https://example.test/pricing" className="hover:underline">Pricing</a>
      </nav>
    </header>
  );
}
`,
  'components/Hero.tsx': `type HeroProps = { title: string; lead: string };

export function Hero({ title, lead }: HeroProps) {
  return (
    <section className="py-24 text-center">
      <h2 className="text-5xl font-bold leading-tight">{title}</h2>
      <p className="mt-4 text-lg text-slate-600">{lead}</p>
    </section>
  );
}
`,
  'components/FeatureList.tsx': `import type { Feature } from "@/content/home";

export function FeatureList({ features }: { features: Feature[] }) {
  return (
    <ul className="grid gap-6 md:grid-cols-3">
      {features.map((f) => (
        <li key={f.title} className="rounded-xl border p-6">
          <h3 className="font-semibold">{f.title}</h3>
          <p className="mt-2 text-sm text-slate-600">{f.body}</p>
        </li>
      ))}
    </ul>
  );
}
`,
  'components/Marquee.tsx': `"use client";
import { useEffect, useRef } from "react";

// a scrolling row of logos: started when visible, paused on hover, everything stopped on unmount
export function Marquee({ items }: { items: string[] }) {
  const track = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let frame = 0;
    let x = 0;
    let paused = false;
    const step = () => { if (!paused) { x -= 0.5; el.style.transform = \`translateX(\${x}px)\`; } frame = requestAnimationFrame(step); };
    const pause = () => { paused = true; };
    const resume = () => { paused = false; };
    el.addEventListener("mouseenter", pause);
    el.addEventListener("mouseleave", resume);
    const seen = new IntersectionObserver(([e]) => { paused = !e.isIntersecting; });
    seen.observe(el);
    frame = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(frame); seen.disconnect(); el.removeEventListener("mouseenter", pause); el.removeEventListener("mouseleave", resume); };
  }, []);
  return (
    <div className="overflow-hidden py-8">
      <div ref={track} className="flex gap-12 whitespace-nowrap">
        {items.map((name) => <span key={name} className="text-sm uppercase tracking-widest">{name}</span>)}
      </div>
    </div>
  );
}
`,
  'content/home.ts': `export type Feature = { title: string; body: string };

export const home = {
  title: "Ship faster",
  lead: "Everything a team needs.",
  features: [
    { title: "Fast", body: "It is fast." },
    { title: "Kind", body: "It is kind." },
    { title: "Open", body: "It is open." },
  ] satisfies Feature[],
  logos: ["Acme", "Globex", "Initech"],
};
`,
  'README.md': `# Fixture: Next.js application

## Run

npm install, then npm run dev (development) or npm run build && npm start (production).

## Routes

/ is app/page.tsx, /about is app/about/page.tsx; both share app/layout.tsx (the header).

## Where to change content

content/home.ts holds the home page's text, features and logos.

## Styling

Tailwind utilities on each element; app/globals.css imports Tailwind and holds nothing else.

## Behaviour and animation

components/Marquee.tsx scrolls the logo row (requestAnimationFrame), pauses on hover and when out of view, and stops everything on unmount.

## Assets

None yet: images go in public/.
`,
};
async function goodApp(root, name = 'fx') {
  const meta = JSON.parse(await fs.readFile(path.join(root, 'reference', 'meta.json'), 'utf8'));
  for (const [rel, text] of Object.entries(scaffoldFiles(name, meta))) await write(root, `nextjs/${rel}`, text);
  for (const [rel, text] of Object.entries(GOOD)) await write(root, `nextjs/${rel}`, text);
  return meta;
}

test('source checks: a maintainable conversion passes every rule', async () => {
  const p = await tmpProject();
  const site = await makeSite(p, 'good', 'doc', { routes: ['/about'] });
  const meta = await goodApp(site.root);
  assert.deepEqual(await lintConversion(site.root, meta), []);
});

// each shortcut the retired generator took, alone, and the rule that must name it
const SHORTCUTS = [
  ['the clone copied into public/ as a page', { 'public/About.html': '<html><body>about</body></html>' }, 'public'],
  ['the clone\'s script.js in public/', { 'public/script.js': 'console.log(1)' }, 'public'],
  ['raw HTML through dangerouslySetInnerHTML', { 'components/Section.tsx': 'export function Section() { return <div dangerouslySetInnerHTML={{ __html: "<p>x</p>" }} />; }\n' }, 'html-strings'],
  ['a giant HTML string as a component', { 'components/Legal.tsx': `const html = "${'<div class=\\"x\\"><p>text</p></div>'.repeat(60)}";\nexport function Legal() { return <pre>{html}</pre>; }\n` }, 'html-strings'],
  ['a positional component name', { 'components/Div05.tsx': 'export function Div05() { return <div className="flex" />; }\n' }, 'naming'],
  ['a global script loader with a run-once flag', { 'components/SiteScripts.tsx': '"use client";\nimport { useEffect } from "react";\nexport function SiteScripts() { useEffect(() => { const w = window as unknown as Record<string, boolean>; if (w.__siteScripts) return; (window as any).__siteScripts = true; const s = document.createElement("script"); s.src = "/script.js"; document.body.appendChild(s); }, []); return null; }\n' }, 'scripts'],
  ['strict mode off', { 'tsconfig.json': JSON.stringify({ compilerOptions: { strict: false, jsx: 'react-jsx' } }) }, 'types'],
  ['type errors ignored at build', { 'next.config.ts': 'export default { typescript: { ignoreBuildErrors: true } };\n' }, 'types'],
  ['every attribute type-checked away', { 'html-types.d.ts': 'declare module "react" { interface HTMLAttributes<T> { [attribute: string]: unknown } }\nexport {};\n' }, 'types'],
  ['Tailwind configured and unused (the site\'s own classes)', { 'app/page.tsx': 'export default function HomePage() { return <main className="w-nav w-container hero__title section-hero"><div className="div-block-7 text-block-3">x</div></main>; }\n', 'components/Hero.tsx': 'export function Hero() { return <section className="hero-wrap hero__inner w-layout-grid" />; }\n', 'components/FeatureList.tsx': 'export function FeatureList() { return <ul className="feature-grid w-list-unstyled" />; }\n', 'components/SiteHeader.tsx': 'import Link from "next/link";\nexport function SiteHeader() { return <header className="navbar w-nav"><Link href="/about" className="nav-link">About</Link></header>; }\n', 'app/about/page.tsx': 'export default function AboutPage() { return <main className="about-page w-container" />; }\n', 'components/Marquee.tsx': 'export function Marquee() { return <div className="marquee-track" />; }\n', 'app/layout.tsx': 'import "./globals.css";\nexport default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body className="body">{children}</body></html>; }\n' }, 'styling'],
  ['a whole minified stylesheet carried over', { 'app/site.css': `.a{color:red}${'.w-nav{display:block;position:relative}'.repeat(2000)}` }, 'styling'],
  ['an iframe of the clone', { 'components/Frame.tsx': 'export function Frame() { return <iframe src="/index.html" title="x" />; }\n' }, 'iframe'],
  ['a listener never removed', { 'components/Scroller.tsx': '"use client";\nimport { useEffect } from "react";\nexport function Scroller() { useEffect(() => { window.addEventListener("scroll", () => {}); }, []); return null; }\n' }, 'lifecycle'],
  ['GSAP never reverted', { 'components/Reveal.tsx': '"use client";\nimport { useEffect } from "react";\nimport gsap from "gsap";\nexport function Reveal() { useEffect(() => { gsap.to(".x", { y: 0 }); }, []); return null; }\n' }, 'lifecycle'],
  ['a client boundary that needs none', { 'components/Badge.tsx': '"use client";\nexport function Badge({ label }: { label: string }) { return <span className="rounded-full px-2 text-xs">{label}</span>; }\n' }, 'boundaries'],
  ['selector-driven DOM in a component', { 'components/Menu.tsx': '"use client";\nimport { useEffect } from "react";\nexport function Menu() { useEffect(() => { const el = document.querySelector(".menu"); el?.classList.add("open"); }, []); return null; }\n' }, 'dom'],
  ['a plain link between routes', { 'components/Footer.tsx': 'export function Footer() { return <footer className="py-8"><a href="/about">About</a></footer>; }\n' }, 'links'],
  ['an image without alt', { 'components/Logo.tsx': 'export function Logo() { return <img src="/logo.svg" className="h-6 w-6" />; }\n' }, 'a11y'],
  ['a clickable div', { 'components/Card.tsx': '"use client";\nexport function Card() { return <div className="p-4" onClick={() => alert(1)}>x</div>; }\n' }, 'a11y'],
  ['a route of the scope with no page', { 'app/about/page.tsx': null }, 'routes'],
  ['a README still to be written', { 'README.md': '# x\n\n## Run\n\nTODO\n' }, 'docs'],
];
for (const [label, files, rule] of SHORTCUTS) {
  test(`source checks: ${label} is found (${rule})`, async () => {
    const p = await tmpProject();
    const site = await makeSite(p, 'bad', 'doc', { routes: ['/about'] });
    const meta = await goodApp(site.root);
    for (const [rel, text] of Object.entries(files)) {
      if (text === null) await fs.rm(path.join(site.root, 'nextjs', rel), { force: true });
      else await write(site.root, `nextjs/${rel}`, text);
    }
    const found = await lintConversion(site.root, meta);
    assert.ok(found.some((f) => f.rule === rule), `${label}: expected a "${rule}" finding, got ${JSON.stringify(found)}`);
  });
}

test('review criteria: answered with existing evidence, for the app as it is now; a changed app is reviewed again', async () => {
  const p = await tmpProject();
  const site = await makeSite(p, 'crit', 'doc');
  await goodApp(site.root);
  const hash = await subjectHash(site.root, 'app');
  const lines = CRITERIA.map(([id, key]) => `- ${id} ${key}: met: nextjs/components/Hero.tsx`);
  let c = parseCriteria(`## Conversion review [${reviewToken(hash)}]\n${lines.join('\n')}\n`, hash, site.root);
  assert.ok(c.every((x) => x.state === 'met'), JSON.stringify(c));
  c = parseCriteria(`## Conversion review [${reviewToken(hash)}]\n- C1 components: met: nextjs/components/Nope.tsx\n- C2 data: not met: copied markup in the footer\n`, hash, site.root);
  assert.equal(c[0].state, 'missing');
  assert.match(c[0].why, /does not exist/);
  assert.equal(c[1].state, 'not-met');
  assert.equal(c[2].state, 'missing');
  c = parseCriteria(`## Conversion review [abcdef12]\n${lines.join('\n')}\n`, hash, site.root);
  assert.ok(c.every((x) => x.state === 'stale'));
});

// ---- the command: a separate request, never from an unfinished clone, never touching the clone's outcome ----
test('convert: refused without a finished HTML clone, creating nothing; from an Incomplete clone only when the user says so', async () => {
  const p = await tmpProject();
  const site = await makeSite(p, 'nf');
  let r = convert(p, 'nf');
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /the HTML clone is not finished \(its outcome: none\)/);
  assert.equal(await exists(path.join(site.root, 'nextjs')), false);
  assert.equal(await exists(path.join(site.root, 'compare-nextjs')), false);
  // an Incomplete clone: refused, then converted when the user's words are given, its limitations recorded
  await measureAll(site, 'clone');
  await reviewAll(site, 'clone');
  const mf = path.join(site.root, 'reference', 'meta.json');
  const meta = JSON.parse(await fs.readFile(mf, 'utf8'));
  meta.routesNotCaptured = [{ path: '/x.html', failed: true, why: 'capture failed at every size: boom' }];
  await fs.writeFile(mf, JSON.stringify(meta));
  assert.equal(status(p, 'nf').code, 3);
  r = convert(p, 'nf');
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /ended Incomplete/);
  assert.match(r.out, /--from-incomplete/);
  assert.equal(await exists(path.join(site.root, 'nextjs')), false);
  r = convert(p, 'nf', ['--from-incomplete', 'the user: convert it anyway, the missing page is fine']);
  assert.equal(r.code, 1, r.out);
  const req = await readJson(site, 'compare-nextjs/request.json');
  assert.equal(req.baseline.outcome, 'incomplete');
  assert.equal(req.baseline.accepted, 'the user: convert it anyway, the missing page is fine');
  assert.ok(req.baseline.limitations.some((l) => /x\.html/.test(l)));
  assert.match(r.out, /next: convert the clone into sites\/nf\/nextjs\//);
});

test('convert: the request creates a conventional empty project; the conversion\'s own files are never overwritten', async () => {
  const p = await tmpProject();
  const site = await verifiedSite(p, 'sc');
  assert.equal(status(p, 'sc').code, 0);
  let r = convert(p, 'sc');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /conversion requested: from the HTML clone Verified/);
  for (const f of ['package.json', 'tsconfig.json', 'next.config.ts', 'eslint.config.mjs', 'postcss.config.mjs', 'app/layout.tsx', 'app/page.tsx', 'app/globals.css', 'README.md']) assert.ok(await exists(path.join(site.root, 'nextjs', f)), f);
  assert.match(await fs.readFile(path.join(site.root, 'nextjs', 'app', 'page.tsx'), 'utf8'), new RegExp(PLACEHOLDER_MARK));
  assert.equal(JSON.parse(await fs.readFile(path.join(site.root, 'nextjs', 'tsconfig.json'), 'utf8')).compilerOptions.strict, true);
  // the conversion's work: kept as written, whatever the next calls do
  await write(site.root, 'nextjs/app/page.tsx', 'export default function HomePage() { return <main className="p-4">mine</main>; }\n');
  await write(site.root, 'nextjs/README.md', '# mine\n');
  await fs.rm(path.join(site.root, 'nextjs', 'postcss.config.mjs'));
  r = convert(p, 'sc');
  assert.equal(await fs.readFile(path.join(site.root, 'nextjs', 'app', 'page.tsx'), 'utf8'), 'export default function HomePage() { return <main className="p-4">mine</main>; }\n');
  assert.equal(await fs.readFile(path.join(site.root, 'nextjs', 'README.md'), 'utf8'), '# mine\n');
  assert.ok(await exists(path.join(site.root, 'nextjs', 'postcss.config.mjs')), 'a missing scaffold file is created again');
  assert.match(r.out, /created 1 file\(s\)[^\n]*postcss\.config\.mjs/);
  assert.doesNotMatch(r.out, /next: convert the clone/, 'the placeholder is gone: the next step is the source checks');
});

test('convert: a Verified conversion is its own outcome; the HTML clone\'s outcome, REPORT.md and audit are untouched', async () => {
  const p = await tmpProject();
  const site = await verifiedSite(p, 'fx', 'doc', { routes: ['/about'] });
  assert.equal(status(p, 'fx').code, 0);
  const htmlOutcome = await fs.readFile(path.join(site.root, 'compare', 'outcome.json'), 'utf8');
  const htmlReport = await fs.readFile(path.join(site.root, 'REPORT.md'), 'utf8');
  assert.equal(convert(p, 'fx').code, 1);
  await goodApp(site.root);
  // what convert --verify records after install, typecheck, lint, build and serving every route (the build itself is
  // the e2e test's): here written for the app as it is
  const hash = await subjectHash(site.root, 'app');
  await write(site.root, 'compare-nextjs/build.json', JSON.stringify({ subjectHash: hash, at: new Date().toISOString(), steps: Object.fromEntries(['install', 'typecheck', 'lint', 'build', 'serve'].map((s) => [s, { ok: true, exit: 0 }])), routes: [{ path: '/', status: 200 }, { path: '/about', status: 200 }] }));
  let r = convert(p, 'fx');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /next: npx trueclone convert fx --verify/, 'not measured against the reference yet');
  await measureAll(site, 'app');
  await reviewAll(site, 'app');
  r = convert(p, 'fx');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /write "## Conversion review \[[a-z0-9]{8}\]" in notes\.md/);
  const notes = await fs.readFile(path.join(site.root, 'notes.md'), 'utf8');
  await fs.writeFile(path.join(site.root, 'notes.md'), `${notes}\n## Conversion review [${reviewToken(hash)}]\n${CRITERIA.map(([id, key]) => `- ${id} ${key}: met: nextjs/components/Marquee.tsx, nextjs/content/home.ts`).join('\n')}\n`);
  r = convert(p, 'fx');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Verified: the Next\.js app in sites\/fx\/nextjs\/ builds/);
  const out = await readJson(site, 'compare-nextjs/outcome.json');
  assert.equal(out.outcome, 'verified');
  assert.equal(out.deliverable, 'nextjs');
  assert.equal(out.baseline.outcome, 'verified');
  assert.ok(out.accounting.ids.some((i) => i.startsWith('app:criterion:')) && out.accounting.ids.some((i) => i.startsWith('app:build:')));
  assert.match(await fs.readFile(path.join(site.root, 'REPORT.nextjs.md'), 'utf8'), /## Conversion[\s\S]*### Review criteria/);
  // the clone's workflow: unchanged by every conversion step, and still Verified on its own
  assert.equal(await fs.readFile(path.join(site.root, 'compare', 'outcome.json'), 'utf8'), htmlOutcome);
  assert.equal(await fs.readFile(path.join(site.root, 'REPORT.md'), 'utf8'), htmlReport);
  const s = status(p, 'fx');
  assert.equal(s.code, 0, s.out);
  assert.equal(audit(site.root).status, 0, audit(site.root).stdout);
  const a = audit(site.root, ['--conversion']);
  assert.equal(a.status, 0, a.stdout);
});

test('convert: a failing conversion ends Incomplete or Blocked on its own; the HTML clone stays Verified', async () => {
  const p = await tmpProject();
  const site = await verifiedSite(p, 'ff', 'doc', { routes: ['/about'] });
  assert.equal(status(p, 'ff').code, 0);
  const htmlOutcome = await fs.readFile(path.join(site.root, 'compare', 'outcome.json'), 'utf8');
  assert.equal(convert(p, 'ff').code, 1);
  await goodApp(site.root, 'ff');
  const hash = await subjectHash(site.root, 'app');
  await write(site.root, 'compare-nextjs/build.json', JSON.stringify({ subjectHash: hash, steps: Object.fromEntries(['install', 'typecheck', 'lint', 'build', 'serve'].map((s) => [s, { ok: true, exit: 0 }])) }));
  await measureAll(site, 'app');
  await reviewAll(site, 'app');
  const notes = await fs.readFile(path.join(site.root, 'notes.md'), 'utf8');
  await fs.writeFile(path.join(site.root, 'notes.md'), `${notes}\n## Conversion review [${reviewToken(hash)}]\n${CRITERIA.map(([id, key]) => (id === 'C2' ? `- ${id} ${key}: not met: the footer's links are copied markup` : `- ${id} ${key}: met: nextjs/components/Hero.tsx`)).join('\n')}\n`);
  const r = convert(p, 'ff');
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, /Next\.js app review C2 \(data\): not met/);
  assert.equal((await readJson(site, 'compare-nextjs/outcome.json')).outcome, 'incomplete');
  assert.equal(await fs.readFile(path.join(site.root, 'compare', 'outcome.json'), 'utf8'), htmlOutcome);
  assert.equal(status(p, 'ff').code, 0);
  // a build that fails names the fix in the app, and the clone is still Verified
  await write(site.root, 'compare-nextjs/build.json', JSON.stringify({ subjectHash: hash, steps: { install: { ok: true }, typecheck: { ok: false, exit: 2, error: "app/page.tsx(3,7): error TS2322: Type 'number' is not assignable to type 'string'." }, lint: { ok: true }, build: { ok: true } } }));
  const b = convert(p, 'ff');
  assert.equal(b.code, 1, b.out);
  assert.match(b.out, /next: fix the typecheck error in sites\/ff\/nextjs\/[\s\S]*TS2322/);
  assert.equal(status(p, 'ff').code, 0);
});

test('cloning never schedules conversion, and convert is never named by status', async () => {
  const p = await tmpProject();
  await verifiedSite(p, 'nc');
  const r = status(p, 'nc');
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /convert|next\.js|nextjs/i);
  const help = spawnSync(process.execPath, [path.join(SCRIPTS, '..', 'bin', 'trueclone.mjs'), 'next', 'nc'], { cwd: p, encoding: 'utf8' });
  assert.equal(help.status, 1);
  assert.match(`${help.stdout}${help.stderr}`, /trueclone next is retired[\s\S]*npx trueclone convert <name>/);
});

test('a conversion step still running never makes the clone\'s status wait; convert waits for its own', async () => {
  const p = await tmpProject();
  const site = await verifiedSite(p, 'rw');
  assert.equal(status(p, 'rw').code, 0);
  assert.equal(convert(p, 'rw').code, 1);
  // a `convert --verify` in progress (this test's own process stands for it: alive, no end record)
  await fs.mkdir(path.join(site.root, 'logs'), { recursive: true });
  await fs.appendFile(path.join(site.root, 'logs', 'commands.jsonl'), `${JSON.stringify({ event: 'start', step: 'convert', args: ['rw', '--verify'], pid: process.pid, startedAt: new Date().toISOString(), log: 'logs/x-convert.log' })}\n`);
  const s = status(p, 'rw');
  assert.equal(s.code, 0, s.out);
  assert.doesNotMatch(s.out, /waiting/);
  const c = convert(p, 'rw');
  assert.equal(c.code, 1, c.out);
  assert.match(c.out, /waiting: `convert rw --verify`/);
});
