// RC6-18: at a phone size a nav collapses behind a menu button (aria-expanded="false", no aria-controls): its links keep
// a box clipped to max-height 0 (elise-ux) or are display:none (a drawer). The detector drafts them with the button as
// their opener; operable() opens it, keeps the scenario with the opening click first, and drops what still cannot be
// operated with the reason. The button itself is a menu scenario closed by a second click.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openBrowser, newPage } from '../../scripts/lib.mjs';
import { detectInPage, operable } from '../../scripts/interactions-auto.mjs';

const PAGE = `<!doctype html><style>
body{margin:0;font:16px sans-serif}.nav{display:flex;justify-content:space-between;padding:10px;position:relative;background:#eee}
.toggle{display:none}.links{display:flex;gap:20px}.drawer{display:none}
@media (max-width:640px){.toggle{display:block}.links{position:absolute;top:100%;left:0;right:0;flex-direction:column;max-height:0;overflow:hidden;background:#eee;transition:max-height .3s}
.nav.open .links{max-height:220px}.links a{padding:12px}}
</style><body><header><nav class="nav"><a class="mark" href="/">Home</a>
<button class="toggle" type="button" aria-label="Menu" aria-expanded="false">=</button>
<div class="links"><a href="/Landing%20Page.html#work">Work</a><a href="/about.html">About</a></div></nav></header>
<aside><button class="drawer-btn" aria-expanded="false" style="display:none">More</button><div class="drawer"><a href="/hidden.html">Hidden</a></div></aside>
<main style="height:1600px"><h1>Page</h1></main>
<script>const n=document.querySelector('.nav'),b=n.querySelector('.toggle');b.addEventListener('click',()=>{const o=n.classList.toggle('open');b.setAttribute('aria-expanded',String(o));});</script></body>`;

test('a link hidden behind a collapsed menu at mobile is opened first, not dropped', async () => {
  const server = http.createServer((req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const browser = await openBrowser();
  try {
    const { context, page } = await newPage(browser, { name: 'mobile', width: 390, height: 844 });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const found = await page.evaluate(detectInPage, ['mobile', 'structure', 48, ['/', '/about.html', '/Landing Page.html', '/hidden.html']]);
    const about = found.find((s) => s.name === 'go to /about.html (mobile)');
    assert.ok(about, `no About navigation: ${found.map((s) => s.name).join(', ')}`);
    assert.match(about.opener || '', /toggle/, 'the menu button is the opener hint');
    // a captured route spelled decoded is matched by its canonical form, and named as the capture names it
    assert.ok(found.some((s) => s.name === 'go to /Landing Page.html (mobile)'), found.map((s) => s.name).join(', '));
    assert.ok(!found.some((s) => /hidden\.html/.test(s.name)), 'a link behind no visible opener is not drafted');
    const menu = found.find((s) => /^menu Menu/.test(s.name));
    assert.ok(menu, 'the menu button is a scenario of its own');
    assert.deepEqual(menu.steps[3], { click: menu.steps[0].click }, 'a toggle without aria-controls is closed by a second click');

    const { kept, dropped } = await operable(page, found);
    const k = kept.find((s) => s.name === 'go to /about.html (mobile)');
    assert.ok(k, `About was dropped: ${JSON.stringify(dropped)}`);
    assert.match(k.steps[0].click.ref, /toggle/, 'the opening click comes first');
    assert.ok(k.steps[1].wait > 0);
    assert.match(k.steps[2].click.ref, /^a/, 'then the link');
    assert.ok(!('opener' in k) && !('alts' in k), 'hints are not part of the scenario');
    // the menu was closed again after the trial
    assert.equal(await page.getAttribute('.toggle', 'aria-expanded'), 'false');
    // the scenario replays: open, then the link is clickable for real
    await page.click(k.steps[0].click.ref);
    await page.waitForTimeout(k.steps[1].wait);
    const [s, i] = k.steps[2].click.ref.split('@');
    await page.locator(s).nth(Number(i || 0)).click({ trial: true, timeout: 2000 });
    await context.close();

    // at desktop the links are visible and the button is not: no opener step
    const d = await newPage(browser, { name: 'desktop', width: 1440, height: 900 });
    await d.page.goto(`http://127.0.0.1:${server.address().port}/`);
    const dk = (await operable(d.page, await d.page.evaluate(detectInPage, ['desktop', 'structure', 48, ['/', '/about.html']]))).kept.find((x) => x.name === 'go to /about.html (desktop)');
    assert.ok(dk && !/toggle/.test(dk.steps[0].click.ref), JSON.stringify(dk));
    await d.context.close();
  } finally { await browser.close(); server.close(); }
});
