// RC6-23: structure mode compares an iframe's presence and box, never its content. elise's start page is a nav and an
// iframe stage; hidden by the mask on both sides, the clone's empty stage scored 100.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const LIB = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'lib.mjs')).href;
const page = (stage) => `<!doctype html><html><body style="margin:0;background:#fff"><nav style="height:40px;background:#222"></nav>${stage}<footer style="height:60px;background:#ddd"></footer></body></html>`;
const frame = (color, style = '') => `<iframe style="display:block;width:600px;height:300px;border:0;${style}" srcdoc="<body style='margin:0;background:${color}'><h1>hero</h1></body>"></iframe>`;

test('structure mode: an iframe is a flat box (its content masked), so a missing or moved frame differs and a different frame content does not', { timeout: 120000 }, async () => {
  const { mask, matchPct, PNG } = await import(LIB);
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const shot = async (html) => {
    const p = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await p.setContent(html, { waitUntil: 'load' });
    await mask(p);
    const png = PNG.sync.read(await p.screenshot({ fullPage: true }));
    await p.close();
    return png;
  };
  try {
    const ref = await shot(page(frame('red')));
    // the same page with the same stage box and no frame in it (elise's clone: an empty stage)
    const empty = await shot(page('<div style="width:600px;height:300px"></div>'));
    const moved = await shot(page(frame('red', 'margin-left:200px')));
    const otherContent = await shot(page(frame('blue')));
    assert.equal(matchPct(ref, await shot(page(frame('red')))).pct, 100, 'the page against itself');
    assert.ok(matchPct(ref, empty).pct < 98, `an empty stage scored ${matchPct(ref, empty).pct}`);
    assert.ok(matchPct(ref, moved).pct < 98, `a moved frame scored ${matchPct(ref, moved).pct}`);
    // the frame's content is masked in structure mode: what is inside is layout-real's (exact) and the review's
    assert.equal(matchPct(ref, otherContent).pct, 100, 'the frame\'s content was compared in structure mode');
  } finally { await browser.close(); }
});
