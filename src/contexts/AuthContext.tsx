/**
 * Authentication context.
 *
 * Exposes the currently signed-in user (or null), plus signIn/signOut
 * actions. Listens for auth state changes via Firebase's
 * `onAuthStateChanged` so the UI updates automatically when sign-in /
 * sign-out events happen.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { auth, firebaseReady, googleProvider } from "../lib/firebase";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  ready: boolean;
  signIn: () => Promise<void>;
  signOutUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseReady || !auth) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (next) => {
      setUser(next);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      ready: firebaseReady,
      signIn: async () => {
        if (!auth) throw new Error("Firebase auth not initialised");
        await signInWithPopup(auth, googleProvider);
      },
      signOutUser: async () => {
        if (!auth) return;
        await signOut(auth);
      },
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
