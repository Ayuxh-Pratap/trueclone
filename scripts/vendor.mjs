// The site's libraries at the site's versions, into clone/patches/ (loaded before script.js, in order), so the clone
// runs the same GSAP, Lenis, three.js or Swiper the original runs. The versions come from the capture: the motion
// inventory (a bundled GSAP reports its version, three.js its revision) and the URLs of the scripts that ran. Only
// what was found is vendored; a library whose version the capture cannot tell is listed, never guessed.
//
// usage: trueclone vendor <name> [--dry]
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { parseArgs, siteDir } from './lib.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) { console.error('usage: trueclone vendor <name> [--dry]'); process.exit(1); }
const root = siteDir(name);
const read = (p, d) => fs.readFile(path.join(root, p), 'utf8').then(JSON.parse).catch(() => d);
const motion = await read('reference/motion.desktop.json', { libs: {} });
const scripts = (await read('reference/scripts/scripts.json', { scripts: [] })).scripts || [];
const libs = motion.libs || {};
const urls = scripts.map((s) => String(s.url || ''));
const fromUrl = (re) => { for (const u of urls) { const m = re.exec(u); if (m) return m[1]; } return null; };
const V = /(\d+\.\d+\.\d+)/.source;

const want = [];
// GSAP: the core and every plugin the site registered (all in the "gsap" package since 3.13)
const gsapV = libs.gsap || fromUrl(new RegExp(`gsap[@/-]v?${V}`));
if (gsapV) {
  const plugins = ['ScrollTrigger', 'SplitText', 'CustomEase'].filter((p) => libs[p]);
  for (const s of scripts) for (const p of ['Flip', 'MotionPathPlugin', 'DrawSVGPlugin', 'ScrollToPlugin', 'Observer', 'Draggable', 'InertiaPlugin', 'MorphSVGPlugin', 'ScrambleTextPlugin', 'TextPlugin']) if (new RegExp(`\\b${p}\\b`).test(`${s.url} ${s.file}`) && !plugins.includes(p)) plugins.push(p);
  want.push({ pkg: 'gsap', version: gsapV, files: ['dist/gsap.min.js', ...plugins.map((p) => `dist/${p}.min.js`)] });
}
const lenisV = fromUrl(new RegExp(`lenis[@/-]v?${V}`));
if (lenisV) want.push({ pkg: 'lenis', version: lenisV, files: ['dist/lenis.min.js'], css: 'dist/lenis.css' });
else if (libs.Lenis) console.log('Lenis: used, but its version is not in any script URL (bundled): pick the version from reference/scripts/ (search "lenis" or "version") and vendor it by hand, or write the smooth scroll in script.js');
const threeRev = String(libs.three || '').match(/\d+/)?.[0];
if (threeRev) want.push({ pkg: 'three', version: `0.${threeRev}.0`, files: Number(threeRev) <= 160 ? ['build/three.min.js'] : ['build/three.module.min.js'], module: Number(threeRev) > 160 });
const swiperV = fromUrl(new RegExp(`swiper[@/-]v?${V}`));
if (swiperV || libs.Swiper) {
  if (swiperV) want.push({ pkg: 'swiper', version: swiperV, files: ['swiper-bundle.min.js'], css: 'swiper-bundle.min.css' });
  else console.log('Swiper: used, but its version is not in any script URL: vendor it by hand at the site\'s version');
}
if (!want.length) { console.log('nothing to vendor: no library with a known version in the capture (reference/motion.desktop.json, reference/scripts/)'); process.exit(0); }

const patches = path.join(root, 'clone', 'patches');
await fs.mkdir(patches, { recursive: true });
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'tc-vendor-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
let n = 0;
const written = [];
try {
  for (const w of want) {
    console.log(`${w.pkg}@${w.version}: ${w.files.join(', ')}${w.css ? ` + ${w.css}` : ''}`);
    if (flags.dry) continue;
    const dir = path.join(tmp, w.pkg);
    await fs.mkdir(dir, { recursive: true });
    // npm is a .cmd on Windows (needs a shell): one quoted command line there, so Node does not warn (DEP0190)
    const packed = process.platform === 'win32'
      ? spawnSync(`npm pack ${w.pkg}@${w.version} --pack-destination "${dir}" --silent`, { encoding: 'utf8', shell: true })
      : spawnSync(npm, ['pack', `${w.pkg}@${w.version}`, '--pack-destination', dir, '--silent'], { encoding: 'utf8' });
    const tgz = (await fs.readdir(dir)).find((f) => f.endsWith('.tgz'));
    if (packed.status !== 0 || !tgz) { console.warn(`  WARNING ${w.pkg}@${w.version} not fetched: ${(packed.stderr || '').split('\n')[0]}`); continue; }
    const untar = spawnSync('tar', ['-xzf', tgz], { cwd: dir, encoding: 'utf8' });
    if (untar.status !== 0) { console.warn(`  WARNING ${w.pkg}: could not unpack (${untar.stderr})`); continue; }
    for (const f of w.files) {
      const src = path.join(dir, 'package', f);
      const base = `0${n++}`.slice(-2) + `-vendor-${w.pkg}-${path.basename(f)}`;
      if (!(await fs.stat(src).catch(() => null))) { console.warn(`  WARNING ${w.pkg}@${w.version} has no ${f}`); continue; }
      if (w.module) {
        // an ES module build: kept as a module and exposed as the global the site's code expected (window.THREE)
        await fs.copyFile(src, path.join(patches, `vendor-${w.pkg}.module.js`));
        await fs.writeFile(path.join(patches, `body-${base.replace(/\.js$/, '')}.html`), `<script type="module">import * as lib from './patches/vendor-${w.pkg}.module.js'; window.THREE = lib;</script>\n`);
        written.push(`body-${base.replace(/\.js$/, '')}.html (+ vendor-${w.pkg}.module.js)`);
      } else {
        await fs.copyFile(src, path.join(patches, base));
        written.push(base);
      }
    }
    if (w.css && (await fs.stat(path.join(dir, 'package', w.css)).catch(() => null))) {
      const base = `0${n++}`.slice(-2) + `-vendor-${w.pkg}-${path.basename(w.css)}`;
      await fs.copyFile(path.join(dir, 'package', w.css), path.join(patches, base));
      written.push(base);
    }
  }
} finally {
  await fs.rm(tmp, { recursive: true, force: true });
}
if (!flags.dry) console.log(`clone/patches/: ${written.join(', ')}\nnext: npx trueclone seed ${name} --patches (applies them in a second)`);
