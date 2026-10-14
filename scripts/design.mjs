// One design system per site, from one canonical file.
//   sites/<name>/design-tokens.json   canonical: drafted from the capture, then reviewed/edited by hand
//   sites/<name>/DESIGN.md            Google design.md format (linted with @google/design.md)
//   sites/<name>/globals.css          shadcn/ui theme (Tailwind v4, oklch)
//   sites/<name>/clone/tokens.css     CSS variables the clone's own stylesheet must use
//
// usage: node scripts/design.mjs <name>            render from design-tokens.json (drafts it first if missing)
//        node scripts/design.mjs <name> --redraft  write a fresh draft to design-tokens.draft.json (never overwrites edits)
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './lib.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) {
  console.error('usage: npm run design -- <name> [--redraft]');
  process.exit(1);
}
const root = path.resolve('sites', name);
const ref = path.join(root, 'reference');
const canonical = path.join(root, 'design-tokens.json');
const readJson = async (f, fallback) => { try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch { return fallback; } };

// ======================= Colour maths =======================
const NAMED = { white: '#ffffff', black: '#000000', transparent: 'rgba(0, 0, 0, 0)' };
function parseColor(input) {
  let s = String(input).trim().toLowerCase();
  if (NAMED[s]) s = NAMED[s];
  let m = s.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? +(n(6) / 255).toFixed(3) : 1 };
  }
  m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map((v) => (v.endsWith('%') ? parseFloat(v) * 2.55 : parseFloat(v)));
    return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : (m[1].includes('%') && p[3] > 1 ? p[3] / 255 : p[3]) };
  }
  return null;
}
const hex2 = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
const toHex = (c) => `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}${c.a < 1 ? hex2(c.a * 255) : ''}`;
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
function toOklch(c) {
  const r = lin(c.r), g = lin(c.g), b = lin(c.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.sqrt(A * A + B * B);
  let H = (Math.atan2(B, A) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L, C, H: C < 0.0005 ? 0 : H, a: c.a };
}
const oklchCss = (c) => {
  const o = toOklch(c);
  const base = `oklch(${+o.L.toFixed(3)} ${+o.C.toFixed(3)} ${+o.H.toFixed(1)}`;
  return o.a < 1 ? `${base} / ${Math.round(o.a * 100)}%)` : `${base})`;
};
const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
const luminance = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return +((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)).toFixed(2); };
const BLACK = parseColor('#000'), WHITE = parseColor('#fff');

// ======================= Draft from the capture =======================
async function draft() {
  const meta = await readJson(path.join(ref, 'meta.json'), {});
  const tokens = await readJson(path.join(ref, 'tokens.json'), null);
  const spec = await readJson(path.join(ref, 'desktop.spec.json'), []);
  if (!tokens) throw new Error(`no ${path.join(ref, 'tokens.json')}: run capture first`);
  // typography comes from the measured text runs (font family per size and weight); without them it would be guessed
  if (!spec.length) throw new Error(`no ${path.join(ref, 'desktop.spec.json')}: run "trueclone spec ${name}" first (the typography is measured from it)`);
  const rootPx = parseFloat(meta.rootFontSize?.desktop || tokens.rootFontSize || 16);
  const rem = (px) => `${+(parseFloat(px) / rootPx).toFixed(4)}rem`;
  const origin = 'captured';

  // ---- colours: usage-weighted, roles inferred from lightness/chroma ----
  const pool = new Map();
  const add = (value, uses, kind) => {
    const c = parseColor(value);
    if (!c || c.a === 0) return;
    const key = toHex(c);
    const e = pool.get(key) || { c, hex: key, uses: 0, text: 0, bg: 0 };
    e.uses += uses; e[kind] += uses;
    pool.set(key, e);
  };
  const textChars = new Map();
  const countText = (n) => { if (n.textLen && n.style?.color) textChars.set(n.style.color, (textChars.get(n.style.color) || 0) + n.textLen); (n.children || []).forEach(countText); };
  spec.forEach(countText);
  if (textChars.size) textChars.forEach((chars, color) => add(color, chars, 'text'));
  else tokens.textColors.forEach((t) => add(t.value, t.uses, 'text'));
  tokens.backgrounds.forEach((t) => add(t.value, t.uses, 'bg'));
  const all = [...pool.values()].sort((a, b) => b.uses - a.uses);
  const opaque = all.filter((e) => e.c.a === 1);
  const lightness = (e) => toOklch(e.c).L;
  const chroma = (e) => toOklch(e.c).C;
  const bodyBg = parseColor(tokens.bodyBackground);
  const surface = bodyBg && bodyBg.a === 1 ? { c: bodyBg, hex: toHex(bodyBg), uses: 1 } : opaque.find((e) => lightness(e) > 0.9) || { c: WHITE, hex: '#ffffff', generated: true };
  const onSurface = opaque.filter((e) => e.text && contrast(e.c, surface.c) >= 4.5).sort((a, b) => b.text - a.text)[0] || { c: BLACK, hex: '#000000', generated: true };
  const chromatic = opaque.filter((e) => chroma(e) > 0.06);
  const primary = chromatic[0];
  const inverse = opaque.filter((e) => e.bg >= 2 && lightness(e) < 0.25)[0];
  const neutral = opaque.filter((e) => e.bg && e.hex !== surface.hex && lightness(e) > 0.85 && lightness(e) < 0.995 && chroma(e) < 0.02)[0];
  const alphaDark = all.filter((e) => e.c.a < 1 && luminance(e.c) < 0.2 && e.c.a <= 0.2).sort((a, b) => b.bg - a.bg)[0];
  const alphaLight = all.filter((e) => e.c.a < 1 && luminance(e.c) > 0.8).sort((a, b) => b.uses - a.uses)[0];
  const mutedText = all.filter((e) => e.c.a < 1 && e.text && e.c.a >= 0.3).sort((a, b) => b.text - a.text)[0];

  const colors = {};
  const put = (key, e, role, gen = false) => {
    if (!e) return;
    colors[key] = { value: e.hex, role, uses: e.uses || 0, origin: gen || e.generated ? 'generated' : origin };
  };
  if (primary) {
    put('primary', primary, 'Brand accent: calls to action, highlights, active states');
    put('on-primary', { c: contrast(BLACK, primary.c) >= contrast(WHITE, primary.c) ? BLACK : WHITE, hex: contrast(BLACK, primary.c) >= contrast(WHITE, primary.c) ? '#000000' : '#ffffff', generated: true }, 'Text and icons on primary (best-contrast black or white)');
  } else {
    put('primary', onSurface, 'Monochrome site: the ink colour doubles as primary', true);
    put('on-primary', { c: surface.c, hex: surface.hex }, 'Text on primary', true);
  }
  chromatic.slice(1, 3).forEach((e, i) => put(i ? 'tertiary' : 'secondary', e, 'Secondary accent'));
  put('surface', surface, 'Default page background');
  put('on-surface', onSurface, 'Default text colour on surface');
  if (mutedText) put('on-surface-muted', mutedText, 'Secondary text, captions, metadata');
  put('neutral', neutral, 'Quiet fills: secondary buttons, inputs, chips');
  if (inverse) {
    put('inverse-surface', inverse, 'Dark sections');
    put('on-inverse-surface', { c: WHITE, hex: '#ffffff', generated: !opaque.some((e) => e.hex === '#ffffff' && e.text) }, 'Text on dark sections');
  }
  put('outline', alphaDark, 'Hairlines, borders and input fills on light surfaces');
  put('outline-inverse', alphaLight, 'Hairlines on dark surfaces');
  put('error', { c: parseColor('#dc2626'), hex: '#dc2626' }, 'Errors and destructive actions (not in source)', true);

  // ---- typography: from measured text nodes, weighted by characters ----
  const runs = new Map();
  const walk = (n) => {
    const s = n.style || {};
    if (n.textLen && s['font-size']) {
      const key = [s['font-family'], s['font-size'], s['line-height'], s['font-weight'] || '400', s['letter-spacing'] || 'normal', s['text-transform'] || 'none'].join('|');
      const e = runs.get(key) || { key, chars: 0, tags: new Set() };
      e.chars += n.textLen; e.tags.add(n.tag);
      runs.set(key, e);
    }
    (n.children || []).forEach(walk);
  };
  spec.forEach(walk);
  const inherit = (n, parent = {}) => { // spec omits inherited defaults; fill from parent chain
    const s = { ...parent, ...(n.style || {}) };
    n.style = s;
    (n.children || []).forEach((k) => inherit(k, s));
  };
  if (!runs.size) { spec.forEach((n) => inherit(n)); spec.forEach(walk); }
  const typeRuns = [...runs.values()].filter((e) => e.chars >= 12 || parseFloat(e.key.split('|')[1]) >= 24);
  const fam = (e) => e.key.split('|')[0];
  const sizeOf = (e) => parseFloat(e.key.split('|')[1]);
  const famChars = new Map();
  typeRuns.forEach((e) => famChars.set(fam(e), (famChars.get(fam(e)) || 0) + e.chars));
  const bodyFamily = [...famChars].sort((a, b) => b[1] - a[1])[0]?.[0];
  const headingFamily = [...new Set(typeRuns.filter((e) => fam(e) !== bodyFamily).sort((a, b) => sizeOf(b) - sizeOf(a)).map(fam))][0] || bodyFamily;
  const typography = {};
  const toType = (e) => {
    const [family, size, lh, weight, ls, transform] = e.key.split('|');
    const px = parseFloat(size);
    // line height as a ratio; "normal" (or anything not a length, a 0px font) is the browser's normal, ~1.2
    const ratio = parseFloat(lh) / px;
    const t = { fontFamily: family, fontSize: rem(px), fontWeight: Number(weight) || 400, lineHeight: lh !== 'normal' && Number.isFinite(ratio) && ratio > 0 ? +ratio.toFixed(2) : 1.2 };
    if (ls && ls !== 'normal' && parseFloat(ls) !== 0) t.letterSpacing = `${+(parseFloat(ls) / px).toFixed(3)}em`;
    if (transform && transform !== 'none') t.textTransform = transform;
    return { ...t, uses: e.chars, origin };
  };
  const dedupe = (list) => { const seen = new Set(); return list.filter((e) => { const k = `${fam(e)}|${sizeOf(e)}|${e.key.split('|')[3]}`; if (seen.has(k)) return false; seen.add(k); return true; }); };
  const lhOf = (e) => { const lh = e.key.split('|')[2]; return lh === 'normal' ? 1.2 : parseFloat(lh) / sizeOf(e); };
  const weightOf = (e) => Number(e.key.split('|')[3]) || 400;
  const bySizeKeepMostUsed = (list) => { const m = new Map(); list.forEach((e) => { const k = sizeOf(e); if (!m.has(k) || m.get(k).chars < e.chars) m.set(k, e); }); return [...m.values()].sort((a, b) => sizeOf(b) - sizeOf(a)); };
  if (headingFamily !== bodyFamily) {
    const display = typeRuns.filter((e) => fam(e) === headingFamily);
    const buttonish = bySizeKeepMostUsed(display.filter((e) => sizeOf(e) <= 18)).sort((a, b) => b.chars - a.chars)[0];
    const heads = bySizeKeepMostUsed(display.filter((e) => sizeOf(e) > 18));
    ['headline-xl', 'headline-lg', 'headline-md', 'headline-sm', 'headline-xs'].forEach((k, i) => { if (heads[i]) typography[k] = toType(heads[i]); });
    if (buttonish) typography['label-button'] = toType(buttonish);
  }
  const bodyRuns = typeRuns.filter((e) => fam(e) === bodyFamily);
  const base = [...bodyRuns].filter((e) => lhOf(e) > 1.1).sort((a, b) => b.chars - a.chars)[0] || [...bodyRuns].sort((a, b) => b.chars - a.chars)[0];
  if (base) {
    typography['body-md'] = toType(base);
    const larger = bySizeKeepMostUsed(bodyRuns.filter((e) => sizeOf(e) > sizeOf(base)));
    const smaller = bySizeKeepMostUsed(bodyRuns.filter((e) => sizeOf(e) < sizeOf(base)));
    if (larger.length) typography['body-lg'] = toType(larger[larger.length - 1]);
    if (smaller.length) typography['body-sm'] = toType(smaller[0]);
    const strong = bodyRuns.filter((e) => sizeOf(e) === sizeOf(base) && weightOf(e) >= 600).sort((a, b) => b.chars - a.chars)[0];
    if (strong) typography['body-md-strong'] = toType(strong);
    const tight = bodyRuns.filter((e) => lhOf(e) <= 1.1).sort((a, b) => b.chars - a.chars)[0];
    if (tight) typography['label-md'] = toType(tight);
  }

  // ---- spacing / layout from measured boxes ----
  const hist = (vals) => { const m = new Map(); vals.forEach((v) => m.set(v, (m.get(v) || 0) + 1)); return [...m].sort((a, b) => b[1] - a[1]); };
  const nodes = [];
  const flat = (n) => { nodes.push(n); (n.children || []).forEach(flat); };
  spec.forEach(flat);
  const vw = Math.max(...spec.map((n) => n.box[2]));
  const fullWidth = nodes.filter((n) => n.box[0] <= 1 && n.box[2] >= vw - 1 && n.style?.padding);
  const pads = fullWidth.map((n) => n.style.padding.split(' ').map(parseFloat));
  const sideMargin = hist(pads.map((p) => (p.length === 4 ? p[3] : p.length >= 2 ? p[1] : p[0])).filter((v) => v >= 16))[0]?.[0];
  const sectionPads = hist(pads.map((p) => p[0]).filter((v) => v >= 48)).filter(([, n]) => n >= 2).slice(0, 3).map(([v]) => v).sort((a, b) => a - b);
  const grids = nodes.filter((n) => n.style?.display === 'grid' && n.style['grid-template-columns']);
  const cols = hist(grids.map((n) => n.style['grid-template-columns'].split(' ').length).filter((c) => c >= 4))[0]?.[0];
  const gutter = hist(grids.map((n) => parseFloat(String(n.style.gap || '').split(' ').pop())).filter((v) => v > 0))[0]?.[0];
  const gaps = hist(nodes.filter((n) => n.style?.display === 'flex' && n.style.gap).map((n) => parseFloat(n.style.gap))).slice(0, 4).map(([v]) => v).sort((a, b) => a - b);
  const spacing = {};
  if (sideMargin) spacing.margin = { value: rem(sideMargin), role: 'Page side margin', origin };
  if (gutter) spacing.gutter = { value: rem(gutter), role: 'Grid column gap', origin };
  if (cols) spacing.columns = { value: cols, role: 'Grid columns', origin };
  ['xs', 'sm', 'md', 'lg'].forEach((k, i) => { if (gaps[i]) spacing[`gap-${k}`] = { value: rem(gaps[i]), role: 'Gap between stacked elements', origin }; });
  ['section-sm', 'section-md', 'section-lg'].forEach((k, i) => { if (sectionPads[i]) spacing[k] = { value: rem(sectionPads[i]), role: 'Vertical section padding', origin }; });

  // ---- radii ----
  const radii = tokens.radii.map((r) => parseFloat(r.value)).filter((v) => !Number.isNaN(v) && String(v) === String(parseFloat(v)));
  const distinct = [...new Set(radii)].sort((a, b) => a - b);
  const rounded = {};
  const rNames = ['sm', 'md', 'lg', 'xl', '2xl'];
  distinct.filter((v) => v < 100).slice(0, 5).forEach((v, i) => { rounded[rNames[i]] = { value: rem(v), origin }; });
  if (distinct.some((v) => v >= 100)) rounded.full = { value: '9999px', origin };

  // ---- components (heuristic; review by hand) ----
  const refColor = (val) => { const c = parseColor(val); if (!c) return val; const hex = toHex(c); const k = Object.keys(colors).find((key) => colors[key].value === hex); return k ? `{colors.${k}}` : hex; };
  const refRadius = (val) => { const k = Object.keys(rounded).find((key) => rounded[key].value === rem(val)); return k ? `{rounded.${k}}` : rem(val); };
  const components = {};
  const findNode = (pred) => nodes.find(pred);
  const btn = primary && findNode((n) => parseColor(n.style?.['background-color'] || '')?.r === primary.c.r && toHex(parseColor(n.style['background-color'])) === primary.hex && n.box[3] >= 28 && n.box[3] <= 64 && n.box[2] < 420);
  if (btn) {
    const host = findNode((n) => (n.children || []).includes(btn)) || btn;
    const inner = findNode((n) => host.children?.includes(n) && n.style?.padding) || btn;
    components['button-primary'] = { backgroundColor: '{colors.primary}', textColor: '{colors.on-primary}', rounded: refRadius(btn.style['border-radius'] || 0), padding: inner.style?.padding ? inner.style.padding.split(' ').map(rem).join(' ') : undefined, height: rem(btn.box[3]), typography: typography['label-button'] ? '{typography.label-button}' : typography['label-md'] ? '{typography.label-md}' : undefined, origin };
  }
  const sec = neutral && findNode((n) => n.style?.['background-color'] && toHex(parseColor(n.style['background-color'])) === neutral.hex && n.box[3] <= 64 && n.box[2] < 200);
  if (sec) components['button-secondary'] = { backgroundColor: '{colors.neutral}', textColor: '{colors.on-surface}', rounded: refRadius(sec.style['border-radius'] || 0), padding: sec.style.padding ? sec.style.padding.split(' ').map(rem).join(' ') : undefined, height: rem(sec.box[3]), origin };
  const input = findNode((n) => n.tag === 'input');
  if (input) components['input-field'] = { backgroundColor: refColor(input.style['background-color'] || '#fff'), textColor: '{colors.on-surface}', rounded: refRadius(input.style['border-radius'] || 0), padding: input.style.padding ? input.style.padding.split(' ').map(rem).join(' ') : undefined, height: rem(input.box[3]), typography: typography['body-sm'] ? '{typography.body-sm}' : undefined, origin };
  for (const c of Object.values(components)) for (const k of Object.keys(c)) if (c[k] === undefined) delete c[k];

  // ---- shadcn theme mapping (light = page default, dark = the site's dark sections) ----
  const g = (v) => ({ value: v, origin: 'generated' }); // explicit "not in source" values
  const light = {
    background: '{colors.surface}', foreground: '{colors.on-surface}',
    card: '{colors.surface}', 'card-foreground': '{colors.on-surface}',
    popover: '{colors.surface}', 'popover-foreground': '{colors.on-surface}',
    primary: '{colors.primary}', 'primary-foreground': '{colors.on-primary}',
    secondary: colors.neutral ? '{colors.neutral}' : g('#f4f4f5'), 'secondary-foreground': '{colors.on-surface}',
    muted: colors.neutral ? '{colors.neutral}' : g('#f4f4f5'), 'muted-foreground': colors['on-surface-muted'] ? '{colors.on-surface-muted}@opaque' : g('#71717a'),
    accent: colors.neutral ? '{colors.neutral}' : g('#f4f4f5'), 'accent-foreground': '{colors.on-surface}',
    destructive: '{colors.error}',
    border: colors.outline ? '{colors.outline}' : g('#e4e4e7'), input: colors.outline ? '{colors.outline}' : g('#e4e4e7'), ring: '{colors.primary}',
    'chart-1': '{colors.primary}', 'chart-2': colors.secondary ? '{colors.secondary}' : g('#2563eb'), 'chart-3': colors.tertiary ? '{colors.tertiary}' : g('#16a34a'), 'chart-4': g('#9333ea'), 'chart-5': g('#ea580c'),
    sidebar: '{colors.surface}', 'sidebar-foreground': '{colors.on-surface}', 'sidebar-primary': '{colors.primary}', 'sidebar-primary-foreground': '{colors.on-primary}',
    'sidebar-accent': colors.neutral ? '{colors.neutral}' : g('#f4f4f5'), 'sidebar-accent-foreground': '{colors.on-surface}', 'sidebar-border': colors.outline ? '{colors.outline}' : g('#e4e4e7'), 'sidebar-ring': '{colors.primary}',
  };
  const darkBg = colors['inverse-surface'] ? '{colors.inverse-surface}' : g('#0a0a0a');
  const darkFg = colors['on-inverse-surface'] ? '{colors.on-inverse-surface}' : g('#fafafa');
  const darkLine = colors['outline-inverse'] ? '{colors.outline-inverse}' : g('rgba(255, 255, 255, 0.1)');
  const dark = {
    background: darkBg, foreground: darkFg, card: darkBg, 'card-foreground': darkFg, popover: darkBg, 'popover-foreground': darkFg,
    primary: '{colors.primary}', 'primary-foreground': '{colors.on-primary}',
    secondary: g('#262626'), 'secondary-foreground': darkFg, muted: g('#262626'), 'muted-foreground': g('#a3a3a3'), accent: g('#262626'), 'accent-foreground': darkFg,
    destructive: '{colors.error}', border: darkLine, input: darkLine, ring: '{colors.primary}',
    'chart-1': '{colors.primary}', 'chart-2': light['chart-2'], 'chart-3': light['chart-3'], 'chart-4': light['chart-4'], 'chart-5': light['chart-5'],
    sidebar: darkBg, 'sidebar-foreground': darkFg, 'sidebar-primary': '{colors.primary}', 'sidebar-primary-foreground': '{colors.on-primary}',
    'sidebar-accent': g('#262626'), 'sidebar-accent-foreground': darkFg, 'sidebar-border': darkLine, 'sidebar-ring': '{colors.primary}',
  };
  const radiusKey = rounded.md ? 'md' : rounded.sm ? 'sm' : null;

  // ---- breakpoints from the site's stylesheets ----
  const bps = new Map();
  try {
    for (const f of await fs.readdir(path.join(ref, 'assets', 'stylesheet'))) {
      const css = await fs.readFile(path.join(ref, 'assets', 'stylesheet', f), 'utf8');
      for (const m of css.matchAll(/@media[^{]*?\((?:max|min)-width:\s*([\d.]+)(px|em|rem)\)/g)) {
        const px = m[2] === 'px' ? +m[1] : +m[1] * 16;
        bps.set(px, (bps.get(px) || 0) + 1);
      }
    }
  } catch { /* no stylesheets saved */ }

  const sourceVars = Object.entries(tokens.cssVariables || {}).filter(([, v]) => parseColor(v)).slice(0, 40).map(([k, v]) => `${k}: ${v}`);
  return {
    $schema: 'rea-lab/design-tokens@1',
    name: meta.mode === 'exact' ? (tokens.title || name) : `${name} (layout system)`,
    description: `Design system reverse-engineered from ${meta.url || name}. Draft: review roles, names and notes before relying on it.`,
    source: { url: meta.url, capturedAt: meta.capturedAt, mode: meta.mode || 'template' },
    colors, typography, rounded, spacing, components,
    theme: { light, dark, radius: radiusKey ? `{rounded.${radiusKey}}` : g('0.5rem'), fonts: { sans: bodyFamily, heading: headingFamily } },
    layout: {
      rootFontSize: `${rootPx}px`,
      rootFontSizeByViewport: meta.rootFontSize || null,
      breakpoints: [...bps].filter(([, n]) => n >= 2).map(([px]) => px).sort((a, b) => a - b),
    },
    notes: {
      overview: '', colors: '', typography: '', layout: '', elevation: '', shapes: '', components: '',
      dos: [], donts: [],
      sourceVariables: sourceVars,
    },
  };
}

// ======================= Render =======================
const resolve = (val, t, depth = 0) => {
  if (val && typeof val === 'object' && 'value' in val) return resolve(val.value, t, depth);
  if (typeof val !== 'string') return val;
  const opaque = val.endsWith('@opaque');
  const m = val.replace('@opaque', '').match(/^\{([\w-]+)\.([\w-]+)\}$/);
  if (!m || depth > 5) return val;
  const node = t[m[1]]?.[m[2]];
  let out = resolve(node && typeof node === 'object' && 'value' in node ? node.value : node, t, depth + 1);
  if (opaque && typeof out === 'string') { // flatten alpha text onto the page background for shadcn's opaque foregrounds
    const fg = parseColor(out), bg = parseColor(resolve('{colors.surface}', t));
    if (fg && bg && fg.a < 1) out = toHex(over(fg, bg));
  }
  return out;
};
const isGenerated = (v, t) => (v && typeof v === 'object' && v.origin === 'generated')
  || (typeof v === 'string' && /^\{colors\.([\w-]+)\}/.test(v) && t.colors[v.match(/^\{colors\.([\w-]+)\}/)[1]]?.origin === 'generated');

const yq = (v) => (typeof v === 'number' ? String(v) : JSON.stringify(String(v)));
function frontMatter(t) {
  const L = ['---', 'version: alpha', `name: ${yq(t.name)}`, `description: ${yq(t.description)}`];
  const section = (key, entries) => { if (!entries.length) return; L.push(`${key}:`); entries.forEach((e) => L.push(e)); };
  const surf = parseColor(t.colors.surface?.value || '#fff');
  section('colors', Object.entries(t.colors).map(([k, v]) => {
    const c = parseColor(v.value);
    const base = /inverse/.test(k) && t.colors['inverse-surface'] ? parseColor(t.colors['inverse-surface'].value) : surf;
    return '  ' + k + ': ' + yq(c && c.a < 1 ? toHex(over(c, base)) : v.value);
  }));
  section('typography', Object.entries(t.typography).flatMap(([k, v]) => [`  ${k}:`, ...['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'].filter((p) => v[p] !== undefined).map((p) => `    ${p}: ${yq(v[p])}`)]));
  section('rounded', Object.entries(t.rounded).map(([k, v]) => `  ${k}: ${yq(v.value)}`));
  section('spacing', Object.entries(t.spacing).map(([k, v]) => `  ${k}: ${yq(v.value)}`));
  section('components', Object.entries(t.components).flatMap(([k, v]) => [`  ${k}:`, ...['backgroundColor', 'textColor', 'typography', 'rounded', 'padding', 'size', 'height', 'width'].filter((p) => v[p] !== undefined).map((p) => `    ${p}: ${yq(v[p])}`)]));
  L.push('---');
  return L.join('\n');
}

function designMd(t) {
  const n = t.notes || {};
  const flag = (o) => (o === 'generated' ? ' _(not in source, generated)_' : '');
  const c = (k) => parseColor(resolve(`{colors.${k}}`, t));
  const out = [frontMatter(t), '', `# ${t.name}`, ''];
  const typeFamilies = [...new Set(Object.values(t.typography).map((v) => v.fontFamily.split(',')[0].trim()))];
  out.push('## Overview', '', t.description, '',
    `Source: ${t.source.url} (captured ${String(t.source.capturedAt || '').slice(0, 10)}, mode \`${t.source.mode}\`). Type families: ${typeFamilies.join(', ') || 'n/a'}. ${Object.keys(t.colors).length} colour tokens, ${Object.keys(t.typography).length} type levels.`, '');
  if (n.overview) out.push(n.overview, '');

  out.push('## Colors', '');
  for (const [k, v] of Object.entries(t.colors)) {
    const a = parseColor(v.value)?.a;
    const alphaNote = a < 1 ? ' (' + Math.round(a * 100) + '% alpha; flattened onto its surface in the token list)' : '';
    out.push('- **' + k + '** `' + v.value + '`' + alphaNote + ': ' + (v.role || '') + flag(v.origin));
  }
  out.push('');
  if (n.colors) out.push(n.colors, '');
  if (n.sourceVariables?.length) out.push('Colour variables declared by the source site (for traceability):', '', ...n.sourceVariables.map((s) => `- \`${s}\``), '');

  out.push('## Typography', '');
  for (const [k, v] of Object.entries(t.typography)) {
    out.push(`- **${k}**: ${v.fontFamily.split(',')[0]} ${v.fontSize} / ${v.lineHeight}, weight ${v.fontWeight}${v.letterSpacing ? `, tracking ${v.letterSpacing}` : ''}${v.textTransform ? `, ${v.textTransform}` : ''}`);
  }
  out.push('');
  if (n.typography) out.push(n.typography, '');

  out.push('## Layout', '');
  for (const [k, v] of Object.entries(t.spacing)) out.push(`- **${k}** \`${v.value}\`: ${v.role || ''}`);
  out.push(`- Root font size ${t.layout.rootFontSize}${t.layout.rootFontSizeByViewport ? ` (by viewport: ${Object.entries(t.layout.rootFontSizeByViewport).map(([a, b]) => `${a} ${b}`).join(', ')}; every rem scales with it)` : ''}.`);
  if (t.layout.breakpoints?.length) out.push(`- Breakpoints used by the source: ${t.layout.breakpoints.map((b) => `${b}px`).join(', ')}.`);
  out.push('');
  if (n.layout) out.push(n.layout, '');

  out.push('## Elevation & Depth', '', n.elevation || 'No box shadows in the source. Depth comes from tonal contrast between light and dark sections, overlays and layering, not elevation.', '');

  out.push('## Shapes', '');
  for (const [k, v] of Object.entries(t.rounded)) out.push(`- **${k}** \`${v.value}\``);
  out.push('');
  if (n.shapes) out.push(n.shapes, '');

  out.push('## Components', '');
  for (const [k, v] of Object.entries(t.components)) {
    const props = Object.entries(v).filter(([p]) => p !== 'origin').map(([p, val]) => `${p} \`${val}\``).join(', ');
    out.push(`- **${k}**: ${props}`);
  }
  out.push('');
  if (n.components) out.push(n.components, '');

  out.push("## Do's and Don'ts", '');
  const dos = [...(n.dos || [])], donts = [...(n.donts || [])];
  if (c('primary') && c('on-primary')) dos.push(`Do pair **primary** with **on-primary** (contrast ${contrast(c('primary'), c('on-primary'))}:1).`);
  if (c('primary') && c('surface')) {
    const r = contrast(c('primary'), c('surface'));
    (r < 3 ? donts : dos).push(`${r < 3 ? "Don't" : 'Do'} use **primary** as text or icons on **surface** (contrast ${r}:1${r < 3 ? ', fails WCAG' : ''}).`);
  }
  if (c('on-surface') && c('surface')) dos.push(`Do keep body text in **on-surface** on **surface** (contrast ${contrast(c('on-surface'), c('surface'))}:1).`);
  dos.forEach((d) => out.push(`- ${d}`));
  donts.forEach((d) => out.push(`- ${d}`));
  out.push('');
  return out.join('\n');
}

function brandKeys(t) {
  const used = new Set((JSON.stringify(t.theme).match(/\{colors\.[\w-]+\}/g) || []).map((r) => r.slice(8, -1)));
  return Object.keys(t.colors).filter((k) => !used.has(k));
}

function globalsCss(t) {
  const val = (v) => resolve(v, t);
  const css = (v) => { const r = val(v); const p = parseColor(r); return p ? oklchCss(p) : r; };
  const line = (k, v) => `  --${k}: ${css(v)};${isGenerated(v, t) ? ' /* not in source */' : ''}`;
  const radius = val(t.theme.radius);
  const keys = Object.keys(t.theme.light);
  const fonts = t.theme.fonts || {};
  return [
    `/* ${t.name}: shadcn/ui theme generated from design-tokens.json (rea-lab). Do not edit by hand; edit the tokens and re-run npm run design. */`,
    '@import "tailwindcss";',
    '@import "tw-animate-css";',
    '',
    '@custom-variant dark (&:is(.dark *));',
    '',
    '@theme inline {',
    ...keys.map((k) => `  --color-${k}: var(--${k});`),
    ...brandKeys(t).map((k) => `  --color-brand-${k}: var(--brand-${k});`),
    `  --font-sans: ${fonts.sans || 'ui-sans-serif, system-ui, sans-serif'};`,
    `  --font-heading: ${fonts.heading || fonts.sans || 'ui-sans-serif, system-ui, sans-serif'};`,
    '  --radius-sm: calc(var(--radius) * 0.6);',
    '  --radius-md: calc(var(--radius) * 0.8);',
    '  --radius-lg: var(--radius);',
    '  --radius-xl: calc(var(--radius) * 1.4);',
    '  --radius-2xl: calc(var(--radius) * 1.8);',
    '  --radius-3xl: calc(var(--radius) * 2.2);',
    '  --radius-4xl: calc(var(--radius) * 2.6);',
    '}',
    '',
    ':root {',
    `  --radius: ${radius};${isGenerated(t.theme.radius, t) ? ' /* not in source */' : ''}`,
    ...keys.map((k) => line(k, t.theme.light[k])),
    '  /* brand colours from the source, beyond the shadcn roles */',
    ...brandKeys(t).map((k) => `  --brand-${k}: ${oklchCss(parseColor(t.colors[k].value))};${t.colors[k].origin === 'generated' ? ' /* not in source */' : ''}`),
    '}',
    '',
    '.dark {',
    ...keys.map((k) => line(k, t.theme.dark[k])),
    '}',
    '',
    '@layer base {',
    '  * {',
    '    @apply border-border outline-ring/50;',
    '  }',
    '  body {',
    '    @apply bg-background text-foreground;',
    '  }',
    '}',
    '',
  ].join('\n');
}

function tokensCss(t) {
  const L = [`/* ${t.name}: design tokens for the clone (generated from design-tokens.json; edit the JSON, not this file) */`, ':root {'];
  for (const [k, v] of Object.entries(t.colors)) L.push(`  --color-${k}: ${v.value};`);
  for (const [k, v] of Object.entries(t.typography)) {
    L.push(`  --font-${k}: ${v.fontFamily};`, `  --text-${k}: ${v.fontSize};`, `  --leading-${k}: ${v.lineHeight};`, `  --weight-${k}: ${v.fontWeight};`);
    if (v.letterSpacing) L.push(`  --tracking-${k}: ${v.letterSpacing};`);
  }
  for (const [k, v] of Object.entries(t.rounded)) L.push(`  --radius-${k}: ${v.value};`);
  for (const [k, v] of Object.entries(t.spacing)) L.push(`  --space-${k}: ${v.value};`);
  L.push('}', '');
  return L.join('\n');
}

// ======================= Main =======================
let tokens = await readJson(canonical, null);
if (!tokens || flags.redraft) {
  const d = await draft();
  const target = tokens ? path.join(root, 'design-tokens.draft.json') : canonical;
  await fs.writeFile(target, JSON.stringify(d, null, 2));
  console.log(`draft -> ${path.relative(process.cwd(), target)}${tokens ? ' (canonical file left untouched; merge by hand)' : ''}`);
  if (!tokens) tokens = d;
}
await fs.writeFile(path.join(root, 'DESIGN.md'), designMd(tokens));
await fs.writeFile(path.join(root, 'globals.css'), globalsCss(tokens));
await fs.mkdir(path.join(root, 'clone'), { recursive: true });
await fs.writeFile(path.join(root, 'clone', 'tokens.css'), tokensCss(tokens));
console.log(`wrote DESIGN.md, globals.css, clone/tokens.css for ${name}`);

const lint = spawnSync(process.execPath, [fileURLToPath(import.meta.resolve('@google/design.md')), 'lint', path.join(root, 'DESIGN.md')], { encoding: 'utf8' });
console.log('--- @google/design.md lint ---');
console.log((lint.stdout || '') + (lint.stderr || ''));
