#!/usr/bin/env node
// glassbox.js
//
// Command-line entry point.
//
//   node glassbox.js <folder>          readable report
//   node glassbox.js <folder> --json   raw results, for agents and CI
//
// Each new check gets imported here and added to CHECKS.

import { collectFiles } from './shared/files.js';
import { checkStop } from './shared/checks/stop.js';
import { checkGates } from './shared/checks/gates.js';
import { checkToolsVisible } from './shared/checks/tools-visible.js';
import { checkAccessibleStream } from './shared/checks/accessible-stream.js';
import { overallScore } from './shared/report.js';

const CHECKS = [checkStop, checkGates, checkToolsVisible, checkAccessibleStream];

const args = process.argv.slice(2);
const folder = args.find((a) => !a.startsWith('--'));
if (!folder) {
  console.error('Usage: node glassbox.js <folder> [--json]');
  process.exit(1);
}

const files = collectFiles(folder);
const results = CHECKS.map((check) => check(files));
const score = overallScore(results);

if (args.includes('--json')) {
  console.log(JSON.stringify({ folder, files: files.length, score, results }, null, 2));
} else {
  console.log(`\nGlassbox · ${folder} · ${files.length} source files`);
  console.log(score === null ? 'Overall: nothing to assess yet\n' : `Overall: ${score}/100\n`);
  for (const r of results) printResult(r);
}

function printResult(r) {
  console.log(`■ ${r.id} · ${r.label}  [${r.impact}]`);
  if (!r.applicable) {
    console.log(`  Not applicable: ${r.reason}.\n`);
    return;
  }
  console.log(`  Score: ${r.score}/100`);
  for (const issue of r.issues) console.log(`  ✗ ${issue.message}`);
  if (r.evidence.length) {
    console.log('  Evidence:');
    const MAX = 10; // the full list is in --json
    for (const e of r.evidence.slice(0, MAX)) console.log(`    ${e.line ? `${e.path}:${e.line}` : e.path}  ${e.signal}  │ ${e.text}`);
    if (r.evidence.length > MAX) console.log(`    … and ${r.evidence.length - MAX} more (see --json)`);
  }
  if (r.judge.length) {
    console.log('  For the agent to verify:');
    for (const q of r.judge) console.log(`    ? ${q}`);
  }
  if (r.score < 100) console.log(`  Fix: ${r.fix}`);
  console.log(`  Why: ${r.source}\n`);
}
