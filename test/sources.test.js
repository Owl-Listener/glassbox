// test/sources.test.js
//
// Each test hands the check a tiny fake project and asserts what it
// should conclude. Run with: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSources } from '../shared/checks/sources.js';

const search = {
  path: 'lib/tools/search.ts',
  content: `export const webSearch = tool({ description: 'Search the web', execute: async ({ q }) => results });`,
};
const ui = (content) => ({ path: 'components/Answer.tsx', content });

test('not applicable when nothing retrieves information', () => {
  const r = checkSources([{ path: 'route.ts', content: `streamText({ tools: { getWeather: tool({ execute }) } })` }]);
  assert.equal(r.applicable, false);
  assert.match(r.reason, /no retrieval/);
});

test('search with no sources in the UI scores 0', () => {
  const r = checkSources([search, ui(`<p>{answer}</p>`)]);
  assert.equal(r.score, 0);
  assert.match(r.issues[0].message, /trust it on faith/);
});

test('sources listed as plain text are decorative: 40', () => {
  const r = checkSources([search, ui(`{sources.map((s) => <span key={s.id}>{s.title}</span>)}`)]);
  assert.equal(r.score, 40);
  assert.ok(r.issues.some((i) => /Decorative citations/.test(i.message)));
});

test('linked sources listed at the bottom: 70', () => {
  const r = checkSources([search, ui(`{sources.map((s) => <a key={s.id} href={s.url}>{s.title}</a>)}`)]);
  assert.equal(r.score, 70);
  assert.ok(r.issues.some((i) => /attached to the claims/.test(i.message)));
});

test('AI SDK source parts, linked, with inline citations: 100', () => {
  const r = checkSources([
    { path: 'route.ts', content: `const r = streamText({ model, tools: { webSearch } });\nreturn r.toUIMessageStreamResponse({ sendSources: true });` },
    ui(`{part.type === 'source-url' && <InlineCitation href={part.url} title={part.title} />}`),
  ]);
  assert.equal(r.score, 100);
});

test('a link passed as a plain href prop counts (like a CitationLink component)', () => {
  const r = checkSources([search, {
    path: 'components/citation-link.tsx',
    content: `export function CitationLink({ href, citation }) { return <Link href={href}>{citation}</Link>; }\n{sources.map(s => <CitationLink href={s.url} />)}`,
  }]);
  assert.ok(r.score >= 70);
});

test('a prompt asking for inline citations counts as inline', () => {
  const r = checkSources([
    { ...search, content: search.content + '\nconst system = `You MUST cite sources inline using the [number](#label) format.`;' },
    ui(`{sources.map((s) => <a href={s.url}>{s.title}</a>)}`),
  ]);
  assert.equal(r.score, 100);
});

test('vector retrieval counts as retrieval', () => {
  const r = checkSources([{ path: 'lib/rag.ts', content: `const hits = await vectorStore.similaritySearch(query, 5);` }]);
  assert.equal(r.applicable, true);
});

// --- Patterns found in real apps and examples ------------------------

test('looking up an order in your own database is not retrieval', () => {
  const r = checkSources([{ path: 'route.ts', content: `streamText({ tools: { lookupOrder: tool({ description: 'Look up an order by its id', execute }) } })` }]);
  assert.equal(r.applicable, false);
});

test('fetch counts as retrieval when its description is about web pages', () => {
  const r = checkSources([{ path: 'fetch.ts', content: `export function createFetchTool() { return tool({ description: 'Fetch the content of a web page by URL', execute }) }` }]);
  assert.equal(r.applicable, true);
});

test('a TypeScript type like createContext<CitationContextValue> is not UI', () => {
  const r = checkSources([search, ui(`const C = createContext<CitationContextValue | undefined>(undefined);`)]);
  assert.equal(r.score, 0);
});

test('a list index like Parameters<typeof x>[0] is not an inline citation', () => {
  const r = checkSources([search, ui(`{sources.map((s) => <a href={s.url}>{s.title}</a>)}\nconst f = (o?: Parameters<typeof regenerate>[0]) => o;`)]);
  assert.equal(r.score, 70);
});
