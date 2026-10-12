// Record the discrete states of a page's widgets (tabs, menus, accordions) so the clone can replay them. Many
// component libraries render only the active panel, so the other tabs' content and closed menus' content aren't in
// the captured page at all; the only faithful source is the original after each click.
//
// For every control (role="tab", or a button with aria-expanded) the reference page is clicked, and the region the
// control changes is snapshotted: the smallest element containing both the control and the panel it points at
// (aria-controls), falling back to its section. Controls are marked data-tc-trigger and regions data-tc-scope
// before clicking, so the snapshots carry the marks and `trueclone seed` can wire the clone: a click on a trigger
// swaps its region to the recorded state. Markup only, never the site's scripts; template mode gets placeholders.
//
// Not covered yet: popovers rendered in a portal at the end of <body> (comboboxes, tooltips); they are listed.
//
// usage: node scripts/widgets.mjs <name> [--viewport desktop]   -> sites/<name>/reference/widgets.<vp>.json
import fs from 'node:fs/promises';
import path from 'node:path';
import { VIEWPORTS, parseArgs, openBrowser, newPage, waitStill } from './lib.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) {
  console.error('usage: trueclone widgets <name> [--viewport desktop]');
  process.exit(1);
}
const root = path.resolve('sites', name);
const meta = JSON.parse(await fs.readFile(path.join(root, 'reference', 'meta.json'), 'utf8'));
const vp = VIEWPORTS.find((v) => v.name === (flags.viewport || 'desktop'));

// Marks every control and its region; returns the groups (a tablist, or a single expandable button).
function markInPage() {
  const SKIP = new Set(['SCRIPT', 'NOSCRIPT', 'TEMPLATE', 'STYLE', 'LINK', 'META']);
  const pathOf = (el) => {
    const parts = [];
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const sibs = [...n.parentElement.children].filter((c) => !SKIP.has(c.tagName));
      parts.unshift(`${n.tagName.toLowerCase()}:${sibs.indexOf(n) + 1}`);
    }
    return parts.join('>');
  };
  const lca = (a, b) => { for (let n = a; n; n = n.parentElement) if (n.contains(b)) return n; return null; };
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
  const groups = [];
  const portals = [];
  // tabs, grouped by their tablist
  const lists = new Set([...document.querySelectorAll('[role="tab"]')].filter(visible).map((t) => t.closest('[role="tablist"]') || t.parentElement));
  for (const list of lists) {
    const tabs = [...list.querySelectorAll('[role="tab"]')].filter(visible);
    if (tabs.length < 2) continue;
    const selected = tabs.find((t) => t.getAttribute('aria-selected') === 'true') || tabs[0];
    const panel = selected.getAttribute('aria-controls') && document.getElementById(selected.getAttribute('aria-controls'));
    let scope = panel ? lca(list, panel) : list.closest('section, header, footer, main > div') || list.parentElement;
    if (!scope || scope === document.body) scope = list.closest('section, header, footer') || list.parentElement;
    groups.push({ kind: 'tabs', scope, triggers: tabs, initial: tabs.indexOf(selected) });
  }
  // expandable buttons (menus, accordions, disclosures), not inside a tablist
  for (const btn of [...document.querySelectorAll('button[aria-expanded], [role="button"][aria-expanded]')].filter(visible)) {
    if (btn.closest('[role="tablist"]')) continue;
    const popup = btn.getAttribute('aria-haspopup');
    if (btn.getAttribute('role') === 'combobox' || popup === 'listbox' || popup === 'dialog') { portals.push(btn); continue; }
    const scope = btn.closest('header, nav, section, footer, li') || btn.parentElement;
    groups.push({ kind: 'expand', scope, triggers: [btn], initial: btn.getAttribute('aria-expanded') === 'true' ? 0 : -1 });
  }
  // an element can be the region of several widgets (all the menus of one nav): marks are space-separated lists
  const addMark = (el, v) => { const cur = (el.getAttribute('data-tc-scope') || '').split(' ').filter(Boolean); if (!cur.includes(v)) cur.push(v); el.setAttribute('data-tc-scope', cur.join(' ')); };
  groups.forEach((g, i) => {
    addMark(g.scope, String(i));
    g.triggers.forEach((t, j) => t.setAttribute('data-tc-trigger', `${i}:${j}`));
  });
  window.__tcGroups = groups;
  return {
    groups: groups.map((g, i) => ({ i, kind: g.kind, scopePath: pathOf(g.scope), triggers: g.triggers.map((t) => ({ path: pathOf(t), label: (t.getAttribute('aria-label') || t.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40) })), initial: g.initial })),
    portals: portals.map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 40)),
  };
}

// Frameworks re-render a region when its state changes, which drops the marks on anything inside it (a tab set
// nested in another tab's panel). Marks are re-applied by path before every click and every snapshot.
function remarkInPage(groups) {
  const SKIP = new Set(['SCRIPT', 'NOSCRIPT', 'TEMPLATE', 'STYLE', 'LINK', 'META']);
  const resolve = (p) => {
    let el = document.body;
    for (const part of p.split('>')) {
      const [tag, n] = part.split(':');
      el = [...el.children].filter((c) => !SKIP.has(c.tagName))[Number(n) - 1];
      if (!el || el.tagName.toLowerCase() !== tag) return null;
    }
    return el;
  };
  for (const g of groups) {
    const scope = resolve(g.scopePath);
    if (scope) { const cur = (scope.getAttribute('data-tc-scope') || '').split(' ').filter(Boolean); if (!cur.includes(String(g.i))) cur.push(String(g.i)); scope.setAttribute('data-tc-scope', cur.join(' ')); }
    g.triggers.forEach((t, j) => resolve(t.path)?.setAttribute('data-tc-trigger', `${g.i}:${j}`));
  }
}

// Menus often render their panel outside the trigger's own container (a shared viewport after the list): once open,
// the region becomes the smallest element holding both the trigger and the panel it controls.
function widenScopeInPage([i, sel]) {
  const SKIP = new Set(['SCRIPT', 'NOSCRIPT', 'TEMPLATE', 'STYLE', 'LINK', 'META']);
  const pathOf = (el) => {
    const parts = [];
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const sibs = [...n.parentElement.children].filter((c) => !SKIP.has(c.tagName));
      parts.unshift(`${n.tagName.toLowerCase()}:${sibs.indexOf(n) + 1}`);
    }
    return parts.join('>');
  };
  const btn = document.querySelector(sel);
  const panel = btn?.getAttribute('aria-controls') && document.getElementById(btn.getAttribute('aria-controls'));
  if (!btn || !panel) return null;
  let scope = btn;
  while (scope && !scope.contains(panel)) scope = scope.parentElement;
  if (!scope || scope === document.body) return null;
  for (const old of document.querySelectorAll(`[data-tc-scope~="${i}"]`)) {
    const rest = old.getAttribute('data-tc-scope').split(' ').filter((v) => v !== String(i));
    if (rest.length) old.setAttribute('data-tc-scope', rest.join(' ')); else old.removeAttribute('data-tc-scope');
  }
  const cur = (scope.getAttribute('data-tc-scope') || '').split(' ').filter(Boolean);
  cur.push(String(i));
  scope.setAttribute('data-tc-scope', cur.join(' '));
  return pathOf(scope);
}

const browser = await openBrowser(flags.cdp);
let result;
try {
  const { page } = await newPage(browser, vp, { reducedMotion: 'reduce' });
  await page.goto(meta.url, { waitUntil: 'load', timeout: 60000 });
  await waitStill(page, { timeout: 15000, interval: 200 });
  const found = await page.evaluate(markInPage);
  console.log(`${found.groups.length} widget group(s): ${found.groups.filter((g) => g.kind === 'tabs').length} tab sets, ${found.groups.filter((g) => g.kind === 'expand').length} expandable${found.portals.length ? `; not recorded (portal popovers): ${found.portals.join(', ')}` : ''}`);
  for (const g of found.groups) {
    g.states = [];
    const snapshot = async () => { await page.evaluate(remarkInPage, found.groups); return page.evaluate((i) => document.querySelector(`[data-tc-scope~="${i}"]`)?.innerHTML ?? null, g.i); };
    for (let j = 0; j < g.triggers.length; j++) {
      await page.evaluate(remarkInPage, found.groups);
      const handle = await page.$(`[data-tc-trigger="${g.i}:${j}"]`);
      if (!handle) { g.states.push(null); continue; }
      await handle.scrollIntoViewIfNeeded().catch(() => {});
      await handle.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(350);
      await waitStill(page, { timeout: 2500 });
      if (g.kind === 'expand') {
        const wider = await page.evaluate(widenScopeInPage, [g.i, `[data-tc-trigger="${g.i}:${j}"]`]);
        if (wider) g.scopePath = wider;
      }
      g.states.push(await snapshot());
      if (g.kind === 'expand') { // the closed state, so the clone can close it again
        await page.evaluate(remarkInPage, found.groups);
        await page.click(`[data-tc-trigger="${g.i}:${j}"]`, { timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(350);
        g.closed = await snapshot();
      }
    }
    // back to the initial state before the next group (tabs: click the initially selected one)
    if (g.kind === 'tabs' && g.initial >= 0) {
      await page.evaluate(remarkInPage, found.groups);
      await page.click(`[data-tc-trigger="${g.i}:${g.initial}"]`, { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(350);
    }
    const changed = new Set(g.states.filter(Boolean)).size;
    console.log(`  ${g.kind.padEnd(6)} ${g.triggers.map((t) => t.label).slice(0, 6).join(' | ')}${g.triggers.length > 6 ? ' ...' : ''}: ${changed} distinct state(s)`);
  }
  result = found;
} finally {
  if (!flags.cdp) await browser.close();
}
const out = path.join(root, 'reference', `widgets.${vp.name}.json`);
await fs.writeFile(out, JSON.stringify({ url: meta.url, viewport: vp, at: new Date().toISOString(), ...result }, null, 2));
console.log(`-> ${path.relative(process.cwd(), out)}`);
