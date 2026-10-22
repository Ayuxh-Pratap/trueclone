// RC5 zero (2026-10-22): the scored reference journey drew "a zero" before the site showed its gate (the load
// checkpoint holds still within ~2 s while the loader counts; the gate appears 3-6 s after load), so the gesture went
// nowhere and every later checkpoint stayed at "DRAW A ZERO". A gesture drawn 6 s after load passed 2 of 2; at 0.5-3 s,
// 0 of 6. The replay must wait for the gate it was written for, check it passed, and say so when it does not.
// A local canvas app with a gate that appears 3 s after load, through the real journey.mjs (about 1 minute).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPTS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts');
const PAGE = `<!doctype html><html><body style="margin:0;overflow:hidden;background:#123">
<canvas id="c" style="position:fixed;inset:0;width:100vw;height:100vh"></canvas>
<div id="ui" style="position:fixed;top:40%;width:100%;text-align:center;color:#fff;font:24px sans-serif"></div>
<script>
const ui = document.getElementById('ui'), c = document.getElementById('c'), x = c.getContext('2d');
c.width = innerWidth; c.height = innerHeight;
let gate = false, passed = false, pts = [];
setTimeout(() => { gate = true; ui.textContent = 'DRAW A ZERO'; }, 3000);
// a loader that counts while the page is "loading" (it looks still to a frame comparison)
let n = 0; const tick = setInterval(() => { if (gate) return clearInterval(tick); x.fillStyle = '#123'; x.fillRect(0, 0, 60, 30); x.fillStyle = '#fff'; x.fillText(String(n++ % 10), 10, 20); }, 300);
addEventListener('pointerdown', (e) => { pts = [[e.clientX, e.clientY]]; });
addEventListener('pointermove', (e) => { if (e.buttons) pts.push([e.clientX, e.clientY]); });
addEventListener('pointerup', () => {
  if (!gate || passed) return;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  if (pts.length > 20 && Math.max(...xs) - Math.min(...xs) > 100 && Math.max(...ys) - Math.min(...ys) > 100) { passed = true; ui.textContent = '100 XP'; document.body.style.background = '#272'; }
});
</script></body></html>`;

test('a replayed gate waits for the gate, passes it, and a gate that never passes is reported', { timeout: 300000 }, async () => {
  const srv = http.createServer((q, r) => r.writeHead(200, { 'content-type': 'text/html' }).end(PAGE));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${srv.address().port}/`;
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'tc-gate-'));
  const site = path.join(project, 'sites', 'gate');
  await fs.mkdir(path.join(site, 'reference'), { recursive: true });
  await fs.writeFile(path.join(site, 'reference', 'meta.json'), JSON.stringify({ url, name: 'gate', mode: 'template', capturedAt: '2026-10-22T00:00:00Z', complete: true, canvasApp: { canvas: 'canvas#c' }, stabilise: { seed: 1, clock: 'off' } }));
  const run = () => new Promise((resolve) => { const c = spawn(process.execPath, [path.join(SCRIPTS, 'journey.mjs'), 'gate'], { cwd: project }); let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; }); c.on('close', (code) => resolve({ code, out })); });
  const read = async () => JSON.parse(await fs.readFile(path.join(site, 'reference', 'journey', 'journey.json'), 'utf8')).viewports[0];
  try {
    // the journey as the draft writes it: a load checkpoint, the gate's gesture, a checkpoint after it
    await fs.writeFile(path.join(site, 'journey.json'), JSON.stringify({ viewports: ['desktop'], steps: [{ checkpoint: 'load', settle: 12000 }, { gesture: { shape: 'circle', at: [0.5, 0.5], size: 0.22 } }, { checkpoint: 'gate-1' }] }));
    let r = await run();
    let v = await read();
    assert.match(v.checkpoints.find((c) => c.name === 'gate-1').ui, /100 XP/, r.out);
    assert.deepEqual(v.errors, []);

    // a gesture the gate never accepts (a dot, not a zero): tried a bounded number of times, then reported
    await fs.writeFile(path.join(site, 'journey.json'), JSON.stringify({ viewports: ['desktop'], steps: [{ checkpoint: 'load', settle: 12000 }, { gesture: { path: [[0.5, 0.5], [0.501, 0.5]] } }, { checkpoint: 'gate-1' }] }));
    r = await run();
    v = await read();
    assert.match(v.checkpoints.find((c) => c.name === 'gate-1').ui, /DRAW A ZERO/);
    assert.ok(v.errors.some((e) => /gate not passed/.test(e) && /DRAW A ZERO/.test(e)), JSON.stringify(v.errors));
  } finally { srv.close(); }
});
