import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, CheckCircle, AlertCircle, ArrowRight, X } from 'lucide-react';
import { parseFile } from '../lib/parsers/index';
import { saveTransactions, findDuplicateIds } from '../lib/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import type { Transaction } from '../lib/types';

// ─── helpers ────────────────────────────────────────────────────────────────

function fmtAmount(tx: Transaction): string {
  const abs = Math.abs(tx.amount).toFixed(2);
  const ccy = tx.originalCurrency && tx.originalCurrency !== 'EUR' ? tx.originalCurrency : 'EUR';
  const displayAmt = tx.originalAmount != null ? Math.abs(tx.originalAmount).toFixed(2) : abs;
  const base = `${tx.amount >= 0 ? '+' : '-'}${abs} EUR`;
  return ccy !== 'EUR' ? `${base} (${tx.amount >= 0 ? '' : '-'}${displayAmt} ${ccy})` : base;
}

function kindBadge(tx: Transaction) {
  if (tx.kind === 'internal_transfer')
    return <span className="px-1.5 py-0.5 text-xs rounded bg-slate-100 text-slate-500">Internal</span>;
  if (tx.kind === 'income')
    return <span className="px-1.5 py-0.5 text-xs rounded bg-green-100 text-green-700">Income</span>;
  return <span className="px-1.5 py-0.5 text-xs rounded bg-red-50 text-red-600">Expense</span>;
}

// ─── subcomponents ───────────────────────────────────────────────────────────

function DropZone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length) onFiles(files);
    },
    [onFiles]
  );

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-12 cursor-pointer transition-colors select-none
        ${dragging ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = '';
        }}
      />
      <Upload className={`h-10 w-10 ${dragging ? 'text-blue-500' : 'text-slate-300'}`} />
      <div className="text-center">
        <p className="font-medium text-slate-700">Drop your statements here</p>
        <p className="text-sm text-slate-500 mt-1">or click to browse</p>
      </div>
    </div>
  );
}

function SummaryBar({
  transactions,
  duplicateIds,
}: {
  transactions: Transaction[];
  duplicateIds: Set<string>;
}) {
  const counts = transactions.reduce(
    (acc, tx) => {
      if (duplicateIds.has(tx.id)) { acc.dupes++; return acc; }
      if (tx.kind === 'internal_transfer') acc.internal++;
      else if (tx.kind === 'income') acc.income++;
      else acc.expense++;
      if (tx.needsReview) acc.review++;
      return acc;
    },
    { income: 0, expense: 0, internal: 0, dupes: 0, review: 0 }
  );

  const newCount = transactions.length - counts.dupes;

  return (
    <div className="flex flex-wrap gap-3 text-sm">
      <Pill color="green"  label={`${counts.income} income`} />
      <Pill color="red"    label={`${counts.expense} expense`} />
      <Pill color="slate"  label={`${counts.internal} internal`} />
      {counts.dupes > 0 && <Pill color="amber" label={`${counts.dupes} already imported`} />}
      {counts.review > 0 && <Pill color="amber" label={`${counts.review} need review`} />}
      <span className="ml-auto font-semibold text-slate-700">{newCount} new</span>
    </div>
  );
}

function Pill({ color, label }: { color: string; label: string }) {
  const colours: Record<string, string> = {
    green: 'bg-green-50 text-green-700',
    red:   'bg-red-50 text-red-600',
    slate: 'bg-slate-100 text-slate-500',
    amber: 'bg-amber-50 text-amber-700',
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${colours[color] ?? colours.slate}`}>
      {label}
    </span>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

type Phase = 'idle' | 'parsing' | 'preview' | 'importing' | 'done';

export default function Import() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>('idle');
  const [transactions, setTransactions]     = useState<Transaction[]>([]);
  const [duplicateIds, setDuplicateIds]     = useState<Set<string>>(new Set());
  const [parseErrors, setParseErrors]       = useState<string[]>([]);
  const [importResult, setImportResult]     = useState<{ written: number; skipped: number } | null>(null);
  const [importError, setImportError]       = useState<string | null>(null);

  async function handleFiles(files: File[]) {
    setPhase('parsing');
    setParseErrors([]);

    const allTx: Transaction[] = [];
    const allErrors: string[] = [];

    for (const file of files) {
      const result = await parseFile(file);
      allTx.push(...result.transactions);
      allErrors.push(...result.errors);
    }

    // Deduplicate within the batch (same transaction in two files)
    const seen = new Set<string>();
    const unique = allTx.filter((tx) => {
      if (seen.has(tx.id)) return false;
      seen.add(tx.id);
      return true;
    });

    // Check against Firestore for previously imported transactions
    let existingIds = new Set<string>();
    if (db && user) {
      existingIds = await findDuplicateIds(db, user.uid, unique.map((t) => t.id));
    }

    setTransactions(unique);
    setDuplicateIds(existingIds);
    setParseErrors(allErrors);
    setPhase('preview');
  }

  async function handleCommit() {
    if (!db || !user) return;
    setPhase('importing');
    setImportError(null);

    try {
      const toImport = transactions.filter((tx) => !duplicateIds.has(tx.id));
      const result = await saveTransactions(db, user.uid, toImport);
      setImportResult(result);
      setPhase('done');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setImportError(msg);
      setPhase('preview');
    }
  }

  function reset() {
    setPhase('idle');
    setTransactions([]);
    setDuplicateIds(new Set());
    setParseErrors([]);
    setImportResult(null);
    setImportError(null);
  }

  const newTransactions = transactions.filter((tx) => !duplicateIds.has(tx.id));
  const reviewCount     = newTransactions.filter((tx) => tx.needsReview).length;

  // ── idle ──────────────────────────────────────────────────────────────────
  if (phase === 'idle') {
    return (
      <div className="space-y-6 max-w-3xl">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Import</h2>
          <p className="text-sm text-slate-600 mt-1">
            Supports BBVA (.xlsx), Iberia (.xlsx), AMEX (.csv), and Wise (.csv) statements. Drop one or more files and we'll parse, deduplicate, and show you a preview before saving anything.
          </p>
        </div>
        <DropZone onFiles={handleFiles} />
      </div>
    );
  }

  // ── parsing ───────────────────────────────────────────────────────────────
  if (phase === 'parsing') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-3">
          <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-600">Parsing your statement…</p>
        </div>
      </div>
    );
  }

  // ── done ──────────────────────────────────────────────────────────────────
  if (phase === 'done' && importResult) {
    return (
      <div className="max-w-lg space-y-6">
        <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center space-y-4">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
          <div>
            <p className="text-lg font-semibold text-slate-800">
              {importResult.written} transaction{importResult.written !== 1 ? 's' : ''} imported
            </p>
            {importResult.skipped > 0 && (
              <p className="text-sm text-slate-500 mt-1">{importResult.skipped} duplicate{importResult.skipped !== 1 ? 's' : ''} skipped</p>
            )}
            {reviewCount > 0 && (
              <p className="text-sm text-amber-600 mt-1">{reviewCount} need your review</p>
            )}
          </div>
          <div className="flex gap-3 justify-center pt-2">
            <button
              onClick={() => navigate('/transactions')}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              View transactions <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={reset}
              className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Import another
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── preview / importing ───────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Preview</h2>
          <p className="text-sm text-slate-600 mt-1">
            Review the parsed transactions below, then click Import to save them.
          </p>
        </div>
        <button onClick={reset} className="p-2 text-slate-400 hover:text-slate-600">
          <X className="h-5 w-5" />
        </button>
      </div>

      {importError && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-700 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span><span className="font-semibold">Import failed:</span> {importError}</span>
          </p>
        </div>
      )}

      {parseErrors.length > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 space-y-1">
          {parseErrors.map((e, i) => (
            <p key={i} className="text-sm text-amber-700 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /> {e}
            </p>
          ))}
        </div>
      )}

      <div className="rounded-xl bg-white border border-slate-200 p-4">
        <SummaryBar transactions={transactions} duplicateIds={duplicateIds} />
      </div>

      {/* Preview table */}
      <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-500 whitespace-nowrap">Date</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Description</th>
                <th className="px-4 py-3 text-right font-medium text-slate-500 whitespace-nowrap">Amount</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Account</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Category</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.slice(0, 100).map((tx) => {
                const isDupe = duplicateIds.has(tx.id);
                return (
                  <tr
                    key={tx.id}
                    className={`${isDupe ? 'opacity-40' : ''} ${tx.kind === 'internal_transfer' ? 'bg-slate-50/50' : ''}`}
                  >
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap font-mono text-xs">{tx.date}</td>
                    <td className="px-4 py-2.5 text-slate-800 max-w-xs">
                      <span className="line-clamp-1">{tx.description}</span>
                      {tx.needsReview && !isDupe && (
                        <span className="ml-1.5 text-xs text-amber-600">⚑ review</span>
                      )}
                      {isDupe && <span className="ml-1.5 text-xs text-slate-400">already imported</span>}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-mono text-xs whitespace-nowrap tabular-nums
                      ${tx.kind === 'income' ? 'text-green-600' : tx.kind === 'expense' ? 'text-red-500' : 'text-slate-400'}`}>
                      {fmtAmount(tx)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{tx.account}</td>
                    <td className="px-4 py-2.5 text-slate-600 text-xs">{tx.category}</td>
                    <td className="px-4 py-2.5">{kindBadge(tx)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {transactions.length > 100 && (
            <p className="text-xs text-slate-400 px-4 py-2 border-t border-slate-100">
              Showing first 100 of {transactions.length} transactions
            </p>
          )}
        </div>
      </div>

      {/* Commit bar */}
      <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-5 py-4">
        <p className="text-sm text-slate-600">
          <span className="font-semibold text-slate-800">{newTransactions.length}</span> new transactions will be saved
          {duplicateIds.size > 0 && `, ${duplicateIds.size} duplicate${duplicateIds.size > 1 ? 's' : ''} skipped`}
        </p>
        <button
          onClick={handleCommit}
          disabled={phase === 'importing' || newTransactions.length === 0}
          className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {phase === 'importing' ? (
            <>
              <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Importing…
            </>
          ) : (
            <>Import {newTransactions.length} transaction{newTransactions.length !== 1 ? 's' : ''}</>
          )}
        </button>
      </div>
    </div>
  );
}
