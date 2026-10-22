// ASTRO-5: script evidence of a route page. The route is asked without its trailing slash and served with it (as astro's
// routes are); its two different inline scripts must be saved as two files, never overwrite one another.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { openBrowser, newPage } from '../../scripts/lib.mjs';
import { startScriptEvidence } from '../../scripts/scripts-evidence.mjs';

test('two inline scripts on a route served at a trailing slash are two files', async () => {
  const page1 = `<!doctype html><body><h1>intro</h1><script>window.themeToggle = function () { document.documentElement.dataset.theme = 'dark'; return 'theme'; };</script><script>window.sidebarPersist = function () { localStorage.setItem('sidebar', 'open'); return 'sidebar'; };</script></body>`;
  const server = http.createServer((req, res) => {
    if (req.url === '/tutorial/intro') return res.writeHead(301, { location: '/tutorial/intro/' }).end();
    res.writeHead(200, { 'content-type': 'text/html' }).end(page1);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'tc-scripts-'));
  const browser = await openBrowser();
  try {
    const { context, page } = await newPage(browser, { name: 'desktop', width: 1440, height: 900 });
    const finish = await startScriptEvidence(page, `${base}/tutorial/intro`);
    await page.goto(`${base}/tutorial/intro`, { waitUntil: 'load' });
    await finish(out);
    await context.close();
  } finally { await browser.close(); server.close(); }
  const files = (await fs.readdir(out)).filter((f) => f.endsWith('.js') && !f.endsWith('.pretty.js'));
  const inline = files.filter((f) => f.startsWith('inline-'));
  assert.equal(inline.length, 2, `files: ${files.join(', ')}`);
  const sources = await Promise.all(inline.map((f) => fs.readFile(path.join(out, f), 'utf8')));
  assert.ok(sources.some((s) => s.includes('themeToggle')) && sources.some((s) => s.includes('sidebarPersist')));
});
