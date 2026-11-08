// shared/checks/tools-visible.js
//
// Check 3 · tools-visible · "The user can see what the agent did"
//
// Heuristic #10 (agent-design-primer): Tool use is surfaced. "When the
// agent calls an external tool, the user should be able to tell,
// including what was sent, what came back, and under what authority."
// Anti-pattern: "Silent ingestion"
//
// The funnel:
//
//   0. Does the agent have tools?                 (none → not applicable)
//   0. Is there a UI in this code to look at?     (none → not applicable)
//   1. Does the UI handle tool calls at all?       50 points
//   2. Does it show what was sent (the inputs)?    25 points
//   3. Does it show what came back (result/state)? 25 points

import { findTools } from '../tools.js';
import { stripComments } from '../signals.js';

// A file counts as UI if it's a React component file or uses a chat hook.
const isUiFile = (f) => /\.(tsx|jsx)$/.test(f.path) || /\buse(Chat|Assistant)\s*(?:<[^>()]*>)?\s*\(/.test(f.content);

// 1. The UI deals with tool-call messages. Covers the Vercel AI SDK's
// message parts (`part.type === 'tool-sendEmail'`, `dynamic-tool`), its
// older `toolInvocations`, Anthropic's `tool_use` blocks, and felt-ui.
const TOOL_PARTS = /\btoolInvocations?\b|['"`]tool-|\btype\s*===?\s*['"`]tool|\bstartsWith\(\s*['"`]tool|\btool_use\b|\bdynamic-tool\b|\btoolName\b|<ToolCall\b/;

// 2. It shows the tool's inputs: who the email goes to, how much the refund is.
const INPUTS = /\b(part|toolInvocation|invocation|call|toolCall|block)\.(input|args|arguments|parameters)\b|\bargs\s*=\s*\{/;

// 3. It shows the outcome: the result, an error, or the call's live state.
const OUTPUTS = /\b(part|toolInvocation|invocation|call|toolCall|block)\.(output|result|state|errorText)\b|['"`](output-available|output-error|result)['"`]|<ToolCall\b[^>]*\bstatus\s*=/;

/**
 * @param {{path: string, content: string}[]} files
 * @returns {object} a CheckResult
 */
export function checkToolsVisible(files) {
  const result = {
    id: 'tools-visible',
    label: 'The user can see what the agent did',
    impact: 'high',
    weight: 3,
    applicable: true,
    reason: null,
    score: 0,
    issues: [],
    evidence: [],
    judge: [],
    fix: 'Render every tool call in the conversation: a human-readable name, what was sent, and what came back. felt-ui <ToolCall> (available now) shows all three.',
    source: 'https://github.com/Owl-Listener/agent-design-primer/blob/main/chapters/L3-tool-use.md',
  };

  const tools = findTools(files);
  if (tools.length === 0) {
    return { ...result, applicable: false, score: null, reason: 'no agent tools found' };
  }
  // Comments are blanked out (line numbers kept), so a note that only
  // mentions <ToolCall> doesn't count as showing tool calls.
  const ui = files.filter(isUiFile).map((f) => ({ ...f, content: stripComments(f.content) }));
  const original = new Map(files.map((f) => [f.path, f.content.split('\n')]));
  if (ui.length === 0) {
    return { ...result, applicable: false, score: null, reason: `${tools.length} tool(s) found, but no UI code to check` };
  }

  // Find the first line in the UI that matches a signal, for evidence.
  const firstHit = (pattern, signal) => {
    for (const f of ui) {
      const lines = f.content.split('\n');
      const i = lines.findIndex((l) => pattern.test(l));
      if (i !== -1) return { signal, path: f.path, line: i + 1, text: original.get(f.path)[i].trim() };
    }
    // Some patterns (like a multi-line <ToolCall ... status=>) span lines.
    const f = ui.find((file) => pattern.test(file.content));
    return f ? { signal, path: f.path, line: null, text: '(spans several lines)' } : null;
  };

  const names = tools.map((t) => t.name).join(', ');

  // 1. Tool calls reach the UI at all?
  const parts = firstHit(TOOL_PARTS, 'UI handles tool calls');
  if (!parts) {
    result.issues.push({
      severity: 'high',
      message: `The agent has ${tools.length} tool(s) (${names}), but the UI never shows a tool call. Users can't tell what the agent did on their behalf (anti-pattern: "Silent ingestion").`,
    });
    result.judge.push('Check whether tool calls are shown some other way, e.g. a custom message renderer or an activity log this scan does not recognise.');
    return result;
  }
  result.score += 50;
  result.evidence.push(parts);

  // 2. Inputs shown?
  const inputs = firstHit(INPUTS, 'Shows what was sent');
  if (inputs) {
    result.score += 25;
    result.evidence.push(inputs);
  } else {
    result.issues.push({
      severity: 'moderate',
      message: 'Tool calls appear in the UI, but not what was sent. Users see "sending email" without seeing who it goes to or what it says.',
    });
  }

  // 3. Outcome shown?
  const outputs = firstHit(OUTPUTS, 'Shows what came back');
  if (outputs) {
    result.score += 25;
    result.evidence.push(outputs);
  } else {
    result.issues.push({
      severity: 'moderate',
      message: 'Tool calls appear in the UI, but not their outcome. Users can\'t tell whether the action worked, failed, or is still running.',
    });
  }

  result.judge.push(
    'Are tool calls labelled in human terms ("Emailing alex@acme.com") rather than raw names ("sendEmail")?',
    'Is every tool shown, or only some? Look for tools that are filtered out or only appear while waiting for approval.',
    'Can a screen-reader user tell when a tool starts, finishes, or fails?',
  );

  return result;
}
