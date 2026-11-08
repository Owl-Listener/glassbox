## Glassbox review: cloudflare/agents-starter (gates only)

*Commit `4ea6a72` (2026-07-24) · 5 source files · reviewed by reading the code, not by running the app*

**Scope:** this review covers the `gates` check only.

**gates: not applicable.** The starter's six tools (`getWeather`, `getUserTimezone`, `calculate`, `scheduleTask`, `getScheduledTasks`, `cancelScheduledTask`, all in `src/server.ts`) don't send, pay or delete anything outside the app. Cancelling a scheduled reminder can be redone, so it isn't consequential in the heuristic's sense.

### Worth noting

**It demonstrates approval scaled to the stakes.** `calculate` asks for approval only when a number is over 1,000 (`src/server.ts:110`):

```ts
needsApproval: async ({ a, b }) => Math.abs(a) > 1000 || Math.abs(b) > 1000,
```

On a calculator that's a teaching example, but the pattern is heuristic #8 in miniature: free actions get no friction, bigger ones get a check. It's worth copying for real consequential tools, e.g. refunds over a threshold.
