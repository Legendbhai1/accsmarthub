import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";
import { readProfile, readWallet, type Profile, type Wallet } from "@/lib/supabaseData";
import { formatPrice } from "@/lib/format";

/**
 * The account session, now backed by Supabase.
 *
 * Identity comes from Supabase Auth (a verified email session) and the
 * balance from the `wallets` row. There is no localStorage copy of the user
 * and no client-side role picker: a single account both buys and sells, and
 * selling unlocks only after an admin approves the seller's store.
 *
 * The exported shape is unchanged from the Convex version, so route guards
 * and every page consumer keep working unchanged.
 */

export type Role = "buyer" | "seller" | "admin";
export type SellerStatus = "none" | "pending" | "approved" | "rejected";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Available spendable wallet balance (USD). */
  balance: number;
  /** Escrow held on the seller's behalf, shown separately. */
  lockedBalance: number;
  sellerStatus: SellerStatus;
  /** False until the emailed one-time code has been entered. */
  emailVerified: boolean;
  storeName: string | null;
};

type SessionContextValue = {
  user: SessionUser | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  /** Re-reads profile and wallet; call after a mutation that changes them. */
  refresh: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [sessionResolved, setSessionResolved] = useState(false);
  // Which user id the profile/wallet below belong to. Comparing against
  // userId is what makes "isLoading" derivable instead of stored state.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Read the current session first so the page can render before the
    // async initial fetch completes.
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setUserId(data.session?.user.id ?? null);
      setEmailVerified(!!data.session?.user.email_confirmed_at);
      setSessionResolved(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (cancelled) return;
        setUserId(session?.user.id ?? null);
        // email_confirmed_at is the authoritative marker. For a brand-new
        // account verified via OTP, Supabase sets it when the code is
        // accepted.
        setEmailVerified(!!session?.user.email_confirmed_at);
        setSessionResolved(true);
        if (!session) {
          setProfile(null);
          setWallet(null);
          setLoadedFor(null);
        }
      },
    );

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const load = useCallback(
    () =>
      Promise.all([readProfile().catch(() => null), readWallet().catch(() => null)])
        .then(([p, w]) => {
          setProfile(p);
          setWallet(w);
        })
        .catch(() => undefined),
    [],
  );

  useEffect(() => {
    if (!userId) return;
    void load().then(() => setLoadedFor(userId));
  }, [userId, load]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setWallet(null);
    setUserId(null);
    setLoadedFor(null);
  }, []);

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  const value = useMemo<SessionContextValue>(() => {
    // Guards must wait for this rather than bouncing a signed-in user to
    // /auth. Still resolving means: no session yet, or a session whose
    // profile has not arrived.
    const isLoading = userId === null ? !sessionResolved : loadedFor !== userId;

    if (!userId || !profile || isLoading) {
      return { user: null, isLoading, signOut, refresh };
    }

    const sellerStatus: SellerStatus = profile.store_status ?? "none";
    const role: Role = profile.is_admin
      ? "admin"
      : sellerStatus === "approved"
        ? "seller"
        : "buyer";

    return {
      user: {
        id: profile.id,
        name: profile.name ?? profile.email?.split("@")[0] ?? "Member",
        email: profile.email ?? "",
        role,
        balance: Number(wallet?.balance_usd ?? 0),
        lockedBalance: Number(wallet?.locked_usd ?? 0),
        sellerStatus,
        emailVerified,
        storeName: profile.store_name,
      },
      isLoading: false,
      signOut,
      refresh,
    };
  }, [userId, profile, wallet, sessionResolved, loadedFor, emailVerified, signOut, refresh]);

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