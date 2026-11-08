// shared/checks/plan.js
//
// Check 4 · plan · "The plan comes before the work"
//
// Heuristic #2 (agent-design-primer): The plan is the contract. "What
// appears in the plan is what the agent will do. Plans that the agent
// quietly deviates from are not plans."
// Anti-pattern: "The reveal-after-the-fact": a plan shown only after the
// work is done is a receipt, not a contract.
//
// Applies to multi-step agents only. A chat that answers in one go has
// no plan to show. Three questions:
//
//   1. Does the agent work from a plan (a plan/todo tool or plan state)?  40
//   2. Is the plan shown to the user?                                      30
//   3. Can the user see and approve or change it before work starts?       30

import { stripComments } from '../signals.js';
import { findTools, nameWords } from '../tools.js';

// Signs the agent runs a longer task on its own. A short step limit
// (up to 5) is the standard way to let a chat call a tool and then
// answer ("check the weather, reply"), which needs no plan; that case
// is only applicable if the agent also has a planning tool.
// (Found in a real app, field-tests/.)
const AGENT_LOOP = [
  /\b(ToolLoopAgent|Experimental_Agent)\b|\bnew\s+Agent\s*\(/,
  /\bStateGraph\s*\(|\bcreateReactAgent\s*\(/,             // LangGraph
];
const STEP_LIMIT = /\b(?:stepCountIs|isStepCount)\s*\(\s*(\w+)\s*\)|\bmaxSteps\s*[:=]\s*(\w+)/;
const SHORT_LOOP_MAX = 5;

// A planning tool or plan state.
const PLAN_WORDS = new Set(['plan', 'plans', 'todo', 'todos', 'steps', 'checklist', 'tasks', 'task']);
const PLAN_STATE = /['"`]data-plan['"`]|\bplan\s*:\s*\{|\bsteps\s*:\s*\[|\btodos\s*:\s*\[/;

// The plan appears in the UI.
const PLAN_UI = /\btool-(todo|plan|task)\w*|<(Plan|Steps|Todo\w*|Task(List|s)?|Checklist)\b|\b(todos|plan\.steps|steps)\.map\s*\(|['"`]data-plan['"`]/i;

// The user can approve or change the plan before work starts.
const PLAN_APPROVAL_UI = /\b(Approve|Confirm|Edit|Accept)\s+(the\s+)?plan\b|\bonApprovePlan\b|\bonEditPlan\b/i;
const PLAN_APPROVAL_PROMPT = /\b(present|show|share)\s+(the|your)\s+plan\b[^.]{0,80}\b(wait|ask|confirm|approv)|\bbefore\s+(starting|proceeding|executing|acting)\b[^.]{0,60}\b(confirm|approv)/i;

const isUiFile = (f) => /\.(tsx|jsx)$/.test(f.path);

/**
 * @param {{path: string, content: string}[]} files
 * @returns {object} a CheckResult
 */
export function checkPlan(files) {
  const result = {
    id: 'plan',
    label: 'The plan comes before the work',
    impact: 'high',
    weight: 3,
    applicable: true,
    reason: null,
    score: 0,
    issues: [],
    evidence: [],
    judge: [],
    fix: 'Have the agent write its plan first (a plan or todo tool), show it as a checklist, and let the user approve or edit it before the first step runs. felt-ui <Plan> / <Steps> (planned).',
    source: 'https://github.com/Owl-Listener/agent-design-primer/blob/main/chapters/L3-plan-visibility.md',
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

  const planTools = findTools(files).filter((t) => nameWords(t.name).some((w) => PLAN_WORDS.has(w)));
  const framework = AGENT_LOOP.map((p) => hit(code, p, 'Agent loop')).find(Boolean);
  const limit = hit(code, STEP_LIMIT, 'Step limit');
  const limitValue = limit && Number((limit.text.match(STEP_LIMIT) || [])[1] ?? (limit.text.match(STEP_LIMIT) || [])[2]);
  const longLoop = limit && (Number.isNaN(limitValue) || limitValue > SHORT_LOOP_MAX); // computed limits count as long
  if (!framework && !longLoop && planTools.length === 0) {
    const reason = limit
      ? `a short tool loop (up to ${limitValue} steps, ${limit.path}:${limit.line}), not a long-running agent`
      : 'not a multi-step agent (no step loop or agent framework found)';
    return { ...result, applicable: false, score: null, reason };
  }
  result.evidence.push(framework || limit || { signal: 'Planning tool', path: planTools[0].path, line: planTools[0].line, text: planTools[0].name });

  // --- 1. A plan exists --------------------------------------------------
  const planState = hit(code, PLAN_STATE, 'Plan in agent state');
  if (planTools.length === 0 && !planState) {
    result.issues.push({
      severity: 'high',
      message: 'This agent runs several steps on its own, but nothing in the code gives it a plan to show: no plan or todo tool, no plan state. Users only find out what it did afterwards (anti-pattern: "The reveal-after-the-fact").',
    });
    result.judge.push('Does the agent describe its plan in plain text before acting (in its prompt)? That counts for something, but users can\'t track or change a plan that\'s just prose.');
    return result;
  }
  result.score += 40;
  for (const t of planTools.slice(0, 2)) result.evidence.push({ signal: 'Planning tool', path: t.path, line: t.line, text: t.name });
  if (planState && planTools.length === 0) result.evidence.push(planState);

  // --- 2. The plan is shown ----------------------------------------------
  const shown = hit(code.filter(isUiFile), PLAN_UI, 'Plan shown in UI');
  if (shown) {
    result.score += 30;
    result.evidence.push(shown);
  } else {
    result.issues.push({
      severity: 'high',
      message: 'The agent keeps a plan, but the UI never shows it. A plan the user can\'t see isn\'t a contract.',
    });
  }

  // --- 3. Approved before work starts -------------------------------------
  const gatedTool = planTools.find((t) => /\bneedsApproval\b/.test(t.body) || !/\bexecute\s*[:(]/.test(t.body));
  const approval =
    (gatedTool && { signal: 'Plan tool waits for the user', path: gatedTool.path, line: gatedTool.line, text: gatedTool.name }) ||
    hit(code.filter(isUiFile), PLAN_APPROVAL_UI, 'Approve or edit the plan') ||
    hit(code, PLAN_APPROVAL_PROMPT, 'Prompt asks to confirm the plan first');
  if (approval) {
    result.score += 30;
    result.evidence.push(approval);
  } else {
    result.issues.push({
      severity: 'moderate',
      message: 'The plan is shown while the agent works, but the user can\'t approve or change it before work starts. It\'s closer to a progress log than a contract.',
    });
  }

  result.judge.push(
    'Is the plan shown before the first step runs, or only alongside or after the work? (anti-pattern: "The reveal-after-the-fact")',
    'If the agent changes course mid-run, does the plan update visibly, and does it pause for anything the user didn\'t agree to? (heuristic: "The plan is the contract")',
    'Does every plan step show its status (to do, in progress, done, failed) in text, not only colour?',
  );
  return result;
}
