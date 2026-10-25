// The exit codes and commands an agent is told about agree everywhere they are written (Stage 5): the skill, the
// AGENTS.md block init writes, status itself, the CLI's step list and docs/policy.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFile(path.join(ROOT, f), 'utf8');

test('exit codes: 0 Verified, 1 work left, 2 Blocked, 3 Incomplete, in the skill, AGENTS.md, status and the policy', async () => {
  const skill = await read('skill/SKILL.md');
  const bin = await read('bin/trueclone.mjs');
  const status = await read('scripts/status.mjs');
  const policy = await read('docs/policy.md');
  for (const [code, word] of [[0, 'Verified'], [1, 'Work left'], [2, 'Blocked'], [3, 'Incomplete']]) {
    assert.match(skill, new RegExp(`\\| ${code} \\| \\*\\*${word}\\*\\*`, 'i'), `skill: ${code} ${word}`);
    assert.match(bin, new RegExp(`${code} ${word}`, 'i'), `AGENTS.md block: ${code} ${word}`);
    assert.match(status, new RegExp(`//\\s+${code}\\s+${word}`, 'i'), `status.mjs header: ${code} ${word}`);
    assert.match(policy, new RegExp(`\\| ${code} \\| ${word}`, 'i'), `docs/policy.md: ${code} ${word}`);
  }
  assert.doesNotMatch(bin, /set aside/, 'the AGENTS.md block no longer speaks of set-asides');
  assert.doesNotMatch(skill, /three real tries/);
});

test('every command the skill and status name is a CLI step, and every step has its script', async () => {
  const bin = await read('bin/trueclone.mjs');
  const steps = Object.fromEntries([...bin.matchAll(/^ {2}'?([\w-]+)'?: \['([\w-]+\.mjs)'/gm)].map((m) => [m[1], m[2]]));
  for (const [step, file] of Object.entries(steps)) await fs.access(path.join(ROOT, 'scripts', file));
  const skill = await read('skill/SKILL.md');
  const status = await read('scripts/status.mjs');
  const named = new Set([...`${skill}\n${status}`.matchAll(/(?:npx trueclone|T\(`)\s*([a-z][a-z-]*) /g)].map((m) => m[1]));
  for (const n of named) if (!['init', 'doctor', 'rea'].includes(n)) assert.ok(steps[n], `"${n}" is named but is not a step`);
  for (const s of ['calibrate', 'behaviour', 'status', 'score', 'review']) assert.ok(steps[s], s);
});

test('two workflows: cloning delivers the HTML clone, converting is a separate request; the retired generator is named nowhere it would be run', async () => {
  const skill = await read('skill/SKILL.md');
  const bin = await read('bin/trueclone.mjs');
  const status = await read('scripts/status.mjs');
  const policy = await read('docs/policy.md');
  const readme = await read('README.md');
  assert.match(skill, /## Two jobs, two requests/);
  assert.match(skill, /## Converting a clone to Next\.js \(a separate request\)/);
  assert.match(skill, /If one request asks for both[^\n]*two stages/);
  assert.match(bin, /converting a finished clone into a Next\.js application is a later, separate request/);
  assert.match(policy, /## Two workflows \(rc\.11\)/);
  assert.match(policy, /## Converting a clone to Next\.js \(rc\.11\)/);
  // (status names the retired generator's folders in one place: the note that they are ignored)
  const statusRuns = status.split('\n').filter((l) => !/retired Next\.js generator|'next', 'compare-next', 'REPORT\.next\.md'/.test(l)).join('\n');
  for (const [file, text] of [['skill', skill], ['bin', bin], ['status', statusRuns], ['README', readme]]) {
    assert.doesNotMatch(text, /next <name> --verify|next \$\{name\} --verify|REPORT\.next\.md|compare-next\//, `${file} names the retired generator`);
  }
  assert.doesNotMatch(bin, /\bnext: \['next\.mjs'/, 'no `next` step');
  assert.match(bin, /trueclone next is retired/);
});
