import { parseBBVA } from './bbva';
import { parseWise } from './wise';
import { parseAMEX } from './amex';
import { parseIberia } from './iberia';
import type { ParseResult } from '../types';

export type DetectedFormat = 'BBVA' | 'Wise' | 'AMEX' | 'Iberia' | 'unknown';

// Peek at the first line of a CSV to identify it by its header columns.
async function detectCsvFormat(file: File): Promise<'AMEX' | 'Wise' | 'unknown'> {
  const chunk = await file.slice(0, 300).text();
  const firstLine = chunk.split('\n')[0];
  if (firstLine.includes('Referencia') && firstLine.includes('Importe')) return 'AMEX';
  if (firstLine.includes('Status') && firstLine.includes('Direction')) return 'Wise';
  return 'unknown';
}

async function parseWith(
  file: File,
  parser: (f: File) => Promise<import('../types').Transaction[]>,
  label: string
): Promise<ParseResult> {
  try {
    const transactions = await parser(file);
    return { transactions, errors: [] };
  } catch (err) {
    return {
      transactions: [],
      errors: [`${label} parse failed: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
}

export async function parseFile(file: File): Promise<ParseResult> {
  const name = file.name.toLowerCase();

  // Excel files: distinguish BBVA vs Iberia by filename keyword
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    if (name.includes('iberia')) return parseWith(file, parseIberia, 'Iberia');
    return parseWith(file, parseBBVA, 'BBVA');
  }

  // CSV files: detect by header content (both AMEX and Wise are .csv)
  if (name.endsWith('.csv')) {
    const fmt = await detectCsvFormat(file);
    if (fmt === 'AMEX') return parseWith(file, parseAMEX, 'AMEX');
    if (fmt === 'Wise') return parseWith(file, parseWise, 'Wise');
    return {
      transactions: [],
      errors: [`Could not detect CSV format for ${file.name}. Expected an AMEX or Wise export.`],
    };
  }

  return {
    transactions: [],
    errors: [`Unrecognised file format: ${file.name}. Expected .xlsx (BBVA/Iberia) or .csv (AMEX/Wise).`],
  };
}
