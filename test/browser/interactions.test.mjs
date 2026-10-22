// Auto-detected scenarios (interactions-auto.mjs) on a real page: a tab list inside a closed <details> gets an "open it"
// step first (RC4 astro, ASTRO-3); a link covered by another element is dropped with its reason (RC4 heybhaskar,
// BHASKAR-5); navigation is filtered to the captured routes before its cap (ASTRO-6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openBrowser, newPage } from '../../scripts/lib.mjs';
import { detectInPage, operable } from '../../scripts/interactions-auto.mjs';

// the closed disclosure's content keeps a box (as on RC4 astro's mobile table of contents)
const PAGE = `<!doctype html><style>details::details-content{content-visibility:visible}</style><body style="margin:0">
<nav>${Array.from({ length: 60 }, (_, i) => `<a href="/doc-${i}">doc ${i}</a> `).join('')}<a href="/captured">captured</a></nav>
<details id="toc"><summary>On this page</summary><div role="tablist"><button role="tab">One</button><button role="tab">Two</button><button role="tab">Three</button></div></details>
<div style="position:relative;height:60px"><a class="cta" href="/covered" style="position:absolute;left:0;top:0">covered link</a><div style="position:absolute;inset:0;background:#fff"></div></div>
<main style="height:2000px"></main></body>`;

test('closed disclosures are opened first, covered elements dropped, navigation filtered before the cap', async () => {
  const server = http.createServer((req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const browser = await openBrowser();
  try {
    const { context, page } = await newPage(browser, { name: 'mobile', width: 390, height: 844 });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const found = await page.evaluate(detectInPage, ['mobile', 'structure', 48, ['/', '/captured', '/covered']]);
    const tabs = found.find((s) => /^tabs/.test(s.name));
    assert.ok(tabs, `no tab scenario: ${found.map((s) => s.name).join(', ')}`);
    assert.match(tabs.steps[0].click.ref, /summary/, 'the disclosure is opened before the tabs are clicked');
    const navs = found.filter((s) => s.navigation).map((s) => s.name);
    assert.ok(navs.some((n) => n.includes('/captured')), `captured route not drafted: ${navs.join(', ')}`);
    assert.ok(!navs.some((n) => /doc-/.test(n)), 'an uncaptured route was drafted');
    const { kept, dropped } = await operable(page, found);
    assert.ok(dropped.some((d) => d.name.includes('/covered')), `the covered link was kept: ${JSON.stringify(dropped)}`);
    assert.ok(kept.some((s) => /^tabs/.test(s.name)), 'the tab scenario (opening its disclosure first) is operable');
    await context.close();
  } finally { await browser.close(); server.close(); }
});
