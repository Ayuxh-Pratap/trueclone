// Measure the live page's layout as a build spec: per section, an element tree with page-relative
// boxes and the computed styles that matter. Text is recorded as length only, never content.
// usage: node scripts/spec.mjs <name> [--depth 6] [--hide "<selectors>"] [--cdp] [--clone [url]]
// --clone measures the rebuild instead (default: sites/<name>/clone/index.html) into compare/<vp>.clone.spec.json
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { VIEWPORTS, parseArgs, openBrowser, newPage, settle } from './lib.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) {
  console.error('usage: npm run spec -- <name> [--depth 6]');
  process.exit(1);
}
const ref = path.resolve('sites', name, 'reference');
const meta = JSON.parse(await fs.readFile(path.join(ref, 'meta.json'), 'utf8'));
const depth = Number(flags.depth || 6);
const clone = flags.clone ? (typeof flags.clone === 'string' ? flags.clone : pathToFileURL(path.resolve('sites', name, 'clone', 'index.html')).href) : null;
const hide = clone ? [] : typeof flags.hide === 'string' ? flags.hide.split(',') : meta.hide || [];
const outDir = clone ? path.resolve('sites', name, 'compare') : ref;
await fs.mkdir(outDir, { recursive: true });

function specInPage(maxDepth) {
  const KEEP = ['display', 'position', 'top', 'right', 'bottom', 'left', 'z-index', 'overflow', 'flex-direction', 'justify-content',
    'align-items', 'flex-wrap', 'gap', 'grid-template-columns', 'grid-template-rows', 'padding', 'margin', 'width', 'height',
    'max-width', 'min-height', 'font-family', 'font-size', 'line-height', 'font-weight', 'letter-spacing', 'text-transform',
    'text-align', 'color', 'background-color', 'background-image', 'border', 'border-bottom', 'border-left', 'border-radius',
    'opacity', 'transform', 'object-fit', 'mix-blend-mode', 'filter'];
  const DEFAULTS = new Set(['static', 'auto', 'visible', 'normal', 'none', '0px', 'nowrap', 'row', 'stretch', 'start',
    'rgba(0, 0, 0, 0)', '1', 'fill', '0px none rgb(0, 0, 0)', 'flex-start', 'border-box']);
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && !['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName);
  };
  const walk = (el, d) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    const style = {};
    for (const k of KEEP) {
      const v = s.getPropertyValue(k);
      if (v && !DEFAULTS.has(v)) style[k] = v.length > 160 ? v.slice(0, 160) + '…' : v;
    }
    const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
    const node = {
      tag: el.tagName.toLowerCase(),
      cls: [...el.classList].slice(0, 3).join(' ') || undefined,
      box: [Math.round(r.left), Math.round(r.top + scrollY), Math.round(r.width), Math.round(r.height)],
      textLen: text.length || undefined,
      style,
    };
    if (el.tagName === 'IMG') node.img = { natural: [el.naturalWidth, el.naturalHeight] };
    if (el.tagName === 'VIDEO') node.video = true;
    const kids = [...el.children].filter(visible);
    if (d < maxDepth && kids.length) node.children = kids.slice(0, 40).map((k) => walk(k, d + 1));
    else if (kids.length) node.more = kids.length;
    return node;
  };
  let root = document.body;
  for (let kids = [...root.children].filter(visible); kids.length === 1; kids = [...root.children].filter(visible)) root = kids[0];
  return [...root.children].filter(visible).map((el) => walk(el, 0));
}

const browser = await openBrowser(flags.cdp);
try {
  for (const vp of VIEWPORTS) {
    const { context, page } = await newPage(browser, vp);
    await page.goto(clone || meta.url, { waitUntil: 'load', timeout: 60000 });
    await settle(page, hide);
    const tree = await page.evaluate(specInPage, depth);
    await fs.writeFile(path.join(outDir, `${vp.name}${clone ? '.clone' : ''}.spec.json`), JSON.stringify(tree));
    console.log(`${vp.name}: ${tree.length} sections -> ${vp.name}.spec.json`);
    await context.close();
  }
} finally {
  if (!flags.cdp) await browser.close();
}
