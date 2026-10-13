// One look at one place on the page: what every check saw there, so a gap is read from the tool's own data instead of
// re-measured by hand. Given a page y (or a section label) at one width, it prints the layout section's score, the
// scroll states near it, the detail probes that differ, the hover rows that differ, and writes a side-by-side crop
// (reference | clone | diff, masked) around that y.
// usage: node scripts/explain.mjs <name> <y | "section label"> [--viewport desktop] [--range 800]
import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG, parseArgs, crop } from './lib.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name, where] = pos;
if (!name || where === undefined) {
  console.error('usage: trueclone explain <name> <y | "section label"> [--viewport desktop] [--range 800]');
  process.exit(1);
}
const vp = flags.viewport || 'desktop';
const range = Number(flags.range || 800);
const root = path.resolve('sites', name);
const read = async (rel) => fs.readFile(path.join(root, rel), 'utf8').then(JSON.parse).catch(() => null);

const layout = await read('compare/report.mask.json');
const lv = layout?.viewports.find((v) => v.viewport === vp);
if (!lv) {
  console.error(`no layout score for ${vp} yet: run trueclone score ${name} first`);
  process.exit(1);
}
const section = /^\d+$/.test(where)
  ? lv.sections.find((s) => Number(where) >= s.y && Number(where) < s.y + s.height) || null
  : lv.sections.find((s) => String(s.label).toLowerCase().includes(where.toLowerCase())) || null;
const y = /^\d+$/.test(where) ? Number(where) : section?.y;
if (y === undefined) {
  console.error(`no section labelled like "${where}" at ${vp}; sections: ${lv.sections.map((s) => `${s.y} ${String(s.label).slice(0, 24)}`).join(' | ')}`);
  process.exit(1);
}
const lo = Math.max(0, y - range / 2), hi = y + range / 2;
const within = (v) => v >= lo && v <= hi;

console.log(`${name} @ ${vp} y ${y} (±${range / 2}px)`);
console.log(`\nLayout: page ${lv.heightRef}px vs clone ${lv.heightClone}px (${lv.match}% overall)`);
if (section) console.log(`  section "${String(section.label).slice(0, 60)}" y ${section.y} h ${section.height}: ${section.match}%`);
for (const s of lv.sections.filter((s) => s !== section && (within(s.y) || within(s.y + s.height)))) console.log(`  nearby "${String(s.label).slice(0, 40)}" y ${s.y}: ${s.match}%`);

const states = await read('compare/states/report.mask.json');
const sv = states?.viewports?.find((v) => v.viewport === vp);
const steps = (sv?.steps || sv?.states || []).filter((st) => within(st.scrollY ?? st.y ?? st.scroll ?? -1));
if (steps.length) console.log(`\nScroll states scrolled to here: ${steps.map((st) => `${st.scrollY ?? st.y ?? st.scroll}px ${st.match ?? st.score}%`).join(', ')}`);

const detail = await read('compare/detail.json');
const dv = detail?.viewports?.find((v) => v.viewport === vp);
if (dv) {
  const here = dv.issues.filter((it) => within(it.y));
  const unstable = (dv.unstableProbes || []).filter((it) => within(it.y));
  console.log(`\nDetail: ${here.length} differing probe(s) here${unstable.length ? `, ${unstable.length} unstable on the reference (not scored)` : ''}`);
  const groups = new Map();
  for (const it of here) { const k = `${it.ref} -> ${it.clone}: ${it.props.join('; ')}`; const g = groups.get(k) || { ...it, n: 0 }; g.n++; groups.set(k, g); }
  [...groups.values()].sort((a, b) => b.n - a.n).slice(0, 12).forEach((g) => console.log(`  x${String(g.n).padEnd(3)} y${String(g.y).padEnd(6)} ${g.ref} -> ${g.clone}: ${g.props.join('; ')}`));
}

const hovers = await read(`compare/hovers.${vp}.json`);
if (hovers) {
  const rows = hovers.rows.filter((r) => within(r.y) && !['static', 'ok', 'unstable'].includes(r.status));
  if (rows.length) { console.log(`\nHovers differing here:`); rows.slice(0, 10).forEach((r) => console.log(`  y${r.y} ${r.ref}: reference changes ${r.refChanges}, clone ${r.cloneChanges} (${r.status})`)); }
}

// the crop: reference | clone | diff, masked, half size
try {
  const imgs = await Promise.all([`reference/${vp}.mask.png`, `compare/${vp}.mask.clone.png`, `compare/${vp}.mask.diff.png`].map(async (f) => PNG.sync.read(await fs.readFile(path.join(root, f)))));
  const top = Math.max(0, Math.round(lo)), h = Math.min(Math.round(hi) - top, Math.min(...imgs.map((i) => i.height)) - top);
  const parts = imgs.map((img) => crop(img, top, h));
  const scale = 0.5, w = Math.round(parts[0].width * scale), hh = Math.round(h * scale);
  const out = new PNG({ width: w * 3 + 20, height: hh });
  out.data.fill(255);
  parts.forEach((p, k) => {
    for (let yy = 0; yy < hh; yy++) for (let x = 0; x < w; x++) {
      const sx = Math.min(p.width - 1, Math.round(x / scale)), sy = Math.min(p.height - 1, Math.round(yy / scale));
      const si = (sy * p.width + sx) * 4, di = (yy * out.width + x + k * (w + 10)) * 4;
      out.data[di] = p.data[si]; out.data[di + 1] = p.data[si + 1]; out.data[di + 2] = p.data[si + 2]; out.data[di + 3] = 255;
    }
  });
  const file = path.join(root, 'compare', 'explain', `${vp}-${y}.png`);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, PNG.sync.write(out));
  console.log(`\nCrop (reference | clone | diff, y ${top}-${top + h}): ${path.relative(process.cwd(), file)}`);
} catch (e) {
  console.log(`\n(no crop: ${e.message.split('\n')[0]})`);
}
console.log(`\nNext: npx trueclone rules ${name} "<selector>" --viewport ${vp} (the reference's CSS) and --clone (the clone's), or npx trueclone score ${name} --only layout,detail --viewport ${vp} after a fix.`);
