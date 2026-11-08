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

const CHECKS = [checkStop, checkGates];

const args = process.argv.slice(2);
const folder = args.find((a) => !a.startsWith('--'));
if (!folder) {
  console.error('Usage: node glassbox.js <folder> [--json]');
  process.exit(1);
}

const files = collectFiles(folder);
const results = CHECKS.map((check) => check(files));

if (args.includes('--json')) {
  console.log(JSON.stringify(results, null, 2));
} else {
  console.log(`\nGlassbox · ${folder} · ${files.length} source files\n`);
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
    for (const e of r.evidence) console.log(`    ${e.path}:${e.line}  ${e.signal}  │ ${e.text}`);
  }
  if (r.judge.length) {
    console.log('  For the agent to verify:');
    for (const q of r.judge) console.log(`    ? ${q}`);
  }
  if (r.score < 100) console.log(`  Fix: ${r.fix}`);
  console.log(`  Why: ${r.source}\n`);
}
