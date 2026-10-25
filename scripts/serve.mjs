// Open the HTML clone in a browser: served on a free port until Ctrl+C, compressed like a real host.
// (A Next.js conversion is a Next.js project of its own: `npm run dev` or `npm run build && npm start` in
// sites/<name>/nextjs/.)
//
// usage: trueclone serve <name> [--port 5173]          the HTML clone (sites/<name>/clone)
import path from 'node:path';
import net from 'node:net';
import { parseArgs, serve, siteDir } from './lib.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) { console.error('usage: trueclone serve <name> [--port <n>]'); process.exit(1); }
if (flags.next) { console.error(`serve --next is retired with the old app generator. A Next.js conversion (trueclone convert ${name}) is a Next.js project: run npm run dev in sites/${name}/nextjs/.`); process.exit(1); }
const root = siteDir(name);
const freeOn = (p, host) => new Promise((resolve) => { const t = net.createServer().once('error', () => resolve(false)).once('listening', () => t.close(() => resolve(true))).listen(p, host); });
const freePort = async (start) => { for (let p = start; p < start + 50; p++) if ((await freeOn(p, '127.0.0.1')) && (await freeOn(p, '0.0.0.0'))) return p; throw new Error('no free port'); };

const port = await freePort(Number(flags.port || 5173));
await serve(path.join(root, 'clone'), port);
console.log(`clone: http://localhost:${port}/  (Ctrl+C to stop)`);
