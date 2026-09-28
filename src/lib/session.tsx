import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Role = "buyer" | "seller" | "admin";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  balance: number;
};

type SessionContextValue = {
  user: SessionUser | null;
  isLoading: boolean;
  signIn: (email: string, role?: Role) => SessionUser;
  signOut: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

const STORAGE_KEY = "accsmarthub.session.v1";

/**
 * Demo session store backed by localStorage. This is the seam where a real
 * backend session (httpOnly cookie / JWT) will plug in — the UI only ever
 * talks to this context.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(() => {
    // Lazy initializer: restore persisted session without an effect.
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as SessionUser) : null;
      } catch {
        return null;
      }
  });
  const isLoading = false;

  const signIn = useCallback((email: string, role: Role = "buyer") => {
    const name = email
      .split("@")[0]
      .replace(/[._-]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    const next: SessionUser = {
      id: role === "admin" ? "u-admin" : `u-${Date.now().toString(36)}`,
      name: name || "Member",
      email,
      role,
      balance: 250,
    };
    setUser(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable — session stays in memory
    }
    return next;
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({ user, isLoading, signIn, signOut }),
    [user, isLoading, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
