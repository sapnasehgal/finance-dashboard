import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpDown, Upload, Search } from 'lucide-react';
import {
  getTransactions,
  updateTransaction,
  saveRule,
  applyRuleRetroactive,
  getCustomCategories,
} from '../lib/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import type { Transaction, Rule, CustomCategory } from '../lib/types';
import type { EditPayload } from '../components/TransactionEditPanel';
import TransactionEditPanel from '../components/TransactionEditPanel';
import CreateRuleModal from '../components/CreateRuleModal';

type SortKey = 'date' | 'amount' | 'account' | 'category';
type SortDir = 'asc' | 'desc';
type KindFilter = 'all' | 'income' | 'expense' | 'internal' | 'review';
type AccountFilter = 'all' | 'BBVA' | 'Wise' | 'AMEX' | 'Iberia';

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function fmtAmount(tx: Transaction): string {
  const abs = Math.abs(tx.amount).toFixed(2);
  if (tx.originalCurrency && tx.originalCurrency !== 'EUR') {
    const origAbs = Math.abs(tx.originalAmount ?? tx.amount).toFixed(2);
    return `${tx.amount >= 0 ? '+' : '-'}${abs} EUR\n(${origAbs} ${tx.originalCurrency})`;
  }
  return `${tx.amount >= 0 ? '+' : '-'}${abs}`;
}

function accountDot(account: string) {
  const colours: Record<string, string> = {
    BBVA: 'bg-blue-500',
    Wise: 'bg-purple-500',
    AMEX: 'bg-slate-500',
    Iberia: 'bg-rose-500',
  };
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-2 w-2 rounded-full ${colours[account] ?? 'bg-slate-400'}`} />
      {account}
    </span>
  );
}

function SortButton({
  label,
  sortKey,
  current,
  dir,
  onClick,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onClick: (k: SortKey) => void;
}) {
  const active = current === sortKey;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick(sortKey);
      }}
      className={`flex items-center gap-1 text-left font-medium whitespace-nowrap
        ${active ? 'text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
    >
      {label}
      <ArrowUpDown className={`h-3 w-3 ${active ? 'opacity-100' : 'opacity-30'}`} />
      {active && <span className="text-xs">{dir === 'desc' ? '↓' : '↑'}</span>}
    </button>
  );
}

export default function Transactions() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [accountFilter, setAccountFilter] = useState<AccountFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [ruleSourceTx, setRuleSourceTx] = useState<Transaction | null>(null);
  const [retroactiveMsg, setRetroactiveMsg] = useState('');

  useEffect(() => {
    if (!db || !user) {
      setLoading(false);
      return;
    }
    Promise.all([
      getTransactions(db, user.uid, 500),
      getCustomCategories(db, user.uid),
    ])
      .then(([txs, cats]) => {
        setTransactions(txs);
        setCustomCategories(cats);
      })
      .finally(() => setLoading(false));
  }, [user]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  async function handleSave(txId: string, payload: EditPayload) {
    if (!db || !user) return;
    await updateTransaction(db, user.uid, txId, payload);
    setTransactions((prev) =>
      prev.map((tx) => (tx.id === txId ? { ...tx, ...payload } : tx))
    );
    setSelectedTx((prev) => (prev?.id === txId ? { ...prev, ...payload } : prev));
  }

  async function handleCreateRule(rule: Rule, retroactive: boolean) {
    if (!db || !user) return;
    await saveRule(db, user.uid, rule);
    if (retroactive) {
      const count = await applyRuleRetroactive(db, user.uid, rule);
      if (count > 0) {
        const updated = await getTransactions(db, user.uid, 500);
        setTransactions(updated);
        setSelectedTx((prev) => {
          if (!prev) return prev;
          return updated.find((t) => t.id === prev.id) ?? prev;
        });
        setRetroactiveMsg(`Applied to ${count} past transaction${count !== 1 ? 's' : ''}.`);
        setTimeout(() => setRetroactiveMsg(''), 4000);
      }
    }
    setRuleSourceTx(null);
  }

  // ── Filter + sort ─────────────────────────────────────────────────────────

  const filtered = transactions.filter((tx) => {
    if (kindFilter === 'income' && tx.kind !== 'income') return false;
    if (kindFilter === 'expense' && tx.kind !== 'expense') return false;
    if (kindFilter === 'internal' && tx.kind !== 'internal_transfer') return false;
    if (kindFilter === 'review' && !tx.needsReview) return false;
    if (accountFilter !== 'all' && tx.account !== accountFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !tx.description.toLowerCase().includes(q) &&
        !tx.rawDescription.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'date') cmp = a.date.localeCompare(b.date);
    if (sortKey === 'amount') cmp = Math.abs(a.amount) - Math.abs(b.amount);
    if (sortKey === 'account') cmp = a.account.localeCompare(b.account);
    if (sortKey === 'category') cmp = a.category.localeCompare(b.category);
    return sortDir === 'desc' ? -cmp : cmp;
  });

  const counts = {
    income: transactions.filter((t) => t.kind === 'income').length,
    expense: transactions.filter((t) => t.kind === 'expense').length,
    internal: transactions.filter((t) => t.kind === 'internal_transfer').length,
    review: transactions.filter((t) => t.needsReview).length,
  };

  // ── Loading / empty ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-7 w-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="space-y-6 max-w-lg">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Transactions</h2>
          <p className="text-sm text-slate-600 mt-1">Every transaction across all accounts.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center space-y-4">
          <Upload className="h-10 w-10 text-slate-200 mx-auto" />
          <div>
            <p className="font-medium text-slate-700">No transactions yet</p>
            <p className="text-sm text-slate-500 mt-1">Import a statement to get started.</p>
          </div>
          <button
            onClick={() => navigate('/import')}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Go to Import
          </button>
        </div>
      </div>
    );
  }

  // ── Main view ─────────────────────────────────────────────────────────────

  return (
    <>
      <div className="space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Transactions</h2>
            <p className="text-sm text-slate-600 mt-1">
              {transactions.length} transactions across all accounts
            </p>
          </div>
          <button
            onClick={() => navigate('/import')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
          >
            <Upload className="h-3.5 w-3.5" /> Import more
          </button>
        </div>

        {/* Search + account filter */}
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <input
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400"
              placeholder="Search descriptions…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none"
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value as AccountFilter)}
          >
            <option value="all">All accounts</option>
            <option value="BBVA">BBVA</option>
            <option value="Wise">Wise</option>
            <option value="AMEX">AMEX</option>
            <option value="Iberia">Iberia</option>
          </select>
        </div>

        {/* Kind filter tabs */}
        <div className="flex gap-2 flex-wrap text-sm">
          {(
            [
              { key: 'all', label: `All (${transactions.length})`, amber: false },
              { key: 'income', label: `Income (${counts.income})`, amber: false },
              { key: 'expense', label: `Expenses (${counts.expense})`, amber: false },
              { key: 'internal', label: `Internal (${counts.internal})`, amber: false },
              { key: 'review', label: `Needs Review (${counts.review})`, amber: true },
            ] as const
          ).map(({ key, label, amber }) => (
            <button
              key={key}
              onClick={() => setKindFilter(key)}
              className={`px-3 py-1.5 rounded-full border transition-colors
                ${kindFilter === key
                  ? amber
                    ? 'bg-amber-50 border-amber-300 text-amber-700 font-medium'
                    : 'bg-slate-800 border-slate-800 text-white font-medium'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Retroactive apply feedback */}
        {retroactiveMsg && (
          <div className="px-4 py-2.5 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
            {retroactiveMsg}
          </div>
        )}

        {/* Table */}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <SortButton
                      label="Date"
                      sortKey="date"
                      current={sortKey}
                      dir={sortDir}
                      onClick={handleSort}
                    />
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Description</th>
                  <th className="px-4 py-3 text-right">
                    <SortButton
                      label="Amount"
                      sortKey="amount"
                      current={sortKey}
                      dir={sortDir}
                      onClick={handleSort}
                    />
                  </th>
                  <th className="px-4 py-3 text-left">
                    <SortButton
                      label="Account"
                      sortKey="account"
                      current={sortKey}
                      dir={sortDir}
                      onClick={handleSort}
                    />
                  </th>
                  <th className="px-4 py-3 text-left">
                    <SortButton
                      label="Category"
                      sortKey="category"
                      current={sortKey}
                      dir={sortDir}
                      onClick={handleSort}
                    />
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500 whitespace-nowrap">
                    Type
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map((tx) => (
                  <tr
                    key={tx.id}
                    onClick={() => setSelectedTx(tx)}
                    className={`group cursor-pointer hover:bg-slate-50/70 transition-colors
                      ${selectedTx?.id === tx.id ? 'bg-blue-50/60' : ''}
                      ${tx.kind === 'internal_transfer' ? 'opacity-50' : ''}`}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">
                      {fmtDate(tx.date)}
                    </td>
                    <td className="px-4 py-3 text-slate-800 max-w-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="line-clamp-1">{tx.description}</span>
                        {tx.needsReview && (
                          <span className="flex-shrink-0 text-xs text-amber-500">⚑</span>
                        )}
                        {tx.isManualOverride && (
                          <span className="flex-shrink-0 text-xs text-blue-400" title="Manually categorised">✎</span>
                        )}
                      </div>
                      {tx.notes && (
                        <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{tx.notes}</p>
                      )}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono text-xs tabular-nums whitespace-pre-line
                        ${tx.kind === 'income'
                          ? 'text-green-600 font-medium'
                          : tx.kind === 'internal_transfer'
                          ? 'text-slate-400'
                          : 'text-red-500'}`}
                    >
                      {fmtAmount(tx)}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {accountDot(tx.account)}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{tx.category}</td>
                    <td className="px-4 py-3">
                      {tx.kind === 'internal_transfer' ? (
                        <span className="px-1.5 py-0.5 text-xs rounded bg-slate-100 text-slate-400">
                          Internal
                        </span>
                      ) : tx.kind === 'income' ? (
                        <span className="px-1.5 py-0.5 text-xs rounded bg-green-100 text-green-700">
                          Income
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 text-xs rounded bg-red-50 text-red-500">
                          Expense
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sorted.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-10">
                No transactions match this filter.
              </p>
            )}
          </div>
          <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/50 text-xs text-slate-400">
            Showing {sorted.length} of {transactions.length} transactions · Click a row to edit
          </div>
        </div>
      </div>

      {/* Edit panel */}
      <TransactionEditPanel
        tx={selectedTx}
        customCategories={customCategories}
        onClose={() => setSelectedTx(null)}
        onSave={handleSave}
        onCreateRule={(tx) => {
          setRuleSourceTx(tx);
          setSelectedTx(null);
        }}
      />

      {/* Rule creation modal */}
      {ruleSourceTx && (
        <CreateRuleModal
          tx={ruleSourceTx}
          customCategories={customCategories}
          onConfirm={handleCreateRule}
          onClose={() => setRuleSourceTx(null)}
        />
      )}
    </>
  );
}
