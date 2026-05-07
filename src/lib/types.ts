export type AccountSource = 'BBVA' | 'Wise' | 'AMEX' | 'Iberia';
export type TransactionKind = 'income' | 'expense' | 'internal_transfer';

export interface Transaction {
  id: string;               // deterministic fingerprint — used as Firestore doc ID
  sourceId: string;         // original ID from the file (Wise TRANSFER-id, or same as id for BBVA)
  date: string;             // YYYY-MM-DD (transaction date)
  valueDate: string;        // YYYY-MM-DD (value date, may differ from date)
  description: string;      // cleaned display name
  rawDescription: string;   // original text from file
  amount: number;           // positive = money in, negative = money out; EUR for display
  currency: string;         // display currency (always EUR)
  originalAmount?: number;  // set when original was a foreign currency
  originalCurrency?: string;
  exchangeRate?: number;
  account: AccountSource;
  kind: TransactionKind;
  category: string;         // current category (may be manually overridden)
  autoCategory: string;     // original auto-assigned (preserved for audit trail)
  isManualOverride: boolean;
  needsReview: boolean;
  notes: string;
  importedAt: string;       // ISO timestamp
}

export interface ParseResult {
  transactions: Transaction[];
  errors: string[];
}

export interface ImportSummary {
  newCount: number;
  duplicateCount: number;
  internalCount: number;
  reviewCount: number;
}
