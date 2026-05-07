import Papa from 'papaparse';
import type { Transaction, TransactionKind } from '../types';

// "2026-04-30 08:37:52" → "2026-04-30"
function parseWiseDate(raw: string): string {
  return String(raw ?? '').trim().slice(0, 10);
}

type WiseRow = {
  ID: string;
  Status: string;
  Direction: string;
  'Created on': string;
  'Finished on': string;
  'Source fee amount': string;
  'Source fee currency': string;
  'Source name': string;
  'Source amount (after fees)': string;
  'Source currency': string;
  'Target name': string;
  'Target amount (after fees)': string;
  'Target currency': string;
  'Exchange rate': string;
  Reference: string;
  Category: string;
  Note: string;
};

type Categorisation = {
  category: string;
  kind: TransactionKind;
  needsReview: boolean;
};

function categorise(row: WiseRow, eurAmount: number): Categorisation {
  const dir       = (row.Direction ?? '').toUpperCase();
  const srcName   = (row['Source name'] ?? '').toUpperCase();
  const tgtName   = (row['Target name'] ?? '').toUpperCase();
  const ref       = (row.Reference ?? '').toLowerCase();
  const category  = (row.Category ?? '').toLowerCase();
  const srcCcy    = (row['Source currency'] ?? '').toUpperCase();

  // ── OUT: Wise → BBVA transfers (self, identified by target name) ──────────
  if (dir === 'OUT' && tgtName.includes('SAPNA')) {
    return { category: 'Internal Transfer (Wise→BBVA)', kind: 'internal_transfer', needsReview: false };
  }

  // ── IN: cashback / rewards from Wise itself ───────────────────────────────
  if (dir === 'IN' && (category === 'rewards' || srcName.includes('TRANSFERWISE') || srcName.includes('WISE'))) {
    return { category: 'Cashback', kind: 'income', needsReview: false };
  }

  // ── IN: parking rental — €145/month from Sara Marabotti ──────────────────
  if (dir === 'IN' && srcName.includes('MARABOTTI') && Math.abs(eurAmount - 145) < 1) {
    return { category: 'Rental Income (Parking €145)', kind: 'income', needsReview: false };
  }

  // Also detect parking rental by reference keyword regardless of sender
  if (dir === 'IN' && (ref.includes('parking') || ref.includes('alquiler') || ref.includes('plaza'))) {
    return { category: 'Rental Income (Parking €145)', kind: 'income', needsReview: false };
  }

  // ── IN: Stripe deposits = international consulting income ─────────────────
  if (dir === 'IN' && srcName.includes('STRIPE')) {
    return { category: 'Consulting Income (International)', kind: 'income', needsReview: false };
  }

  // ── IN: PayPal deposits = international consulting income ─────────────────
  if (dir === 'IN' && srcName.includes('PAYPAL')) {
    return { category: 'Consulting Income (International)', kind: 'income', needsReview: false };
  }

  // ── IN: individual person = tutoring/consulting income ───────────────────
  if (dir === 'IN') {
    // Non-EUR income flag for review (currency conversion creates ambiguity)
    const review = srcCcy !== 'EUR';
    return { category: 'Tutoring Income', kind: 'income', needsReview: review };
  }

  // ── OUT: other outflows (expenses paid from Wise) ────────────────────────
  if (dir === 'OUT') {
    return { category: 'Uncategorised', kind: 'expense', needsReview: true };
  }

  return { category: 'Uncategorised', kind: 'expense', needsReview: true };
}

// Convert to EUR display amount given the row data.
// - If source or target currency is EUR, use that amount.
// - Otherwise keep in original currency and flag for review.
function resolveEurAmount(row: WiseRow): {
  amount: number;
  originalAmount?: number;
  originalCurrency?: string;
  exchangeRate?: number;
} {
  const dir    = (row.Direction ?? '').toUpperCase();
  const srcAmt = parseFloat(row['Source amount (after fees)'] ?? '0') || 0;
  const tgtAmt = parseFloat(row['Target amount (after fees)'] ?? '0') || 0;
  const srcCcy = (row['Source currency'] ?? '').toUpperCase();
  const tgtCcy = (row['Target currency'] ?? '').toUpperCase();
  const rate   = parseFloat(row['Exchange rate'] ?? '1') || 1;

  const sign = dir === 'IN' ? 1 : -1;

  // Conversion to EUR happened on target side
  if (tgtCcy === 'EUR' && dir === 'OUT') {
    return {
      amount: sign * tgtAmt,
      originalAmount: srcAmt,
      originalCurrency: srcCcy !== 'EUR' ? srcCcy : undefined,
      exchangeRate: srcCcy !== 'EUR' ? rate : undefined,
    };
  }

  // Source is EUR
  if (srcCcy === 'EUR') {
    return { amount: sign * srcAmt };
  }

  // Incoming in EUR (target)
  if (tgtCcy === 'EUR') {
    return { amount: sign * tgtAmt, originalAmount: srcAmt, originalCurrency: srcCcy, exchangeRate: rate };
  }

  // Foreign currency — show in original, flag review
  return {
    amount: sign * srcAmt,
    originalAmount: srcAmt,
    originalCurrency: srcCcy,
    exchangeRate: rate,
  };
}

export function parseWise(file: File): Promise<Transaction[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const result = Papa.parse<WiseRow>(text, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (h) => h.trim(),
        });

        if (result.errors.length && !result.data.length) {
          reject(new Error(`CSV parse error: ${result.errors[0].message}`));
          return;
        }

        const now = new Date().toISOString();
        const transactions: Transaction[] = [];

        for (const row of result.data) {
          if (!row.ID || row.Status !== 'COMPLETED') continue;

          const { amount, originalAmount, originalCurrency, exchangeRate } = resolveEurAmount(row);
          const { category, kind, needsReview } = categorise(row, Math.abs(amount));

          const date      = parseWiseDate(row['Finished on'] || row['Created on']);
          const valueDate = parseWiseDate(row['Created on']);

          // Build a readable description from source/target and reference
          const dir     = (row.Direction ?? '').toUpperCase();
          const srcName = (row['Source name'] ?? '').trim();
          const tgtName = (row['Target name'] ?? '').trim();
          const ref     = (row.Reference ?? '').trim();

          let description: string;
          if (dir === 'IN') {
            description = srcName || 'Unknown sender';
          } else {
            description = tgtName || 'Unknown recipient';
          }
          if (ref && ref.toLowerCase() !== 'transfer') {
            description += ` — ${ref}`;
          }

          const srcCcy = (row['Source currency'] ?? '').toUpperCase();
          const tgtCcy = (row['Target currency'] ?? '').toUpperCase();
          const srcAmt = row['Source amount (after fees)'];
          const tgtAmt = row['Target amount (after fees)'];

          transactions.push({
            id: row.ID,
            sourceId: row.ID,
            date,
            valueDate,
            description,
            rawDescription: `${srcAmt} ${srcCcy} → ${tgtAmt} ${tgtCcy} | ${ref}`,
            amount,
            currency: originalCurrency && originalCurrency !== 'EUR' ? originalCurrency : 'EUR',
            originalAmount,
            originalCurrency,
            exchangeRate,
            account: 'Wise',
            kind,
            category,
            autoCategory: category,
            isManualOverride: false,
            needsReview,
            notes: '',
            importedAt: now,
          });
        }

        resolve(transactions);
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    reader.readAsText(file);
  });
}
