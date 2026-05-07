import { useState } from 'react';
import { X, Wand2, CheckCircle } from 'lucide-react';
import { CATEGORY_META } from '../lib/categorise';
import type { Transaction, CustomCategory } from '../lib/types';

export interface EditPayload {
  category: string;
  notes: string;
  isManualOverride: boolean;
  needsReview: boolean;
}

interface Props {
  tx: Transaction | null;
  customCategories: CustomCategory[];
  onClose: () => void;
  onSave: (txId: string, payload: EditPayload) => Promise<void>;
  onCreateRule: (tx: Transaction) => void;
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// Inner form — keyed by tx.id so all state resets when a different row is clicked.
function EditForm({
  tx,
  customCategories,
  onClose,
  onSave,
  onCreateRule,
}: {
  tx: Transaction;
  customCategories: CustomCategory[];
  onClose: () => void;
  onSave: (txId: string, payload: EditPayload) => Promise<void>;
  onCreateRule: (tx: Transaction) => void;
}) {
  const [category, setCategory] = useState(tx.category);
  const [notes, setNotes] = useState(tx.notes);
  const [needsReview, setNeedsReview] = useState(tx.needsReview);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [catQuery, setCatQuery] = useState('');
  const [catOpen, setCatOpen] = useState(false);

  const builtInCats = Object.keys(CATEGORY_META);
  const customCatNames = customCategories.map((c) => c.name);
  const allCats = [...new Set([...builtInCats, ...customCatNames])].sort();
  const filteredCats = catQuery
    ? allCats.filter((c) => c.toLowerCase().includes(catQuery.toLowerCase()))
    : allCats;

  const isDirty =
    category !== tx.category || notes !== tx.notes || needsReview !== tx.needsReview;
  const isOverride = category !== tx.autoCategory;

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(tx.id, {
        category,
        notes,
        isManualOverride: isOverride,
        needsReview,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-slate-100">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 text-sm leading-snug line-clamp-2">
              {tx.description}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-slate-400 font-mono">{fmtDate(tx.date)}</span>
              <span className="text-xs text-slate-300">·</span>
              <span className="text-xs text-slate-500">{tx.account}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-1 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>
        <div
          className={`mt-3 text-lg font-semibold tabular-nums ${
            tx.kind === 'income'
              ? 'text-green-600'
              : tx.kind === 'internal_transfer'
              ? 'text-slate-400'
              : 'text-red-500'
          }`}
        >
          {tx.amount >= 0 ? '+' : ''}
          {tx.amount.toFixed(2)} EUR
        </div>
        {tx.autoCategory && tx.autoCategory !== category && (
          <p className="mt-1 text-xs text-slate-400">Auto: {tx.autoCategory}</p>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Category picker */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Category</label>
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
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 max-h-52 overflow-y-auto">
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
          {isOverride && category !== tx.autoCategory && (
            <p className="mt-1 text-xs text-amber-600">
              Overrides auto: "{tx.autoCategory}"
            </p>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Notes</label>
          <textarea
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 resize-none"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional note…"
          />
        </div>

        {/* Needs review toggle */}
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={needsReview}
            onChange={(e) => setNeedsReview(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 accent-amber-500"
          />
          <span className="text-sm text-slate-700">Flag for review</span>
        </label>

        {/* Raw description (reference) */}
        {tx.rawDescription !== tx.description && (
          <details className="text-xs text-slate-400">
            <summary className="cursor-pointer hover:text-slate-500">Raw description</summary>
            <p className="mt-1 font-mono break-all">{tx.rawDescription}</p>
          </details>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-slate-100 space-y-2">
        <button
          onClick={() => onCreateRule(tx)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <Wand2 className="h-3.5 w-3.5" />
          Create rule from this
        </button>
        <button
          disabled={!isDirty || saving}
          onClick={handleSave}
          className={`w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            !isDirty
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : saved
              ? 'bg-green-600 text-white'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {saved ? (
            <>
              <CheckCircle className="h-3.5 w-3.5" /> Saved
            </>
          ) : saving ? (
            'Saving…'
          ) : (
            'Save changes'
          )}
        </button>
      </div>
    </div>
  );
}

export default function TransactionEditPanel({
  tx,
  customCategories,
  onClose,
  onSave,
  onCreateRule,
}: Props) {
  return (
    <div className={`fixed inset-0 z-40 ${tx ? '' : 'pointer-events-none'}`}>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/20 transition-opacity duration-200 ${
          tx ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />
      {/* Drawer */}
      <div
        className={`absolute right-0 top-0 bottom-0 w-96 bg-white shadow-xl flex flex-col transition-transform duration-200 ${
          tx ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {tx && (
          <EditForm
            key={tx.id}
            tx={tx}
            customCategories={customCategories}
            onClose={onClose}
            onSave={onSave}
            onCreateRule={onCreateRule}
          />
        )}
      </div>
    </div>
  );
}
