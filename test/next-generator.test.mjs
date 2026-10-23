// The Next.js generator (scripts/next.mjs) on a seeded clone (tools/fixtures/next-gen), without installing Next:
//   - RC4 VAR-11c: line breaks in text survive, because a stylesheet rule the generator cannot see (white-space:
//     pre-line) shows them; a no-break space stays one (it is text, not white space)
//   - RC4 ALLBIRDS-12: an inline style with !important keeps its priority and type-checks (no TS2352 on `as CSSProperties`)
//   - rc.7: the app's next.config turns Next's agent upgrade reminder off (a build that fails every second run under a
//     coding agent is no verification)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = path.join(REPO, 'tools', 'fixtures', 'next-gen');

async function generate() {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'tc-nextgen-'));
  const site = path.join(project, 'sites', 'gen');
  await fs.cp(FIXTURE, site, { recursive: true });
  const r = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'next.mjs'), 'gen'], { cwd: project, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const read = (rel) => fs.readFile(path.join(site, 'next', rel), 'utf8');
  return { project, read };
}

test('text keeps its line breaks and no-break spaces; !important styles type-check; no upgrade reminder', async () => {
  const { project, read } = await generate();
  try {
    const legal = await read('components/site/Legal.tsx');
    // each line break of the paragraph is in the emitted string (pre-line shows them as lines; elsewhere they render as
    // the one space they were in the HTML)
    assert.ok(legal.includes(JSON.stringify('Holder: Varsity Capital\nRegistered office: 24 rue de Caumartin, 75009 Paris\nEmail: gdpr@varsity.vc')), legal);
    // a run of spaces and line breaks keeps its line breaks, all of them; the no-break space is not collapsed to a space
    assert.ok(legal.includes(JSON.stringify('Two\n\nbreaks, then 10\u00a0km')), legal);
    // the line break before a sibling element is kept as one too, between <em> and <strong>
    assert.match(legal, /<\/em>\s*\{"\\n"\}\s*<strong>/, legal);
    // no text in the component loses a line break into a plain space
    assert.ok(!legal.includes('Varsity Capital Registered'), legal);

    const pixels = await read('components/site/Pixels.tsx');
    // the priority stays in the value (the server renders it as written), and the value is a plain string, which is
    // comparable to React's typed values: `{ position: "fixed !important" } as CSSProperties` was TS2352
    assert.ok(pixels.includes('"position":"fixed !important" as string'), pixels);
    assert.ok(pixels.includes('"visibility":"hidden !important" as string'), pixels);
    assert.ok(pixels.includes('"--i":"2 !important" as string'), pixels);
    // values without a priority are written exactly as before
    assert.ok(pixels.includes('"zIndex":"3","color":"red"'), pixels);
    assert.ok(!/"zIndex":"3" as string/.test(pixels), pixels);
    assert.match(pixels, /^import type \{ CSSProperties \} from 'react';$/m);

    const third = await read('components/site/Third.tsx');
    assert.match(third, /<p>Plain text, one line\.<\/p>/, 'plain text stays plain JSX');

    const config = await read('next.config.mjs');
    assert.match(config, /experimental: \{ agentUpgrade: false \}/, config);
  } finally { await fs.rm(project, { recursive: true, force: true }); }
});
