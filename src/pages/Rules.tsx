import { useEffect, useState } from 'react';
import { Trash2, Plus, X, ToggleLeft, ToggleRight, Wand2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import {
  getRules,
  deleteRule,
  updateRule,
  saveRule,
  applyRuleRetroactive,
  getCustomCategories,
  saveCustomCategory,
  deleteCustomCategory,
} from '../lib/firestore';
import { CATEGORY_META, COLOUR_HEX } from '../lib/categorise';
import type { Rule, CustomCategory } from '../lib/types';
import CreateRuleModal from '../components/CreateRuleModal';

// ── Category groups for the left panel ───────────────────────────────────────

const CATEGORY_GROUPS: { label: string; keys: string[] }[] = [
  {
    label: 'Income',
    keys: Object.entries(CATEGORY_META)
      .filter(([, m]) => m.kind === 'income')
      .map(([k]) => k),
  },
  {
    label: 'Business Expenses',
    keys: Object.entries(CATEGORY_META)
      .filter(([, m]) => m.isBusiness && m.kind !== 'income')
      .map(([k]) => k),
  },
  {
    label: 'Personal Expenses',
    keys: Object.entries(CATEGORY_META)
      .filter(([, m]) => !m.isBusiness && m.kind !== 'income' && m.kind !== 'internal_transfer')
      .map(([k]) => k),
  },
  {
    label: 'Internal Transfers',
    keys: Object.entries(CATEGORY_META)
      .filter(([, m]) => m.kind === 'internal_transfer')
      .map(([k]) => k),
  },
];

const COLOUR_OPTIONS: { value: CustomCategory['colour']; label: string }[] = [
  { value: 'blue', label: 'Blue (Business)' },
  { value: 'green', label: 'Green (Personal)' },
  { value: 'purple', label: 'Purple (International)' },
  { value: 'amber', label: 'Amber (Review)' },
  { value: 'gray', label: 'Gray (Internal)' },
];

function ColourDot({ colour }: { colour: CustomCategory['colour'] }) {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full flex-shrink-0"
      style={{ backgroundColor: COLOUR_HEX[colour] }}
    />
  );
}

// ── Categories panel ──────────────────────────────────────────────────────────

function CategoriesPanel({
  customCats,
  onAddCustom,
  onDeleteCustom,
}: {
  customCats: CustomCategory[];
  onAddCustom: (cat: CustomCategory) => Promise<void>;
  onDeleteCustom: (id: string) => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [isBusiness, setIsBusiness] = useState(false);
  const [isFixed, setIsFixed] = useState(false);
  const [colour, setColour] = useState<CustomCategory['colour']>('green');
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!name.trim()) return;
    setSaving(true);
    const cat: CustomCategory = {
      id: `cat_${Date.now()}`,
      name: name.trim(),
      isBusiness,
      isFixed,
      colour,
    };
    try {
      await onAddCustom(cat);
      setName('');
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900">Categories</h3>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
        >
          {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {showForm ? 'Cancel' : 'Add custom'}
        </button>
      </div>

      {/* Add custom category form */}
      {showForm && (
        <div className="mb-4 p-3 rounded-xl border border-blue-100 bg-blue-50/50 space-y-3">
          <input
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400"
            placeholder="Category name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <select
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none"
            value={colour}
            onChange={(e) => setColour(e.target.value as CustomCategory['colour'])}
          >
            {COLOUR_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isBusiness}
                onChange={(e) => setIsBusiness(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 accent-blue-600"
              />
              Business
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isFixed}
                onChange={(e) => setIsFixed(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 accent-blue-600"
              />
              Fixed
            </label>
          </div>
          <button
            disabled={!name.trim() || saving}
            onClick={handleAdd}
            className="w-full px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Adding…' : 'Add category'}
          </button>
        </div>
      )}

      {/* Custom categories */}
      {customCats.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">
            Custom
          </p>
          <div className="space-y-1">
            {customCats.map((cat) => (
              <div
                key={cat.id}
                className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 group"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ColourDot colour={cat.colour} />
                  <span className="text-sm text-slate-700 truncate">{cat.name}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {cat.isBusiness && (
                    <span className="text-xs px-1 py-0.5 rounded bg-blue-50 text-blue-600">
                      Biz
                    </span>
                  )}
                  {cat.isFixed && (
                    <span className="text-xs px-1 py-0.5 rounded bg-slate-100 text-slate-500">
                      Fixed
                    </span>
                  )}
                  <button
                    onClick={() => onDeleteCustom(cat.id)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-500 text-slate-400 transition-all"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Built-in categories by group */}
      <div className="space-y-4 overflow-y-auto flex-1">
        {CATEGORY_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.keys.map((key) => {
                const meta = CATEGORY_META[key];
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <ColourDot colour={meta.colour} />
                      <span className="text-sm text-slate-700 truncate">{key}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {meta.isBusiness && (
                        <span className="text-xs px-1 py-0.5 rounded bg-blue-50 text-blue-600">
                          Biz
                        </span>
                      )}
                      {meta.isFixed && (
                        <span className="text-xs px-1 py-0.5 rounded bg-slate-100 text-slate-500">
                          Fixed
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Rules panel ───────────────────────────────────────────────────────────────

function describeCondition(cond: Rule['conditions'][0]): string {
  const field = cond.matchField === 'rawDescription' ? 'raw description' : 'description';
  const type = cond.matchType === 'exact' ? 'is exactly' : 'contains';
  return `${field} ${type} "${cond.matchValue}"`;
}

function RulesPanel({
  rules,
  onToggle,
  onDelete,
  onAddRule,
  onEditRule,
}: {
  rules: Rule[];
  onToggle: (rule: Rule) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onAddRule: () => void;
  onEditRule: (rule: Rule) => void;
}) {
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleToggle(e: React.MouseEvent, rule: Rule) {
    e.stopPropagation();
    setTogglingId(rule.id);
    try {
      await onToggle(rule);
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setDeletingId(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingId(null);
    }
  }

  if (rules.length === 0) {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-900">Rules</h3>
          <button
            onClick={onAddRule}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
          >
            <Plus className="h-3.5 w-3.5" /> Add rule
          </button>
        </div>
        <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center space-y-2">
          <Wand2 className="h-8 w-8 text-slate-200 mx-auto" />
          <p className="text-sm font-medium text-slate-600">No rules yet</p>
          <p className="text-xs text-slate-400">
            Add a rule here, or click any transaction and choose "Create rule from this."
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900">Rules</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">
            {rules.filter((r) => r.enabled).length} of {rules.length} active
          </span>
          <button
            onClick={onAddRule}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
          >
            <Plus className="h-3.5 w-3.5" /> Add rule
          </button>
        </div>
      </div>
      <div className="space-y-2">
        {rules.map((rule) => (
          <div
            key={rule.id}
            onClick={() => onEditRule(rule)}
            className={`rounded-xl border p-4 cursor-pointer transition-colors hover:border-blue-200 hover:bg-blue-50/30 ${
              rule.enabled ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50/50'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-medium truncate ${
                    rule.enabled ? 'text-slate-900' : 'text-slate-400'
                  }`}
                >
                  {rule.description}
                </p>
                <div className="mt-1 space-y-0.5">
                  {rule.conditions.map((cond, i) => (
                    <p key={i} className="text-xs text-slate-400">
                      {rule.conditions.length > 1 && (
                        <span className="text-slate-300 mr-1">{i === 0 ? 'when' : 'or'}</span>
                      )}
                      {describeCondition(cond)}
                    </p>
                  ))}
                </div>
                <p className="text-xs mt-1.5">
                  <span className="text-slate-400">→ </span>
                  <span className={rule.enabled ? 'text-blue-600 font-medium' : 'text-slate-400'}>
                    {rule.category}
                  </span>
                </p>
                {rule.notes && (
                  <p className="text-xs text-slate-400 mt-0.5 italic">Note: {rule.notes}</p>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={(e) => handleToggle(e, rule)}
                  disabled={togglingId === rule.id}
                  className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
                  title={rule.enabled ? 'Disable rule' : 'Enable rule'}
                >
                  {rule.enabled ? (
                    <ToggleRight className="h-5 w-5 text-blue-600" />
                  ) : (
                    <ToggleLeft className="h-5 w-5 text-slate-300" />
                  )}
                </button>
                <button
                  onClick={(e) => handleDelete(e, rule.id)}
                  disabled={deletingId === rule.id}
                  className="p-1 hover:bg-red-50 hover:text-red-500 text-slate-300 rounded-lg transition-colors"
                  title="Delete rule"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Rules() {
  const { user } = useAuth();
  const [rules, setRules] = useState<Rule[]>([]);
  const [customCats, setCustomCats] = useState<CustomCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddRule, setShowAddRule] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [retroactiveMsg, setRetroactiveMsg] = useState('');

  useEffect(() => {
    if (!db || !user) {
      setLoading(false);
      return;
    }
    Promise.all([getRules(db, user.uid), getCustomCategories(db, user.uid)])
      .then(([rs, cats]) => {
        setRules(rs);
        setCustomCats(cats);
      })
      .finally(() => setLoading(false));
  }, [user]);

  async function handleToggle(rule: Rule) {
    if (!db || !user) return;
    const enabled = !rule.enabled;
    await updateRule(db, user.uid, rule.id, { enabled });
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled } : r)));
  }

  async function handleDeleteRule(id: string) {
    if (!db || !user) return;
    await deleteRule(db, user.uid, id);
    setRules((prev) => prev.filter((r) => r.id !== id));
  }

  async function handleAddCustom(cat: CustomCategory) {
    if (!db || !user) return;
    await saveCustomCategory(db, user.uid, cat);
    setCustomCats((prev) => [...prev, cat]);
  }

  async function handleDeleteCustom(id: string) {
    if (!db || !user) return;
    await deleteCustomCategory(db, user.uid, id);
    setCustomCats((prev) => prev.filter((c) => c.id !== id));
  }

  async function handleSaveRule(rule: Rule, retroactive: boolean) {
    if (!db || !user) return;
    const isEdit = rules.some((r) => r.id === rule.id);
    await saveRule(db, user.uid, rule);
    setRules((prev) =>
      isEdit ? prev.map((r) => (r.id === rule.id ? rule : r)) : [rule, ...prev]
    );
    if (retroactive) {
      const count = await applyRuleRetroactive(db, user.uid, rule);
      if (count > 0) {
        setRetroactiveMsg(`Applied to ${count} past transaction${count !== 1 ? 's' : ''}.`);
        setTimeout(() => setRetroactiveMsg(''), 4000);
      }
    }
    setShowAddRule(false);
    setEditingRule(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-7 w-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Rules & Categories</h2>
        <p className="text-sm text-slate-600 mt-1">
          The categorisation rules that shape every dashboard you'll ever see.
        </p>
      </div>

      {retroactiveMsg && (
        <div className="px-4 py-2.5 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
          {retroactiveMsg}
        </div>
      )}

      <div className="flex gap-6 flex-col lg:flex-row">
        {/* Left panel — categories */}
        <div className="lg:w-72 xl:w-80 flex-shrink-0 rounded-2xl border border-slate-200 bg-white p-5 flex flex-col">
          <CategoriesPanel
            customCats={customCats}
            onAddCustom={handleAddCustom}
            onDeleteCustom={handleDeleteCustom}
          />
        </div>

        {/* Right panel — rules */}
        <div className="flex-1 rounded-2xl border border-slate-200 bg-white p-5">
          <RulesPanel
            rules={rules}
            onToggle={handleToggle}
            onDelete={handleDeleteRule}
            onAddRule={() => setShowAddRule(true)}
            onEditRule={(rule) => setEditingRule(rule)}
          />
        </div>
      </div>

      {showAddRule && (
        <CreateRuleModal
          customCategories={customCats}
          onConfirm={handleSaveRule}
          onClose={() => setShowAddRule(false)}
        />
      )}

      {editingRule && (
        <CreateRuleModal
          existingRule={editingRule}
          customCategories={customCats}
          onConfirm={handleSaveRule}
          onClose={() => setEditingRule(null)}
        />
      )}
    </div>
  );
}
