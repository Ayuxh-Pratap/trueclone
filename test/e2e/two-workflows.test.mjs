// End to end, real browser, real pipeline: the two workflows on one small site (tools/fixtures/two-workflows), driven
// the way an agent drives them (do the step status names, run status again).
//   1. cloning ("clone these two pages", exact mode): capture --routes "/,/about" keeps that scope (the pricing page the
//      site links to stays outside it, its link pointing at the live site with its query and fragment); the first-party
//      document the home page embeds (embed.localhost) is captured as a dependency, copied into the clone and measured
//      inside the page; a clone served locally fetches nothing from the live site; status reaches Verified, the
//      deliverable an HTML clone, with no Next.js application, no Next.js step, nothing of a conversion in its outcome
//   2. converting (a separate, later request): convert creates a conventional project, a hand-written conversion
//      (tools/fixtures/two-workflows/app) passes the source checks, installs, type-checks, lints, builds, serves every
//      route, is measured against the original reference and reviewed, and ends Verified as its own outcome, the HTML
//      clone's outcome, REPORT.md and audit unchanged
// Fixtures are not real sites: passing here shows the contracts hold, not that a real site will verify (the manual
// site test is a separate stage). The conversion needs the npm registry (it installs next, react, tailwind, eslint): it
// is skipped, saying so, when npm cannot reach it. usage: npm run test:e2e
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openBrowser, newPage, serve, VIEWPORTS } from '../../scripts/lib.mjs';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIX = path.join(REPO, 'tools', 'fixtures', 'two-workflows');
const PORT = 5611; // the conversion fixture names this origin (its embed and its live link)
const URL_ = `http://localhost:${PORT}/`;
const NAME = 'twofx';
const hits = []; // every request the fixture server answers, with the phase the test is in
let phase = 'capture';

const tc = (cwd, args) => new Promise((resolve) => {
  const c = spawn(process.execPath, [path.join(REPO, 'bin', 'trueclone.mjs'), ...args], { cwd, env: { ...process.env, NODE_OPTIONS: '' } });
  let out = '';
  c.stdout.on('data', (d) => { out += d; });
  c.stderr.on('data', (d) => { out += d; });
  c.on('close', (code) => resolve({ code, out }));
});
const argsOf = (cmd) => (cmd.replace(/^npx trueclone /, '').match(/"[^"]*"|\S+/g) || []).map((a) => a.replace(/^"|"$/g, ''));
const nextOf = (out) => /\nnext: ([^\n]+)/.exec(out)?.[1] || null;
const read = (p) => fs.readFile(p, 'utf8');

// verdicts given to every frame of a review folder that has none yet ("same", with the reason a low-match frame needs)
async function writeVerdicts(site, compare, heading) {
  const lines = [];
  const walk = async (d) => { for (const e of await fs.readdir(d, { withFileTypes: true }).catch(() => [])) { const p = path.join(d, e.name); if (e.isDirectory()) await walk(p); else if (e.name === 'frames.json') { const f = JSON.parse(await read(p)); for (const x of f.frames || []) lines.push(`- ${x.id} ${f.size} [${x.token}]: same: the reference and the copy show the same thing here`); } } };
  await walk(path.join(site, compare, 'review'));
  let notes = await read(path.join(site, 'notes.md')).catch(() => '# notes\n');
  const re = new RegExp(`^## ${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n[\\s\\S]*?(?=^## |(?![\\s\\S]))`, 'm');
  notes = re.test(notes) ? notes.replace(re, `## ${heading}\n\n${lines.join('\n')}\n\n`) : `${notes.replace(/\n*$/, '\n')}\n## ${heading}\n\n${lines.join('\n')}\n`;
  await fs.writeFile(path.join(site, 'notes.md'), notes);
}
const setSection = async (site, title, body) => {
  let notes = await read(path.join(site, 'notes.md')).catch(() => '# notes\n');
  const re = new RegExp(`^## ${title}\\s*\\n[\\s\\S]*?(?=^## |(?![\\s\\S]))`, 'm');
  notes = re.test(notes) ? notes.replace(re, `## ${title}\n\n${body}\n\n`) : `${notes.replace(/\n*$/, '\n')}\n## ${title}\n\n${body}\n`;
  await fs.writeFile(path.join(site, 'notes.md'), notes);
};

let project = null, site = null, htmlOutcome = null, htmlReport = null;
let server = null;

test('cloning: two pages in exact mode reach Verified as an HTML clone; links outside the scope go live; the embedded document is the clone\'s own copy', { timeout: 60 * 60 * 1000 }, async () => {
  server = http.createServer(async (req, res) => {
    const host = String(req.headers.host || '');
    const p = new URL(req.url, 'http://x').pathname;
    hits.push({ phase, host, path: p });
    const dir = host.startsWith('embed.') ? 'embed' : 'site';
    const file = dir === 'embed' ? p.slice(1) : ({ '/': 'index.html', '/about': 'about.html', '/pricing': 'pricing.html' }[p] || p.slice(1));
    const body = await fs.readFile(path.join(FIX, dir, file)).catch(() => null);
    if (!body || file.includes('..')) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': file.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8' }).end(body);
  });
  await new Promise((r) => server.listen(PORT, r));
  project = await fs.mkdtemp(path.join(os.tmpdir(), 'tc-e2e-two-'));
  site = path.join(project, 'sites', NAME);

  let r = await tc(project, ['capture', URL_, NAME, '--routes', '/,/about', '--mode', 'exact', '--permission', 'trueclone test fixture (our own pages)']);
  assert.equal(r.code, 0, r.out);
  const meta = JSON.parse(await read(path.join(site, 'reference', 'meta.json')));
  assert.equal(meta.scope.kind, 'list');
  assert.deepEqual(meta.routes.map((x) => x.path), ['/', '/about']);
  assert.ok(meta.routesNotCaptured.some((x) => x.path === '/pricing' && /outside the requested scope/.test(x.why)), JSON.stringify(meta.routesNotCaptured));
  const dep = (meta.dependencies || []).find((d) => d.src === `http://embed.localhost:${PORT}/frame.html`);
  assert.ok(dep?.recorded && dep.page === '/' && dep.files >= 2, JSON.stringify(meta.dependencies));

  // the agent's loop: do what status names, run it again
  phase = 'clone';
  for (let i = 0; i < 80; i++) {
    r = await tc(project, ['status', NAME]);
    if (r.code !== 1) break;
    const step = nextOf(r.out);
    assert.ok(step, r.out);
    assert.doesNotMatch(r.out, /next\.?js|nextjs|convert/i, 'cloning never names Next.js work');
    if (/^npx trueclone /.test(step)) { const s = await tc(project, argsOf(step)); if (/^npx trueclone (seed|reads|calibrate|design|score|review|brief)\b/.test(step)) assert.ok([0, 1].includes(s.code), `${step}\n${s.out.slice(-2000)}`); }
    else if (/^write review verdicts under "## Review"/.test(step)) await writeVerdicts(site, 'compare', 'Review');
    else if (/^write ## Behaviours/.test(step)) await setSection(site, 'Behaviours', '- none: the site runs no script (reference/scripts/ has no listeners); nothing moves');
    else if (/^write ## Stack/.test(step)) await setSection(site, 'Stack', '- static HTML and one stylesheet; a first-party embedded document (embed.localhost)');
    else if (/^write clone\/script\.js/.test(step)) await fs.writeFile(path.join(site, 'clone', 'script.js'), "// the reference runs no script: nothing to port; the boot contract ends when the page is parsed\nconst root = document.documentElement;\nconst ready = () => root.classList.remove('tc-boot');\nif (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);\nelse ready();\nwindow.addEventListener('pageshow', ready);\n");
    else assert.fail(`status named a step this fixture should not need: ${step}\n${r.out}`);

    // once seeded: the links and the embedded document, checked once
    if (/^npx trueclone seed /.test(step)) {
      const html = await read(path.join(site, 'clone', 'index.html'));
      assert.match(html, /href="\/about"/);
      assert.match(html, new RegExp(`href="http://localhost:${PORT}/pricing\\?plan=pro#faq"`), 'outside the scope: the live page, query and fragment kept');
      assert.doesNotMatch(html, /href="\/pricing/, 'never a local 404');
      assert.match(html, new RegExp(`src="/_dep/embed\\.localhost_${PORT}/frame\\.html"`));
      assert.match(await read(path.join(site, 'clone', '_dep', `embed.localhost_${PORT}`, 'frame.html')), new RegExp(`href="/_dep/embed\\.localhost_${PORT}/frame\\.css"`));
      // the clone, served locally, shows the embedded document from its own copy and asks the live site for nothing
      const local = await serve(path.join(site, 'clone'));
      const browser = await openBrowser();
      try {
        const { page } = await newPage(browser, VIEWPORTS.find((v) => v.name === 'desktop'), { stabilise: false });
        phase = 'clone-served';
        await page.goto(local.url, { waitUntil: 'load', timeout: 60000 });
        await page.waitForTimeout(1500);
        const frame = page.frames().find((f) => /\/_dep\//.test(f.url()));
        assert.equal(await frame?.textContent('.hello'), 'Embedded hello');
        assert.deepEqual(hits.filter((h) => h.phase === 'clone-served'), [], 'the served clone fetched from the live site');
      } finally { phase = 'clone'; await browser.close(); local.close(); }
    }
  }
  assert.equal(r.code, 0, `the HTML clone did not reach Verified:\n${r.out}`);
  assert.match(r.out, /Verified: every required result passes on the HTML clone/);
  assert.match(r.out, /Delivered: HTML\/CSS\/JS clone \(exact mode\), scope: the 2 pages asked for, 2 captured \(\/, \/about\); 1 other page of the site is outside it, linked to the live site/);
  for (const d of ['nextjs', 'next', 'compare-nextjs', 'compare-next']) assert.equal(await fs.stat(path.join(site, d)).catch(() => null), null, `${d} after cloning`);
  const outcome = JSON.parse(await read(path.join(site, 'compare', 'outcome.json')));
  assert.equal(outcome.deliverable, 'html');
  assert.ok(outcome.accounting.ids.every((i) => i.startsWith('clone:')));
  const report = await read(path.join(site, 'REPORT.md'));
  assert.match(report, /## Scope[\s\S]*\*\*Requested\*\*: the pages listed \(`\/`, `\/about`\)/);
  assert.match(report, new RegExp(`\\*\\*Links outside the scope\\*\\* \\(1, each to its live address, query and fragment kept\\): \`http://localhost:${PORT}/pricing\\?plan=pro#faq\``));
  assert.match(report, /\*\*Embedded documents\*\*[^\n]*embed\.localhost[^\n]*recorded/);
  const audit = spawnSync(process.execPath, [path.join(REPO, 'tools', 'audit-run.mjs'), site], { encoding: 'utf8' });
  assert.equal(audit.status, 0, audit.stdout);
  htmlOutcome = await read(path.join(site, 'compare', 'outcome.json'));
  htmlReport = report;
});

test('converting: a separate request, a maintainable app that builds and matches the reference; the HTML clone untouched', { timeout: 60 * 60 * 1000 }, async (t) => {
  try {
    if (!htmlOutcome) { t.skip('the cloning test did not finish'); return; }
    const ping = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ping'], { encoding: 'utf8', timeout: 30000, shell: process.platform === 'win32' });
    if (ping.status !== 0) { t.skip(`npm cannot reach its registry here (npm ping: ${String(ping.stderr || ping.error || '').split('\n')[0]}): the conversion installs next, react, tailwind and eslint`); return; }
    phase = 'convert';
    let r;
    for (let i = 0; i < 40; i++) {
      r = await tc(project, ['convert', NAME]);
      if (r.code !== 1) break;
      const step = nextOf(r.out);
      assert.ok(step, r.out);
      if (/^convert the clone into /.test(step)) await fs.cp(path.join(FIX, 'app'), path.join(site, 'nextjs'), { recursive: true, force: true });
      else if (/^npx trueclone convert \S+ --verify$/.test(step)) { const v = await tc(project, argsOf(step)); assert.ok([0, 1].includes(v.code), v.out.slice(-3000)); }
      else if (/^write review verdicts for the Next\.js app/.test(step)) await writeVerdicts(site, 'compare-nextjs', 'Review: app');
      else if (/^write "## Conversion review \[([a-z0-9]{8})\]"/.test(step)) {
        const token = /\[([a-z0-9]{8})\]/.exec(step)[1];
        const evidence = { C1: 'nextjs/components/Hero.tsx, nextjs/components/FeatureCards.tsx', C2: 'nextjs/components/FeatureCards.tsx, nextjs/content/site.ts', C3: 'nextjs/content/site.ts, nextjs/README.md', C4: 'nextjs/components/Hero.tsx, nextjs/app/globals.css', C5: 'nextjs/app/layout.tsx', C6: 'nextjs/components/EmbeddedPreview.tsx', C7: 'nextjs/app/about/page.tsx, nextjs/components/SiteHeader.tsx', C8: 'nextjs/components/SiteHeader.tsx, nextjs/app/layout.tsx', C9: 'nextjs/README.md', C10: 'nextjs/content/site.ts, nextjs/components/SiteHeader.tsx, nextjs/app/about/page.tsx' };
        const { CRITERIA } = await import('../../scripts/conversion.mjs');
        let notes = (await read(path.join(site, 'notes.md'))).replace(/^## Conversion review[^\n]*\n[\s\S]*?(?=^## |(?![\s\S]))/m, '');
        notes += `\n## Conversion review [${token}]\n\n${CRITERIA.map(([id, key]) => `- ${id} ${key}: met: ${evidence[id]}`).join('\n')}\n`;
        await fs.writeFile(path.join(site, 'notes.md'), notes);
      } else assert.fail(`convert named a step the fixture's conversion should not need: ${step}\n${r.out}`);
    }
    assert.equal(r.code, 0, `the conversion did not reach Verified:\n${r.out}`);
    const out = JSON.parse(await read(path.join(site, 'compare-nextjs', 'outcome.json')));
    assert.equal(out.outcome, 'verified');
    assert.equal(out.baseline.outcome, 'verified');
    const build = JSON.parse(await read(path.join(site, 'compare-nextjs', 'build.json')));
    assert.deepEqual(build.routes.map((x) => [x.path, x.status]), [['/', 200], ['/about', 200]]);
    assert.ok(['install', 'typecheck', 'lint', 'build', 'serve'].every((s) => build.steps[s].ok), JSON.stringify(build.steps));
    assert.match(await read(path.join(site, 'REPORT.nextjs.md')), /\*\*Verified\*\*: the Next\.js conversion builds/);
    // the HTML clone's workflow: byte for byte as it was, and still Verified on its own
    assert.equal(await read(path.join(site, 'compare', 'outcome.json')), htmlOutcome);
    assert.equal(await read(path.join(site, 'REPORT.md')), htmlReport);
    assert.equal((await tc(project, ['status', NAME])).code, 0);
    for (const args of [[site], [site, '--conversion']]) { const a = spawnSync(process.execPath, [path.join(REPO, 'tools', 'audit-run.mjs'), ...args], { encoding: 'utf8' }); assert.equal(a.status, 0, a.stdout); }
  } finally {
    server?.closeAllConnections?.();
    server?.close();
  }
});
