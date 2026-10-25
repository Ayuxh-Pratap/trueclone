// Builds synthetic trueclone site folders for the tests: a capture, a seeded clone, notes, and results recorded through
// the same code the checks use (results.mjs writeUnits with identity.mjs identities), so the evaluator, the loop and
// status are exercised exactly as in a real run, without a browser.
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeUnits } from '../../scripts/results.mjs';
import { startIdentity, refIdOf, codeHash, toolVersion } from '../../scripts/identity.mjs';
import { MASK_VERSION } from '../../scripts/lib.mjs';

export const SCRIPTS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts');
export const VPS = ['desktop', 'tablet', 'mobile', 'laptop', 'wide'];
const SEED = ['desktop', 'tablet', 'mobile'];

export async function tmpProject() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'tc-test-'));
}
const put = async (root, rel, data) => {
  const p = path.join(root, rel);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
};

// kind: 'doc' | 'app'; opts: { routes: ['/about'], interactions: ['menu opens'], exact, curves }
export async function makeSite(project, name, kind = 'doc', opts = {}) {
  const root = path.join(project, 'sites', name);
  const app = kind === 'app';
  const routes = [{ path: '/', slug: '', dir: 'reference' }, ...(opts.routes || []).map((p) => ({ path: p, slug: p.replace(/^\//, '').replace(/\//g, '__'), dir: `reference/routes/${p.replace(/^\//, '').replace(/\//g, '__')}` }))];
  const meta = { maskVersion: MASK_VERSION, url: 'http://127.0.0.1:9/', name, mode: opts.exact ? 'exact' : 'template', ...(opts.exact ? { permission: 'test' } : {}), hide: [], routes: routes.length > 1 ? routes : [], unroll: 'y', ...(opts.ignore ? { ignore: opts.ignore } : {}), stabilise: { seed: 20261021, clock: '2026-01-15T12:00:00.000Z', motion: 'no-preference', loops: 'held at 2300 ms' }, capturedAt: '2026-10-22T00:00:00.000Z', complete: true, viewports: VPS.map((v) => ({ viewport: v, pageHeight: 2000, sections: 3 })), ...(app ? { canvasApp: { canvas: 'canvas#c', engine: 'three' } } : {}) };
  await put(root, 'reference/meta.json', meta);
  // calibrated (calibrate.mjs), with no entry: every bar is the fixed target
  await put(root, 'reference/noise.json', { refId: refIdOf(meta), at: '2026-10-22T02:00:00.000Z', draws: 2, drawDirs: [], entries: {} });
  await put(root, 'reference/motion.desktop.json', { libs: {}, triggers: [], onScroll: [], css: [] });
  await put(root, 'reference/scripts/scripts.json', { listeners: [], scripts: [] });
  if (app) {
    await put(root, 'journey.json', { viewports: ['desktop', 'mobile'], steps: [{ checkpoint: 'load' }, { wheel: { dy: 900 } }, { checkpoint: 'step-1' }] });
    await put(root, 'reference/journey/journey.json', { viewports: [] });
  } else {
    for (const r of routes) for (const v of VPS) await put(root, `${r.dir}/states/${v}.json`, { steps: [] });
    await put(root, 'reference/states/desktop.summary.json', { counts: {} });
    await put(root, 'reference/desktop.spec.json', {});
    await put(root, 'reference/reveals.desktop.json', { keys: 'id-path', scrubs: opts.curves ? [{ cls: 'hero', path: 'section:1' }] : [] });
    await put(root, 'reference/widgets.desktop.json', { keys: 'id-path' });
    await put(root, 'reference/inline-styles.json', {});
    await put(root, 'reference/desktop.sections.json', []);
    await put(root, 'design-tokens.json', {});
    await put(root, 'DESIGN.md', '# design\n');
    if (opts.curves) await put(root, 'motion-map.json', [{ name: 'hero', ref: '.hero', clone: '.hero', props: ['ty'] }]);
  }
  if (opts.interactions) await put(root, 'reference/interactions.auto.json', opts.interactions.map((n) => ({ name: n, viewport: 'desktop', steps: [] })));
  await put(root, 'clone/index.html', opts.cloneHtml || '<!doctype html><title>x</title><body><h1>clone</h1><script src="script.js" defer></script></body>\n');
  // each captured route's page, where the seed writes it (clone/<route>/index.html), unless a test leaves one out
  for (const r of routes.filter((x) => x.slug && !(opts.missingPages || []).includes(x.path))) await put(root, `clone/${r.path.replace(/^\//, '')}/index.html`, '<!doctype html><title>x</title><body><h1>route</h1></body>\n');
  await put(root, 'clone/script.js', opts.cloneScript || 'const a = 1;\nconst b = 2;\nconst c = 3;\nconst d = 4;\nconst e = 5;\nconsole.log(a + b + c + d + e);\n');
  await put(root, 'clone/.seed.json', { capturedAt: meta.capturedAt, at: '2026-10-22T01:00:00.000Z', pages: 1, code: codeHash('seed'), tool: toolVersion() });
  // every read finished for this capture (reads.mjs records it; status trusts nothing else)
  await put(root, 'reference/reads.json', { capturedAt: meta.capturedAt, reads: Object.fromEntries((app ? ['motion', 'journey'] : ['states', 'motion', 'spec', 'widgets', 'reveals']).map((s) => [s, { complete: true, at: '2026-10-22T00:30:00.000Z' }])) });
  // reads and seed inputs must not look newer than the clone: set every file's time to the capture time + 1 h
  const t = new Date('2026-10-22T01:00:00.000Z');
  for (const f of walk(root)) fsSync.utimesSync(f, t, t);
  await put(root, 'notes.md', notesWith([]));
  return { root, meta, routes, app };
}
function* walk(d) { for (const e of fsSync.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) yield* walk(p); else yield p; } }

export function notesWith(reviewLines, extra = '') {
  return `# notes\n\n## Stack\n- static html\n\n## Behaviours\n- h1: no motion\n- hero: scroll parallax, ported in script.js\n\n## Review\n${reviewLines.map((l) => `- ${l}`).join('\n')}\n${extra}`;
}

// Every required result of the site measured as passing (or with `value`), on the clone (compare) or a Next.js
// conversion (compare-nextjs)
export async function measureAll(site, side = 'clone', { value = 99.5, skip = [], members = null, onlyVps = null } = {}) {
  const compare = side === 'app' ? 'compare-nextjs' : 'compare';
  const vps = onlyVps || VPS;
  const routeKeys = site.routes.map((r) => (r.slug ? r.path : ''));
  const write = async (check, units) => { if (!skip.includes(check)) await writeUnits(site.root, compare, check, units, await startIdentity(site.root, check, side)); };
  if (site.app) {
    await write('journey', ['desktop', 'mobile'].filter((v) => vps.includes(v)).map((v) => ({ viewport: v, value, members: members || [{ id: 'load', value }, { id: 'step-1', value }] })));
  } else {
    await write('layout', routeKeys.flatMap((r) => vps.map((v) => ({ route: r, viewport: v, value }))));
    await write('reduced', routeKeys.flatMap((r) => ['desktop', 'mobile'].filter((v) => vps.includes(v)).map((v) => ({ route: r, viewport: v, value }))));
    await write('behaviour', routeKeys.flatMap((r) => ['desktop', 'mobile'].filter((v) => vps.includes(v)).map((v) => ({ route: r, viewport: v, value: 100, members: [{ id: 'move@700', y: 700, value: 100 }] }))));
    await write('scroll', routeKeys.flatMap((r) => vps.map((v) => ({ route: r, viewport: v, value, members: members || [{ id: '0', y: 0, value }, { id: '1', y: 450, value }] }))));
    await write('detail', SEED.filter((v) => vps.includes(v)).map((v) => ({ viewport: v, value })));
    await write('hovers', [{ viewport: 'desktop', na: 'no hover effect on the reference to compare', value: null }]);
    if (site.meta.mode === 'exact') await write('layout-real', vps.map((v) => ({ viewport: v, value })));
    if (fsSync.existsSync(path.join(site.root, 'motion-map.json'))) await write('curves', SEED.filter((v) => vps.includes(v)).map((v) => ({ viewport: v, value })));
  }
  await write('load', vps.map((v) => ({ viewport: v, value })));
  const auto = JSON.parse(await fs.readFile(path.join(site.root, 'reference', 'interactions.auto.json'), 'utf8').catch(() => 'null'));
  if (auto) await write('interact', [...auto.map((s) => ({ state: s.name, value: 99, score: 99, pass: true })), { state: '_plan', scenarios: auto.map((s) => s.name), skipped: [] }]);
}

// Review frames shot of the clone (or app) as it is now, every frame with a verdict. The app's pictures are its own:
// another token than the clone's frame of the same name, and its verdicts under "## Review: app" (rc.7; with one shared
// token this helper hid the RC6 zero collision: docs/rc7-notes.md)
export const TOKENS = { clone: 'tok01', app: 'tap02' };
export async function reviewAll(site, side = 'clone', { verdict = 'same', pct = 99, token = TOKENS[side] } = {}) {
  const { reviewDirs, REVIEW_HEADING } = await import('../../scripts/verdict.mjs');
  const ident = await startIdentity(site.root, 'review', side);
  const lines = [];
  for (const d of reviewDirs(site.meta, side)) {
    const id = `${d.route ? `${d.route.replace(/^\//, '')}/` : ''}01-top`;
    await put(site.root, `${d.dir}/frames.json`, { size: d.size, at: ident.startedAt, subjectHash: ident.subjectHash, refId: ident.refId, frames: [{ id: site.app ? 'journey/00-load' : id, pct, token }] });
    lines.push(`${site.app ? 'journey/00-load' : id} ${d.size} [${token}]: ${verdict}`);
  }
  let notes = await fs.readFile(path.join(site.root, 'notes.md'), 'utf8');
  const heading = `## ${REVIEW_HEADING[side === 'app' ? 'app' : 'clone']}\n`;
  if (!notes.includes(heading)) notes = `${notes.replace(/\n*$/, '\n')}\n${heading}`;
  const have = new Set(notes.split('\n'));
  const add = lines.map((l) => `- ${l}`).filter((l) => !have.has(l));
  await fs.writeFile(path.join(site.root, 'notes.md'), notes.replace(heading, `${heading}${add.join('\n')}${add.length ? '\n' : ''}`));
}

// A fully verified HTML clone: measured and reviewed (cloning has no other side: a conversion is its own workflow)
export async function verifiedSite(project, name, kind = 'doc', opts = {}) {
  const site = await makeSite(project, name, kind, opts);
  await measureAll(site, 'clone');
  await reviewAll(site, 'clone');
  return site;
}

export function status(project, name, env = {}) {
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, 'status.mjs'), name], { cwd: project, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '', ...env } });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}
export function report(project, name, env = {}) {
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, 'report.mjs'), name], { cwd: project, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '', ...env } });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}
export const edit = (site, rel, content) => fs.writeFile(path.join(site.root, rel), content);
// a clone script edit that is still a real script (status asks for script.js below 5 lines of code)
export const scriptEdit = (tag) => `// edit ${tag}\nconst a = 1;\nconst b = 2;\nconst c = 3;\nconst d = 4;\nconsole.log(a + b + c + d, ${JSON.stringify(String(tag))});\n`;
export const readJson = (site, rel) => fs.readFile(path.join(site.root, rel), 'utf8').then(JSON.parse);
