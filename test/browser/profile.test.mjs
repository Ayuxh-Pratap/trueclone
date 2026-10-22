// ALLBIRDS-2: the reference's visit profile (--hide) must reach every page a check opens in parallel, not only the
// first. Real browser: a local "reference" with a full-window dialog, five viewports opened at once as states.mjs does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const LIB = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'lib.mjs')).href;

test('the hide list reaches all five viewports opened in parallel', async () => {
  const server = http.createServer((req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><body><main style="height:2000px">page</main><div id="geo" style="position:fixed;inset:0;background:red">region dialog</div></body>'));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'tc-profile-'));
  await fs.mkdir(path.join(project, 'sites', 'geo', 'reference'), { recursive: true });
  await fs.writeFile(path.join(project, 'sites', 'geo', 'reference', 'meta.json'), JSON.stringify({ url, hide: ['#geo'], capturedAt: '2026-10-22T00:00:00Z' }));
  const probe = path.join(project, 'probe.mjs');
  await fs.writeFile(probe, `import { SCORED, openBrowser, newPage } from ${JSON.stringify(LIB)};
const browser = await openBrowser();
const seen = await Promise.all(SCORED.map(async (vp) => { const { context, page } = await newPage(browser, vp); await page.goto(${JSON.stringify(url)}); const hidden = await page.evaluate(() => getComputedStyle(document.getElementById('geo')).display === 'none'); await context.close(); return hidden; }));
await browser.close();
console.log(JSON.stringify(seen));`);
  // async: the test's own server must keep answering while the probe runs
  const r = await new Promise((resolve) => { const c = spawn(process.execPath, [probe, 'geo'], { cwd: project }); let stdout = '', stderr = ''; c.stdout.on('data', (d) => { stdout += d; }); c.stderr.on('data', (d) => { stderr += d; }); c.on('close', () => resolve({ stdout, stderr })); });
  server.close();
  const seen = JSON.parse((r.stdout || '').trim().split('\n').pop() || '[]');
  assert.deepEqual(seen, [true, true, true, true, true], r.stdout + r.stderr);
});
