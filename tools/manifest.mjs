// Packaging only (npm prepack / postpack): scripts/MANIFEST.json, the digest of every file of the instrument as
// published. An installed copy whose scripts no longer match it was edited (identity.mjs envIdentity): status stops
// (Blocked) and nothing measured with it counts. A development checkout has no manifest and is not checked.
// usage: node tools/manifest.mjs [--remove]
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(ROOT, 'scripts', 'MANIFEST.json');
if (process.argv.includes('--remove')) { await fs.rm(out, { force: true }); process.exit(0); }
const files = {};
for (const f of (await fs.readdir(path.join(ROOT, 'scripts'))).filter((x) => x.endsWith('.mjs')).sort()) files[`scripts/${f}`] = crypto.createHash('sha1').update(await fs.readFile(path.join(ROOT, 'scripts', f))).digest('hex');
files['bin/trueclone.mjs'] = crypto.createHash('sha1').update(await fs.readFile(path.join(ROOT, 'bin', 'trueclone.mjs'))).digest('hex');
const { version } = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8'));
await fs.writeFile(out, `${JSON.stringify({ version, files }, null, 1)}\n`);
console.log(`scripts/MANIFEST.json: ${Object.keys(files).length} files`);
