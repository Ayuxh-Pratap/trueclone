// D1: a faithful clone follows the same observable rules of change, and a clone that stops, reverses or speeds up a
// loop, never advances a carousel, or fixes a shuffled order fails, while stills (same seed, loops held) can match.
// Real browser: the doc-site fixture as reference, served twice, and one broken clone per rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openBrowser, serve, VIEWPORTS } from '../../scripts/lib.mjs';
import { readSide, compare, compareReduced } from '../../scripts/behaviour.mjs';
import { FIXTURE, variantDir } from '../helpers/doc-variants.mjs';

const desktop = VIEWPORTS.find((v) => v.name === 'desktop');

test('behaviour: the faithful copy passes and each broken rule fails with its reason', { timeout: 600000 }, async () => {
  const browser = await openBrowser();
  const ref = await serve(FIXTURE);
  const servers = [ref];
  try {
    const refSide = await readSide(browser, ref.url, desktop);
    // what the fixture does: a marquee moving left, a carousel stepping every 3 s, a shuffle at startup
    assert.ok(refSide.items.some((i) => i.kind === 'move' && i.axis === 'x' && i.v < 0), JSON.stringify(refSide.items));
    const cyc = refSide.items.find((i) => i.kind === 'cycle');
    assert.ok(cyc && Math.abs(cyc.interval - 3000) < 300, JSON.stringify(refSide.items));
    assert.equal(refSide.random, true);

    const expect = {
      faithful: null,
      'marquee-stopped': /does not move/,
      'marquee-reversed': /rightwards: the reference moves leftwards/,
      'marquee-2x': /moves at (1\.9|2\.0)\d*x the reference's speed/,
      'carousel-still': /does not change on its own/,
      'carousel-slow': /every 4\.\d s: the reference every (2\.9|3\.\d) s/,
      'order-fixed': /same order every time/,
    };
    for (const [name, want] of Object.entries(expect)) {
      const s = await serve(await variantDir(name));
      servers.push(s);
      const members = compare(refSide, await readSide(browser, s.url, desktop));
      const failing = members.filter((m) => m.value !== 100);
      if (!want) assert.deepEqual(failing, [], `${name}: ${JSON.stringify(failing)}`);
      else assert.ok(failing.some((m) => want.test(m.reason)), `${name}: ${JSON.stringify(members)}`);
    }
  } finally {
    for (const s of servers) s.close();
    await browser.close();
  }
});

test('D2: under prefers-reduced-motion the site stops its marquee; a clone that keeps it running fails, a faithful one passes', { timeout: 600000 }, async () => {
  const browser = await openBrowser();
  const ref = await serve(FIXTURE);
  const servers = [ref];
  try {
    const refSide = await readSide(browser, ref.url, desktop, { reduce: true });
    assert.ok(!refSide.items.some((i) => i.kind === 'move'), `the reference still moves under reduce: ${JSON.stringify(refSide.items)}`);
    const faithful = await serve(await variantDir('faithful'));
    const ignored = await serve(await variantDir('reduce-ignored'));
    servers.push(faithful, ignored);
    assert.deepEqual(compareReduced(refSide, await readSide(browser, faithful.url, desktop, { reduce: true })).filter((m) => m.value !== 100), []);
    const bad = compareReduced(refSide, await readSide(browser, ignored.url, desktop, { reduce: true })).filter((m) => m.value !== 100);
    assert.ok(bad.some((m) => /^reduce:extra@/.test(m.id) && /with prefers-reduced-motion: reduce, moves leftwards/.test(m.reason)), JSON.stringify(bad));
  } finally {
    for (const s of servers) s.close();
    await browser.close();
  }
});
