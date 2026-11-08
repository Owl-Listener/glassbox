# Glassbox

**See where your AI product is a black box to its users.**

Glassbox is an agent skill that reads the code of an AI product (a chatbot, a copilot, an agent) and checks it for the trust patterns users need: can they stop it, does it ask before doing something risky, can they see what it did, does it fail honestly?

Each finding cites the research behind it and points to a fix.

> 🚧 Early days, being built in public. See [CHECKS.md](CHECKS.md) for the eight checks planned for v0.1.

## How it fits together

| | |
|---|---|
| **The rules** | The 15 heuristics and named anti-patterns in [agent-design-primer](https://github.com/Owl-Listener/agent-design-primer) |
| **The checks** | This repo: code signals a script can find, plus a rubric the agent judges with evidence |
| **The fixes** | Accessible trust components from [felt-ui](https://github.com/Owl-Listener/felt-ui), like `<ToolCall>` |

## License

MIT, by [MC Dean](https://marieclairedean.substack.com/) / [Owl-Listener](https://github.com/Owl-Listener).
