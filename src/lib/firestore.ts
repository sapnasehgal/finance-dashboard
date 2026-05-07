import {
  collection,
  doc,
  getDoc,
  getDocs,
  writeBatch,
  query,
  orderBy,
  limit,
  type Firestore,
} from 'firebase/firestore';
import type { Transaction } from './types';

function txCollection(db: Firestore, uid: string) {
  return collection(db, 'users', uid, 'transactions');
}

// Check which of the given transaction IDs already exist in Firestore.
export async function findDuplicateIds(
  db: Firestore,
  uid: string,
  ids: string[]
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();

  const duplicates = new Set<string>();
  // Check in batches of 30 (getDoc is cheaper than a query for known IDs)
  const checks = ids.map((id) => getDoc(doc(txCollection(db, uid), id)));
  const results = await Promise.all(checks);
  results.forEach((snap, i) => {
    if (snap.exists()) duplicates.add(ids[i]);
  });
  return duplicates;
}

// Firestore rejects undefined field values — remove them before writing.
function clean(tx: Transaction): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(tx).filter(([, v]) => v !== undefined)
  );
}

// Write transactions to Firestore, skipping any that already exist.
// Firestore batch limit is 500 operations; we chunk accordingly.
export async function saveTransactions(
  db: Firestore,
  uid: string,
  transactions: Transaction[]
): Promise<{ written: number; skipped: number }> {
  if (transactions.length === 0) return { written: 0, skipped: 0 };

  const existingIds = await findDuplicateIds(
    db,
    uid,
    transactions.map((t) => t.id)
  );

  const toWrite = transactions.filter((t) => !existingIds.has(t.id));

  // Write in chunks of 499 (leave one slot for safety)
  const BATCH_SIZE = 499;
  for (let i = 0; i < toWrite.length; i += BATCH_SIZE) {
    const chunk = toWrite.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const tx of chunk) {
      const ref = doc(txCollection(db, uid), tx.id);
      batch.set(ref, clean(tx));
    }
    await batch.commit();
  }

  return { written: toWrite.length, skipped: existingIds.size };
}

// Fetch transactions for display, newest first, up to `maxCount`.
export async function getTransactions(
  db: Firestore,
  uid: string,
  maxCount = 500
): Promise<Transaction[]> {
  const q = query(txCollection(db, uid), orderBy('date', 'desc'), limit(maxCount));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as Transaction);
}
