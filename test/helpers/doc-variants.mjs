// The doc-site fixture (tools/fixtures/doc-site) as a faithful clone, and as clones that break one rule of change each.
// Every variant is the fixture's own files with one edit, served from a temp folder.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'tools', 'fixtures', 'doc-site');

// name -> { file, from, to }: the one change that breaks the rule (the faithful copy has none)
export const VARIANTS = {
  faithful: null,
  'marquee-stopped': { file: 'site.css', from: 'animation: ticker 12s linear infinite;', to: '' },
  'marquee-reversed': { file: 'site.css', from: 'animation: ticker 12s linear infinite;', to: 'animation: ticker 12s linear infinite reverse;' },
  'marquee-2x': { file: 'site.css', from: 'animation: ticker 12s linear infinite;', to: 'animation: ticker 6s linear infinite;' },
  'carousel-still': { file: 'site.js', from: 'let timer = setInterval(() => show(index + 1), 3000);', to: 'let timer = 0;' },
  'carousel-slow': { file: 'site.js', from: 'let timer = setInterval(() => show(index + 1), 3000);', to: 'let timer = setInterval(() => show(index + 1), 4500);' },
  'order-fixed': { file: 'site.js', from: 'const j = (Math.random() * (i + 1)) | 0;', to: 'const j = i;' },
  // the marquee keeps running for a visitor who asked for reduced motion (the site stops it)
  'reduce-ignored': { file: 'site.css', from: '@media (prefers-reduced-motion: reduce) {\n  .track { animation: none; }', to: '@media (prefers-reduced-motion: reduce) {' },
  'order-other-rule': { file: 'site.js', from: 'for (let i = items.length - 1; i > 0; i--) {\n  const j = (Math.random() * (i + 1)) | 0;\n  [items[i], items[j]] = [items[j], items[i]];\n}', to: 'items.sort(() => Math.random() - 0.5);' },
};

export async function variantDir(name) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `tc-doc-${name}-`));
  await fs.cp(FIXTURE, dir, { recursive: true });
  const v = VARIANTS[name];
  if (v) {
    const f = path.join(dir, v.file);
    const text = (await fs.readFile(f, 'utf8')).replace(/\r\n/g, '\n');
    if (!text.includes(v.from)) throw new Error(`variant ${name}: the fixture no longer has the line it edits`);
    await fs.writeFile(f, text.replace(v.from, v.to));
  }
  return dir;
}
