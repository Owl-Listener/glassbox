// test/report.test.js
//
// Tests for the overall score and for which folders get scanned.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { overallScore } from '../shared/report.js';
import { collectFiles } from '../shared/files.js';

test('overall score is a weighted average of the checks that apply', () => {
  const results = [
    { applicable: true, score: 100, weight: 5 },
    { applicable: true, score: 0, weight: 3 },
    { applicable: false, score: null, weight: 5 },
  ];
  assert.equal(overallScore(results), 63); // (500 + 0) / 8 = 62.5 → 63
});

test('overall score is null when nothing applies', () => {
  assert.equal(overallScore([{ applicable: false, score: null, weight: 5 }]), null);
});

test('scanning skips dependencies and installed agent skills', () => {
  const root = mkdtempSync(join(tmpdir(), 'glassbox-'));
  const put = (path) => {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), '// code');
  };
  put('app/Chat.tsx');
  put('node_modules/ai/index.js');
  put('.claude/skills/glassbox/examples/ungated-agent/route.ts');
  put('.cursor/skills/other/thing.js');

  const paths = collectFiles(root).map((f) => f.path);
  assert.deepEqual(paths, [join('app', 'Chat.tsx')]);
});
