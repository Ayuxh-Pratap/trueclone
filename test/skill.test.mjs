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
  const steps = Object.fromEntries([...bin.matchAll(/^ {2}(\w+): \['([\w-]+\.mjs)'/gm)].map((m) => [m[1], m[2]]));
  for (const [step, file] of Object.entries(steps)) await fs.access(path.join(ROOT, 'scripts', file));
  const skill = await read('skill/SKILL.md');
  const status = await read('scripts/status.mjs');
  const named = new Set([...`${skill}\n${status}`.matchAll(/(?:npx trueclone|T\(`)\s*([a-z]+) /g)].map((m) => m[1]));
  for (const n of named) if (!['init', 'doctor', 'rea'].includes(n)) assert.ok(steps[n], `"${n}" is named but is not a step`);
  for (const s of ['calibrate', 'behaviour', 'status', 'score', 'review']) assert.ok(steps[s], s);
});
