## Glassbox review: miurla/morphic

*Commit `be5846d` (2026-11-05) · 382 source files · reviewed by reading the code, not by running the app*

**Overall: 100/100** (scan: 100, confirmed) · 2 checks applied · not yet assessed: plan, failure, refusal, sources, accessibility

| Check | Scan | Judged | Verdict |
|---|---|---|---|
| stop: user can stop the agent | 100 | 100 | ✓ The send button becomes a working stop button for the whole response |
| gates: risky actions ask first | n/a | n/a | 7 tools, all search, fetch, drafting or planning; runtime MCP tools need a manual check |
| tools-visible: user sees what it did | 100 | 100 | ✓ Search, fetch and todo calls render with inputs and results |

### Fix first

Nothing critical found in the checks that ran.

**Worth checking by hand:** Morphic can create tools at runtime from MCP servers (`lib/tools/dynamic.ts:34`, `createMCPTool`). Their names and powers aren't in the code, so glassbox can't tell whether one sends or deletes. If MCP servers with write access are allowed, those calls need an approval step.

### Fine as is

- **stop:** `isLoading` covers both phases (`components/chat-panel.tsx:166`, `status === 'submitted' || status === 'streaming'`), and the button stays enabled and calls `stop` throughout (`components/chat-panel.tsx:959`, `onClick={isLoading ? stop : undefined}`).
- **tools-visible:** tool parts render per type (`components/artifact/artifact-content.tsx:13`), with inputs (`components/artifact/todo-invocation-content.tsx:12`) and outputs once available (`components/artifact/search-artifact-content.tsx:16`).
- **gates:** tools are `createSearchTool`, `createFetchTool`, `createQuestionTool`, `editDraft`, `todoWrite`, a search wrapper, and the dynamic MCP factory.
