# Field tests

Glassbox run on real, open-source AI apps, to learn where its patterns hold and where they break. Each review follows the report format in [SKILL.md](../SKILL.md): the scan's score, then what reading the code confirmed or corrected.

These are code reviews, not usability tests: the apps were read, not run. Each review names the exact commit it looked at, so later changes to the app may already have fixed things.

| App | Commit | Scan | After judgment | What it taught glassbox |
|---|---|---|---|---|
| [vercel/ai-chatbot](vercel-ai-chatbot.md) | `a8989b5` | 100 | **63** | Stop shown only while `"submitted"` disappears during streaming |
| [miurla/morphic](miurla-morphic.md) | `be5846d` | 100 | 100 | Tools built by factory functions; prompt text that looks like code |

## What the first run got wrong, and what changed

The first scan of these two apps found **no tools in either**, so two checks silently didn't run. Fixed in the same pull request:

- **Tools are mostly written as constants or factories** (`export const getWeather = tool(...)`, `const createDocument = (props) => tool(...)`), not just `name: tool(...)`. Glassbox now finds every `tool(...)` and `dynamicTool(...)` call.
- **Prose in prompts looked like code.** "Start with the fetch tool (skip search)" matched `tool (`. Text inside quotes is now ignored when looking for tools.
- **Test files, evals and fixtures were scanned.** They describe how code *should* behave, with fake tools and streams. They're now skipped.
- **`e.stopPropagation()` counted as a stop button.** It no longer does.
