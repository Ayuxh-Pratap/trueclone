// What a visitor sees at a review frame, and what only the clone shows there (review.mjs; docs/policy.md "Third-party
// content", "Template mode's placeholder text").
import fs from 'node:fs/promises';
import path from 'node:path';

// In the page: the boxes outside the page's flow (fixed and sticky boxes, frames, shadow hosts: a widget launcher, a
// banner, an overlay) and the text in view. What a visitor cannot see is not in view: clipped to nothing (a skip link
// until it is focused), the sr-only pattern, or inside such an element (RC6 astro: a clipped skip link was the first
// "clone-only" text).
export function inViewInPage() {
  const fixed = [], texts = new Set();
  const hiddenBox = new Map();
  const clipped = (el) => {
    if (!el || el === document.body) return false;
    if (hiddenBox.has(el)) return hiddenBox.get(el);
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const own = /rect\(0(px)?,? 0(px)?,? 0(px)?,? 0(px)?\)/.test(s.clip) || /inset\(\s*50%|circle\(\s*0/.test(s.clipPath) || (s.overflow === 'hidden' && r.width <= 2 && r.height <= 2);
    const v = own || clipped(el.parentElement);
    hiddenBox.set(el, v);
    return v;
  };
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity < 0.05 || clipped(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8 || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue;
    if (s.position === 'fixed' || s.position === 'sticky' || el.tagName === 'IFRAME' || el.shadowRoot) {
      const label = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.shadowRoot ? ' (shadow root)' : ''}`;
      fixed.push({ box: [r.left, r.top, r.width, r.height].map(Math.round), label });
    }
    for (const n of el.childNodes) if (n.nodeType === 3) { const t = n.textContent.replace(/\s+/g, ' ').trim().toLowerCase(); if (t.length >= 12) texts.add(t); }
  }
  return { fixed, texts: [...texts] };
}

// Template mode: the seed replaced every text of the page with placeholder of the same width (seed.mjs), by design. The
// text the seed generated is the tool's own, read from the seed's own record of what it wrote (clone/.seed-base*.html),
// lower-cased with its whitespace collapsed, as inViewInPage reads text. Exact mode: none (every text is the site's).
export async function seedTextOf(root, meta) {
  if (meta?.mode === 'exact') return '';
  const dir = path.join(root, 'clone');
  const files = (await fs.readdir(dir).catch(() => [])).filter((f) => /^\.seed-base.*\.html$/.test(f));
  const texts = await Promise.all(files.map((f) => fs.readFile(path.join(dir, f), 'utf8').catch(() => '')));
  const ent = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
  return texts.map((t) => t.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&(#?\w+);/g, (m, e) => ent[e] ?? (/^#\d+$/.test(e) ? String.fromCharCode(Number(e.slice(1))) : m))).join(' ').replace(/\s+/g, ' ').toLowerCase();
}

// The first text the clone shows in view that no reference load shows anywhere on its page, and that the seed did not
// generate (template placeholder): a difference, whatever the verdict (RC6 astro: with every placeholder flagged no
// template site could be verified; text the agent's script adds is still flagged)
export const cloneOnlyText = (cloneTexts, refPageTexts, seedText = '') => (cloneTexts || []).find((t) => refPageTexts.every((p) => !(p || '').includes(t)) && !(seedText && seedText.includes(t))) || null;
