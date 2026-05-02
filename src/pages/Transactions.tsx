/**
 * Transactions ledger. Will support search, filter, sort, click-to-edit,
 * and the "create rule from this transaction" flow. Lands in Session 5.
 */

import PlaceholderCard from "../components/PlaceholderCard";

export default function Transactions() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Transactions</h2>
        <p className="text-sm text-slate-600 mt-1">
          Every transaction across all four accounts.
        </p>
      </div>
      <PlaceholderCard
        title="Coming in Sessions 2 & 5"
        body="Session 2 lands a basic transactions table once the BBVA + Wise parsers are in. Session 5 adds search, filter, sort, the click-to-edit panel, and the rules engine."
      />
    </div>
  );
}
