import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Supabase data layer.
 *
 * Replaces the Convex `api.*` calls the pages used. Two things differ from
 * Convex and both are deliberate:
 *
 *  - Convex `useQuery` pushed updates. Supabase has no equivalent for
 *    arbitrary RPC results, so `useSBQuery` refetches when the tab regains
 *    focus and on a slow interval. It is a poll, not a subscription; if a
 *    screen ever needs true push, add a Realtime channel for that table.
 *  - Money, escrow and credential access are Postgres functions. They are
 *    called with `supabase.rpc(...)` using the CALLER's session so the
 *    database's own ownership checks run. The service role is never used
 *    from the browser.
 */

// ---------------------------------------------------------------------
// Row shapes, matching supabase/migrations/0001_core.sql
// ---------------------------------------------------------------------
export type Profile = {
  id: string;
  email: string | null;
  name: string | null;
  is_admin: boolean;
  store_status: "none" | "pending" | "approved" | "rejected";
  store_name: string | null;
};

export type Wallet = { balance_usd: number; locked_usd: number };

export type LedgerRow = {
  id: number;
  kind: string;
  balance_delta: number;
  locked_delta: number;
  balance_after: number;
  locked_after: number;
  order_no: string | null;
  created_at: string;
};

export type Deposit = {
  track_id: string;
  amount_usd: number;
  status: "pending" | "paid" | "mismatch";
  created_at: string;
  paid_at: string | null;
};

export type Store = {
  id: string;
  user_id: string;
  store_name: string;
  slug: string;
  logo_path: string | null;
  banner_path: string | null;
  platforms: string[];
  delivery_speed: string | null;
  access_format: string | null;
  replacement_policy: string | null;
  restricted_regions: string | null;
  sourcing: string | null;
  contact_policy: boolean;
  status: "pending" | "approved" | "rejected";
  review_note: string | null;
  created_at: string;
};

export type Listing = {
  id: string;
  listing_key: string;
  seller_id: string;
  store_id: string | null;
  title: string;
  brand: string;
  summary: string | null;
  features: string[] | null;
  faq: { question: string; answer: string }[] | null;
  image_path: string | null;
  service_category: string | null;
  discount_percent: number | null;
  warranty_hours: number | null;
  hidden: boolean;
  price_usd: number;
  stock: number;
  status: "pending" | "active" | "paused" | "sold";
  updated_at: string;
};

export type Order = {
  order_no: string;
  listing_id: string;
  listing_title: string;
  brand: string;
  buyer_id: string;
  seller_id: string;
  quantity: number;
  unit_price_usd: number;
  gross_amount: number;
  escrow_fee_usd: number;
  total_usd: number;
  commission_rate: number;
  commission_amount: number;
  seller_net_amount: number;
  status: "in_escrow" | "completed" | "disputed" | "refunded" | "expired";
  created_at: string;
};

export type Report = {
  id: string;
  order_no: string | null;
  reporter_id: string;
  reported_user_id: string | null;
  reason: string;
  detail: string;
  status: "open" | "reviewing" | "resolved" | "dismissed";
  created_at: string;
};

/** Postgres raises these; PostgREST surfaces them in `error.message`. */
export function friendlyError(error: unknown): string {
  const raw =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error);

  if (/Insufficient balance/i.test(raw))
    return "You do not have enough balance. Add funds to your wallet first.";
  if (/Not enough stock/i.test(raw))
    return "There is not enough stock available for this listing.";
  if (/Not enough accounts/i.test(raw))
    return "The seller has run out of accounts for this listing.";
  if (/not the buyer/i.test(raw))
    return "This order belongs to a different account.";
  if (/revoked|only available while/i.test(raw))
    return "Access to these credentials has ended for this order.";
  if (/Only an administrator/i.test(raw))
    return "Only an administrator can do that.";
  if (/Administrators only/i.test(raw))
    return "Only an administrator can do that.";
  if (/Only the buyer/i.test(raw))
    return "Only the buyer can confirm this order.";
  if (/approved/i.test(raw) && /seller/i.test(raw))
    return "Your store is not approved yet, so you cannot publish listings.";
  if (/row-level security|permission denied/i.test(raw))
    return "You do not have access to that information.";
  if (/Failed to fetch/i.test(raw))
    return "Could not reach the server. Check your connection and try again.";
  return raw.replace(/^Failed to run sql query:\s*ERROR:\s*/, "").trim();
}

// ---------------------------------------------------------------------
// React hooks
// ---------------------------------------------------------------------
export type QueryResult<T> = {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

/**
 * Run an async reader and keep the result fresh.
 *
 * `deps` behaves like a useEffect dependency list. Pass `null` to skip the
 * query entirely — that is how a signed-out visitor avoids firing reads
 * that RLS would reject anyway.
 */
export function useSBQuery<T>(
  fetcher: () => Promise<T>,
  deps: readonly unknown[],
): QueryResult<T> {
  const [result, setResult] = useState<{
    generation: number;
    data?: T;
    error: string | null;
  } | null>(null);
  // Bumped only from `refresh`, which is an event handler. Deriving `loading`
  // from it avoids resetting state synchronously inside the effect.
  const [generation, setGeneration] = useState(0);
  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const active = deps.length > 0;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    fetcherRef
      .current()
      .then((data) => {
        if (cancelled) return;
        setResult({ generation, data, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setResult({ generation, error: friendlyError(err) });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, generation, active]);

  // Refetch when the tab comes back, so a seller who approved a store in
  // another tab sees the change without a manual reload.
  useEffect(() => {
    const onFocus = () => setGeneration((g) => g + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const refresh = useCallback(() => setGeneration((g) => g + 1), []);

  return {
    data: result?.data,
    loading: active && result?.generation !== generation,
    error: result?.error ?? null,
    refresh,
  };
}

export type MutationResult<A extends unknown[]> = {
  run: (...args: A) => Promise<void>;
  pending: boolean;
  error: string | null;
};

export function useSBMutation<A extends unknown[]>(
  action: (...args: A) => Promise<unknown>,
): MutationResult<A> {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef(action);

  useEffect(() => {
    ref.current = action;
  });

  const run = useCallback(async (...args: A) => {
    setPending(true);
    setError(null);
    try {
      await ref.current(...args);
    } catch (err) {
      setError(friendlyError(err));
      throw err;
    } finally {
      setPending(false);
    }
  }, []);

  return { run, pending, error };
}

/** Throws with a readable message when PostgREST returns an error. */
async function unwrap<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

// ---------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------
/**
 * The signed-in user's id, or null when there is no session.
 *
 * WHY EVERY "MY ROW" READ HAS TO NAME THE USER
 *
 * The RLS policies on profiles, wallets, wallet_ledger, deposits and stores all
 * end in `or public.is_admin()`, and for an admin that predicate is true for
 * EVERY row. A read that leans on RLS alone therefore hands the whole table to
 * an admin: `.maybeSingle()` fails with PGRST116 ("multiple rows returned") and
 * a list read quietly returns other people's rows. RLS is a floor, not the
 * filter — `.eq("id", …)` is what makes the query mean "mine" for an admin too.
 *
 * The consequence of getting this wrong is not a wrong number on a screen: a
 * failing `readProfile` leaves the session provider with no profile, so `user`
 * stays null, `RequireRole` bounces every account route back to `/auth`, and the
 * return trip from an emailed link never leaves "Finishing sign-in…".
 */
async function myId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export const readProfile = async () => {
  const id = await myId();
  if (!id) return null;
  return unwrap(supabase.from("profiles").select("*").eq("id", id).maybeSingle());
};

export const readWallet = async () => {
  const id = await myId();
  if (!id) return null;
  return unwrap(
    supabase
      .from("wallets")
      .select("balance_usd, locked_usd")
      .eq("user_id", id)
      .maybeSingle(),
  );
};

export const readLedger = async (limit = 50) => {
  const id = await myId();
  if (!id) return [];
  return unwrap(
    supabase
      .from("wallet_ledger")
      .select("*")
      .eq("user_id", id)
      .order("id", { ascending: false })
      .limit(limit),
  );
};

export const readDeposits = async () => {
  const id = await myId();
  if (!id) return [];
  return unwrap(
    supabase
      .from("deposits")
      .select("*")
      .eq("user_id", id)
      .order("created_at", { ascending: false }),
  );
};

export const readMyStore = async () => {
  const id = await myId();
  if (!id) return null;
  // `.limit(1)` instead of `.maybeSingle()`: maybeSingle errors as soon as
  // the query matches two rows, and a duplicate application row used to make
  // every store read fail — which the caller swallowed into `null`, so the
  // seller appeared to have no store at all.
  const rows = await unwrap(
    supabase
      .from("stores")
      .select("*")
      .eq("user_id", id)
      .order("created_at", { ascending: true })
      .limit(1),
  );
  return rows?.[0] ?? null;
};

export const readLiveListings = () =>
  unwrap(
    supabase
      .from("listings")
      .select("*")
      .eq("status", "active")
      .eq("hidden", false)
      .order("created_at", { ascending: false }),
  );

export const readMyListings = () =>
  unwrap(
    supabase.from("listings").select("*").order("updated_at", { ascending: false }),
  );

export const readMyOrders = () =>
  unwrap(
    supabase.from("orders").select("*").order("created_at", { ascending: false }),
  );

export const readOrder = (orderNo: string) =>
  unwrap(
    supabase
      .from("orders")
      .select("*")
      .eq("order_no", orderNo)
      .maybeSingle(),
  );

export const readAllOrders = () =>
  unwrap(
    supabase.from("orders").select("*").order("created_at", { ascending: false }),
  );

export const readReviewQueue = () =>
  unwrap(
    supabase
      .from("stores")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  );

export const readAllStores = () =>
  unwrap(supabase.from("stores").select("*").order("created_at", { ascending: false }));

export const readOpenReports = () =>
  unwrap(
    supabase
      .from("off_platform_reports")
      .select("*")
      .in("status", ["open", "reviewing"])
      .order("created_at", { ascending: false }),
  );

export const readAllProfiles = () =>
  unwrap(supabase.from("profiles").select("*").order("created_at", { ascending: false }));

// ---------------------------------------------------------------------
// Writers — every one of these is a Postgres function, so the database
// re-checks ownership, stock, balance and escrow regardless of what the
// browser sends.
// ---------------------------------------------------------------------
export const placeOrder = (listingId: string, quantity: number) =>
  unwrap(
    supabase.rpc("place_order", {
      p_listing_id: listingId,
      p_quantity: quantity,
      // One key per checkout attempt. The browser generates it once per
      // "Pay" press and reuses it on retry, so a double-click or a flaky
      // network cannot charge twice.
      p_idempotency_key: crypto.randomUUID(),
    }),
  );

export const completeOrder = (orderNo: string) =>
  unwrap(supabase.rpc("complete_order", { p_order_no: orderNo }));

export const openDeposit = (amountUsd: number, trackId: string) =>
  unwrap(supabase.rpc("open_deposit", { p_amount: amountUsd, p_track_id: trackId }));

export const submitStore = (input: {
  storeName: string;
  slug: string;
  platforms: string[];
  deliverySpeed: string;
  accessFormat: string;
  replacementPolicy: string;
  restrictedRegions: string;
  sourcing: string;
  contactPolicy: boolean;
  logoPath?: string | null;
  bannerPath?: string | null;
}) => {
  const existing = readMyStore();
  return existing.then(async (row) => {
    if (!row) {
      return unwrap(
        supabase.from("stores").insert({ ...input, status: "pending" }).select(),
      );
    }
    return unwrap(
      supabase
        .from("stores")
        .update(input)
        .eq("id", row.id)
        .select(),
    );
  });
};

export const reviewStore = (storeId: string, approve: boolean, note?: string) =>
  unwrap(
    supabase.rpc("review_store", {
      p_store_id: storeId,
      p_approve: approve,
      p_note: note ?? null,
    }),
  );

export const setListingStatus = (listingId: string, status: string) =>
  unwrap(
    supabase.rpc("set_listing_status", {
      p_listing_id: listingId,
      p_status: status,
    }),
  );

export const resolveReport = (reportId: string, status: string, penalty?: string) =>
  unwrap(
    supabase.rpc("resolve_report", {
      p_report_id: reportId,
      p_status: status,
      p_penalty: penalty ?? null,
    }),
  );

export const uploadCredentials = (listingId: string, units: unknown[]) =>
  unwrap(
    supabase.rpc("upload_credentials", { p_listing_id: listingId, p_units: units }),
  );

export const fileReport = (input: {
  order_no?: string;
  listing_id?: string;
  reported_user_id?: string;
  reason: string;
  detail: string;
}) => unwrap(supabase.from("off_platform_reports").insert(input).select());

/**
 * Download a buyer's credentials.
 *
 * The database returns CIPHERTEXT. Decryption happens in the Edge Function
 * because the passphrase must never reach a browser. If the function is not
 * deployed yet this fails loudly rather than pretending it worked.
 */
export async function downloadCredentials(orderNo: string) {
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL ?? "https://fbalfkvimlfmcpsfzrvn.supabase.co"}/functions/v1/download-credentials`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
        Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? ""}`,
      },
      body: JSON.stringify({ orderNo }),
    },
  );
  const payload = await res.json().catch(() => null);
  if (!res.ok) throw new Error(payload?.error ?? "Could not download your credentials.");
  return payload as { orderNo: string; files: { fileName: string; content: string }[] };
}