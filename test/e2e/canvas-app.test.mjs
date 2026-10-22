// D4, end to end (about 4 minutes; needs the fixture servers, started here when they are not running): a template-mode
// canvas app (tools/fixtures/canvas-app) captured, its journey read and calibrated, then scored against
//   - a faithful port (the app's own code): every checkpoint passes
//   - the same colours in another arrangement (the gradient turned, the ring moved): the colour histogram that RC4's
//     template journey was judged by still scores it 98+, and the journey now fails on composition
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evaluate } from '../../scripts/verdict.mjs';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPTS = path.join(REPO, 'scripts');
const APP = 'http://127.0.0.1:5601/';
const run = (cwd, args) => new Promise((resolve) => {
  const c = spawn(process.execPath, [path.join(SCRIPTS, args[0]), ...args.slice(1)], { cwd, env: { ...process.env, NODE_OPTIONS: '' } });
  let out = '';
  c.stdout.on('data', (d) => { out += d; });
  c.stderr.on('data', (d) => { out += d; });
  c.on('close', (code) => resolve({ code, out }));
});
const up = () => fetch(APP).then((r) => r.ok, () => false);

test('D4: a template canvas journey passes a faithful port and fails the same colours in another layout', { timeout: 20 * 60 * 1000 }, async () => {
  let fixtures = null;
  if (!(await up())) {
    fixtures = spawn(process.execPath, [path.join(REPO, 'tools', 'fixtures', 'serve-fixtures.mjs')], { stdio: 'ignore' });
    for (let i = 0; i < 50 && !(await up()); i++) await new Promise((r) => setTimeout(r, 200));
  }
  try {
    const project = await fs.mkdtemp(path.join(os.tmpdir(), 'tc-app-'));
    const site = path.join(project, 'sites', 'fx');
    await fs.mkdir(site, { recursive: true });
    // the journey a visitor makes (as journey --draft wrote it for this app)
    await fs.writeFile(path.join(site, 'journey.json'), JSON.stringify({ viewports: ['desktop', 'mobile'], steps: [{ checkpoint: 'load', settle: 12000 }, { gesture: { shape: 'circle', at: [0.5, 0.5], size: 0.22 } }, { checkpoint: 'gate-1' }, { wheel: { dy: 1080 } }, { checkpoint: 'step-1' }, { wheel: { dy: 1080 } }, { checkpoint: 'step-2' }, { hold: { at: [0.5, 0.5], ms: 2000 } }, { checkpoint: 'hold-2' }] }));
    assert.equal((await run(project, ['capture.mjs', APP, 'fx'])).code, 0);
    assert.equal((await run(project, ['journey.mjs', 'fx'])).code, 0);
    assert.equal((await run(project, ['calibrate.mjs', 'fx'])).code, 0);

    await fs.cp(path.join(REPO, 'tools', 'fixtures', 'canvas-app'), path.join(site, 'clone'), { recursive: true });
    await run(project, ['score.mjs', 'fx', '--only', 'journey']);
    let ev = await evaluate(site, { side: 'clone' });
    const journey = () => ev.units.filter((u) => u.check === 'journey');
    assert.ok(journey().length === 2 && journey().every((u) => u.status === 'pass'), JSON.stringify(journey().map((u) => [u.viewport, u.status, u.value])));

    const stages = path.join(site, 'clone', 'stages.js');
    const src = await fs.readFile(stages, 'utf8');
    await fs.writeFile(stages, src.replace('clamp(uv.y + uMix', 'clamp(uv.x + uMix').replace('distance(uv, vec2(0.5))', 'distance(uv, vec2(0.3, 0.6))'));
    await run(project, ['score.mjs', 'fx', '--only', 'journey']);
    ev = await evaluate(site, { side: 'clone' });
    assert.ok(journey().every((u) => u.status === 'fail'), JSON.stringify(journey().map((u) => [u.viewport, u.status, u.value])));
    const members = journey().flatMap((u) => u.record.members);
    assert.ok(members.every((m) => m.hist >= 95), 'the histogram alone would have passed it');
    assert.ok(members.some((m) => m.sComp < 50), 'composition sees the other arrangement');
  } finally {
    fixtures?.kill();
  }
});
