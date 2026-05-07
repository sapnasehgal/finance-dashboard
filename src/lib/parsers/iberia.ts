import * as XLSX from 'xlsx';
import type { Transaction, TransactionKind } from '../types';

// Sheet layout (confirmed from sample file):
// Row 5 (r=4): header — B=Fecha, C=Tarjeta, D=Concepto, E=Importe, F=Divisa
// Rows 6+    : data; dates stored as text "DD/MM/YYYY"

function parseDate(raw: unknown): string {
  if (typeof raw === 'string') {
    const parts = raw.split('/');
    if (parts.length === 3) {
      const [d, m, y] = parts;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }
  if (raw instanceof Date) {
    return raw.toISOString().slice(0, 10);
  }
  return '';
}

function makeId(date: string, amount: number, concepto: string, counter: number): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24);
  const sign = amount < 0 ? 'm' : 'p';
  const base = `iberia_${date.replace(/-/g, '')}_${sign}${Math.abs(amount).toFixed(2).replace('.', '')}_${slug(concepto)}`;
  return counter === 0 ? base : `${base}_${counter}`;
}

type Cat = { category: string; kind: TransactionKind; needsReview: boolean };

function categorise(concepto: string, amount: number): Cat {
  const c = concepto.toLowerCase();

  // Internal transfers
  if (c.includes('recibo mes anterior') || c.includes('recibo anterior')) {
    return { category: 'Internal Transfer (BBVA→Iberia)', kind: 'internal_transfer', needsReview: false };
  }
  if (c.includes('ingreso desde cuenta')) {
    return { category: 'Internal Transfer (BBVA→Iberia)', kind: 'internal_transfer', needsReview: false };
  }

  // Positive = cashback reward or refund
  if (amount > 0) {
    if (c.includes('bonificacion') || c.includes('bonificación')) {
      return { category: 'Cashback', kind: 'income', needsReview: false };
    }
    return { category: 'Refund', kind: 'income', needsReview: false };
  }

  // Expenses (negative amounts)
  if (c.includes('freenow') || c.includes('taxi') || c.includes('cabify') || c.includes('uber')) {
    return { category: 'Transport', kind: 'expense', needsReview: false };
  }
  if (c.includes('amazon')) {
    return { category: 'Shopping', kind: 'expense', needsReview: false };
  }
  if (c.includes('netflix') || c.includes('spotify') || c.includes('hintapp') || c.includes('google')) {
    return { category: 'Subscriptions', kind: 'expense', needsReview: false };
  }
  if (c.includes('energ') || c.includes('suministro') || c.includes('iberdrola') || c.includes('naturgy')) {
    return { category: 'Utilities', kind: 'expense', needsReview: false };
  }
  if (c.includes('tusclases') || c.includes('eduvic') || c.includes('academia')) {
    return { category: 'Education & Training', kind: 'expense', needsReview: false };
  }
  if (c.includes('farmacia')) {
    return { category: 'Health & Pharmacy', kind: 'expense', needsReview: false };
  }

  return { category: 'Uncategorised', kind: 'expense', needsReview: true };
}

export function parseIberia(file: File): Promise<Transaction[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
        const ws = workbook.Sheets[workbook.SheetNames[0]];

        const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1:A1');

        // Find header row: look for 'Fecha' in column B (c=1)
        let headerRow = -1;
        for (let r = range.s.r; r <= range.e.r; r++) {
          const cell = ws[XLSX.utils.encode_cell({ r, c: 1 })];
          if (String(cell?.v ?? '').trim() === 'Fecha') {
            headerRow = r;
            break;
          }
        }
        if (headerRow < 0) {
          reject(new Error('Could not find header row in Iberia file'));
          return;
        }

        const now = new Date().toISOString();
        const transactions: Transaction[] = [];
        const fingerprintCount = new Map<string, number>();

        for (let r = headerRow + 1; r <= range.e.r; r++) {
          const fechaCell   = ws[XLSX.utils.encode_cell({ r, c: 1 })]; // B
          const conceptoCell = ws[XLSX.utils.encode_cell({ r, c: 3 })]; // D
          const importeCell  = ws[XLSX.utils.encode_cell({ r, c: 4 })]; // E

          if (!fechaCell || !importeCell) continue;

          const concepto = String(conceptoCell?.v ?? '').trim();
          const amount   = typeof importeCell.v === 'number'
            ? importeCell.v
            : parseFloat(String(importeCell.v ?? '').replace(',', '.'));

          if (!concepto || isNaN(amount)) continue;

          const date = parseDate(fechaCell.v);
          if (!date) continue;

          const { category, kind, needsReview } = categorise(concepto, amount);

          // Fingerprint: count duplicates within the same (date, amount, concepto) group
          const baseKey = `${date}|${amount.toFixed(2)}|${concepto}`;
          const counter = fingerprintCount.get(baseKey) ?? 0;
          fingerprintCount.set(baseKey, counter + 1);

          transactions.push({
            id: makeId(date, amount, concepto, counter),
            sourceId: makeId(date, amount, concepto, counter),
            date,
            valueDate: date,
            description: concepto,
            rawDescription: concepto,
            amount,
            currency: 'EUR',
            account: 'Iberia',
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
    reader.readAsArrayBuffer(file);
  });
}
