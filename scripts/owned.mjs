// Which regions of the clone does script.js own? The seed carries the original's markup in its post-script state; a
// script that rebuilds a region at boot (a hero grid, a card layout it places, a slider it wraps) replaces that
// markup. This loads the clone twice, with its scripts blocked and with them running, and lists the top-level sections
// whose structure the scripts changed: those are the agent's, and the seed's recorded players must not run there
// (hand them over, see SKILL.md). Runs again after each build round.
// usage: node scripts/owned.mjs <name> [--viewport desktop]
import fs from 'node:fs/promises';
import path from 'node:path';
import { VIEWPORTS, parseArgs, openBrowser, newPage, serve, settle, sectionsOf } from './lib.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) {
  console.error('usage: trueclone owned <name> [--viewport desktop]');
  process.exit(1);
}
const root = path.resolve('sites', name);
const vp = VIEWPORTS.find((v) => v.name === (flags.viewport || 'desktop'));
const server = await serve(path.join(root, 'clone'));
const browser = await openBrowser(flags.cdp);

// a structural signature per top-level section: element count, tag sequence hash, inline-style count
const signatures = () => {
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };
  const unwrap = (el) => { let n = el; while (n.children.length === 1 && !n.matches('header,footer,main,section,nav,article,aside')) n = n.children[0]; return n; };
  const tops = [...unwrap(document.body).children].filter((el) => !['SCRIPT', 'STYLE', 'TEMPLATE', 'LINK', 'NOSCRIPT'].includes(el.tagName));
  return tops.map((el) => {
    const r = el.getBoundingClientRect();
    const all = el.getElementsByTagName('*');
    return { label: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.classList.length ? `.${[...el.classList].slice(0, 2).join('.')}` : ''}`, y: Math.round(r.top + scrollY), elements: all.length, tags: hash([...all].map((e) => e.tagName).join(',')), styled: [...all].filter((e) => e.hasAttribute('style')).length, shadow: [...all].some((e) => e.shadowRoot) };
  });
};
let before, after;
try {
  const url = `${server.url}index.html`;
  const a = await newPage(browser, vp);
  await a.page.route(/\.m?js(\?|$)/, (r) => r.abort());
  await a.page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await a.page.waitForTimeout(500);
  before = await a.page.evaluate(signatures);
  await a.context.close();
  const b = await newPage(browser, vp, { reducedMotion: 'no-preference' });
  await b.page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await settle(b.page);
  after = await b.page.evaluate(signatures);
  await b.context.close();
} finally {
  if (!flags.cdp) await browser.close();
  server.close();
}
const rows = before.map((s, i) => {
  const t = after[i] || {};
  const changed = !t.label ? 'removed' : t.elements !== s.elements || t.tags !== s.tags ? `rebuilt (${s.elements} → ${t.elements} elements)` : t.styled !== s.styled ? `restyled (${s.styled} → ${t.styled} inline styles)` : null;
  return { section: s.label, y: s.y, before: s.elements, after: t.elements ?? null, changed };
});
for (const t of after.slice(before.length)) rows.push({ section: t.label, y: t.y, before: 0, after: t.elements, changed: 'added by a script' });
await fs.mkdir(path.join(root, 'compare'), { recursive: true });
await fs.writeFile(path.join(root, 'compare', 'owned.json'), JSON.stringify({ at: new Date().toISOString(), viewport: vp.name, rows }, null, 2));
// structure changed: the script owns the section; only inline styles changed: it animates inside the seed's markup
const owned = rows.filter((r) => r.changed && !r.changed.startsWith('restyled'));
const animated = rows.filter((r) => r.changed?.startsWith('restyled'));
console.log(owned.length ? `script.js rebuilds ${owned.length} section(s) at ${vp.name}:` : `script.js rebuilds no section at ${vp.name}: the seed's markup and players stand as they are`);
for (const r of owned) console.log(`  ${r.section} (y ${r.y}): ${r.changed}`);
if (owned.length) console.log('hand these over to script.js (remove the data-tc-* marks there) and hide them until boot if the original hides them too (seed --hide-until-boot).');
if (animated.length) console.log(`animated inside the seed's markup (inline styles only): ${animated.map((r) => r.section).join(', ')}`);
console.log(`-> ${path.relative(process.cwd(), path.join(root, 'compare', 'owned.json'))}`);
