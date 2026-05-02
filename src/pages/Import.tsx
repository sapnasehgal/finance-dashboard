/**
 * Import screen — drag-drop CSV statements. Auto-detects format
 * (BBVA / AMEX / Iberia / Wise / libro), shows a preview, applies
 * categorisation rules, writes to Firestore.
 *
 * Parsers land progressively: BBVA + Wise in Session 2, AMEX + Iberia
 * in Session 4.
 */

import PlaceholderCard from "../components/PlaceholderCard";

export default function Import() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Import</h2>
        <p className="text-sm text-slate-600 mt-1">
          Drag-drop your statements. We'll parse, deduplicate, and apply your
          rules.
        </p>
      </div>
      <PlaceholderCard
        title="Coming in Session 2"
        body="The drop zone and the BBVA + Wise CSV parsers arrive in the next session. AMEX and Iberia follow in Session 4."
      />
    </div>
  );
}
