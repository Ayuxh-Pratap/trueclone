// Template mode: give the clone's placeholder text the reference's shape. For every text block on the clone, the
// reference block at the same spot on screen is found, and each reference word is replaced by a lorem word of
// (nearly) the same rendered width in the reference's own font, keeping capitals, punctuation, number lengths, years. Lines then
// break where the reference's lines break, so layout and detail scores measure styling instead of copy length.
// Only placeholder words are written; no reference copy ends up in the clone.
//
// Blocks are matched at scroll windows (half a viewport apart, so pinned chapters are seen one by one). A clone
// block is rewritten only when its text is found verbatim in clone/index.html (or as a string literal in
// clone/script.js, for lists the script renders from data). Inline parts (a coloured span inside a heading) are
// shaped part by part. Text that already has the reference's shape (same word count, width within 4%) is kept, and a
// pair is only trusted when both blocks line up (left within 12px; width within 10% for blocks that fill their parent). Run desktop first, then
// the other viewports for blocks that only exist there; text that is already placeholder words is never reshaped.
//
// usage: node scripts/textshape.mjs <name> [--viewport desktop] [--write] [--debug]
//        node scripts/textshape.mjs <name> --list "<reference row selector>" "<clone row selector>" [--write]
//          (repeated lists such as calendar rows or cards: row n takes row n's shape, block by block; this also
//           works where the list still drifts, and for a placeholder repeated in a data array)
import fs from 'node:fs/promises';
import path from 'node:path';
import { VIEWPORTS, parseArgs, openBrowser, newPage, settle, serve, waitStill, siteDir } from './lib.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) {
  console.error('usage: npm run textshape -- <name> [--viewport desktop] [--write]');
  process.exit(1);
}
const root = siteDir(name);
const meta = JSON.parse(await fs.readFile(path.join(root, 'reference', 'meta.json'), 'utf8'));
if (meta.mode === 'exact') {
  console.error('exact mode clones carry the real text already; textshape is for template clones');
  process.exit(1);
}
const vp = VIEWPORTS.find((v) => v.name === (flags.viewport || 'desktop'));
const listAt = process.argv.indexOf('--list');
const listSelectors = listAt > 0 ? process.argv.slice(listAt + 1, listAt + 3) : null;
if (listAt > 0 && (listSelectors.length < 2 || listSelectors.some((x) => x.startsWith('--')))) { console.error('--list needs two selectors: the reference row and the clone row'); process.exit(1); }
const htmlFile = path.join(root, 'clone', 'index.html');
const jsFile = path.join(root, 'clone', 'script.js');

const LOREM = `lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore
magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute
irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt
culpa qui officia deserunt mollit anim id est laborum curabitur pretium tincidunt lacus nunc vitae faucibus porta felis
mauris viverra diam vel augue blandit nibh sapien rhoncus massa feugiat tellus integer vulputate morbi risus quam varius
orci nam libero justo laoreet sem lectus mattis praesent semper ante gravida eget fermentum turpis sodales neque arcu
egestas phasellus volutpat donec pharetra aenean placerat lobortis primis cras tortor iaculis lacinia suspendisse potenti
vivamus ultricies posuere cubilia curae maecenas ligula proin accumsan quisque ornare urna pellentesque habitant tristique
senectus netus malesuada fames ac a at nec mi ne te se eu per`.split(/\s+/).filter(Boolean);
const LOREM_SET = new Set(LOREM);

// Same rule on both pages: a text node belongs to its nearest block-level ancestor, skipping split-text wrappers.
const BLOCK_RULE = `
  const SPLIT = /(^|[-_\\s])(line|word|char)s?([-_\\s]|$)|split|reveal-/i;
  const own = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const norm = (t) => t.replace(/\\s+/g, ' ').trim();
  const blockOf = (el) => {
    let b = el;
    while (b.parentElement && b.parentElement !== document.body) {
      const d = getComputedStyle(b).display;
      // one-or-two-character inline-blocks are split text too (odometer digits, per-letter hover rolls)
      const splitChar = d === 'inline-block' && norm(b.textContent).length <= 2;
      if (!['inline', 'contents'].includes(d) && !splitChar && !SPLIT.test(String(b.getAttribute('class') || ''))) break;
      b = b.parentElement;
    }
    return b;
  };`;

// Clone: text blocks actually on screen, with a stable id and which duplicate (same text) they are.
const blocksInView = `(() => {${BLOCK_RULE}
  const visible = (el) => {
    // closed <details> content still reports a box but is never painted
    if (el.checkVisibility && !el.checkVisibility({ contentVisibilityAuto: true })) return false;
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.visibility === 'hidden' || +s.opacity === 0 || s.display === 'none') return false;
    }
    return true;
  };
  // hit tests skip pointer-events:none layers (text overlays often are), so switch it on while testing
  const hit = document.createElement('style');
  hit.textContent = '*{pointer-events:auto!important}';
  document.head.append(hit);
  const found = new Map();
  for (const el of document.body.querySelectorAll('*')) {
    if (!own(el) || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXT', 'TSPAN'].includes(el.tagName.toUpperCase())) continue;
    const b = blockOf(el);
    if (found.has(b) || !visible(b)) continue;
    const range = document.createRange();
    range.selectNodeContents(b);
    const first = [...range.getClientRects()].find((r) => r.width > 2 && r.height > 2);
    if (!first || first.top < 0 || first.bottom > innerHeight || first.left < 0 || first.right > innerWidth) continue;
    const pt = { x: first.left + Math.min(6, first.width / 2), y: first.top + first.height / 2 };
    // clipped text (a closed menu behind a clip-path) drops out of hit testing; decorative layers above the text
    // (guide lines, gradients) are fine, so the block only has to be somewhere in the stack at its point
    if (!document.elementsFromPoint(pt.x, pt.y).some((e) => e === b || b.contains(e))) continue;
    found.set(b, { ...pt, top: first.top });
  }
  window.__labIds = window.__labIds || 0;
  hit.remove();
  return [...found].map(([b, p]) => {
    if (!b.dataset.labId) b.dataset.labId = String(++window.__labIds);
    const text = norm(b.textContent);
    const same = [...document.body.querySelectorAll('*')].filter((e) => norm(e.textContent) === text && ![...e.children].some((c) => norm(c.textContent) === text));
    const dup = same.findIndex((e) => e === b || b.contains(e) || e.contains(b));
    const box = b.getBoundingClientRect();
    const fills = box.width >= 0.9 * b.parentElement.getBoundingClientRect().width;
    const cs = getComputedStyle(b);
    return { id: b.dataset.labId, x: p.x, y: p.y, top: p.top, boxTop: box.top, boxBottom: box.bottom, left: box.left, width: box.width, fills, family: cs.fontFamily.split(',')[0].replace(/["']/g, '').trim().toLowerCase(), size: parseFloat(cs.fontSize), text, dup, dups: same.length };
  });
})()`;

// A block's text split into parts by inline styling (a coloured span is its own part), with each part's font.
const DESCRIBE = `${BLOCK_RULE}
const describe = (b) => {
  const parts = [];
  const walk = (node) => {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) {
        if (!n.textContent.trim() && !parts.length) continue;
        let el = n.parentElement;
        while (el !== b && SPLIT.test(String(el.getAttribute('class') || ''))) el = el.parentElement;
        // keyed by the inline element's class, not its identity: split-text libraries clone a coloured span on
        // every line it crosses, and those copies are one part
        const key = el === b ? '' : String(el.getAttribute('class') || el.tagName);
        const last = parts[parts.length - 1];
        if (last && last.key === key && !last.closed) last.text += n.textContent;
        else {
          const s = getComputedStyle(n.parentElement);
          parts.push({ key, text: n.textContent, font: s.fontStyle + ' ' + s.fontWeight + ' ' + s.fontSize + ' ' + s.fontFamily, upper: s.textTransform === 'uppercase', ls: parseFloat(s.letterSpacing) || 0 });
        }
      } else if (n.nodeType === 1) {
        if (n.tagName === 'BR') { const last = parts[parts.length - 1]; if (last) last.closed = true; continue; }
        if (getComputedStyle(n).display === 'none') continue;
        walk(n);
      }
    }
  };
  walk(b);
  return {
    boxTop: b.getBoundingClientRect().top,
    boxBottom: b.getBoundingClientRect().bottom,
    top: (() => { const rg = document.createRange(); rg.selectNodeContents(b); const f = [...rg.getClientRects()].find((x) => x.width > 2 && x.height > 2); return f ? f.top : b.getBoundingClientRect().top; })(),
    left: b.getBoundingClientRect().left,
    width: b.getBoundingClientRect().width,
    fills: b.getBoundingClientRect().width >= 0.9 * b.parentElement.getBoundingClientRect().width,
    family: getComputedStyle(b).fontFamily.split(',')[0].replace(/["']/g, '').trim().toLowerCase(),
    size: parseFloat(getComputedStyle(b).fontSize),
    tag: b.tagName.toLowerCase(),
    cls: String(b.getAttribute('class') || '').split(/\\s+/).slice(0, 2).join('.'),
    text: norm(b.textContent),
    ...(() => { const t = norm(b.textContent); const same = [...document.body.querySelectorAll('*')].filter((e) => norm(e.textContent) === t && ![...e.children].some((c) => norm(c.textContent) === t)); return { dup: same.findIndex((e) => e === b || b.contains(e) || e.contains(b)), dups: same.length }; })(),
    parts: parts.map((p) => ({ text: norm(p.text), font: p.font, upper: p.upper, ls: p.ls })).filter((p) => p.text),
  };
};`;

// Reference: the block under a point.
const refBlockAt = (x, y) => `(() => {${DESCRIBE}
  const hit = document.createElement('style');
  hit.textContent = '*{pointer-events:auto!important}';
  document.head.append(hit);
  const leaf = document.elementsFromPoint(${x}, ${y}).find(own);
  hit.remove();
  return leaf ? describe(blockOf(leaf)) : null;
})()`;

// List mode: every row of a repeated list (rows, cards), and the text blocks inside each row in reading order.
const listRows = (sel) => `(() => {${DESCRIBE}
  return [...document.querySelectorAll(${JSON.stringify(sel)})].map((row) => {
    const blocks = [];
    for (const el of row.querySelectorAll('*')) {
      if (!own(el) || ['SCRIPT', 'STYLE', 'TEXT', 'TSPAN'].includes(el.tagName.toUpperCase())) continue;
      const b = blockOf(el);
      // only text that renders: hidden CMS fields (display: none) are not part of the layout
      if (!blocks.includes(b) && row.contains(b) && b.getClientRects().length) blocks.push(b);
    }
    return blocks.map(describe);
  });
})()`;

// Does the clone text already have the reference's shape (same word count, width within 4%)?
function sameShapeInPage([refParts, cloneParts]) {
  const ctx = document.createElement('canvas').getContext('2d');
  return refParts.every((p, k) => {
    ctx.font = p.font;
    const words = (t) => t.split(/\s+/).filter(Boolean);
    const w = (t) => ctx.measureText(p.upper ? t.toUpperCase() : t).width;
    const c = cloneParts[k] || '';
    return words(p.text).length === words(c).length && Math.abs(w(p.text) - w(c)) <= 0.04 * w(p.text);
  });
}

// Width-matched placeholder words, measured in the reference font.
function shapeInPage([parts, lorem]) {
  const ctx = document.createElement('canvas').getContext('2d');
  let seed = 7;
  return parts.map((p) => {
    ctx.font = p.font;
    const width = (w) => ctx.measureText(p.upper ? w.toUpperCase() : w).width + p.ls * w.length;
    const pool = lorem.map((w) => [w, width(w)]);
    // match the running width, not just each word: every pick corrects the drift left by the previous ones, so
    // the line-break points stay where the reference's are even over long paragraphs
    let drift = 0;
    return p.text.split(/(\s+)/).map((tok) => {
      if (!tok.trim()) return ' ';
      const m = tok.match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}][\p{L}\p{N}'’-]*?)?([^\p{L}\p{N}]*)$/u);
      if (!m || !m[2]) return tok; // punctuation only
      const [, pre, word, post] = m;
      // numbers keep their length (and years stay), but not their digits: a car number or a podium count is the
      // original's data, not layout
      if (/^(19|20)\d\d$/.test(word)) return tok;
      if (/^[\d.,:/+-]+$/.test(word)) return pre + word.replace(/\d/g, (d) => String((Number(d) + 3) % 10)) + post;
      // candidates get the word's capitalisation before they are measured (capitals are wider)
      const caps = word.length > 1 && word === word.toUpperCase() && /\p{L}/u.test(word);
      const cap = !caps && /\p{Lu}/u.test(word[0]);
      const cased = (w) => (caps ? w.toUpperCase() : cap ? w[0].toUpperCase() + w.slice(1) : w);
      const target = width(word) + drift;
      const ranked = pool.map(([w]) => [cased(w), Math.abs(width(cased(w)) - target)]).sort((a, b) => a[1] - b[1]);
      const close = ranked.filter(([, d]) => d <= ranked[0][1] + 0.5).map(([w]) => w);
      seed = (seed * 31 + word.length) % 9973;
      const out = close[seed % close.length];
      drift = target - width(out);
      return pre + out + post;
    }).join('').replace(/\s+/g, ' ').trim();
  });
}

// Clone source: the block's own text parts in clone/index.html (parsed, no scripts).
function sourcePartsInPage([blockText, dup, dups, html]) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const candidates = [...doc.body.querySelectorAll('*')].filter((e) => norm(e.textContent) === blockText && ![...e.children].some((c) => norm(c.textContent) === blockText));
  if (!candidates.length) return { error: 'not found verbatim in the source' };
  if (candidates.length !== dups || dup < 0) return { error: `${candidates.length} identical blocks in the source, ${dups} on the page` };
  const el = candidates[dup];
  const allText = [];
  const tw = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) allText.push(n);
  const parts = [];
  const walk = (node) => {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) {
        if (!n.textContent.trim()) continue;
        const k = allText.indexOf(n);
        const occurrence = allText.filter((t, j) => j < k && norm(t.textContent) === norm(n.textContent)).length;
        const last = parts[parts.length - 1];
        if (last && last.parent === n.parentElement && !last.closed) last.nodes.push({ text: n.textContent, occurrence });
        else parts.push({ parent: n.parentElement, nodes: [{ text: n.textContent, occurrence }] });
      } else if (n.nodeType === 1) {
        if (n.tagName === 'BR') { const last = parts[parts.length - 1]; if (last) last.closed = true; continue; }
        walk(n);
      }
    }
  };
  walk(el);
  return { parts: parts.map((p) => p.nodes) };
}

const LITERAL = /(['"`])((?:\\.|(?!\1).)*)\1/g; // string literals in script.js
const server = await serve(path.join(root, 'clone'));
const browser = await openBrowser(flags.cdp);
const html = await fs.readFile(htmlFile, 'utf8');
const js = await fs.readFile(jsFile, 'utf8').catch(() => '');
const plan = [];
const seen = new Set();
try {
  const open = async (url) => {
    const { page } = await newPage(browser, vp, { reducedMotion: 'no-preference' });
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await page.mouse.move(5, vp.height - 5);
    await waitStill(page, { timeout: 15000, interval: 200 });
    await settle(page);
    return page;
  };
  const [ref, clone] = await Promise.all([open(meta.url), open(server.url)]);
  // One pair: reference block r, clone block c ({ text, dup, dups }); jsOccurrence set in list mode.
  const consider = async (r, c, where, jsOccurrence) => {
    if (!r || !r.text || r.text === c.text) return; // nothing, or already the same words (generic labels)
    const words = c.text.toLowerCase().match(/\p{L}+/gu) || [];
    if (words.length && words.every((w) => LOREM_SET.has(w))) { // shaped on an earlier pass
      if (flags.debug) console.log(`  already placeholder words: "${c.text.slice(0, 40)}"`);
      return;
    }
    const label = `${r.tag}.${r.cls}`;
    let src = await clone.evaluate(sourcePartsInPage, [c.text, c.dup, c.dups, html]);
    if (src.error && r.parts.length === 1) {
      const lits = [...js.matchAll(LITERAL)].filter((m) => m[2] === c.text);
      // a literal repeated across data rows maps by row order in list mode; otherwise only a unique one is safe
      if (jsOccurrence !== undefined && jsOccurrence < lits.length) src = { js: true, parts: [[{ text: c.text, occurrence: jsOccurrence }]] };
      else if (lits.length === 1 && c.dups === 1) src = { js: true, parts: [[{ text: c.text, occurrence: 0 }]] };
      else if (lits.length) src = { error: `string literal repeated ${lits.length}x in script.js (use --list)` };
    }
    if (src.error) { plan.push({ y: where, clone: c.text, ref: label, skip: src.error }); return; }
    if (src.parts.length !== r.parts.length) { plan.push({ y: where, clone: c.text, ref: label, skip: `${src.parts.length} inline parts on the clone vs ${r.parts.length} on the reference` }); return; }
    const cloneParts = src.parts.map((nodes) => nodes.map((n) => n.text).join(' ').replace(/\s+/g, ' ').trim());
    if (await ref.evaluate(sameShapeInPage, [r.parts, cloneParts])) {
      if (flags.debug) console.log(`  same shape already: "${c.text.slice(0, 40)}"`);
      return;
    }
    const shaped = await ref.evaluate(shapeInPage, [r.parts, LOREM]);
    plan.push({ y: where, clone: c.text, ref: label, js: src.js, parts: src.parts.map((nodes, k) => ({ nodes, to: shaped[k] })) });
  };

  if (listSelectors) {
    // List mode: row n of the clone list takes the shape of row n of the reference list, block by block.
    const [refSel, cloneSel] = listSelectors;
    const [refRows, cloneRows] = await Promise.all([ref.evaluate(listRows(refSel)), clone.evaluate(listRows(cloneSel))]);
    if (refRows.length !== cloneRows.length) console.warn(`WARNING ${refRows.length} reference rows vs ${cloneRows.length} clone rows: pairing the first ${Math.min(refRows.length, cloneRows.length)}`);
    const seenText = new Map(); // text -> how many earlier rows used it (literal occurrence order)
    for (let i = 0; i < Math.min(refRows.length, cloneRows.length); i++) {
      if (refRows[i].length !== cloneRows[i].length) { plan.push({ y: `row ${i + 1}`, clone: cloneRows[i].map((x) => x.text).join(' | '), ref: refSel, skip: `${cloneRows[i].length} text blocks vs ${refRows[i].length}` }); continue; }
      for (let j = 0; j < refRows[i].length; j++) {
        const c = cloneRows[i][j], r = refRows[i][j];
        const occurrence = seenText.get(c.text) || 0;
        seenText.set(c.text, occurrence + 1);
        if (r.family !== c.family) { plan.push({ y: `row ${i + 1}`, clone: c.text, ref: `${r.tag}.${r.cls}`, skip: `font ${c.family} vs ${r.family}` }); continue; }
        await consider(r, c, `row ${i + 1}`, occurrence);
      }
    }
  } else {
    const max = await clone.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    // Horizontal scrollers (a gallery of cards) hold text beyond the first screen sideways: both sides' scroller (the
    // same element: found by its place in the document, which the seed keeps) are stepped sideways together and the
    // blocks paired at every step, like the vertical windows.
    const scrollersInView = () => {
      const SKIP = new Set(['SCRIPT', 'NOSCRIPT', 'TEMPLATE', 'STYLE', 'LINK', 'META']);
      const pathOf = (el) => { const parts = []; for (let n = el; n && n !== document.body && n.parentElement; n = n.parentElement) parts.unshift(`${n.tagName.toLowerCase()}:${[...n.parentElement.children].filter((c) => !SKIP.has(c.tagName)).indexOf(n) + 1}`); return parts.join('>'); };
      const out = [];
      for (const el of document.body.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight || r.width < 160) continue;
        const s = getComputedStyle(el);
        if (/(auto|scroll)/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 24) out.push({ path: pathOf(el), steps: Math.min(8, Math.ceil((el.scrollWidth - el.clientWidth) / (el.clientWidth * 0.8))) });
      }
      return out;
    };
    const setScroll = ([p, x]) => {
      const SKIP = new Set(['SCRIPT', 'NOSCRIPT', 'TEMPLATE', 'STYLE', 'LINK', 'META']);
      let el = document.body;
      for (const part of p.split('>')) { const [tag, i] = part.split(':'); el = el && [...el.children].filter((c) => !SKIP.has(c.tagName))[Number(i) - 1]; if (!el || el.tagName.toLowerCase() !== tag) return false; }
      el.style.scrollBehavior = 'auto';
      el.scrollLeft = x * el.clientWidth * 0.8;
      return true;
    };
    const sideways = new Set();
    for (let y = 0; ; y += Math.round(vp.height / 2)) {
      const at = Math.min(y, max);
      await Promise.all([ref, clone].map(async (p) => { await p.evaluate((yy) => window.scrollTo(0, yy), at); await waitStill(p, { timeout: 3000 }); }));
      const steps = [null];
      for (const s of await clone.evaluate(scrollersInView)) if (!sideways.has(s.path)) { sideways.add(s.path); for (let k = 1; k <= s.steps; k++) steps.push([s.path, k]); steps.push([s.path, 0]); }
      for (const step of steps) {
      if (step) {
        const ok = await Promise.all([ref, clone].map((p) => p.evaluate(setScroll, step)));
        if (!ok.every(Boolean)) continue;
        await Promise.all([ref, clone].map((p) => waitStill(p, { timeout: 1500 })));
        if (step[1] === 0) continue; // back to the start: nothing new to pair
      }
      for (const c of await clone.evaluate(blocksInView)) {
        if (seen.has(c.id)) continue;
        const r = await ref.evaluate(refBlockAt(c.x, c.y));
        if (!r || !r.text) continue;
        seen.add(c.id);
        // Position pairing only holds where the layout already lines up: the blocks' left edges must agree (and
        // widths, for blocks that fill their parent), and the text must be the same kind (family, size). Elsewhere
        // (a section that still drifts at this width) the block under the point is a different block: use --list.
        const why = Math.abs(r.left - c.left) > 12 || (r.fills && c.fills && Math.abs(r.width - c.width) > Math.max(12, 0.1 * r.width))
          ? `boxes differ (left ${Math.round(r.left)} vs ${Math.round(c.left)}, width ${Math.round(r.width)} vs ${Math.round(c.width)})`
          // vertically the blocks must line up too (drift): by their first lines, centres or bottoms, so top-, centre-
          // and bottom-aligned layouts all pass while text of different length is still being shaped
          : ![[r.top, c.top], [(r.boxTop + r.boxBottom) / 2, (c.boxTop + c.boxBottom) / 2], [r.boxBottom, c.boxBottom]].some(([p, q]) => Math.abs(p - q) <= Math.max(4, 0.4 * c.size))
          ? `first lines at different heights (${Math.round(r.top)} vs ${Math.round(c.top)})`
          : r.family !== c.family || Math.abs(r.size - c.size) > 0.15 * r.size ? `different text (${r.family} ${r.size} vs ${c.family} ${c.size})` : null;
        if (why) {
          if (flags.debug) console.log(`  not paired at y${at}: "${c.text.slice(0, 40)}" with ${r.tag}.${r.cls} "${r.text.slice(0, 30)}": ${why}`);
          continue;
        }
        await consider(r, c, at);
      }
      }
      if (at >= max) break;
    }
  }
} finally {
  if (!flags.cdp) await browser.close();
  server.close();
}

// Apply: each source part's text nodes become the shaped text (the first node gets it all, the rest are emptied).
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pattern = (text) => new RegExp(text.trim().split(/\s+/).map((w) => reEsc(esc(w)).replace(/'/g, "(?:'|&#39;|&apos;)").replace(/’/g, '(?:’|&rsquo;)')).join('\\s+'), 'g');
// Edits to the same text are applied from the last occurrence back to the first: replacing an earlier copy
// first would shift the occurrence numbers of the later ones.
const edits = [];
for (const item of plan.filter((p) => p.parts)) {
  if (item.js) { const { text, occurrence } = item.parts[0].nodes[0]; edits.push({ js: true, text, occurrence, to: item.parts[0].to }); continue; }
  for (const part of item.parts) part.nodes.forEach((node, k) => edits.push({ text: node.text, occurrence: node.occurrence, to: k === 0 ? part.to : '' }));
}
edits.sort((x, y) => y.occurrence - x.occurrence);
let out = html;
let outJs = js;
for (const e of edits) {
  let n = -1;
  if (e.js) outJs = outJs.replace(LITERAL, (m, q, body) => (body === e.text && ++n === e.occurrence ? q + e.to.split(q).join('\\' + q) + q : m));
  else out = out.replace(pattern(e.text), (m) => (++n === e.occurrence ? esc(e.to) : m));
}
const changed = plan.filter((p) => p.parts).reduce((n, p) => n + p.parts.length, 0);
for (const p of plan) {
  console.log(`y${String(p.y).padEnd(6)} ${p.ref.padEnd(36)} ${p.skip ? `SKIP (${p.skip})` : p.js ? '(script.js)' : ''}`);
  console.log(`         clone: ${p.clone.slice(0, 110)}`);
  if (p.parts) p.parts.forEach((x) => console.log(`         ->     ${x.to.slice(0, 110)}`));
}
console.log(`\n${plan.filter((p) => p.parts).length} blocks reshaped, ${plan.filter((p) => p.skip).length} skipped`);
if (flags.write) {
  await fs.writeFile(htmlFile, out);
  if (outJs !== js) await fs.writeFile(jsFile, outJs);
  console.log(`wrote ${path.relative(process.cwd(), htmlFile)}${outJs !== js ? ' and script.js' : ''} (${changed} text parts)`);
} else console.log('dry run: add --write to apply');
