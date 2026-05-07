import { useState } from 'react';
import { X, Wand2, Plus, Trash2 } from 'lucide-react';
import { CATEGORY_META } from '../lib/categorise';
import type { Transaction, Rule, RuleCondition, CustomCategory } from '../lib/types';

interface Props {
  tx?: Transaction;
  existingRule?: Rule;
  customCategories: CustomCategory[];
  onConfirm: (rule: Rule, retroactive: boolean) => Promise<void>;
  onClose: () => void;
}

const BLANK_CONDITION: RuleCondition = {
  matchField: 'description',
  matchType: 'contains',
  matchValue: '',
};

function conditionFromTx(tx: Transaction): RuleCondition {
  return { matchField: 'description', matchType: 'contains', matchValue: tx.description };
}

export default function CreateRuleModal({
  tx,
  existingRule,
  customCategories,
  onConfirm,
  onClose,
}: Props) {
  const isEdit = !!existingRule;

  const [description, setDescription] = useState(
    existingRule?.description ?? (tx ? `${tx.description} → ${tx.category}` : '')
  );
  const [conditions, setConditions] = useState<RuleCondition[]>(
    existingRule?.conditions ?? (tx ? [conditionFromTx(tx)] : [{ ...BLANK_CONDITION }])
  );
  const [category, setCategory] = useState(existingRule?.category ?? tx?.category ?? '');
  const [notes, setNotes] = useState(existingRule?.notes ?? '');
  const [retroactive, setRetroactive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [catQuery, setCatQuery] = useState('');
  const [catOpen, setCatOpen] = useState(false);

  const builtInCats = Object.keys(CATEGORY_META);
  const customCatNames = customCategories.map((c) => c.name);
  const allCats = [...new Set([...builtInCats, ...customCatNames])].sort();
  const filteredCats = catQuery
    ? allCats.filter((c) => c.toLowerCase().includes(catQuery.toLowerCase()))
    : allCats;

  const canSubmit =
    conditions.length > 0 &&
    conditions.every((c) => c.matchValue.trim().length > 0) &&
    category.length > 0 &&
    !saving;

  function updateCondition(i: number, patch: Partial<RuleCondition>) {
    setConditions((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  function removeCondition(i: number) {
    setConditions((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addCondition() {
    setConditions((prev) => [...prev, { ...BLANK_CONDITION }]);
  }

  async function handleConfirm() {
    if (!canSubmit) return;
    const rule: Rule = {
      id: existingRule?.id ?? `rule_${Date.now()}`,
      description,
      conditions,
      category,
      notes,
      createdAt: existingRule?.createdAt ?? new Date().toISOString(),
      enabled: existingRule?.enabled ?? true,
    };
    setSaving(true);
    try {
      await onConfirm(rule, retroactive);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-blue-600" />
            <h3 className="font-semibold text-slate-900">
              {isEdit ? 'Edit rule' : 'Create rule'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto">
          {/* Rule name */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Rule name</label>
            <input
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Netflix → Entertainment Subscriptions"
            />
          </div>

          {/* Conditions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-600">
                Match conditions{' '}
                <span className="font-normal text-slate-400">
                  {conditions.length > 1 ? '— any one is enough' : ''}
                </span>
              </label>
            </div>

            <div className="space-y-2">
              {conditions.map((cond, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <select
                    className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none bg-white flex-shrink-0"
                    value={cond.matchField}
                    onChange={(e) =>
                      updateCondition(i, {
                        matchField: e.target.value as RuleCondition['matchField'],
                      })
                    }
                  >
                    <option value="description">description</option>
                    <option value="rawDescription">raw description</option>
                  </select>
                  <select
                    className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none bg-white flex-shrink-0"
                    value={cond.matchType}
                    onChange={(e) =>
                      updateCondition(i, {
                        matchType: e.target.value as RuleCondition['matchType'],
                      })
                    }
                  >
                    <option value="contains">contains</option>
                    <option value="exact">is exactly</option>
                  </select>
                  <input
                    className="flex-1 min-w-0 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400"
                    value={cond.matchValue}
                    onChange={(e) => updateCondition(i, { matchValue: e.target.value })}
                    placeholder="Match text…"
                  />
                  {conditions.length > 1 && (
                    <button
                      onClick={() => removeCondition(i)}
                      className="flex-shrink-0 p-1.5 hover:bg-red-50 hover:text-red-500 text-slate-300 rounded-lg transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={addCondition}
              className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
            >
              <Plus className="h-3.5 w-3.5" /> Add another condition
            </button>
          </div>

          {/* Target category */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Set category to
            </label>
            <div className="relative">
              <input
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400"
                value={catOpen ? catQuery : category}
                placeholder="Search categories…"
                onFocus={() => {
                  setCatOpen(true);
                  setCatQuery('');
                }}
                onBlur={() => setTimeout(() => setCatOpen(false), 150)}
                onChange={(e) => setCatQuery(e.target.value)}
              />
              {catOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
                  {filteredCats.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-slate-400">No categories found.</p>
                  ) : (
                    filteredCats.map((cat) => (
                      <button
                        key={cat}
                        onMouseDown={() => {
                          setCategory(cat);
                          setCatOpen(false);
                          setCatQuery('');
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 transition-colors ${
                          cat === category
                            ? 'font-medium text-blue-600 bg-blue-50/50'
                            : 'text-slate-700'
                        }`}
                      >
                        {cat}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Optional note */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Add note to matched transactions{' '}
              <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Netflix annual billing"
            />
          </div>

          {/* Retroactive */}
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={retroactive}
              onChange={(e) => setRetroactive(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-blue-600"
            />
            <div>
              <p className="text-sm text-slate-700">
                {isEdit ? 'Re-apply to past transactions' : 'Apply to past transactions'}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Re-categorise all matching transactions already imported.
              </p>
            </div>
          </label>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex gap-2 justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={!canSubmit}
            onClick={handleConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? (isEdit ? 'Saving…' : 'Creating…') : isEdit ? 'Save rule' : 'Create rule'}
          </button>
        </div>
      </div>
    </div>
  );
}
