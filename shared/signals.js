// shared/signals.js
//
// Small helpers every check uses to look for "code signals".
//
// A signal is a pattern in the source code that is evidence of a
// design decision, e.g. `new AbortController()` is evidence that
// someone thought about cancelling a request. Signals are clues,
// not verdicts: the skill asks the agent to confirm them.
//
// Everything here is a pure function. Input is a list of files as
// plain objects: { path: string, content: string }. No file system,
// no side effects. That keeps checks easy to test and lets them run
// anywhere (Node, a CI job, inside an agent).

/**
 * Find every place a regular expression matches across all files.
 *
 * @param {{path: string, content: string}[]} files
 * @param {RegExp} pattern  any regex; we add the "g" flag ourselves
 * @returns {{path: string, line: number, text: string}[]}
 *   one entry per match, with the 1-based line number where the
 *   match starts and that line's text, trimmed, for showing as evidence.
 */
export function findAll(files, pattern) {
  // A regex needs the "g" (global) flag to find more than the first
  // match. We copy the pattern rather than mutate the caller's one.
  const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
  const re = new RegExp(pattern.source, flags);

  const hits = [];
  for (const file of files) {
    const lines = file.content.split('\n');
    // Match against the code with comments blanked out, so a comment
    // that merely *mentions* useChat or <ToolCall> doesn't count.
    for (const match of stripComments(file.content).matchAll(re)) {
      const line = lineNumberAt(file.content, match.index);
      hits.push({ path: file.path, line, text: lines[line - 1].trim() });
    }
  }
  return hits;
}

/**
 * Like findAll, but tries several patterns and tags each hit with
 * a human-readable name for the signal, so reports can say *why*
 * a line counts as evidence.
 *
 * @param {{path: string, content: string}[]} files
 * @param {{name: string, pattern: RegExp}[]} signals
 */
export function findSignals(files, signals) {
  return signals.flatMap(({ name, pattern }) =>
    findAll(files, pattern).map((hit) => ({ signal: name, ...hit })),
  );
}

/**
 * Replace comments with spaces, keeping every newline, so line numbers
 * and positions still match the original file.
 *
 * Handles block comments and // line comments, and skips text inside
 * quotes, so "https://example.com" in a string is left alone. Pass
 * { strings: true } to blank string contents as well.
 */
export function stripComments(text, { strings = false } = {}) {
  let out = '';
  let i = 0;
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"' || ch === "'" || ch === '`') {
      // Copy the whole string literal unchanged.
      let j = i + 1;
      while (j < text.length && text[j] !== ch) j += text[j] === '\\' ? 2 : 1;
      const literal = text.slice(i, j + 1);
      // With { strings: true }, blank the inside of the string too (keeping
      // the quotes), so prose in a prompt like "use the fetch tool (…)"
      // isn't mistaken for code.
      out += strings ? ch + blank(literal.slice(1, -1)) + literal.slice(-1) : literal;
      i = j + 1;
    } else if (ch === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      out += blank(text.slice(i, stop));
      i = stop;
    } else if (ch === '/' && next === '/') {
      const end = text.indexOf('\n', i);
      const stop = end === -1 ? text.length : end;
      out += blank(text.slice(i, stop));
      i = stop;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

// Count the newlines before a character position to get its line.
function lineNumberAt(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (text[i] === '\n') line++;
  return line;
}
