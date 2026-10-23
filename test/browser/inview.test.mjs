// RC6-02 (astro): in template mode every text of the clone is the seed's placeholder by design, and review flagged each
// one "clone-only" (the first a skip link clipped to nothing), so no template site could be verified. In a real browser:
//   - text a visitor cannot see (clipped, sr-only, inside such an element) is not in view
//   - the placeholder text the seed wrote (its own record, .seed-base.html) is not clone-only; text the clone adds is
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { inViewInPage, seedTextOf, cloneOnlyText } from '../../scripts/inview.mjs';

const PAGE = `<!doctype html><html><head><style>
.skip{position:fixed;top:12px;left:12px;clip:rect(0,0,0,0)}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
</style></head><body>
<a class="skip" href="#main">Sine tu quando aliquam</a>
<span class="sr"><span>Candidus quam frustra</span></span>
<h1 id="main">Placeholder heading text here</h1>
<p>Lorem placeholder paragraph text for the page</p>
<p id="added">Loading your personal results now</p>
</body></html>`;

test('RC6-02: clipped and sr-only text is not in view; seed placeholder text is not clone-only; added text is', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.setContent(PAGE);
    const seen = await page.evaluate(inViewInPage);
    assert.ok(!seen.texts.some((t) => /sine tu quando/.test(t)), JSON.stringify(seen.texts));
    assert.ok(!seen.texts.some((t) => /candidus quam/.test(t)), JSON.stringify(seen.texts));
    assert.ok(!seen.fixed.some((f) => /^a/.test(f.label)), 'a clipped fixed link is no fixed box in view');
    assert.ok(seen.texts.includes('placeholder heading text here'));
    // a template clone: the seed wrote the placeholders (not the "loading" line, which the clone's script added)
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tc-inview-'));
    await fs.mkdir(path.join(dir, 'clone'), { recursive: true });
    await fs.writeFile(path.join(dir, 'clone', '.seed-base.html'), PAGE.replace(/<p id="added">[^<]*<\/p>/, ''));
    const seedText = await seedTextOf(dir, { mode: 'template' });
    const refPage = 'skip to content getting started welcome to the docs';
    assert.equal(cloneOnlyText(seen.texts, [refPage, refPage], seedText), 'loading your personal results now');
    // without the seed's record (exact mode), every text the reference does not show is clone-only, as before
    assert.equal(cloneOnlyText(seen.texts, [refPage], await seedTextOf(dir, { mode: 'exact' })), 'placeholder heading text here');
  } finally { await browser.close(); }
});
