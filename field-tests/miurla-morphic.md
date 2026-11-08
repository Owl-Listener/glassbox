## Glassbox review: miurla/morphic

*Commit `be5846d` (2026-11-05) · 382 source files · reviewed by reading the code, not by running the app*

**Overall: 81/100** (scan: 81, confirmed) · 3 checks applied · not yet assessed: plan, failure, refusal, sources

| Check | Scan | Judged | Verdict |
|---|---|---|---|
| stop: user can stop the agent | 100 | 100 | ✓ The send button becomes a working stop button for the whole response |
| gates: risky actions ask first | n/a | n/a | 7 tools, all search, fetch, drafting or planning; runtime MCP tools need a manual check |
| tools-visible: user sees what it did | 100 | 100 | ✓ Search, fetch and todo calls render with inputs and results |
| accessible-stream: works for everyone | 32 | 32 | ✗ Answers aren't announced; the send/stop button has no name |

### Fix first

1. **Screen-reader users don't hear the answer.** The only live regions wrap a "Loading chat" skeleton (`components/chat.tsx:785`) and a usage warning (`components/usage-budget-provider.tsx:245`). So a blind user is told they're running low on usage, but not what the AI said. **Fix:** wrap the message list in `role="log"`.

2. **The send/stop button has no name** (`components/chat-panel.tsx:947`). It shows `<Square />` or `<ArrowUp />` depending on state. Its `title` is set only when no model is available, so in normal use a screen reader just says "button", for the control that stops the agent. The "new chat" button next to it has the same problem (`:936`); 12 of 31 icon-only buttons in total. **Fix:** `aria-label={isLoading ? 'Stop generating' : 'Send message'}`.

3. **Image results are clickable `div`s** (`components/search-results-image.tsx:296`), so keyboards can't open them. **Fix:** use `<button>`.

   Source: [agent-design-primer, L4 accessibility](https://github.com/Owl-Listener/agent-design-primer/blob/main/chapters/L4-accessibility.md)

**Worth checking by hand:** Morphic can create tools at runtime from MCP servers (`lib/tools/dynamic.ts:34`, `createMCPTool`). Their names and powers aren't in the code, so glassbox can't tell whether one sends or deletes. If MCP servers with write access are allowed, those calls need an approval step.

### Fine as is

- **Reduced motion:** respected globally (`app/globals.css:377`, `@media (prefers-reduced-motion: reduce)`) and per component (`motion-reduce:` classes).
- **stop:** `isLoading` covers both phases (`components/chat-panel.tsx:166`, `status === 'submitted' || status === 'streaming'`), and the button stays enabled and calls `stop` throughout (`components/chat-panel.tsx:959`, `onClick={isLoading ? stop : undefined}`).
- **tools-visible:** tool parts render per type (`components/artifact/artifact-content.tsx:13`), with inputs (`components/artifact/todo-invocation-content.tsx:12`) and outputs once available (`components/artifact/search-artifact-content.tsx:16`).
- **gates:** tools are `createSearchTool`, `createFetchTool`, `createQuestionTool`, `editDraft`, `todoWrite`, a search wrapper, and the dynamic MCP factory.
