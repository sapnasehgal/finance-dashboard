import * as XLSX from 'xlsx';
import type { Transaction, TransactionKind } from '../types';

// DD/MM/YYYY → YYYY-MM-DD
function parseSpanishDate(raw: string): string {
  const s = String(raw ?? '').trim();
  const [d, m, y] = s.split('/');
  if (!d || !m || !y) return s;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function cleanText(raw: string): string {
  return String(raw ?? '').trim().replace(/\s+/g, ' ');
}

// Title-case a merchant name coming from BBVA's all-caps or messy format
function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// Deterministic fingerprint that survives re-imports of the same file.
// Including the running balance makes it robust against two identical
// charges on the same day (their balances will differ).
function makeId(valueDate: string, amount: number, concepto: string, movimiento: string, balance: number): string {
  const slug = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24);
  return `bbva_${valueDate.replace(/-/g, '')}_${amount < 0 ? 'm' : 'p'}${Math.abs(amount).toFixed(2).replace('.', '')}_${slug(concepto)}_${slug(movimiento)}_${Math.round(balance * 100)}`;
}

type Categorisation = {
  category: string;
  kind: TransactionKind;
  needsReview: boolean;
};

function categorise(concepto: string, movimiento: string, amount: number): Categorisation {
  const c = concepto.toLowerCase();
  const m = movimiento.toLowerCase();

  // ── Internal BBVA transfers (savings buckets) ─────────────────────────────
  if (c === 'traspaso desde cuenta' || c === 'traspaso a cuenta') {
    return { category: 'Internal Transfer', kind: 'internal_transfer', needsReview: false };
  }

  // ── Wise → BBVA inflows (income already captured on Wise side) ───────────
  if ((c === 'transferencia recibida' || c.includes('transferencia')) && m.includes('sapna')) {
    return { category: 'Internal Transfer (Wise→BBVA)', kind: 'internal_transfer', needsReview: false };
  }

  // ── Personal loan repayment (~€403.61/mo until May 2027) ─────────────────
  if (c.includes('amortizacion') || (c.includes('prestamo') && c.includes('cargo'))) {
    return { category: 'Loan Repayment', kind: 'expense', needsReview: false };
  }

  // ── Tax / compliance (checked before generic patterns) ───────────────────
  if (c.includes('tgss') || c.includes('seguridad social') || c.includes('tesoreria general')) {
    return { category: 'Autónoma Tax (TGSS)', kind: 'expense', needsReview: false };
  }
  if (c.includes('hacienda') || c.includes('irpf') || c.includes('agencia tributaria') || c.includes('aeat')) {
    return { category: 'IRPF Aplazamiento', kind: 'expense', needsReview: false };
  }

  // ── Gestor ────────────────────────────────────────────────────────────────
  if (c.includes('igsa') || (c.includes('associats') && c.includes('tax'))) {
    return { category: 'Gestor / Accounting', kind: 'expense', needsReview: false };
  }

  // ── Rent (GEIBA 2005 SL) ─────────────────────────────────────────────────
  if (c.includes('geiba')) {
    return { category: 'Rent', kind: 'expense', needsReview: false };
  }

  // ── Utilities ─────────────────────────────────────────────────────────────
  if (c.includes('energia xxi') || c.includes('endesa') || c.includes('iberdrola') || c.includes('naturgy') || c.includes('holaluz')) {
    return { category: 'Utilities (Electricity)', kind: 'expense', needsReview: false };
  }
  if (c.includes('aigues') || c.includes('aguas') || c.includes('water')) {
    return { category: 'Utilities', kind: 'expense', needsReview: false };
  }

  // ── Insurance ─────────────────────────────────────────────────────────────
  if (c.includes('mapfre')) {
    return { category: 'Insurance - Health (Mapfre)', kind: 'expense', needsReview: false };
  }
  if (c.includes('generali')) {
    return { category: 'Insurance - Home (Generali)', kind: 'expense', needsReview: false };
  }

  // ── Vodafone (50% business, 50% personal) ─────────────────────────────────
  if (c.includes('vodafone')) {
    return { category: 'Vodafone (50% Business)', kind: 'expense', needsReview: false };
  }

  // ── Card payments — Concepto holds the merchant name ─────────────────────
  if (m === 'pago con tarjeta') {
    // Taxis — all default to business (user corrects personal ones)
    if (c.includes('taxi') || c.includes('cabify') || c.includes('free now') || c.includes('mytaxi') || c.includes('prestige') || c.includes('limousine')) {
      return { category: 'Taxi (Business)', kind: 'expense', needsReview: false };
    }

    // Grocery supermarkets
    if (c.includes('ametller') || c.includes('condis') || c.includes('caprabo') || c.includes('carrefour') || c.includes('mercadona') || c.includes('supermercado') || c.includes('lidl') || c.includes('alcampo') || c.includes('dia ') || c.includes('spar')) {
      return { category: 'Groceries', kind: 'expense', needsReview: false };
    }

    // Delivery — >€40 = groceries, ≤€40 = dining out
    if (c.includes('uber eats') || c.includes('glovo') || c.includes('deliveroo')) {
      return Math.abs(amount) > 40
        ? { category: 'Groceries', kind: 'expense', needsReview: false }
        : { category: 'Dining Out', kind: 'expense', needsReview: false };
    }

    // Dining
    if (c.includes('restauran') || c.includes('cafeteria') || c.includes('bar ') || c.includes('cafe ') || c.includes('café')) {
      return { category: 'Dining Out', kind: 'expense', needsReview: false };
    }

    // Pharmacy
    if (c.includes('farmacia') || c.includes('pharmacy') || c.includes('parafarmacia')) {
      return { category: 'Medical & Pharmacy', kind: 'expense', needsReview: false };
    }

    // Dental
    if (c.includes('dentalspa') || c.includes('dental') || c.includes('clinica dental')) {
      return { category: 'Medical & Pharmacy', kind: 'expense', needsReview: false };
    }

    // ATM via card
    if (c.includes('atm') || c.includes('cajero')) {
      const flag = Math.abs(amount) === 300;
      return { category: flag ? 'Cash (Likely Personal Trainer)' : 'Cash (Uncategorised)', kind: 'expense', needsReview: flag };
    }

    // Software & business subscriptions
    if (c.includes('anthropic') || c.includes('claude.ai') || c.includes('claude pro')) {
      return { category: 'Software & Subscriptions', kind: 'expense', needsReview: false };
    }
    if (c.includes('openai') || c.includes('chatgpt')) {
      return { category: 'Software & Subscriptions', kind: 'expense', needsReview: false };
    }
    if (c.includes('zoom')) {
      return { category: 'Software & Subscriptions', kind: 'expense', needsReview: false };
    }
    if (c.includes('flodesk') || c.includes('teachable') || c.includes('convertkit') || c.includes('kit.com')) {
      return { category: 'Software & Subscriptions', kind: 'expense', needsReview: false };
    }
    if (c.includes('canva') || c.includes('adobe') || c.includes('calendly') || c.includes('napkin') || c.includes('samcart') || c.includes('ampmycontent')) {
      return { category: 'Software & Subscriptions', kind: 'expense', needsReview: false };
    }
    // Google — flag for review (Workspace=business vs Google One=personal)
    if (c.includes('google') && !c.includes('google ads')) {
      return { category: 'Software & Subscriptions', kind: 'expense', needsReview: true };
    }
    if (c.includes('google ads') || c.includes('google*ads')) {
      return { category: 'Advertising', kind: 'expense', needsReview: false };
    }

    // Public transport
    if (c.includes('t-mobilitat') || c.includes('tmb') || c.includes('mobilitat') || c.includes('metro barcelona')) {
      return { category: 'Transport - Public', kind: 'expense', needsReview: false };
    }
    if (c.includes('renfe') || c.includes('rodalies')) {
      return { category: 'Transport - Public', kind: 'expense', needsReview: false };
    }

    // Travel
    if (c.includes('hotel') || c.includes('airbnb') || c.includes('booking.com') || c.includes('ryanair') || c.includes('vueling') || c.includes('iberia')) {
      return { category: 'Travel & Holidays', kind: 'expense', needsReview: true };
    }

    // Gym / fitness
    if (c.includes('urban sports') || c.includes('urbansports') || c.includes('gym') || c.includes('fitness')) {
      return { category: 'Gym & Fitness', kind: 'expense', needsReview: false };
    }

    // Metropolitan Business Association
    if (c.includes('metropolitan')) {
      return { category: 'Metropolitan Business Assoc.', kind: 'expense', needsReview: false };
    }

    // Printing / office
    if (c.includes('workcenter')) {
      return { category: 'Printing & Office', kind: 'expense', needsReview: false };
    }

    // Pet (Brielle) — dog food, vet, daycare
    if (c.includes('veterinar') || c.includes('dogsy') || c.includes('woof') || c.includes('petco') || c.includes('arcaplanet') || c.includes('tienda animal') || c.includes('mascota')) {
      return { category: 'Pet (Brielle)', kind: 'expense', needsReview: false };
    }

    // Personal care
    if (c.includes('massage') || c.includes('masaje') || c.includes('physio') || c.includes('fisio') || c.includes('nails') || c.includes('uñas') || c.includes('estetica') || c.includes('salud')) {
      return { category: 'Personal Care', kind: 'expense', needsReview: false };
    }

    // Amazon — professional development by default (flag for review)
    if (c.includes('amazon') && !c.includes('amazon prime')) {
      return { category: 'Professional Development', kind: 'expense', needsReview: true };
    }

    // Entertainment subs via card
    if (c.includes('netflix') || c.includes('spotify') || c.includes('amazon prime') || c.includes('hbo') || c.includes('disney+') || c.includes('apple tv')) {
      return { category: 'Entertainment Subscriptions', kind: 'expense', needsReview: false };
    }

    return { category: 'Uncategorised', kind: 'expense', needsReview: true };
  }

  // ── ATM withdrawals ───────────────────────────────────────────────────────
  if (c.includes('cajero') || c.includes('reintegro') || m.includes('cajero')) {
    const flag = Math.abs(amount) === 300;
    return { category: flag ? 'Cash (Likely Personal Trainer)' : 'Cash (Uncategorised)', kind: 'expense', needsReview: flag };
  }

  // ── Income (positive amounts not already caught above) ────────────────────
  if (amount > 0) {
    // €85 recurring Bizum → storage rental
    if (Math.abs(amount - 85) < 0.01) {
      return { category: 'Rental Income (Storage €85)', kind: 'income', needsReview: false };
    }
    if (c.includes('bizum') || c.includes('ingreso por bizum') || m.includes('bizum')) {
      return { category: 'Tutoring Income', kind: 'income', needsReview: false };
    }
    if (c === 'transferencia recibida') {
      return { category: 'Tutoring Income', kind: 'income', needsReview: true };
    }
    return { category: 'Uncategorised Income', kind: 'income', needsReview: true };
  }

  // ── Direct debits / subscriptions (negative, non-card) ───────────────────
  if (c.includes('netflix') || c.includes('spotify') || c.includes('amazon prime') || c.includes('hbo') || c.includes('disney')) {
    return { category: 'Entertainment Subscriptions', kind: 'expense', needsReview: false };
  }
  if (c.includes('urban sports') || c.includes('urbansports')) {
    return { category: 'Gym & Fitness', kind: 'expense', needsReview: false };
  }
  if (c.includes('t-mobilitat') || c.includes('mobilitat')) {
    return { category: 'Transport - Public', kind: 'expense', needsReview: false };
  }
  if (c.includes('metropolitan')) {
    return { category: 'Metropolitan Business Assoc.', kind: 'expense', needsReview: false };
  }
  if (c.includes('anthropic') || c.includes('openai') || c.includes('zoom') || c.includes('flodesk') || c.includes('teachable') || c.includes('canva') || c.includes('adobe') || c.includes('calendly')) {
    return { category: 'Software & Subscriptions', kind: 'expense', needsReview: false };
  }

  return { category: 'Uncategorised', kind: 'expense', needsReview: true };
}

export function parseBBVA(file: File): Promise<Transaction[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const wb = XLSX.read(data, { type: 'array', cellDates: false });
        const ws = wb.Sheets[wb.SheetNames[0]];

        // Get all rows as arrays. Column A is always empty in BBVA exports
        // (data lives in B:J), so each row array is indexed A=0, B=1, … J=9.
        const allRows = XLSX.utils.sheet_to_json<(string | number | null | undefined)[]>(ws, {
          header: 1,
          raw: true,
        });

        // Find the header row by looking for 'F.Valor'
        const headerIdx = allRows.findIndex((row) =>
          Array.isArray(row) && row.some((cell) => String(cell ?? '').trim() === 'F.Valor')
        );
        if (headerIdx === -1) throw new Error('BBVA header row not found — unexpected file format');

        const headers = allRows[headerIdx];
        const col = {
          valueDate:    headers.findIndex((h) => String(h ?? '').trim() === 'F.Valor'),
          date:         headers.findIndex((h) => String(h ?? '').trim() === 'Fecha'),
          concepto:     headers.findIndex((h) => String(h ?? '').trim() === 'Concepto'),
          movimiento:   headers.findIndex((h) => String(h ?? '').trim() === 'Movimiento'),
          importe:      headers.findIndex((h) => String(h ?? '').trim() === 'Importe'),
          disponible:   headers.findIndex((h) => String(h ?? '').trim() === 'Disponible'),
          observaciones:headers.findIndex((h) => String(h ?? '').trim() === 'Observaciones'),
        };

        const now = new Date().toISOString();
        const transactions: Transaction[] = [];

        for (let i = headerIdx + 1; i < allRows.length; i++) {
          const row = allRows[i];
          if (!Array.isArray(row) || row.length === 0) continue;

          const rawValueDate = String(row[col.valueDate] ?? '').trim();
          const rawDate      = String(row[col.date] ?? '').trim();
          const concepto     = cleanText(String(row[col.concepto] ?? ''));
          const movimiento   = cleanText(String(row[col.movimiento] ?? ''));
          const amount       = Number(row[col.importe]);
          const balance      = Number(row[col.disponible] ?? 0);
          const observ       = cleanText(String(row[col.observaciones] ?? ''));

          if (!rawValueDate || isNaN(amount)) continue;

          const valueDate = parseSpanishDate(rawValueDate);
          const date      = parseSpanishDate(rawDate || rawValueDate);

          // For card payments, Concepto holds merchant; otherwise Movimiento is the label
          const isCardPayment = movimiento.toLowerCase() === 'pago con tarjeta';
          const description = titleCase(isCardPayment ? concepto : (movimiento || concepto));
          const rawDescription = [concepto, movimiento, observ].filter(Boolean).join(' | ');

          const { category, kind, needsReview } = categorise(concepto, movimiento, amount);
          const id = makeId(valueDate, amount, concepto, movimiento, balance);

          transactions.push({
            id,
            sourceId: id,
            date,
            valueDate,
            description,
            rawDescription,
            amount,
            currency: 'EUR',
            account: 'BBVA',
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
