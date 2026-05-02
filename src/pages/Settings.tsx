/**
 * Settings screen — account configurations, IRPF aplazamiento input form,
 * budget targets, exports, JSON backup/restore, sign-out.
 *
 * Lands progressively across Sessions 8 (IRPF + budgets + exports) and
 * 9 (JSON backup).
 */

import PlaceholderCard from "../components/PlaceholderCard";
import { useAuth } from "../contexts/AuthContext";

export default function Settings() {
  const { user, signOutUser } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Settings</h2>
        <p className="text-sm text-slate-600 mt-1">
          Account, IRPF aplazamiento, budgets, exports, backup.
        </p>
      </div>

      <div className="rounded-2xl bg-white border border-slate-200 p-6">
        <p className="text-sm font-medium text-slate-900">Signed in as</p>
        <p className="mt-1 text-sm text-slate-600">
          {user?.displayName ?? "—"} · {user?.email}
        </p>
        <button
          type="button"
          onClick={signOutUser}
          className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 transition"
        >
          Sign out
        </button>
      </div>

      <PlaceholderCard
        title="Coming in Sessions 8 & 9"
        body="IRPF aplazamiento input form, budget targets, PDF/Excel exports, and the JSON backup/restore flow."
      />
    </div>
  );
}
