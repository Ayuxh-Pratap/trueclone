// CSS rules for one element, like the DevTools Styles pane: every rule that matches the element and its
// ::before / ::after, in source order, with the @media / @supports / @layer it sits in and where it came from.
// Build from the original's real CSS instead of approximating what the computed values look like
// (e.g. a "capsize" ::before/::after text trim is not the same as text-box-trim inside flex and grid).
// Cross-origin stylesheets (CDNs) are fetched outside the page and parsed, so they are included too.
//
// usage: node scripts/rules.mjs <name> "<selector>[@n]" [--viewport desktop] [--clone] [--url <page>]
//        node scripts/rules.mjs <name> --text "Car number"     (the element whose own text starts with this)
import fs from 'node:fs/promises';
import path from 'node:path';
import { VIEWPORTS, parseArgs, openBrowser, newPage, settle, serve, waitStill, siteDir } from './lib.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name, target] = pos;
if (!name || (!target && typeof flags.text !== 'string')) {
  console.error('usage: npm run rules -- <name> "<selector>[@n]" [--viewport desktop] [--clone] | <name> --text "label"');
  process.exit(1);
}
const root = siteDir(name);
const meta = JSON.parse(await fs.readFile(path.join(root, 'reference', 'meta.json'), 'utf8'));
const vp = VIEWPORTS.find((v) => v.name === (flags.viewport || 'desktop'));
const server = flags.clone && typeof flags.url !== 'string' ? await serve(path.join(root, 'clone')) : null;
const url = typeof flags.url === 'string' ? flags.url : server ? server.url : meta.url;

const browser = await openBrowser(flags.cdp);
try {
  const { page } = await newPage(browser, vp, { reducedMotion: 'no-preference' });
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await waitStill(page, { timeout: 15000, interval: 200 });
  await settle(page);

  // Sheets the page cannot read (cross-origin without CORS): fetch them here, parse them in the page.
  const blocked = await page.evaluate(() => [...document.styleSheets].map((s, i) => {
    try { void s.cssRules; return null; } catch { return { i, href: s.href, media: s.media.mediaText }; }
  }).filter(Boolean));
  for (const b of blocked) {
    const text = await page.context().request.get(b.href).then((r) => r.text()).catch(() => '');
    await page.evaluate(([b, text]) => {
      const sheet = new CSSStyleSheet({ media: b.media || undefined });
      sheet.replaceSync(text.replace(/@import[^;]+;/g, ''));
      (window.__labSheets ||= []).push({ i: b.i, href: b.href, sheet });
    }, [b, text]);
  }

  const result = await page.evaluate(([target, text]) => {
    let el;
    if (text) {
      el = [...document.body.querySelectorAll('*')].find((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().startsWith(text)));
    } else {
      const [sel, idx] = target.split('@');
      el = document.querySelectorAll(sel)[Number(idx || 0)];
    }
    if (!el) return null;
    // split a selector list on top-level commas only (":is(a, b)" stays whole)
    const split = (s) => { const out = []; let depth = 0, cur = ''; for (const ch of s) { if (ch === '(' || ch === '[') depth++; if (ch === ')' || ch === ']') depth--; if (ch === ',' && !depth) { out.push(cur.trim()); cur = ''; } else cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; };
    const PSEUDO = /::?(before|after)\b/;
    const found = { element: [], before: [], after: [] };
    const sheets = [...document.styleSheets].map((s, i) => {
      if (s.ownerNode?.hasAttribute?.('data-lab-freeze')) return { rules: [], source: 'lab' }; // the lab's own freeze styles
      const own = (() => { try { return s.cssRules; } catch { return null; } })();
      const parsed = (window.__labSheets || []).find((x) => x.i === i);
      return { rules: own || parsed?.sheet.cssRules || [], source: s.href ? s.href.split('/').pop().split('?')[0] : `inline <style> #${i}` };
    });
    const walk = (rules, source, ctx) => {
      for (const r of rules) {
        if (r instanceof CSSMediaRule) { if (matchMedia(r.conditionText).matches) walk(r.cssRules, source, [...ctx, `@media ${r.conditionText}`]); continue; }
        if (r instanceof CSSSupportsRule) { if (CSS.supports(r.conditionText)) walk(r.cssRules, source, [...ctx, `@supports ${r.conditionText}`]); continue; }
        if (window.CSSLayerBlockRule && r instanceof CSSLayerBlockRule) { walk(r.cssRules, source, [...ctx, `@layer ${r.name}`]); continue; }
        if (!(r instanceof CSSStyleRule)) continue;
        for (const part of split(r.selectorText)) {
          const m = part.match(PSEUDO);
          if (!m && /::?(marker|placeholder|selection|first-line|first-letter|-webkit-|-moz-)/.test(part)) continue; // other pseudo-elements
          const base = part.replace(/::?(before|after|marker|placeholder|selection|first-line|first-letter)\b/g, '').trim() || '*';
          let hit = false;
          try { hit = el.matches(base); } catch { /* selector the engine does not support */ }
          if (!hit) continue;
          (found[m ? m[1] : 'element']).push({ selector: part, where: [source, ...ctx].join('  '), css: r.style.cssText });
          break;
        }
      }
    };
    sheets.forEach((s) => walk(s.rules, s.source, []));
    const inline = el.getAttribute('style');
    if (inline) found.element.push({ selector: 'style=""', where: 'inline attribute', css: inline });
    const pick = (s) => ({ display: s.display, size: `${s.width} x ${s.height}`, margin: s.margin, padding: s.padding, font: `${s.fontWeight} ${s.fontSize}/${s.lineHeight} ${s.fontFamily.split(',')[0]}`, color: s.color, background: s.backgroundColor, transform: s.transform, content: s.content });
    const r = el.getBoundingClientRect();
    return {
      el: `${el.tagName.toLowerCase()}.${String(el.getAttribute('class') || '').split(/\s+/).join('.')}`,
      box: `${Math.round(r.width)} x ${Math.round(r.height)} at page y ${Math.round(r.top + scrollY)}`,
      computed: { element: pick(getComputedStyle(el)), before: pick(getComputedStyle(el, '::before')), after: pick(getComputedStyle(el, '::after')) },
      found,
    };
  }, [target || null, typeof flags.text === 'string' ? flags.text : null]);

  if (!result) { console.error(`nothing matched ${target || flags.text} on ${url}`); process.exitCode = 1; }
  else {
    console.log(`${result.el}  (${result.box})  on ${flags.clone ? 'the clone' : url}, ${vp.name}`);
    for (const part of ['element', 'before', 'after']) {
      const rules = result.found[part];
      const c = result.computed[part];
      if (part !== 'element' && !rules.length && c.content === 'none') continue;
      console.log(`\n${part === 'element' ? 'element' : `::${part}`}  computed: ${Object.entries(c).filter(([k, v]) => v && v !== 'none' && v !== 'normal' && !(k === 'content' && part === 'element')).map(([k, v]) => `${k} ${v}`).join(' | ')}`);
      for (const r of rules) console.log(`  ${r.selector}  { ${r.css} }\n      ${r.where}`);
    }
  }
} finally {
  if (!flags.cdp) await browser.close();
  server?.close();
}
