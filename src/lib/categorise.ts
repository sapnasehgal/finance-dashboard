import type { TransactionKind } from './types';

export type CategoryMeta = {
  isBusiness: boolean;
  isFixed: boolean;
  colour: 'blue' | 'green' | 'purple' | 'amber' | 'gray';
  kind?: TransactionKind;
};

// Central registry of every category name used across all four parsers.
// Drives colour coding, business/personal split, and chart grouping.
// When a new category is introduced in any parser, add it here.
export const CATEGORY_META: Record<string, CategoryMeta> = {
  // ── Income ─────────────────────────────────────────────────────────────────
  'Tutoring Income':                   { isBusiness: true,  isFixed: false, colour: 'blue',   kind: 'income' },
  'Consulting Income (International)': { isBusiness: true,  isFixed: false, colour: 'purple', kind: 'income' },
  'Rental Income (Storage €85)':       { isBusiness: false, isFixed: true,  colour: 'green',  kind: 'income' },
  'Rental Income (Parking €145)':      { isBusiness: false, isFixed: true,  colour: 'green',  kind: 'income' },
  'Cashback':                          { isBusiness: false, isFixed: false, colour: 'green',  kind: 'income' },
  'Refund':                            { isBusiness: false, isFixed: false, colour: 'green',  kind: 'income' },
  'Uncategorised Income':              { isBusiness: false, isFixed: false, colour: 'amber',  kind: 'income' },

  // ── Business expenses (blue) ───────────────────────────────────────────────
  'Autónoma Tax (TGSS)':              { isBusiness: true, isFixed: true,  colour: 'blue' },
  'IRPF Aplazamiento':                { isBusiness: true, isFixed: true,  colour: 'blue' },
  'Gestor / Accounting':              { isBusiness: true, isFixed: true,  colour: 'blue' },
  'Software & Subscriptions':         { isBusiness: true, isFixed: true,  colour: 'blue' },
  'Software & Tech':                  { isBusiness: true, isFixed: true,  colour: 'blue' },
  'Advertising':                      { isBusiness: true, isFixed: false, colour: 'blue' },
  'Taxi (Business)':                  { isBusiness: true, isFixed: false, colour: 'blue' },
  'Metropolitan Business Assoc.':     { isBusiness: true, isFixed: true,  colour: 'blue' },
  'Professional Development':         { isBusiness: true, isFixed: false, colour: 'blue' },
  'Education & Training':             { isBusiness: true, isFixed: false, colour: 'blue' },
  'Marketing':                        { isBusiness: true, isFixed: false, colour: 'blue' },
  'Printing & Office':                { isBusiness: true, isFixed: false, colour: 'blue' },
  'Vodafone (50% Business)':          { isBusiness: true, isFixed: true,  colour: 'blue' },

  // ── Personal expenses (green) ──────────────────────────────────────────────
  'Rent':                             { isBusiness: false, isFixed: true,  colour: 'green' },
  'Utilities (Electricity)':          { isBusiness: false, isFixed: true,  colour: 'green' },
  'Utilities':                        { isBusiness: false, isFixed: true,  colour: 'green' },
  'Insurance - Health (Mapfre)':      { isBusiness: false, isFixed: true,  colour: 'green' },
  'Insurance - Home (Generali)':      { isBusiness: false, isFixed: true,  colour: 'green' },
  'Gym & Fitness':                    { isBusiness: false, isFixed: true,  colour: 'green' },
  'Sports & Activities':              { isBusiness: false, isFixed: false, colour: 'green' },
  'Groceries':                        { isBusiness: false, isFixed: false, colour: 'green' },
  'Dining Out':                       { isBusiness: false, isFixed: false, colour: 'green' },
  'Food & Dining':                    { isBusiness: false, isFixed: false, colour: 'green' },
  'Transport - Public':               { isBusiness: false, isFixed: true,  colour: 'green' },
  'Transport':                        { isBusiness: false, isFixed: false, colour: 'green' },
  'Taxi (Personal)':                  { isBusiness: false, isFixed: false, colour: 'green' },
  'Personal Care':                    { isBusiness: false, isFixed: false, colour: 'green' },
  'Medical & Pharmacy':               { isBusiness: false, isFixed: false, colour: 'green' },
  'Health & Pharmacy':                { isBusiness: false, isFixed: false, colour: 'green' },
  'Entertainment Subscriptions':      { isBusiness: false, isFixed: true,  colour: 'green' },
  'Entertainment':                    { isBusiness: false, isFixed: false, colour: 'green' },
  'Subscriptions':                    { isBusiness: false, isFixed: true,  colour: 'amber' },
  'Pet (Brielle)':                    { isBusiness: false, isFixed: false, colour: 'green' },
  'Travel & Holidays':                { isBusiness: false, isFixed: false, colour: 'green' },
  'Shopping':                         { isBusiness: false, isFixed: false, colour: 'green' },
  'Home & Furnishings':               { isBusiness: false, isFixed: false, colour: 'green' },
  'Card Annual Fee':                  { isBusiness: false, isFixed: true,  colour: 'green' },
  'Gifts & Donations':                { isBusiness: false, isFixed: false, colour: 'green' },
  'Cash (Likely Personal Trainer)':   { isBusiness: false, isFixed: false, colour: 'amber' },
  'Cash (Uncategorised)':             { isBusiness: false, isFixed: false, colour: 'amber' },

  // ── Internal / transfers ───────────────────────────────────────────────────
  'Internal Transfer':                { isBusiness: false, isFixed: false, colour: 'gray', kind: 'internal_transfer' },
  'Internal Transfer (Wise→BBVA)':    { isBusiness: false, isFixed: false, colour: 'gray', kind: 'internal_transfer' },
  'Internal Transfer (AMEX→BBVA)':   { isBusiness: false, isFixed: false, colour: 'gray', kind: 'internal_transfer' },

  // ── Loan ──────────────────────────────────────────────────────────────────
  'Loan Repayment':                   { isBusiness: false, isFixed: true,  colour: 'gray' },

  // ── Catch-all ─────────────────────────────────────────────────────────────
  'Other Services':                   { isBusiness: false, isFixed: false, colour: 'amber' },
  'Uncategorised':                    { isBusiness: false, isFixed: false, colour: 'amber' },
};

const DEFAULT_META: CategoryMeta = { isBusiness: false, isFixed: false, colour: 'amber' };

export function getCategoryMeta(category: string): CategoryMeta {
  return CATEGORY_META[category] ?? DEFAULT_META;
}

// Colour hex values for use in charts (Recharts doesn't accept Tailwind classes)
export const COLOUR_HEX: Record<CategoryMeta['colour'], string> = {
  blue:   '#2563eb',
  green:  '#16a34a',
  purple: '#9333ea',
  amber:  '#d97706',
  gray:   '#94a3b8',
};

export const INCOME_CATEGORIES = new Set<string>([
  'Tutoring Income',
  'Consulting Income (International)',
  'Rental Income (Storage €85)',
  'Rental Income (Parking €145)',
  'Cashback',
  'Refund',
  'Uncategorised Income',
]);

export const INTERNAL_CATEGORIES = new Set<string>([
  'Internal Transfer',
  'Internal Transfer (Wise→BBVA)',
  'Internal Transfer (AMEX→BBVA)',
]);
