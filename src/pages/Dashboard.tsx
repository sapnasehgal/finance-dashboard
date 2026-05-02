/**
 * Dashboard — home screen. Will hold:
 *   • Anomaly badges
 *   • Income vs Spending line chart
 *   • Quarterly P&L card
 *   • Spending by category bar chart
 *   • Spending by category over time stacked area
 *   • Top 5 expenses + Needs Review + Recurring subscriptions
 *   • Plain-language summary
 *
 * Placeholder for now. Real content lands in Sessions 3, 6, and 7.
 */

import PlaceholderCard from "../components/PlaceholderCard";

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>
        <p className="text-sm text-slate-600 mt-1">
          Where the summary of your money lives.
        </p>
      </div>
      <PlaceholderCard
        title="Coming in Session 3"
        body="The categorisation engine and the first dashboard cards (income, spending split, by-category bar chart) will appear here. Time-series charts arrive in Session 6, and the anomaly badges + plain-language summary in Session 7."
      />
    </div>
  );
}
