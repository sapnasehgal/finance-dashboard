import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { AlertCircle, Upload, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import { getTransactions } from '../lib/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { getCategoryMeta, COLOUR_HEX, INTERNAL_CATEGORIES } from '../lib/categorise';
import type { Transaction, AccountSource } from '../lib/types';

// ── Period helpers ────────────────────────────────────────────────────────────

type Period = 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'lastQuarter' | 'allTime';

const PERIOD_LABELS: Record<Period, string> = {
  thisMonth:    'This Month',
  lastMonth:    'Last Month',
  thisQuarter:  'This Quarter',
  lastQuarter:  'Last Quarter',
  allTime:      'All Time',
};

function getPeriodRange(p: Period): { start: string; end: string } {
  const now   = new Date();
  const yr    = now.getFullYear();
  const mo    = now.getMonth(); // 0-indexed

  if (p === 'allTime') return { start: '2000-01-01', end: '2099-12-31' };

  if (p === 'thisMonth') {
    const mm  = String(mo + 1).padStart(2, '0');
    const last = new Date(yr, mo + 1, 0).getDate();
    return { start: `${yr}-${mm}-01`, end: `${yr}-${mm}-${String(last).padStart(2, '0')}` };
  }

  if (p === 'lastMonth') {
    const prevMo = mo === 0 ? 11 : mo - 1;
    const prevYr = mo === 0 ? yr - 1 : yr;
    const mm  = String(prevMo + 1).padStart(2, '0');
    const last = new Date(prevYr, prevMo + 1, 0).getDate();
    return { start: `${prevYr}-${mm}-01`, end: `${prevYr}-${mm}-${String(last).padStart(2, '0')}` };
  }

  if (p === 'thisQuarter') {
    const q = Math.floor(mo / 3);
    const startMo = q * 3 + 1;       // 1-indexed
    const endMo   = startMo + 2;
    const last = new Date(yr, endMo, 0).getDate();
    return {
      start: `${yr}-${String(startMo).padStart(2, '0')}-01`,
      end:   `${yr}-${String(endMo).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
    };
  }

  // lastQuarter
  let q = Math.floor(mo / 3) - 1;
  let qYr = yr;
  if (q < 0) { q = 3; qYr = yr - 1; }
  const startMo = q * 3 + 1;
  const endMo   = startMo + 2;
  const last = new Date(qYr, endMo, 0).getDate();
  return {
    start: `${qYr}-${String(startMo).padStart(2, '0')}-01`,
    end:   `${qYr}-${String(endMo).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
  };
}

function getPeriodDisplayLabel(p: Period): string {
  const now = new Date();
  const yr = now.getFullYear();
  const mo = now.getMonth();

  if (p === 'allTime') return 'All time';
  if (p === 'thisMonth') {
    return new Date(yr, mo, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }
  if (p === 'lastMonth') {
    const prev = mo === 0 ? 11 : mo - 1;
    const prevYr = mo === 0 ? yr - 1 : yr;
    return new Date(prevYr, prev, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }
  if (p === 'thisQuarter') {
    return `Q${Math.floor(mo / 3) + 1} ${yr}`;
  }
  let q = Math.floor(mo / 3) - 1;
  let qYr = yr;
  if (q < 0) { q = 3; qYr = yr - 1; }
  return `Q${q + 1} ${qYr}`;
}

// ── Formatting ────────────────────────────────────────────────────────────────

function fmtEUR(n: number, showSign = false): string {
  const abs = new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(Math.abs(n));
  if (showSign && n > 0) return `+${abs}`;
  return abs;
}

// ── Account colour dots ───────────────────────────────────────────────────────

const ACCOUNT_COLOURS: Record<string, string> = {
  BBVA:   'bg-blue-500',
  Wise:   'bg-purple-500',
  AMEX:   'bg-slate-500',
  Iberia: 'bg-rose-500',
};

// ── Main component ────────────────────────────────────────────────────────────

const ACCOUNTS: Array<'all' | AccountSource> = ['all', 'BBVA', 'AMEX', 'Iberia', 'Wise'];

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [allTx, setAllTx]           = useState<Transaction[]>([]);
  const [loading, setLoading]        = useState(true);
  const [error, setError]            = useState<string | null>(null);
  const [period, setPeriod]          = useState<Period>('allTime');
  const [account, setAccount]        = useState<'all' | AccountSource>('all');
  const [refreshKey, setRefreshKey]  = useState(0);

  useEffect(() => {
    if (!db || !user) return;
    setLoading(true);
    setError(null);
    getTransactions(db, user.uid, 2000)
      .then(setAllTx)
      .catch((e) => setError(String(e?.message ?? e)))
      .finally(() => setLoading(false));
  }, [user, refreshKey]);

  // ── Filter by period + account ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    const { start, end } = getPeriodRange(period);
    return allTx.filter(tx => {
      if (account !== 'all' && tx.account !== account) return false;
      return tx.date >= start && tx.date <= end;
    });
  }, [allTx, period, account]);

  // ── Computed stats ─────────────────────────────────────────────────────────

  const income = useMemo(() => {
    const rows = filtered.filter(tx => tx.kind === 'income');
    const eurTutoring   = rows.filter(tx => tx.category === 'Tutoring Income' && (tx.account === 'BBVA' || !tx.originalCurrency || tx.originalCurrency === 'EUR')).reduce((s, tx) => s + tx.amount, 0);
    const intlConsult   = rows.filter(tx => tx.category === 'Consulting Income (International)').reduce((s, tx) => s + tx.amount, 0);
    const wiseTutoring  = rows.filter(tx => tx.category === 'Tutoring Income' && tx.account === 'Wise').reduce((s, tx) => s + tx.amount, 0);
    const rentalStorage = rows.filter(tx => tx.category === 'Rental Income (Storage €85)').reduce((s, tx) => s + tx.amount, 0);
    const rentalParking = rows.filter(tx => tx.category === 'Rental Income (Parking €145)').reduce((s, tx) => s + tx.amount, 0);
    const other = rows
      .filter(tx => !['Tutoring Income', 'Consulting Income (International)'].includes(tx.category) && !tx.category.startsWith('Rental Income'))
      .reduce((s, tx) => s + tx.amount, 0);
    const total = rows.reduce((s, tx) => s + tx.amount, 0);
    return { eurTutoring, intlConsult, wiseTutoring, rentalStorage, rentalParking, other, total };
  }, [filtered]);

  const spending = useMemo(() => {
    const rows = filtered.filter(tx => tx.kind === 'expense');
    let business = 0;
    let personal = 0;
    for (const tx of rows) {
      const abs = Math.abs(tx.amount);
      if (getCategoryMeta(tx.category).isBusiness) business += abs;
      else personal += abs;
    }
    return { business, personal, total: business + personal };
  }, [filtered]);

  const byCategory = useMemo(() => {
    const rows = filtered.filter(tx => tx.kind === 'expense');
    const map = new Map<string, { amount: number; isBusiness: boolean }>();
    for (const tx of rows) {
      const meta = getCategoryMeta(tx.category);
      const existing = map.get(tx.category) ?? { amount: 0, isBusiness: meta.isBusiness };
      existing.amount += Math.abs(tx.amount);
      map.set(tx.category, existing);
    }
    return Array.from(map.entries())
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.amount - a.amount);
  }, [filtered]);

  const top5 = useMemo(() =>
    filtered
      .filter(tx => tx.kind === 'expense')
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
      .slice(0, 5),
    [filtered],
  );

  const needsReviewCount = useMemo(
    () => filtered.filter(tx => tx.needsReview && !INTERNAL_CATEGORIES.has(tx.category)).length,
    [filtered],
  );

  const net = income.total - spending.total;
  const bizPct = spending.total > 0 ? Math.round((spending.business / spending.total) * 100) : 0;
  const chartHeight = Math.max(160, byCategory.length * 34 + 40);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? 'Loading…' : `${filtered.length} transactions · ${getPeriodDisplayLabel(period)}`}
            {needsReviewCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-flagged font-medium">
                <AlertCircle className="size-3.5" />
                {needsReviewCount} need review
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          className="self-start sm:self-auto flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition"
          title="Refresh data"
        >
          <RefreshCw className="size-4" />
          Refresh
        </button>
      </div>

      {/* Period selector */}
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={[
              'px-3 py-1.5 rounded-lg text-sm font-medium transition',
              period === p
                ? 'bg-business text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:border-slate-300',
            ].join(' ')}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Account filter */}
      <div className="flex flex-wrap gap-1.5">
        {ACCOUNTS.map(a => (
          <button
            key={a}
            onClick={() => setAccount(a)}
            className={[
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition',
              account === a
                ? 'bg-slate-800 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300',
            ].join(' ')}
          >
            {a !== 'all' && (
              <span className={`size-2 rounded-full ${ACCOUNT_COLOURS[a]}`} />
            )}
            {a === 'all' ? 'All Accounts' : a}
          </button>
        ))}
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load transactions: {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-36 bg-white rounded-xl border border-slate-200 animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
          <Upload className="size-10 mx-auto text-slate-300 mb-3" />
          <p className="font-medium text-slate-600">No transactions in this period</p>
          <p className="text-sm text-slate-400 mt-1 mb-4">
            Try "All Time" or import your bank statements.
          </p>
          <button
            onClick={() => navigate('/import')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-business text-white text-sm font-medium hover:bg-blue-700 transition"
          >
            <Upload className="size-4" /> Go to Import
          </button>
        </div>
      )}

      {/* Cards */}
      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-4">

          {/* Row 1: Income + Spending */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Income card */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Income</h3>
                <TrendingUp className="size-4 text-personal" />
              </div>
              <p className="text-3xl font-bold tabular-nums text-personal mb-4">
                {fmtEUR(income.total)}
              </p>
              <div className="space-y-2 text-sm">
                {income.eurTutoring > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">EUR Tutoring (BBVA)</span>
                    <span className="tabular-nums font-medium">{fmtEUR(income.eurTutoring)}</span>
                  </div>
                )}
                {income.wiseTutoring > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Tutoring (Wise)</span>
                    <span className="tabular-nums font-medium">{fmtEUR(income.wiseTutoring)}</span>
                  </div>
                )}
                {income.intlConsult > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Int'l Consulting</span>
                    <span className="tabular-nums font-medium text-foreign">{fmtEUR(income.intlConsult)}</span>
                  </div>
                )}
                {(income.rentalStorage > 0 || income.rentalParking > 0) && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Rental Income</span>
                    <span className="tabular-nums font-medium">{fmtEUR(income.rentalStorage + income.rentalParking)}</span>
                  </div>
                )}
                {income.other > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Other</span>
                    <span className="tabular-nums">{fmtEUR(income.other)}</span>
                  </div>
                )}
                <div className="pt-2 mt-2 border-t border-slate-100 flex justify-between font-semibold">
                  <span className={net >= 0 ? 'text-personal' : 'text-red-600'}>
                    Net {net >= 0 ? 'surplus' : 'deficit'}
                  </span>
                  <span className={`tabular-nums ${net >= 0 ? 'text-personal' : 'text-red-600'}`}>
                    {fmtEUR(net, true)}
                  </span>
                </div>
              </div>
            </div>

            {/* Spending card */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Spending</h3>
                <TrendingDown className="size-4 text-red-400" />
              </div>
              <p className="text-3xl font-bold tabular-nums text-slate-800 mb-4">
                {fmtEUR(spending.total)}
              </p>

              {/* Business/Personal split bar */}
              {spending.total > 0 && (
                <div className="mb-4">
                  <div className="flex h-3 rounded-full overflow-hidden bg-personal-bg">
                    <div
                      className="bg-business transition-all"
                      style={{ width: `${bizPct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-slate-500 mt-1.5">
                    <span className="text-business font-medium">{bizPct}% Business</span>
                    <span className="text-personal font-medium">{100 - bizPct}% Personal</span>
                  </div>
                </div>
              )}

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="flex items-center gap-1.5 text-business">
                    <span className="size-2.5 rounded-full bg-business inline-block" />
                    Business
                  </span>
                  <span className="tabular-nums font-medium text-business">{fmtEUR(spending.business)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="flex items-center gap-1.5 text-personal">
                    <span className="size-2.5 rounded-full bg-personal inline-block" />
                    Personal
                  </span>
                  <span className="tabular-nums font-medium text-personal">{fmtEUR(spending.personal)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Row 2: Category chart */}
          {byCategory.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-5">
                Spending by Category
              </h3>
              <div className="flex gap-4 text-xs text-slate-500 mb-3">
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-business inline-block" /> Business
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-personal inline-block" /> Personal
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-flagged inline-block" /> Review needed
                </span>
              </div>
              <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart
                  data={byCategory}
                  layout="vertical"
                  margin={{ left: 8, right: 40, top: 0, bottom: 0 }}
                >
                  <XAxis
                    type="number"
                    tickFormatter={(v: number) => `€${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}`}
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="category"
                    width={165}
                    tick={{ fontSize: 12, fill: '#475569' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value: number) => [`€${value.toFixed(2)}`, 'Amount']}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                  />
                  <Bar dataKey="amount" radius={[0, 4, 4, 0]} maxBarSize={28}>
                    {byCategory.map((entry, i) => {
                      const meta = getCategoryMeta(entry.category);
                      return <Cell key={i} fill={COLOUR_HEX[meta.colour]} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Row 3: Top 5 expenses */}
          {top5.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">
                Top 5 Expenses
              </h3>
              <div className="space-y-3">
                {top5.map((tx, i) => {
                  const meta = getCategoryMeta(tx.category);
                  const colourClass =
                    meta.colour === 'blue'   ? 'text-business bg-business-bg' :
                    meta.colour === 'green'  ? 'text-personal bg-personal-bg' :
                    meta.colour === 'purple' ? 'text-foreign bg-foreign-bg'   :
                    meta.colour === 'amber'  ? 'text-flagged bg-flagged-bg'   :
                    'text-slate-500 bg-slate-100';
                  return (
                    <div key={tx.id} className="flex items-center gap-3">
                      <span className="text-slate-400 tabular-nums text-sm w-4 shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{tx.description}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${colourClass}`}>
                            {tx.category}
                          </span>
                          <span className="text-xs text-slate-400">{tx.date}</span>
                          <span className={`text-xs px-1 py-0.5 rounded ${ACCOUNT_COLOURS[tx.account]} bg-opacity-20 text-slate-600`}>
                            {tx.account}
                          </span>
                        </div>
                      </div>
                      <span className="text-sm font-semibold tabular-nums text-slate-800 shrink-0">
                        {fmtEUR(Math.abs(tx.amount))}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
