// shared/tools.js
//
// Finds the *tools* an AI agent can call: the actions it can take in
// the world, like sendEmail or deleteFile. Several checks need this
// (gates now, tools-visible later), so it lives in its own file.
//
// We recognise the two most common ways tools are written:
//
//   1. Vercel AI SDK (our first target stack):
//        sendEmail: tool({ description: '...', inputSchema: ..., execute: ... })
//
//   2. A plain JSON-schema definition, as used by the Anthropic and
//      OpenAI SDKs directly:
//        { name: 'send_email', description: '...', input_schema: {...} }
//
// Pure functions only: files in, a list of tools out.

/**
 * @param {{path: string, content: string}[]} files
 * @returns {{name: string, path: string, line: number, body: string, style: 'ai-sdk' | 'schema'}[]}
 *   body is the full source text of the tool's definition, so checks can
 *   look inside it (does it have execute? needsApproval?).
 */
export function findTools(files) {
  const tools = [];

  for (const { path, content } of files) {
    const spans = []; // where AI SDK tools are, to avoid counting them twice

    // --- Style 1: `name: tool(` -------------------------------------
    for (const m of content.matchAll(/(['"]?)([A-Za-z_$][\w$]*)\1\s*:\s*tool\s*\(/g)) {
      const open = m.index + m[0].length - 1; // position of the "("
      const close = matchingBracket(content, open);
      if (close === -1) continue;
      spans.push([open, close]);
      tools.push({
        name: m[2],
        path,
        line: lineAt(content, m.index),
        body: content.slice(open, close + 1),
        style: 'ai-sdk',
      });
    }

    // --- Style 2: `{ name: '...', input_schema / parameters ... }` --
    for (const m of content.matchAll(/\bname\s*:\s*['"]([\w.-]+)['"]/g)) {
      if (spans.some(([a, b]) => m.index > a && m.index < b)) continue;
      const open = enclosingBrace(content, m.index);
      if (open === -1) continue;
      const close = matchingBracket(content, open);
      if (close === -1) continue;
      const body = content.slice(open, close + 1);
      // Lots of objects have a `name`. Only count ones that also
      // describe their inputs, which is what makes them a tool.
      if (!/\b(input_schema|inputSchema|parameters)\s*:/.test(body)) continue;
      tools.push({ name: m[1], path, line: lineAt(content, m.index), body, style: 'schema' });
    }
  }

  return tools;
}

/**
 * Split a tool name into lowercase words:
 *   "sendEmail" → ["send", "email"], "delete_file" → ["delete", "file"]
 */
export function nameWords(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2') // camelCase → camel Case
    .split(/[\s_.-]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

// ---------------------------------------------------------------------
// Bracket helpers. Given the position of an opening ( or {, find the
// one that closes it, counting nested brackets on the way. Text inside
// quotes is skipped so a "}" in a string doesn't confuse the count.
// ---------------------------------------------------------------------

const PAIRS = { '(': ')', '{': '}', '[': ']' };

function matchingBracket(text, openIndex) {
  const stack = [];
  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      i = skipString(text, i);
      continue;
    }
    if (PAIRS[ch]) stack.push(PAIRS[ch]);
    else if (ch === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) return i;
    }
  }
  return -1;
}

// Walk backwards to find the "{" of the object that contains position i.
// (Simple version: doesn't skip strings, good enough for tool definitions.)
function enclosingBrace(text, i) {
  let depth = 0;
  for (let j = i; j >= 0; j--) {
    if (text[j] === '}') depth++;
    else if (text[j] === '{') {
      if (depth === 0) return j;
      depth--;
    }
  }
  return -1;
}

function skipString(text, start) {
  const quote = text[start];
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === '\\') i++; // skip escaped character
    else if (text[i] === quote) return i;
  }
  return text.length;
}

function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (text[i] === '\n') line++;
  return line;
}
