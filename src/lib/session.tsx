import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";
import { formatPrice } from "@/lib/format";

/**
 * The account session.
 *
 * Identity comes from Convex Auth (a real, verified email session) and the
 * balance from the server-side wallet. There is no localStorage copy and no
 * client-side role picker: a single account both buys and sells, and selling
 * unlocks only after an admin approves the seller's store.
 */

export type Role = "buyer" | "seller" | "admin";
/** Store application lifecycle: not applied → pending review → approved / rejected. */
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
  /** False until the emailed one-time code has been entered. */
  emailVerified: boolean;
  storeName: string | null;
};

type SessionContextValue = {
  user: SessionUser | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { signOut } = useAuthActions();
  // `undefined` means the query is still in flight — guards must wait for it
  // instead of bouncing a signed-in user to /auth.
  const identity = useQuery(api.users.me);
  const wallet = useQuery(api.wallet.me);

  const value = useMemo<SessionContextValue>(() => {
    const isLoading = identity === undefined;
    if (!identity) {
      return { user: null, isLoading, signOut };
    }
    const sellerStatus: SellerStatus = identity.storeStatus ?? "none";
    const role: Role = identity.isAdmin
      ? "admin"
      : sellerStatus === "approved"
        ? "seller"
        : "buyer";
    const user: SessionUser = {
      id: identity.id,
      name: identity.name,
      email: identity.email,
      role,
      balance: wallet?.balanceUsd ?? 0,
      lockedBalance: wallet?.lockedUsd ?? 0,
      sellerStatus,
      emailVerified: identity.emailVerified,
      storeName: identity.storeName,
    };
    return { user, isLoading, signOut };
  }, [identity, wallet, signOut]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}

/** The platform commission taken from every completed sale. */
export const PLATFORM_COMMISSION_RATE = 0.1;

/** Human-readable split used by the checkout and earnings screens. */
export function splitGross(gross: number) {
  const commission = Math.round(gross * PLATFORM_COMMISSION_RATE * 100) / 100;
  return {
    gross,
    commission,
    net: Math.round((gross - commission) * 100) / 100,
    commissionLabel: `${Math.round(PLATFORM_COMMISSION_RATE * 100)}% platform fee (${formatPrice(commission)})`,
  };
}