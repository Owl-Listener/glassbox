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

import { stripComments } from './signals.js';

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

    // --- Style 1: any call to tool(...) or dynamicTool(...) ---------
    // Real apps write AI SDK tools in several shapes, so we find every
    // call and work out the name from what surrounds it:
    //   sendEmail: tool({...})                      → "sendEmail"
    //   export const getWeather = tool({...})       → "getWeather"
    //   export const createDocument = (p) => tool({ → "createDocument"
    //   function createFetchTool() { return tool({  → "createFetchTool"
    // `(?<![\w.$])` skips look-alikes such as callTool( or mcp.tool(.
    // Comments are blanked first so a commented-out tool isn't counted.
    // Two cleaned-up copies of the file, same length and line numbers:
    //  - code: comments blanked (used for names in quotes, like name: 'x')
    //  - bare: comments AND string contents blanked, so prose in a prompt
    //    such as "start with the fetch tool (skip search)" isn't a tool.
    const code = stripComments(content);
    const bare = stripComments(content, { strings: true });
    for (const m of bare.matchAll(/(?<![\w.$])(tool|dynamicTool)\s*\(/g)) {
      const open = m.index + m[0].length - 1; // position of the "("
      const close = matchingBracket(bare, open);
      if (close === -1) continue;
      spans.push([open, close]);
      const name = toolNameBefore(bare, m.index);
      tools.push({
        name: name.value,
        path,
        line: lineAt(content, name.index ?? m.index),
        body: content.slice(open, close + 1),
        style: 'ai-sdk',
        dynamic: m[1] === 'dynamicTool',
      });
    }

    // --- Style 2: `{ name: '...', input_schema / parameters ... }` --
    for (const m of code.matchAll(/\bname\s*:\s*['"]([\w.-]+)['"]/g)) {
      if (spans.some(([a, b]) => m.index > a && m.index < b)) continue;
      const open = enclosingBrace(code, m.index);
      if (open === -1) continue;
      const close = matchingBracket(code, open);
      if (close === -1) continue;
      const body = content.slice(open, close + 1);
      // Lots of objects have a `name`. Only count ones that also
      // describe their inputs, which is what makes them a tool.
      if (!/\b(input_schema|inputSchema|parameters)\s*:/.test(body)) continue;
      // Schema tools are sent to a model from server code. The same shape
      // inside a React component is usually a list shown to people, like a
      // docs page describing tools. (Found in a real app, field-tests/.)
      if (/\.(tsx|jsx)$/.test(path)) continue;
      tools.push({ name: m[1], path, line: lineAt(content, m.index), body, style: 'schema' });
    }
  }

  return tools;
}

/**
 * Work out a tool's name from the code just before its tool( call.
 * Returns { value, index } where index is where the name was found
 * (used for the line number), or a placeholder when nothing fits.
 */
function toolNameBefore(code, callIndex) {
  const before = code.slice(Math.max(0, callIndex - 2000), callIndex);
  const offset = Math.max(0, callIndex - 2000);

  // Directly assigned: `getWeather: tool(` or `const getWeather = tool(`
  const direct = before.match(/(['"]?)([A-Za-z_$][\w$]*)\1\s*:\s*$|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*$/);
  if (direct) {
    const value = direct[2] || direct[3];
    return { value, index: offset + direct.index + direct[0].indexOf(value) };
  }

  // Inside a factory: the nearest function declaration or arrow-function
  // const before the call, e.g. `const createDocument = (props) =>`.
  const factory = /function\s+([A-Za-z_$][\w$]*)|(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^()]*(?:\([^()]*\)[^()]*)*\)|[A-Za-z_$][\w$]*)\s*(?::[^=]*)?=>/g;
  let last = null;
  for (const m of before.matchAll(factory)) last = m;
  if (last) {
    const value = last[1] || last[2];
    return { value, index: offset + last.index + last[0].indexOf(value) };
  }
  return { value: '(unnamed tool)', index: null };
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

/**
 * The words that describe what a tool *does*, without factory wrapping:
 *   "createSendEmailTool" → ["send", "email"], "createDocument" → ["document"]
 * Used for risk decisions; reports still show the full name.
 */
export function actionWords(name) {
  const words = nameWords(name);
  // Not "get": getRuleExecutionTool reads, and stripping "get" would hide
  // that. (Found in a real app, field-tests/.)
  if (words.length > 1 && ['create', 'make', 'build'].includes(words[0]) && words[words.length - 1] === 'tool') {
    return words.slice(1, -1);
  }
  if (words.length > 1 && words[words.length - 1] === 'tool') return words.slice(0, -1);
  return words;
}

// ---------------------------------------------------------------------
// Bracket helpers. Given the position of an opening ( or {, find the
// one that closes it, counting nested brackets on the way. Text inside
// quotes is skipped so a "}" in a string doesn't confuse the count.
// ---------------------------------------------------------------------

const PAIRS = { '(': ')', '{': '}', '[': ']' };

export function matchingBracket(text, openIndex) {
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
