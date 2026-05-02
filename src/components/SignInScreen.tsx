/**
 * Pre-auth landing page. Shown when no user is signed in.
 *
 * If Firebase isn't configured yet (no `.env.local` values), shows a
 * helpful "not configured" message instead of a broken sign-in button.
 */

import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

export default function SignInScreen() {
  const { signIn, ready } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSignIn = async () => {
    setError(null);
    setBusy(true);
    try {
      await signIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md p-8 bg-white rounded-2xl shadow-sm border border-slate-200">
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">
          Finance Dashboard
        </h1>
        <p className="text-slate-600 mb-6 text-sm">
          Personal finance for autónomas. Your data stays in your own Firebase
          project, gated by your Google account.
        </p>

        {!ready ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-medium mb-1">Firebase isn't configured yet.</p>
            <p className="text-amber-800">
              Create a <code className="font-mono text-xs">.env.local</code>{" "}
              file in the project root with your Firebase config keys, then
              restart the dev server. See{" "}
              <code className="font-mono text-xs">.env.local.example</code> for
              the template.
            </p>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={handleSignIn}
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {busy ? "Signing in…" : "Sign in with Google"}
            </button>
            {error && (
              <p className="mt-3 text-sm text-red-600">{error}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
