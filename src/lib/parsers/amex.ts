import Papa from 'papaparse';
import type { Transaction, TransactionKind } from '../types';

type AMEXRow = {
  Fecha: string;
  'Descripción': string;
  Importe: string;
  'Detalles ampliados': string;
  Referencia: string;
  'Categoría': string;
  [key: string]: string;
};

const CURRENCY_NAMES: Record<string, string> = {
  'Dólar U.S.A.': 'USD',
  'Libra Esterlina': 'GBP',
  'Dólar Canadiense': 'CAD',
  'Dólar Australiano': 'AUD',
  'Dólar Neozelandés': 'NZD',
  'Franco Suizo': 'CHF',
  'Yen japonés': 'JPY',
};

const CATEGORY_MAP: Record<string, string> = {
  'Entretenimiento-Restaurantes': 'Food & Dining',
  'Productos-Comestibles': 'Groceries',
  'Transporte-Taxi': 'Transport',
  'Transporte-Otros Transporte': 'Transport',
  'Productos-Artículos informáticos': 'Software & Tech',
  'Servicios Comerciales-Conferencias y entrenamientos': 'Education & Training',
  'Entretenimiento-Eventos deportivos': 'Sports & Activities',
  'Productos-Compra online': 'Shopping',
  'Comunicaciones-Otros Comunicaciones': 'Subscriptions',
  'Productos-Farmacia': 'Health & Pharmacy',
  'Varios-Educación': 'Education & Training',
  'Productos-Otros Productos': 'Shopping',
  'Servicios Comerciales-Asistencia médica': 'Health & Pharmacy',
  'Entretenimiento-Otros Entretenimiento': 'Entertainment',
  'Productos-Amueblamiento': 'Home & Furnishings',
  'Servicios Comerciales-Insumos de oficina': 'Software & Tech',
  'Servicios Comerciales-Otros Servicios Comerciales': 'Other Services',
  'Productos-Venta por correo': 'Shopping',
};

function parseDate(raw: string): string {
  const [d, m, y] = raw.trim().split('/');
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

// AMEX Spain: comma as decimal separator, period as thousands separator
function parseAmount(raw: string): number {
  return parseFloat(raw.trim().replace(/\./g, '').replace(',', '.')) || 0;
}

function parseForeign(details: string): {
  originalAmount?: number;
  originalCurrency?: string;
  exchangeRate?: number;
} {
  if (!details?.trim()) return {};
  const m = details.match(/Foreign Spend Amount:\s*([\d.]+)\s+(.+?)\s+Commission Amount:/);
  const r = details.match(/Currency Exchange Rate:\s*([\d.]+)/);
  if (!m) return {};
  return {
    originalAmount: parseFloat(m[1]),
    originalCurrency: CURRENCY_NAMES[m[2].trim()] ?? m[2].trim(),
    exchangeRate: r ? parseFloat(r[1]) : undefined,
  };
}

type Cat = { category: string; kind: TransactionKind; needsReview: boolean };

function categorise(row: AMEXRow, csvAmount: number): Cat {
  const desc = (row['Descripción'] ?? '').toUpperCase();
  const amexCat = (row['Categoría'] ?? '').trim();

  // Monthly bill payment sent to bank
  if (desc.includes('RECIBO ENVIADO A SU BANCO')) {
    return { category: 'Internal Transfer (AMEX→BBVA)', kind: 'internal_transfer', needsReview: false };
  }

  // Credits / refunds (negative charge on card = money back)
  if (csvAmount < 0) {
    return { category: 'Refund', kind: 'income', needsReview: false };
  }

  // Merchant-level overrides for business expenses
  if (desc.includes('GOOGLE*ADS') || (desc.includes('GOOGLE') && desc.includes('ADS'))) {
    return { category: 'Advertising', kind: 'expense', needsReview: false };
  }
  if (desc.includes('CLAUDE.AI') || desc.includes('OPENAI') || desc.includes('CHATGPT')) {
    return { category: 'Software & Tech', kind: 'expense', needsReview: false };
  }
  if (desc.includes('GOOGLE CLOUD')) {
    return { category: 'Software & Tech', kind: 'expense', needsReview: false };
  }

  const mapped = CATEGORY_MAP[amexCat];
  if (mapped) return { category: mapped, kind: 'expense', needsReview: false };

  return { category: 'Uncategorised', kind: 'expense', needsReview: true };
}

export function parseAMEX(file: File): Promise<Transaction[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const result = Papa.parse<AMEXRow>(text, {
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
          const rawDate   = (row['Fecha'] ?? '').trim();
          const rawAmount = (row['Importe'] ?? '').trim();
          if (!rawDate || !rawAmount) continue;

          // Strip single-quote wrappers AMEX adds around the reference
          const ref = (row['Referencia'] ?? '').trim().replace(/^'|'$/g, '');
          if (!ref) continue;

          const date       = parseDate(rawDate);
          const csvAmount  = parseAmount(rawAmount); // positive = charge, negative = credit
          const amount     = -csvAmount;             // our convention: charges are negative
          const description = (row['Descripción'] ?? '').trim().replace(/\s+/g, ' ');

          const { category, kind, needsReview } = categorise(row, csvAmount);
          const foreign = parseForeign(row['Detalles ampliados'] ?? '');

          transactions.push({
            id: `amex_${ref}`,
            sourceId: ref,
            date,
            valueDate: date,
            description,
            rawDescription: row['Descripción'] ?? '',
            amount,
            currency: 'EUR',
            account: 'AMEX',
            kind,
            category,
            autoCategory: category,
            isManualOverride: false,
            needsReview,
            notes: '',
            importedAt: now,
            ...foreign,
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
