// Exact mode: start the clone from the reference mirror instead of an empty folder. The mirror is the rendered page
// with every script and inline handler removed and its stylesheets and media saved locally, so the seeded clone has
// the site's own markup, text, styles and media at the right paths. What it lacks is behaviour: write that in
// clone/script.js (your own code, using the parameters you read from the site), then verify with the usual scores.
//
// Template clones are never seeded: their text and media must be placeholders.
//
// usage: node scripts/seed.mjs <name> [--force]   (--force overwrites an existing clone/)
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from './lib.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) {
  console.error('usage: npm run seed -- <name> [--force]');
  process.exit(1);
}
const root = path.resolve('sites', name);
const ref = path.join(root, 'reference');
const meta = JSON.parse(await fs.readFile(path.join(ref, 'meta.json'), 'utf8'));
if (meta.mode !== 'exact' || !meta.permission) {
  console.error('seed is for exact mode only (capture with --mode exact --permission "<owner>"); template clones use placeholder content');
  process.exit(1);
}
const mirror = path.join(ref, 'mirror');
const clone = path.join(root, 'clone');
const exists = await fs.stat(path.join(clone, 'index.html')).then(() => true, () => false);
if (exists && !flags.force) {
  console.error(`${path.relative(process.cwd(), clone)} already has an index.html; add --force to overwrite it`);
  process.exit(1);
}
await fs.mkdir(path.join(clone, 'css'), { recursive: true });

// Assets the mirror points at (../assets/... from the page, ../../assets/... from mirror/css) are copied into
// clone/assets and the paths rewritten, so clone/ is self-contained.
const copied = new Set();
const pull = async (rel) => {
  const clean = decodeURIComponent(rel.split(/[?#]/)[0]);
  if (copied.has(clean)) return;
  copied.add(clean);
  const from = path.join(ref, 'assets', clean);
  const to = path.join(clone, 'assets', clean);
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.copyFile(from, to).catch(() => console.warn(`WARNING missing asset ${clean}`));
};
const rewrite = async (text, prefix, replacement) => {
  const re = new RegExp(prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + 'assets/([^"\')\\s]+)', 'g');
  for (const m of text.matchAll(re)) await pull(m[1]);
  return text.replace(re, (all, rel) => `${replacement}assets/${rel}`);
};

for (const file of await fs.readdir(path.join(mirror, 'css')).catch(() => [])) {
  const css = await fs.readFile(path.join(mirror, 'css', file), 'utf8');
  await fs.writeFile(path.join(clone, 'css', file), await rewrite(css, '../../', '../'));
}
let html = await fs.readFile(path.join(mirror, 'index.html'), 'utf8');
html = await rewrite(html, '../', '');
// the clone's own behaviour script, loaded once the DOM is parsed
if (!/<script[^>]+src="script\.js"/.test(html)) html = html.replace(/<\/body>/i, '<script src="script.js" defer></script>\n</body>');
await fs.writeFile(path.join(clone, 'index.html'), html);

const scriptFile = path.join(clone, 'script.js');
if (!(await fs.stat(scriptFile).then(() => true, () => false))) {
  await fs.writeFile(scriptFile, `// ${meta.url} - clone behaviour (your own code). The markup, styles and media come from the mirror.\n// Rebuild every interaction from the reference's parameters; verify with npm run score -- ${name}.\n`);
}
console.log(`seeded ${path.relative(process.cwd(), clone)} from the mirror: index.html, ${(await fs.readdir(path.join(clone, 'css'))).length} stylesheet(s), ${copied.size} asset(s)`);
console.log('next: write clone/script.js (behaviour), then npm run score -- ' + name);
