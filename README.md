# Glassbox

**See where your AI product is a black box to its users.**

Glassbox is an agent skill that reads the code of an AI product (a chatbot, a copilot, an agent) and checks it for the trust patterns users need: can they stop it, does it ask before doing something risky, can they see what it did, does it fail honestly?

Each finding cites the research behind it and points to a fix.

> 🚧 Early days, being built in public. See [CHECKS.md](CHECKS.md) for the eight checks planned for v0.1.

## Try it

Glassbox needs only Node 20+, with no dependencies to install.

```bash
node glassbox.js path/to/your/app
```

Or see a before and after on a tiny example support agent, which can email customers and issue refunds:

```bash
npm run example
```

```
■ gates · Consequential actions ask first  [critical]
  Score: 0/100
  ✗ "sendEmail" (route.ts:19) can act in the world without asking the user first.
  ✗ "refundOrder" (route.ts:24) can act in the world without asking the user first.
```

Add `--json` for machine-readable results an agent or CI job can use.

**v0.1 status:** 2 of 8 checks are built: `stop` and `gates`. See [CHECKS.md](CHECKS.md) for the rest.

## How it fits together

| | |
|---|---|
| **The rules** | The 15 heuristics and named anti-patterns in [agent-design-primer](https://github.com/Owl-Listener/agent-design-primer) |
| **The checks** | This repo: code signals a script can find, plus a rubric the agent judges with evidence |
| **The fixes** | Accessible trust components from [felt-ui](https://github.com/Owl-Listener/felt-ui), like `<ToolCall>` |

## License

MIT, by [MC Dean](https://marieclairedean.substack.com/) / [Owl-Listener](https://github.com/Owl-Listener).
