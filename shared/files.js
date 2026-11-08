// shared/files.js
//
// The one place Glassbox touches the file system. It walks a project
// folder and returns its source files as { path, content } objects,
// which is the plain input every check expects.

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

// Source files we read. v0.1 targets JavaScript/TypeScript apps.
const SOURCE_EXT = /\.(js|jsx|ts|tsx|mjs|cjs)$/;

// Folders that never hold the product's own code:
// - dependencies and build output (slow to scan, full of false signals)
// - agent skill folders. Glassbox itself gets installed in one, e.g.
//   .claude/skills/glassbox/, and its example apps (with their fake
//   sendEmail tools) must not be reported as the user's problems.
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'out', 'coverage',
  '.claude', '.cursor', '.gemini', '.agents', '.codex', '.windsurf',
]);

/**
 * @param {string} root  folder to scan
 * @returns {{path: string, content: string}[]}  paths are relative to root
 */
export function collectFiles(root) {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full);
      } else if (SOURCE_EXT.test(entry.name)) {
        files.push({ path: relative(root, full), content: readFileSync(full, 'utf8') });
      }
    }
  };
  walk(root);
  return files;
}
