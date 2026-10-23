// Interrupted and resumed, through the real pipeline on the doc-site fixture (RC6: heybhaskar's behaviour killed at its
// limit lost 14 finished units and left its timing lock; varsity's calibrate stopped after 98 minutes and a rerun would
// have deleted its finished draws).
//   - behaviour killed after its first unit keeps that unit; the rerun measures only what is left
//   - calibrate killed after its first check resumes from it, and writes noise.json once every check is done
//   - a score step killed on its time limit leaves no timing lock behind
// Needs the fixture servers (started here when they are not running). usage: npm run test:e2e
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FIXTURE } from '../helpers/doc-variants.mjs';
import { timingLockHolder } from '../../scripts/lib.mjs';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPTS = path.join(REPO, 'scripts');
const URL_ = 'http://127.0.0.1:5603/';
const up = () => fetch(URL_).then((r) => r.ok, () => false);
// run a step; with `killWhen`, kill it (the whole tree) as soon as its output matches
const run = (cwd, args, { killWhen = null } = {}) => new Promise((resolve) => {
  const c = spawn(process.execPath, [path.join(SCRIPTS, args[0]), ...args.slice(1)], { cwd, env: { ...process.env, NODE_OPTIONS: '' } });
  let out = '', killed = false;
  const on = (d) => { out += d; if (killWhen && !killed && killWhen.test(out)) { killed = true; if (process.platform === 'win32') spawn('taskkill', ['/pid', String(c.pid), '/T', '/F']); else c.kill('SIGKILL'); } };
  c.stdout.on('data', on);
  c.stderr.on('data', on);
  c.on('close', (code) => resolve({ code, out, killed }));
});

test('interrupted, then resumed: behaviour keeps its finished units, calibrate its finished checks; a killed step leaves no lock', { timeout: 40 * 60 * 1000 }, async () => {
  let fixtures = null;
  if (!(await up())) {
    fixtures = spawn(process.execPath, [path.join(REPO, 'tools', 'fixtures', 'serve-fixtures.mjs')], { stdio: 'ignore' });
    for (let i = 0; i < 50 && !(await up()); i++) await new Promise((r) => setTimeout(r, 200));
  }
  try {
    const project = await fs.mkdtemp(path.join(os.tmpdir(), 'tc-resume-'));
    const site = path.join(project, 'sites', 'rs');
    let r = await run(project, ['capture.mjs', URL_, 'rs', '--routes', '1']);
    assert.equal(r.code, 0, r.out);
    r = await run(project, ['states.mjs', 'rs']);
    assert.equal(r.code, 0, r.out);
    await fs.cp(FIXTURE, path.join(site, 'clone'), { recursive: true, force: true });

    // behaviour: killed after its first unit (desktop), then run again
    r = await run(project, ['behaviour.mjs', 'rs'], { killWhen: /\/ (desktop|mobile): behaviour/ });
    assert.ok(r.killed, r.out);
    const first = JSON.parse(await fs.readFile(path.join(site, 'compare', 'results', 'behaviour.json'), 'utf8'));
    const kept = Object.keys(first.units);
    assert.equal(kept.length, 1, `one unit written before the kill: ${kept}`);
    r = await run(project, ['behaviour.mjs', 'rs']);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /already measured on this clone \(kept/);
    assert.match(r.out, /1 unit\(s\) kept from an earlier run on this clone; 1 measured now/);
    const both = JSON.parse(await fs.readFile(path.join(site, 'compare', 'results', 'behaviour.json'), 'utf8'));
    assert.equal(Object.keys(both.units).length, 2);
    assert.equal(both.units[kept[0]].identity.endedAt, first.units[kept[0]].identity.endedAt, 'the kept unit was not measured again');

    // calibrate: killed after its first check, then resumed
    r = await run(project, ['calibrate.mjs', 'rs'], { killWhen: /draw 1 layout: done/ });
    assert.ok(r.killed, r.out);
    const progress = JSON.parse(await fs.readFile(path.join(site, 'reference', 'calib', 'progress.json'), 'utf8'));
    assert.deepEqual(progress.done, ['1:layout']);
    await assert.rejects(fs.access(path.join(site, 'reference', 'noise.json')), 'no calibration written from part of the work');
    r = await run(project, ['calibrate.mjs', 'rs']);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /1 already done \(kept from the last run\), \d+ left/);
    assert.doesNotMatch(r.out, /draw 1 layout:/, 'the finished check was not run again');
    const noise = JSON.parse(await fs.readFile(path.join(site, 'reference', 'noise.json'), 'utf8'));
    assert.ok(Object.keys(noise.entries).length > 0);
    assert.ok(noise.reads?.sha1, 'the reads it replayed, by content');
    const log = await fs.readFile(path.join(site, 'reference', 'calib', 'log.txt'), 'utf8');
    assert.match(log, /# draw 2 scroll: exit 0/);

    // a step killed on its limit (behaviour holds the machine's timing lock while it watches): no lock left behind
    r = await run(project, ['score.mjs', 'rs', '--only', 'behaviour', '--fresh', '--step-minutes', '0.15']);
    assert.match(r.out, /behaviour\s+TIMEOUT/);
    assert.match(r.out, /whole output: sites\/rs\/logs\/score-/);
    const holder = await timingLockHolder();
    assert.ok(!holder || holder.alive, `a dead step's lock is gone: ${JSON.stringify(holder)}`);
    const errors = JSON.parse(await fs.readFile(path.join(site, 'compare', 'results', 'behaviour.json'), 'utf8'));
    const unit = Object.values(errors.units).find((u) => u.error);
    if (unit) { assert.equal(unit.errorKind, 'timeout'); assert.match(unit.errorLog, /^logs\/score-/); }
  } finally {
    fixtures?.kill();
  }
});
