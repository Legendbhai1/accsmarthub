import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Role = "buyer" | "seller" | "admin";
/** Store application lifecycle: not applied → pending review → approved (seller) / rejected. */
export type SellerStatus = "none" | "pending" | "approved" | "rejected";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Available spendable wallet balance (USD). Deposits top this up. */
  balance: number;
  /** Escrow/withdrawal-hold balance, shown separately from `balance`. */
  lockedBalance: number;
  /** Store application state. "approved" means the account can also sell. */
  sellerStatus: SellerStatus;
};

type SessionContextValue = {
  user: SessionUser | null;
  isLoading: boolean;
  signIn: (
    email: string,
    role?: Role,
    opts?: { name?: string; sellerStatus?: SellerStatus },
  ) => SessionUser;
  signOut: () => void;
  /** Adds a credited deposit to the wallet balance. */
  creditBalance: (userId: string, amount: number) => void;
  /** Moves funds from balance to lockedBalance (escrow / holds). */
  lockBalance: (userId: string, amount: number) => void;
  /** Unlocks previously locked funds back into balance. */
  unlockBalance: (userId: string, amount: number) => void;
  /** Submits/updates the signed-in user's store application. */
  applyAsSeller: (userId: string) => void;
  /** Demo admin action: approves the given user's store application. */
  approveSellerApplication: (userId: string) => void;
  /** Demo admin action: rejects the given user's store application. */
  rejectSellerApplication: (userId: string) => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

const STORAGE_KEY = "accsmarthub.session.v2";

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

  const persist = useCallback((next: SessionUser | null) => {
    try {
      if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // storage unavailable — session stays in memory
    }
  }, []);

  const patch = useCallback(
    (userId: string, updater: (u: SessionUser) => SessionUser) => {
      setUser((prev) => {
        if (!prev || prev.id !== userId) return prev;
        const next = updater(prev);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const signIn = useCallback(
    (
      email: string,
      role: Role = "buyer",
      opts?: { name?: string; sellerStatus?: SellerStatus },
    ) => {
      const name =
        opts?.name ??
        email
          .split("@")[0]
          .replace(/[._-]+/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
      const isAdmin = email.toLowerCase().startsWith("admin");
      const next: SessionUser = {
        id: isAdmin ? "u-admin" : `u-${email.toLowerCase()}`,
        name: name || "Member",
        email,
        role: isAdmin ? "admin" : role,
        balance: 250,
        lockedBalance: 0,
        // Admins are trusted by default; new accounts must apply for a store.
        sellerStatus: isAdmin ? "approved" : (opts?.sellerStatus ?? "none"),
      };
      setUser(next);
      persist(next);
      return next;
    },
    [persist],
  );

  const signOut = useCallback(() => {
    setUser(null);
    persist(null);
  }, [persist]);

  const creditBalance = useCallback(
    (userId: string, amount: number) =>
      patch(userId, (u) => ({ ...u, balance: Math.round((u.balance + amount) * 100) / 100 })),
    [patch],
  );

  const lockBalance = useCallback(
    (userId: string, amount: number) =>
      patch(userId, (u) => ({
        ...u,
        balance: Math.round((u.balance - amount) * 100) / 100,
        lockedBalance: Math.round((u.lockedBalance + amount) * 100) / 100,
      })),
    [patch],
  );

  const unlockBalance = useCallback(
    (userId: string, amount: number) =>
      patch(userId, (u) => ({
        ...u,
        balance: Math.round((u.balance + amount) * 100) / 100,
        lockedBalance: Math.round((u.lockedBalance - amount) * 100) / 100,
      })),
    [patch],
  );

  const applyAsSeller = useCallback(
    (userId: string) => patch(userId, (u) => ({ ...u, sellerStatus: "pending" })),
    [patch],
  );

  const approveSellerApplication = useCallback(
    (userId: string) =>
      patch(userId, (u) => {
        const next = { ...u, sellerStatus: "approved" as const, role: "seller" as Role };
        return next;
      }),
    [patch],
  );

  const rejectSellerApplication = useCallback(
    (userId: string) => patch(userId, (u) => ({ ...u, sellerStatus: "rejected" as const })),
    [patch],
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      user,
      isLoading,
      signIn,
      signOut,
      creditBalance,
      lockBalance,
      unlockBalance,
      applyAsSeller,
      approveSellerApplication,
      rejectSellerApplication,
    }),
    [
      user,
      isLoading,
      signIn,
      signOut,
      creditBalance,
      lockBalance,
      unlockBalance,
      applyAsSeller,
      approveSellerApplication,
      rejectSellerApplication,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
