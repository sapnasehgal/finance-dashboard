import {
  collection,
  doc,
  getDoc,
  getDocs,
  writeBatch,
  updateDoc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  type Firestore,
} from 'firebase/firestore';
import type { Transaction, Rule, CustomCategory } from './types';
import { matchesRule, applyRule } from './rules';

// ── Collection helpers ────────────────────────────────────────────────────────

function txCollection(db: Firestore, uid: string) {
  return collection(db, 'users', uid, 'transactions');
}

function ruleCollection(db: Firestore, uid: string) {
  return collection(db, 'users', uid, 'rules');
}

function customCatCollection(db: Firestore, uid: string) {
  return collection(db, 'users', uid, 'customCategories');
}

// Firestore rejects undefined field values — strip them before writing.
function clean(obj: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  );
}

// ── Transactions ──────────────────────────────────────────────────────────────

export async function findDuplicateIds(
  db: Firestore,
  uid: string,
  ids: string[]
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const duplicates = new Set<string>();
  const checks = ids.map((id) => getDoc(doc(txCollection(db, uid), id)));
  const results = await Promise.all(checks);
  results.forEach((snap, i) => {
    if (snap.exists()) duplicates.add(ids[i]);
  });
  return duplicates;
}

export async function saveTransactions(
  db: Firestore,
  uid: string,
  transactions: Transaction[]
): Promise<{ written: number; skipped: number }> {
  if (transactions.length === 0) return { written: 0, skipped: 0 };

  const existingIds = await findDuplicateIds(db, uid, transactions.map((t) => t.id));
  const toWrite = transactions.filter((t) => !existingIds.has(t.id));

  const BATCH_SIZE = 499;
  for (let i = 0; i < toWrite.length; i += BATCH_SIZE) {
    const chunk = toWrite.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const tx of chunk) {
      batch.set(doc(txCollection(db, uid), tx.id), clean(tx));
    }
    await batch.commit();
  }

  return { written: toWrite.length, skipped: existingIds.size };
}

export async function getTransactions(
  db: Firestore,
  uid: string,
  maxCount = 500
): Promise<Transaction[]> {
  const q = query(txCollection(db, uid), orderBy('date', 'desc'), limit(maxCount));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as Transaction);
}

export async function updateTransaction(
  db: Firestore,
  uid: string,
  txId: string,
  updates: Partial<Transaction>
): Promise<void> {
  await updateDoc(doc(txCollection(db, uid), txId), clean(updates));
}

// ── Rules ─────────────────────────────────────────────────────────────────────

export async function saveRule(db: Firestore, uid: string, rule: Rule): Promise<void> {
  await setDoc(doc(ruleCollection(db, uid), rule.id), rule);
}

// Normalise rules written before the multi-condition data model.
function normalizeRule(data: Record<string, unknown>): Rule {
  if (Array.isArray(data.conditions) && data.conditions.length > 0) {
    return data as unknown as Rule;
  }
  return {
    ...(data as unknown as Rule),
    conditions: [
      {
        matchField: data.matchField as Rule['conditions'][0]['matchField'],
        matchType: data.matchType as Rule['conditions'][0]['matchType'],
        matchValue: data.matchValue as string,
      },
    ],
  };
}

export async function getRules(db: Firestore, uid: string): Promise<Rule[]> {
  const q = query(ruleCollection(db, uid), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => normalizeRule(d.data()));
}

export async function updateRule(
  db: Firestore,
  uid: string,
  ruleId: string,
  updates: Partial<Rule>
): Promise<void> {
  await updateDoc(doc(ruleCollection(db, uid), ruleId), clean(updates));
}

export async function deleteRule(db: Firestore, uid: string, ruleId: string): Promise<void> {
  await deleteDoc(doc(ruleCollection(db, uid), ruleId));
}

// Applies a rule to all existing transactions that match it. Returns count updated.
export async function applyRuleRetroactive(
  db: Firestore,
  uid: string,
  rule: Rule
): Promise<number> {
  const q = query(txCollection(db, uid), limit(5000));
  const snap = await getDocs(q);
  const matches = snap.docs
    .map((d) => d.data() as Transaction)
    .filter((tx) => matchesRule(rule, tx));

  if (matches.length === 0) return 0;

  const BATCH_SIZE = 499;
  for (let i = 0; i < matches.length; i += BATCH_SIZE) {
    const chunk = matches.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const tx of chunk) {
      const updated = applyRule(rule, tx);
      batch.update(doc(txCollection(db, uid), tx.id), {
        category: updated.category,
        isManualOverride: true,
        needsReview: false,
        notes: updated.notes,
      });
    }
    await batch.commit();
  }

  return matches.length;
}

// ── Custom Categories ─────────────────────────────────────────────────────────

export async function getCustomCategories(
  db: Firestore,
  uid: string
): Promise<CustomCategory[]> {
  const snap = await getDocs(customCatCollection(db, uid));
  return snap.docs.map((d) => d.data() as CustomCategory);
}

export async function saveCustomCategory(
  db: Firestore,
  uid: string,
  cat: CustomCategory
): Promise<void> {
  await setDoc(doc(customCatCollection(db, uid), cat.id), cat);
}

export async function deleteCustomCategory(
  db: Firestore,
  uid: string,
  catId: string
): Promise<void> {
  await deleteDoc(doc(customCatCollection(db, uid), catId));
}
