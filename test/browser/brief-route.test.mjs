// trueclone brief --route opens the clone at the route's address by the one route rule (routes.mjs routeUrl): a
// segment with a colon is a path, not a scheme ("a:b" as a URL is the scheme a:), and a route named decoded
// ("/Landing Page.html") is the captured "/Landing%20Page.html" (samePath). The clone's evidence marks are found there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { routeDir } from '../../scripts/routes.mjs';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const put = async (root, rel, data) => {
  await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
  await fs.writeFile(path.join(root, rel), typeof data === 'string' ? data : JSON.stringify(data));
};
const page = (title) => `<!doctype html><title>${title}</title><body style="margin:0"><main style="height:2000px"><h1>${title}</h1><div data-tc-reveal="0" style="height:40px">reveal</div></main></body>`;

test('brief opens a route at its own address, however the route is spelled', async () => {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'tc-brief-'));
  const site = path.join(project, 'sites', 'b');
  try {
    const routes = [{ path: '/', slug: '' }, { path: '/a:b', slug: 'a_b', dir: 'reference/routes/a_b' }, { path: '/Landing%20Page.html', slug: 'Landing_20Page_html', dir: 'reference/routes/Landing_20Page_html' }];
    await put(site, 'reference/meta.json', { url: 'http://127.0.0.1:9/', name: 'b', mode: 'template', app: 'pages', routes });
    await put(site, 'clone/index.html', page('Home'));
    for (const r of routes.slice(1)) {
      await put(site, `${r.dir}/desktop.sections.json`, [{ index: 0, y: 0, height: 2000, tag: 'main' }]);
      await put(site, `clone/${routeDir(r.path)}/index.html`, page(r.path));
    }
    for (const spelled of ['/a:b', '/Landing Page.html', '/Landing%20Page.html']) {
      const r = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'brief.mjs'), 'b', '--route', spelled], { cwd: project, encoding: 'utf8', timeout: 120000 });
      assert.equal(r.status, 0, `${spelled}: ${r.stderr || r.stdout}`);
      // section 1 of the route: the reveal mark on the route's page (motion 1); a page that did not load has none
      assert.match(r.stdout, /^\| 1 \| main \| 0-2000 \| \d+ \| 1 \|/m, `${spelled}: ${r.stdout}`);
    }
  } finally { await fs.rm(project, { recursive: true, force: true }); }
});
