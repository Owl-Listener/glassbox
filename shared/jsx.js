// shared/jsx.js
//
// A small, forgiving JSX reader: just enough to look at individual
// elements, e.g. "find every <button> and tell me its attributes and
// what's inside it". It isn't a full parser. It only needs to cope
// with what real React code looks like, including the awkward bits:
//
//   <button onClick={() => stop()}>   ← the ">" in "=>" isn't the end of the tag
//   <div className={cn("a", x > 1 && "b")}>
//
// Pure functions: source text in, plain objects out.

/**
 * Find opening tags whose name matches `namePattern`.
 *
 * @param {string} code   source text (comments already blanked)
 * @param {RegExp} namePattern  e.g. /^(button|Button)$/
 * @returns {{tag: string, attrs: string, children: string|null, index: number}[]}
 *   attrs:    the raw text between the tag name and its closing ">"
 *   children: the raw text between <tag> and </tag>, or null for <tag />
 *   index:    where the element starts, for line numbers
 */
export function findElements(code, namePattern) {
  const out = [];
  // "<" followed by a tag name. motion.div and Foo.Bar count as names.
  for (const m of code.matchAll(/<([A-Za-z][\w]*(?:\.[\w]+)?)(?=[\s/>])/g)) {
    const tag = m[1];
    if (!namePattern.test(tag)) continue;

    const end = endOfOpeningTag(code, m.index + m[0].length);
    if (end === -1) continue;
    const selfClosing = code[end - 1] === '/';
    const attrs = code.slice(m.index + m[0].length, selfClosing ? end - 1 : end);

    let children = null;
    if (!selfClosing) {
      const close = code.indexOf(`</${tag}>`, end);
      children = close === -1 ? '' : code.slice(end + 1, close);
    }
    out.push({ tag, attrs, children, index: m.index });
  }
  return out;
}

/** Does the attribute text contain this attribute? e.g. hasAttr(attrs, 'aria-label') */
export function hasAttr(attrs, name) {
  return new RegExp(`(^|\\s)${name.replace(/[-]/g, '\\-')}(\\s*=|\\s|$)`).test(attrs);
}

// Walk forward from just after the tag name to the ">" that ends the
// opening tag, skipping anything inside {braces} or quotes.
function endOfOpeningTag(code, from) {
  let depth = 0;
  for (let i = from; i < code.length; i++) {
    const ch = code[i];
    if (depth === 0 && (ch === '"' || ch === "'")) {
      const close = code.indexOf(ch, i + 1);
      if (close === -1) return -1;
      i = close;
    } else if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === '>' && depth === 0) return i;
    else if (ch === '<' && depth === 0) return -1; // ran into the next tag: not JSX after all
  }
  return -1;
}
