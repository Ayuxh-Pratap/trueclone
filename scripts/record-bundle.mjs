// Complete an own bundle with every captured route and every file the capture saved (bundle-complete.mjs), without
// capturing again: the reference (its shots, reads and calibration) is left as it is, only reference/bundle/ grows.
// status names this step when the bundle lacks a captured route's page or a file the capture saved; the seed then
// builds the clone again from the completed bundle. Exit 0 when the bundle covers everything, 1 when something is
// still missing (named, with why).
//
// usage: trueclone record-bundle <name>
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs, siteDir } from './lib.mjs';
import { completeBundle } from './bundle-complete.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) { console.error('usage: trueclone record-bundle <name>'); process.exit(1); }
const root = siteDir(name);
const meta = JSON.parse(await fs.readFile(path.join(root, 'reference', 'meta.json'), 'utf8').catch(() => 'null'));
if (!meta) { console.error(`no capture for ${name}`); process.exit(1); }
if (!meta.bundle) { console.error(`${name} was not captured with its own bundle (exact mode with --bundle, or a canvas app): there is no bundle to complete`); process.exit(1); }
const t0 = Date.now();
console.log(`record-bundle ${name}: ${(meta.routes || []).filter((r) => r.slug).length + 1} captured page(s), loaded once more at desktop and recorded; then the files the capture saved that the bundle lacks, fetched whole`);
const r = await completeBundle(root, meta, { cdp: Boolean(flags.cdp) });
const { coverage } = r;
console.log(`record-bundle: ${r.routes - r.routeFailures.length} of ${r.routes} page(s) recorded, ${r.fetched} of ${r.tried} missing file(s) fetched whole, in ${Math.round((Date.now() - t0) / 1000)}s`);
if (coverage.routes.length) console.log(`still without a page in the bundle: ${coverage.routes.map((x) => x.path).join(', ')}${r.routeFailures.length ? ` (${r.routeFailures.map((f) => `${f.path}: ${f.error}`).join('; ')})` : ''}`);
if (coverage.assets.length) console.log(`still missing from the bundle: ${coverage.assets.length} file(s) the capture saved: ${coverage.assets.slice(0, 8).join(', ')}${coverage.assets.length > 8 ? '…' : ''} (reference/bundle/manifest.json says why)`);
if (!coverage.routes.length && !coverage.assets.length) console.log('the bundle has every captured page and every file the capture saved. next: npx trueclone status ' + name);
process.exit(coverage.routes.length || coverage.assets.length ? 1 : 0);
