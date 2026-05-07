import type { Rule, Transaction } from './types';

export function matchesRule(rule: Rule, tx: Transaction): boolean {
  if (!rule.enabled) return false;
  const haystack = (tx[rule.matchField] ?? '').toLowerCase();
  const needle = rule.matchValue.toLowerCase().trim();
  if (!needle) return false;
  return rule.matchType === 'exact' ? haystack === needle : haystack.includes(needle);
}

export function applyRule(rule: Rule, tx: Transaction): Transaction {
  const notes = rule.notes
    ? tx.notes ? `${tx.notes}; ${rule.notes}` : rule.notes
    : tx.notes;
  return { ...tx, category: rule.category, isManualOverride: true, notes };
}
