// shared/report.js
//
// Combines check results into one overall score.
//
// It's a weighted average, the same model as agent-ready: critical
// checks (weight 5) count more than moderate ones (weight 2). Checks
// that don't apply to this product are left out, so a chat app with
// no tools isn't punished, or rewarded, for the gates check.

/**
 * @param {{applicable: boolean, score: number|null, weight: number}[]} results
 * @returns {number|null}  0-100, or null when no check applied
 */
export function overallScore(results) {
  const applied = results.filter((r) => r.applicable);
  if (applied.length === 0) return null;
  const totalWeight = applied.reduce((sum, r) => sum + r.weight, 0);
  const weighted = applied.reduce((sum, r) => sum + r.score * r.weight, 0);
  return Math.round(weighted / totalWeight);
}
