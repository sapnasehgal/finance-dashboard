/**
 * Authenticated layout shell.
 *
 * Desktop: left sidebar with full navigation labels.
 * Mobile (below `lg` breakpoint): bottom tab bar with icons + short labels.
 *
 * The five main screens (Dashboard, Transactions, Import, Rules, Settings)
 * each render inside the main content area.
 */

import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  ListOrdered,
  Upload,
  SlidersHorizontal,
  Settings as SettingsIcon,
  LogOut,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/transactions", label: "Transactions", icon: ListOrdered },
  { to: "/import", label: "Import", icon: Upload },
  { to: "/rules", label: "Rules", icon: SlidersHorizontal },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export default function Layout() {
  const { user, signOutUser } = useAuth();

  const initial = (user?.displayName ?? user?.email ?? "?")
    .trim()
    .charAt(0)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-60 bg-white border-r border-slate-200 flex-col">
        <div className="px-6 py-5 border-b border-slate-200">
          <h1 className="text-base font-semibold tracking-tight">
            Finance Dashboard
          </h1>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                [
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition",
                  isActive
                    ? "bg-business-bg text-business font-medium"
                    : "text-slate-700 hover:bg-slate-100",
                ].join(" ")
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-slate-200">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="size-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-sm font-medium">
              {initial}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {user?.displayName ?? "Signed in"}
              </p>
              <p className="text-xs text-slate-500 truncate">{user?.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={signOutUser}
            className="mt-1 w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-100 transition"
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:ml-60 pb-20 lg:pb-0 min-h-screen">
        {/* Top bar (mobile only) */}
        <header className="lg:hidden sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <h1 className="text-base font-semibold">Finance Dashboard</h1>
          <button
            type="button"
            onClick={signOutUser}
            className="size-9 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-sm font-medium hover:bg-slate-200 transition"
            aria-label="Sign out"
          >
            {initial}
          </button>
        </header>

        <div className="p-4 lg:p-8 max-w-6xl mx-auto">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 flex">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              [
                "flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-xs",
                isActive ? "text-business" : "text-slate-500",
              ].join(" ")
            }
          >
            <Icon className="size-5" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
