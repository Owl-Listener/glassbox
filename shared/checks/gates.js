// shared/checks/gates.js
//
// Check 2 · gates · "Consequential actions ask first"
//
// Heuristic #8 (agent-design-primer): Reversibility is proportional to
// consequence. "Free actions get no friction. Costly actions get a
// confirmation. Irreversible actions get a hard gate."
// Anti-patterns: "Soft gate for a hard action", "Gate everywhere"
//
// The check works in three steps:
//
//   1. Find the agent's tools.                       (none → not applicable)
//   2. Decide which are consequential: they send,    (none → not applicable)
//      pay, delete, publish, deploy...
//   3. For each consequential tool, look for a gate: a point where a
//      human approves before it runs.
//
// Score = share of consequential tools that are gated, out of 100,
// minus 10 for each harmless tool that's gated anyway ("Gate everywhere":
// needless confirmations train people to click through the ones that matter).

import { findTools, nameWords } from '../tools.js';

// Words in a tool's name that mean "this changes something in the world".
const RISKY_WORDS = new Set([
  'send', 'email', 'mail', 'sms', 'message',
  'pay', 'payment', 'charge', 'refund', 'transfer', 'withdraw',
  'purchase', 'buy', 'order', 'book', 'subscribe', 'cancel',
  'delete', 'remove', 'destroy', 'drop', 'purge', 'wipe',
  'publish', 'post', 'tweet', 'share', 'deploy', 'submit',
]);

// If a name *starts* with one of these, it only reads:
// "searchEmails" is safe even though it contains "email".
const READ_VERBS = new Set([
  'get', 'list', 'read', 'search', 'fetch', 'find', 'lookup', 'look',
  'query', 'check', 'view', 'show', 'count', 'preview', 'draft',
]);

// When the name gives nothing away (e.g. "runAction"), we fall back to
// verbs in the tool's description: "Sends a payment to..."
const RISKY_DESCRIPTION = /\b(send|sends|pay|pays|charge|charges|refund|refunds|transfer|transfers|purchase|purchases|buy|buys|book|books|cancel|cancels|delete|deletes|remove|removes|destroy|destroys|publish|publishes|post|posts|deploy|deploys|submit|submits)\b/i;

// Signs of an approval step written inside the tool definition.
//   needsApproval: true   → Vercel AI SDK's built-in approval
//   interrupt(...)        → LangGraph's human-in-the-loop pause
const GATE_IN_TOOL = /\b(needsApproval|requiresApproval|requireApproval|needsConfirmation|requiresConfirmation|humanInTheLoop|awaitApproval)\b|\binterrupt\s*\(/;

// Signs of an approval step anywhere in the product. Used for plain
// schema tools, whose code runs in a separate dispatcher we can't
// connect to a specific tool.
const GATE_ANYWHERE = /\b(needsApproval|requiresApproval|onApprove)\b|<ToolCall\b|\bwindow\.confirm\s*\(|\binterrupt\s*\(/;

/** Is this tool consequential? Returns the reason, or null. */
export function riskReason(tool) {
  const words = nameWords(tool.name);
  if (READ_VERBS.has(words[0])) return null;
  const risky = words.find((w) => RISKY_WORDS.has(w));
  if (risky) return `name contains "${risky}"`;
  const description = tool.body.match(/\bdescription\s*:\s*(['"`])([\s\S]*?)\1/);
  const verb = description && description[2].match(RISKY_DESCRIPTION);
  if (verb) return `description says "${verb[0]}"`;
  return null;
}

/** How is this tool gated? Returns a description, or null if it isn't. */
function gateFor(tool, projectHasGate) {
  const inTool = tool.body.match(GATE_IN_TOOL);
  if (inTool) return `approval step in the tool (${inTool[0].replace(/\s*\($/, '()')})`;
  if (tool.style === 'ai-sdk' && !/\bexecute\s*[:(]/.test(tool.body)) {
    // An AI SDK tool with no `execute` can't run on the server by
    // itself: the app has to handle it in the UI. That's the SDK's
    // documented human-in-the-loop pattern, so we count it, and ask
    // the agent to confirm the UI really asks the user.
    return 'no execute function, so the UI has to handle it';
  }
  if (tool.style === 'schema' && projectHasGate) return 'an approval step exists elsewhere in the product';
  return null;
}

/**
 * @param {{path: string, content: string}[]} files
 * @returns {object} a CheckResult
 */
export function checkGates(files) {
  const result = {
    id: 'gates',
    label: 'Consequential actions ask first',
    impact: 'critical',
    weight: 5,
    applicable: true,
    reason: null,
    score: 0,
    issues: [],
    evidence: [],
    judge: [],
    fix: 'Put a human approval step in front of every consequential tool, stronger for irreversible ones. felt-ui <ToolCall reversible={false}> (available now), or needsApproval: true in the Vercel AI SDK.',
    source: 'https://github.com/Owl-Listener/agent-design-primer/blob/main/chapters/L4-high-stakes-gates.md',
  };

  // 1. Find the tools.
  const tools = findTools(files);
  if (tools.length === 0) {
    return { ...result, applicable: false, score: null, reason: 'no agent tools found' };
  }

  // 2. Sort them into consequential and harmless.
  const risky = [];
  const harmless = [];
  for (const tool of tools) {
    const why = riskReason(tool);
    (why ? risky : harmless).push({ tool, why });
  }
  if (risky.length === 0) {
    return { ...result, applicable: false, score: null, reason: `${tools.length} tool(s) found, none consequential` };
  }

  // 3. Is each consequential tool gated?
  const projectHasGate = files.some((f) => GATE_ANYWHERE.test(f.content));
  let gated = 0;
  for (const { tool, why } of risky) {
    const where = `${tool.path}:${tool.line}`;
    const gate = gateFor(tool, projectHasGate);
    result.evidence.push({
      signal: gate ? `Gated: ${gate}` : 'Not gated',
      path: tool.path,
      line: tool.line,
      text: `${tool.name} (${why})`,
    });
    if (gate) {
      gated++;
    } else {
      result.issues.push({
        severity: 'critical',
        message: `"${tool.name}" (${where}) can act in the world without asking the user first.`,
      });
    }
  }
  result.score = Math.round((100 * gated) / risky.length);

  // "Gate everywhere": harmless tools that ask for approval anyway.
  for (const { tool } of harmless) {
    if (GATE_IN_TOOL.test(tool.body)) {
      result.score = Math.max(0, result.score - 10);
      result.issues.push({
        severity: 'moderate',
        message: `"${tool.name}" (${tool.path}:${tool.line}) only reads, but still asks for approval. Needless confirmations train people to click through the ones that matter (anti-pattern: "Gate everywhere").`,
      });
    }
  }

  result.judge.push(
    'Does each gate match the stakes? Irreversible actions (sending, paying, deleting) need more than a one-click "OK" (anti-pattern: "Soft gate for a hard action").',
    'Does the approval show the details that matter before the user approves: who it goes to, how much, what gets deleted?',
    'Are there consequential tools whose names don\'t give them away (e.g. "runAction", "execute")? Read the tool list and check.',
  );
  if (risky.some(({ tool }) => tool.style === 'ai-sdk' && !/\bexecute\s*[:(]/.test(tool.body))) {
    result.judge.push('For tools with no execute function: does the UI really ask the user, or does it run them automatically (e.g. in onToolCall)?');
  }

  return result;
}
