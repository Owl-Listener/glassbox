// shared/checks/sources.js
//
// Check 7 · sources · "Verifiable claims show their sources"
//
// Heuristic #4 (agent-design-primer): Sources are required for
// verifiable claims. "A claim that can be sourced should be. A claim
// that cannot be sourced should be marked as such."
// Anti-patterns: "Decorative citations" (pills that don't open),
// "Phantom citations" (the source doesn't support the claim)
//
// Applies only when the product retrieves information: web search,
// page fetching, document or vector retrieval. Three questions:
//
//   1. Do sources reach the UI?                                   40
//   2. Are they real links the user can open?                     30
//   3. Are they attached to the claims (inline), not just listed? 30

import { stripComments } from '../signals.js';
import { findTools, actionWords } from '../tools.js';

// Retrieval: tools whose name says they look things up, or retrieval code.
// "fetch", "lookup" and "get" only count when the tool's description is
// about the web or documents: looking up an order in your own database
// isn't a source the user needs to verify. (Found while testing.)
const RETRIEVAL_WORDS = new Set(['search', 'retrieve', 'retrieval', 'browse', 'scrape', 'crawl', 'rag', 'web', 'knowledge']);
const MAYBE_RETRIEVAL = new Set(['fetch', 'lookup', 'look', 'get', 'read']);
const ABOUT_THE_WEB = /\b(url|urls|web|website|webpage|page|pages|site|article|document|documents|docs)\b/i;
const isRetrievalTool = (t) => {
  const words = actionWords(t.name);
  if (words.some((w) => RETRIEVAL_WORDS.has(w))) return true;
  const description = (t.body.match(/\bdescription\s*:\s*(['"`])([\s\S]*?)\1/) || [])[2] || '';
  return words.some((w) => MAYBE_RETRIEVAL.has(w)) && ABOUT_THE_WEB.test(description);
};
const RETRIEVAL_CODE = /\bembed(Many)?\s*\(|\bsimilaritySearch\s*\(|\bvectorStore\b|\b(pinecone|qdrant|weaviate|chroma|pgvector)\b|\bsendSources\s*:|['"`]source-(url|document)['"`]/i;

// A file that deals with sources or citations.
const SOURCE_FILE = /\b(sources?|citations?|references?)\b|<(Source|Citation|InlineCitation)\w*\b|['"`]source-(url|document)['"`]/i;
// Component names, not type names: <CitationContextValue …> inside
// createContext<…> is a TypeScript type, not something on screen.
// (Found in a real app, field-tests/.)
const NOT_A_TYPE = '(?!\\w*(Props|Value|Type|Types|Context|Data|Map|Item)\\b)\\w*[\\s/>]';
// 1. Sources rendered.
const SOURCES_UI = new RegExp(`['"\`]source-(url|document)['"\`]|\\bsources?\\.map\\s*\\(|\\bcitations?\\.map\\s*\\(|<(Sources?|Citations?|InlineCitation|SourceList|References)${NOT_A_TYPE}`);
// 2. Real links: an href in a file that handles sources.
const LINK = /\bhref\s*=\s*\{|<a\b[^>]*\bhref\s*=\s*["'{]/;
// 3. Inline: citation components or markers in the UI, or a prompt that
//    asks the model to cite inline.
//    No bare "[1]" pattern: in code, [0] is usually a list index.
//    (Found in a real app, field-tests/.)
const INLINE_UI = new RegExp(`<(InlineCitation|Citation(Link|Badge|Pill|Marker)?)${NOT_A_TYPE}`);
const INLINE_PROMPT = /\bcit(e|ation|ations)\b[^.\n]{0,80}\b(inline|\[\d|\[number\]|\[label\]|markdown link|after (each|the) (claim|sentence|statement|period))/i;

const isUiFile = (f) => /\.(tsx|jsx)$/.test(f.path);

/**
 * @param {{path: string, content: string}[]} files
 * @returns {object} a CheckResult
 */
export function checkSources(files) {
  const result = {
    id: 'sources',
    label: 'Verifiable claims show their sources',
    impact: 'moderate',
    weight: 2,
    applicable: true,
    reason: null,
    score: 0,
    issues: [],
    evidence: [],
    judge: [],
    fix: 'Pass retrieved sources through to the message (e.g. sendSources: true in the Vercel AI SDK) and render them as links attached to the claims they support, not a list at the bottom. felt-ui <Citation> (planned).',
    source: 'https://github.com/Owl-Listener/agent-design-primer/blob/main/chapters/L2-citations.md',
  };

  const code = files.map((f) => ({ ...f, content: stripComments(f.content) }));
  const lines = new Map(files.map((f) => [f.path, f.content.split('\n')]));
  const hit = (set, pattern, signal) => {
    for (const f of set) {
      const m = f.content.match(pattern);
      if (m) {
        const line = f.content.slice(0, m.index).split('\n').length;
        return { signal, path: f.path, line, text: lines.get(f.path)[line - 1].trim() };
      }
    }
    return null;
  };

  // Is there retrieval at all?
  const retrievalTools = findTools(files).filter(isRetrievalTool);
  const retrievalCode = hit(code, RETRIEVAL_CODE, 'Retrieval');
  if (retrievalTools.length === 0 && !retrievalCode) {
    return { ...result, applicable: false, score: null, reason: 'no retrieval found (no search, fetch or document lookup)' };
  }
  const t = retrievalTools[0];
  result.evidence.push(t ? { signal: 'Retrieval tool', path: t.path, line: t.line, text: t.name } : retrievalCode);

  const ui = code.filter(isUiFile);
  const sourceUi = ui.filter((f) => SOURCE_FILE.test(f.content));

  // --- 1. Sources reach the UI ---------------------------------------
  const shown = hit(sourceUi, SOURCES_UI, 'Sources shown in UI');
  if (shown) {
    result.score += 40;
    result.evidence.push(shown);
  } else {
    result.issues.push({
      severity: 'moderate',
      message: 'The product retrieves information, but the UI never shows where an answer came from. Users have to trust it on faith.',
    });
    result.judge.push('Are sources shown some other way, e.g. inside the model\'s markdown text as links? If so, are they reliable, or can the model invent them?');
  }

  // --- 2. Real links ---------------------------------------------------
  const link = hit(sourceUi, LINK, 'Sources are links');
  if (link) {
    result.score += 30;
    result.evidence.push(link);
  } else if (shown) {
    result.issues.push({
      severity: 'moderate',
      message: 'Sources are shown, but no source component renders a link, so users can\'t open them to check (anti-pattern: "Decorative citations").',
    });
  }

  // --- 3. Inline, attached to claims -------------------------------------
  const inline = hit(ui, INLINE_UI, 'Inline citations in UI') || hit(code, INLINE_PROMPT, 'Prompt asks for inline citations');
  if (inline) {
    result.score += 30;
    result.evidence.push(inline);
  } else if (shown) {
    result.issues.push({
      severity: 'moderate',
      message: 'Sources are listed, but not attached to the claims they support. Users can\'t tell which source backs which sentence.',
    });
  }

  result.judge.push(
    'Open a few citations as a user would: do they lead to the actual source, or to a 404, a paywall, or a homepage? (anti-pattern: "Decorative citations")',
    'Does each cited source actually support the sentence it\'s attached to? Look at how citations are matched to results: can the model cite a label it never retrieved? (anti-pattern: "Phantom citations")',
    'Are claims the product couldn\'t source marked as such, rather than looking just as certain as sourced ones?',
  );
  return result;
}
