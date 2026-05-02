/**
 * Top-level app component.
 *
 * Wraps the app in:
 *   - BrowserRouter (URL-based routing)
 *   - AuthProvider (Firebase auth state)
 *
 * Renders either the SignInScreen (if not signed in) or the authenticated
 * Layout shell (with the five routed pages inside it).
 */

import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Layout from "./components/Layout";
import SignInScreen from "./components/SignInScreen";
import Dashboard from "./pages/Dashboard";
import Transactions from "./pages/Transactions";
import Import from "./pages/Import";
import Rules from "./pages/Rules";
import Settings from "./pages/Settings";

function AppRoutes() {
  const { user, loading, ready } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  if (!ready || !user) {
    return <SignInScreen />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="import" element={<Import />} />
        <Route path="rules" element={<Rules />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
