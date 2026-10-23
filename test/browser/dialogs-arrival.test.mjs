// Auto scenarios for dialogs and disclosures (RC4 ALLBIRDS-5), and a page that has just arrived shot after it settles
// under the page clock (RC4 VAR-11d), on tools/fixtures/dialogs-site:
//   - every dialog opener is found (aria-haspopup="dialog", aria-controls naming a role="dialog", a data attribute
//     naming a <dialog>), in the header too and never as a menu; one scenario for a dozen identical "quick add" buttons
//   - disclosures outside the header without aria-controls (or open at first) are clicked, then clicked again
//   - each scenario closes what it opened on the reference (operable() tries it): Escape, or the dialog's own close
//     control when Escape does nothing; a dialog nothing closes, and a disclosure a second click does not close, are
//     dropped with the reason
//   - interact.mjs replays them on reference and clone: each passes, and each ends on the page it started from
//   - the arrival on a page with a 3.75 s intro is shot after the intro (it was shot at 1500 ms, mid-way)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openBrowser, newPage, serve, matchPct, PNG } from '../../scripts/lib.mjs';
import { detectInPage, operable } from '../../scripts/interactions-auto.mjs';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE = path.join(REPO, 'tools', 'fixtures', 'dialogs-site');
const DESKTOP = { name: 'desktop', width: 1440, height: 900 };

test('dialogs and disclosures are found, closed again, and replayed; an arrival is shot once settled', async () => {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'tc-dialogs-'));
  const site = path.join(project, 'sites', 'dlg');
  await fs.cp(FIXTURE, path.join(site, 'reference-host'), { recursive: true });
  const host = await serve(path.join(site, 'reference-host'));
  try { await scenarios(project, site, host); } finally { host.close(); await fs.rm(project, { recursive: true, force: true }); }
});

async function scenarios(project, site, host) {
  const browser = await openBrowser();
  let kept;
  try {
    const { context, page } = await newPage(browser, DESKTOP);
    await page.goto(host.url, { waitUntil: 'load' });
    const found = await page.evaluate(detectInPage, ['desktop', 'visual', 40, ['/', '/intro.html']]);
    const names = found.map((s) => s.name);
    for (const n of ['dialog Size guide (desktop)', 'dialog Quick add (desktop)', 'dialog Refund policy (desktop)', 'dialog Notice (desktop)', 'collapse Details (desktop)', 'expand Care (desktop)', 'expand Reviews (desktop)', 'menu Menu (desktop)', 'go to /intro.html (desktop)']) {
      assert.ok(names.includes(n), `${n} not found: ${names.join(', ')}`);
    }
    assert.equal(names.filter((n) => /Quick add/.test(n)).length, 1, 'three identical openers are one behaviour');
    assert.ok(!names.some((n) => /^menu Size guide/.test(n)), 'a dialog opener in the header is no menu');
    const refund = found.find((s) => s.name === 'dialog Refund policy (desktop)');
    assert.equal(refund.expectChange.ref, '#modal-refund', 'the change expected is the dialog it names');
    assert.match(refund.dialog.closer, /modal-close/, 'its close control is known');

    ({ kept } = await (async () => {
      const r = await operable(page, found);
      const dropped = Object.fromEntries(r.dropped.map((d) => [d.name, d.why]));
      assert.match(dropped['dialog Notice (desktop)'] || '', /neither Escape nor a close control/, JSON.stringify(r.dropped));
      assert.match(dropped['expand Reviews (desktop)'] || '', /second click/, JSON.stringify(r.dropped));
      return r;
    })());
    const k = Object.fromEntries(kept.map((s) => [s.name, s]));
    // Escape does nothing to the refund policy: its close button is the closing step, on both sides
    assert.deepEqual(k['dialog Refund policy (desktop)'].steps[3], { click: { ref: 'button.modal-close', clone: 'button.modal-close' } });
    // a native modal dialog closes on Escape: kept as written
    assert.deepEqual(k['dialog Size guide (desktop)'].steps[3], { key: 'Escape' });
    assert.deepEqual(k['collapse Details (desktop)'].steps[3], k['collapse Details (desktop)'].steps[0], 'closed by a second click');
    assert.ok(kept.every((s) => !('dialog' in s) && !('toggle' in s)), 'hints are not part of a scenario');
    // the trials left the page as they found it
    assert.deepEqual(await page.evaluate(() => [document.querySelectorAll('dialog[open], .modal.open').length, document.querySelector('.acc').getAttribute('aria-expanded')]), [0, 'true']);
    // a control that names no dialog expects a change of the dialog it opened (it does not change itself)
    assert.equal(k['dialog Quick add (desktop)'].expectChange.ref, '#qa');
    await context.close();
  } finally { await browser.close(); }

  // interact.mjs on reference (the host) and clone (the same files, served by the clone's server): the dialogs, the
  // disclosures and the navigation
  {
    await fs.cp(FIXTURE, path.join(site, 'clone'), { recursive: true });
    await fs.mkdir(path.join(site, 'reference'), { recursive: true });
    await fs.writeFile(path.join(site, 'reference', 'meta.json'), JSON.stringify({ url: host.url, name: 'dlg', mode: 'template', routes: [{ path: '/', slug: '' }, { path: '/intro.html', slug: 'intro_html' }] }));
    const chosen = kept.filter((s) => /^(dialog (Size guide|Quick add|Refund policy)|collapse Details|expand Care|go to \/intro\.html)/.test(s.name));
    assert.equal(chosen.length, 6, chosen.map((s) => s.name).join(', '));
    await fs.writeFile(path.join(site, 'reference', 'interactions.auto.json'), JSON.stringify(chosen, null, 2));
    // asynchronously: the reference host is served from this process
    const r = await new Promise((resolve) => {
      const c = spawn(process.execPath, [path.join(REPO, 'scripts', 'interact.mjs'), 'dlg'], { cwd: project });
      let out = '';
      c.stdout.on('data', (d) => { out += d; });
      c.stderr.on('data', (d) => { out += d; });
      c.on('close', (status) => resolve({ status, out }));
    });
    assert.equal(r.status, 0, r.out);
    const report = JSON.parse(await fs.readFile(path.join(site, 'compare', 'interact', 'report.json'), 'utf8'));
    const png = async (f) => PNG.sync.read(await fs.readFile(f));
    for (const s of report.scenarios) {
      assert.ok(s.expect.pass, `${s.name}: ${JSON.stringify(s)}`);
      if (/^go to/.test(s.name)) continue;
      // it ends where it started: the last shot is the first one again, on the reference and on the clone
      const dir = path.join(site, 'compare', 'interact');
      const stem = s.name.replace(/[^a-z0-9]+/gi, '-');
      const last = Object.keys(s.shots).at(-1);
      for (const side of ['ref', 'clone']) {
        const pct = matchPct(await png(path.join(dir, `${stem}.before.${side}.png`)), await png(path.join(dir, `${stem}.${last}.${side}.png`))).pct;
        assert.ok(pct >= 99.5, `${s.name} (${side}) ends at ${pct}% of where it started`);
      }
    }
    // the arrival: the intro (red, 3.75 s of page time) is gone on both sides when the page is shot
    const nav = report.scenarios.find((s) => /^go to/.test(s.name));
    for (const side of ['ref', 'clone']) {
      const shot = await png(path.join(site, 'compare', 'interact', `go-to-intro-html-desktop-.arrived.${side}.png`));
      const i = (Math.floor(shot.height * 0.8) * shot.width + Math.floor(shot.width * 0.1)) * 4; // clear of the intro's words
      assert.ok(!(shot.data[i] > 180 && shot.data[i + 1] < 60 && shot.data[i + 2] < 60), `${side}: the arrival was shot during the intro (${nav.shots.arrived})`);
    }
  }
}
