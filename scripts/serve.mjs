// Open the clone (or its Next.js app) in a browser: served on a free port until Ctrl+C, compressed like a real host.
//
// usage: trueclone serve <name> [--port 5173]          the HTML clone (sites/<name>/clone)
//        trueclone serve <name> --next [--port 3100]   the built Next.js app (npx trueclone next <name> --build first)
import path from 'node:path';
import net from 'node:net';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { parseArgs, serve, siteDir } from './lib.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) { console.error('usage: trueclone serve <name> [--next] [--port <n>]'); process.exit(1); }
const root = siteDir(name);
const freeOn = (p, host) => new Promise((resolve) => { const t = net.createServer().once('error', () => resolve(false)).once('listening', () => t.close(() => resolve(true))).listen(p, host); });
const freePort = async (start) => { for (let p = start; p < start + 50; p++) if ((await freeOn(p, '127.0.0.1')) && (await freeOn(p, '0.0.0.0'))) return p; throw new Error('no free port'); };

if (flags.next) {
  const dir = path.join(root, 'next');
  if (!(await fs.stat(path.join(dir, '.next')).catch(() => null))) { console.error(`no build in ${path.relative(process.cwd(), dir)}: run npx trueclone next ${name} --build first`); process.exit(1); }
  const port = await freePort(Number(flags.port || 3100));
  console.log(`Next.js app: http://localhost:${port}/  (Ctrl+C to stop)`);
  const child = process.platform === 'win32'
    ? spawn(`npx next start -p ${port}`, { cwd: dir, stdio: 'inherit', shell: true })
    : spawn('npx', ['next', 'start', '-p', String(port)], { cwd: dir, stdio: 'inherit' });
  child.on('close', (code) => process.exit(code ?? 0));
} else {
  const port = await freePort(Number(flags.port || 5173));
  await serve(path.join(root, 'clone'), port);
  console.log(`clone: http://localhost:${port}/  (Ctrl+C to stop)`);
}
