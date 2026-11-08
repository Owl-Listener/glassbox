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
    for (const match of file.content.matchAll(re)) {
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

// Count the newlines before a character position to get its line.
function lineNumberAt(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (text[i] === '\n') line++;
  return line;
}
