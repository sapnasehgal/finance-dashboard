/**
 * Rules & Categories editor. Two side-by-side panels — categories on the
 * left (drag-to-reorder, rename, set colour, mark fixed/variable, mark
 * business/personal/internal-flow), rules on the right.
 *
 * Most rules are created from the Transactions screen via the
 * "Create rule from this" flow; this screen is where they're managed.
 *
 * Lands in Session 5.
 */

import PlaceholderCard from "../components/PlaceholderCard";

export default function Rules() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Rules & Categories
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          The categorisation rules that shape every dashboard you'll ever see.
        </p>
      </div>
      <PlaceholderCard
        title="Coming in Session 5"
        body="The categories panel and rules engine UI arrive after the basic categorisation engine has shipped (Session 3) and the transactions ledger is in place (Session 5)."
      />
    </div>
  );
}
