## Glassbox review: elysiajs/arona (refusal only)

*Commit `ed82fa1` (2026-08-07) · 36 source files · reviewed by reading the code, not by running the app*

**Scope:** this review covers the `refusal` check only. The other checks ran (scan overall: 10), but their evidence wasn't verified by hand, so their scores aren't reported here.

| Refusal | Where | Reason | Way forward | Score |
|---|---|---|---|---|
| Prompt constraint: *"Politely decline answer not related to Elysia or have some small talk"* | `src/libs/ai.ts:510` | ✗ | ✗ | 0 |

**refusal: 0/100** (scan and judgment agree).

### Worth fixing

**Off-topic questions hit a cold wall.** The instruction asks for politeness, but gives the model nothing to say beyond no: no reason, and no suggestion of what it *can* help with. The surrounding prompt is otherwise careful about honesty ("Never present generated, inferred, speculated, or deduced content as fact"), so a short, honest refusal would fit its tone.
**Fix:** "Politely decline questions not related to Elysia: say that you only answer questions about Elysia, and suggest a related topic or the docs."

The line's grammar is also ambiguous: it could mean *decline small talk* or *decline unless it's small talk*. Worth rewording either way.
