import type { Rule, RuleCondition, Transaction } from './types';

function matchesCondition(cond: RuleCondition, tx: Transaction): boolean {
  const haystack = (tx[cond.matchField] ?? '').toLowerCase();
  const needle = cond.matchValue.toLowerCase().trim();
  if (!needle) return false;
  return cond.matchType === 'exact' ? haystack === needle : haystack.includes(needle);
}

export function matchesRule(rule: Rule, tx: Transaction): boolean {
  if (!rule.enabled) return false;
  return rule.conditions.some((cond) => matchesCondition(cond, tx));
}

export function applyRule(rule: Rule, tx: Transaction): Transaction {
  const notes = rule.notes
    ? tx.notes ? `${tx.notes}; ${rule.notes}` : rule.notes
    : tx.notes;
  return { ...tx, category: rule.category, isManualOverride: true, needsReview: false, notes };
}
