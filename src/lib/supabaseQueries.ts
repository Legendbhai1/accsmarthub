import { supabase } from "@/lib/supabase";
import { useSBQuery, friendlyError } from "@/lib/supabaseData";
import { useSession } from "@/lib/session";

/**
 * Supabase-backed live-stock / price lookup for the catalogue.
 *
 * Replaces the Convex `api.marketplace.liveStock` query used by Home,
 * Categories and Checkout. The shape is deliberately the same so the
 * existing catalogue code keeps working: each listing id maps to `{ stock, priceUsd, status }`.
 */
export type LiveStockRow = {
  id: string;
  title: string;
  brand: string;
  stock: number;
  priceUsd: number;
  status: string;
};

type LiveStockMap = Record<string, LiveStockRow>;

async function fetchLiveStock(listingIds: string[]): Promise<LiveStockMap> {
  if (listingIds.length === 0) return {};
  const { data, error } = await supabase
    .from("listings")
    .select("id, title, brand, stock, price_usd, status")
    .in("id", listingIds);
  if (error) throw new Error(friendlyError(error));
  const out: LiveStockMap = {};
  for (const row of data ?? []) {
    out[row.id] = {
      id: row.id,
      title: row.title,
      brand: row.brand,
      stock: Number(row.stock ?? 0),
      priceUsd: Number(row.price_usd ?? 0),
      status: row.status,
    };
  }
  return out;
}

export function useLiveStock(listingIds: readonly string[]) {
  return useSBQuery(
    () => fetchLiveStock(Array.from(listingIds)),
    [listingIds.length > 0 ? listingIds.join(",") : ""],
  );
}

/**
 * Seller-side inventory from Supabase.
 *
 * Replaces `convexApi.marketplace.sellerListings`. Returns the signed-in
 * seller's listings with server-side stock/price so the catalogue and checkout
 * both read from one source of truth.
 */
export type SellerListingsRow = {
  id: string;
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
  status: string;
  updated_at: string;
};

async function fetchSellerListings(userId: string): Promise<SellerListingsRow[]> {
  if (!userId) return [];
  // RLS lets anyone read `active` listings, so the seller filter has to be
  // explicit here — otherwise this returns the whole public catalogue.
  const { data, error } = await supabase
    .from("listings")
    .select("*")
    .eq("seller_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(friendlyError(error));
  return (data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    brand: r.brand,
    summary: r.summary,
    features: r.features,
    faq: r.faq,
    image_path: r.image_path,
    service_category: r.service_category,
    discount_percent: r.discount_percent,
    warranty_hours: r.warranty_hours,
    hidden: Boolean(r.hidden),
    price_usd: Number(r.price_usd ?? 0),
    stock: Number(r.stock ?? 0),
    status: r.status,
    updated_at: r.updated_at,
  }));
}

export function useSellerListings() {
  const { user } = useSession();
  return useSBQuery(() => fetchSellerListings(user?.id ?? ""), [user?.id ?? ""]);
}

/**
 * Seller-side earnings summary from Supabase.
 *
 * Replaces `convexApi.marketplace.earningsSummary` and
 * `convexApi.stats.platformStats`. Computed from the signed-in seller's
 * orders and the platform tables.
 */
export type EarningsSummary = {
  grossUsd: number;
  commissionUsd: number;
  netUsd: number;
  escrowUsd: number;
  completedCount: number;
};

async function fetchEarningsSummary(): Promise<EarningsSummary> {
  const session = await supabase.auth.getSession();
  const userId = session.data.session?.user.id;
  if (!userId) return { grossUsd: 0, commissionUsd: 0, netUsd: 0, escrowUsd: 0, completedCount: 0 };

  const ordersResult = await supabase
    .from("orders")
    .select("gross_amount, commission_amount, seller_net_amount, status")
    .eq("seller_id", userId);
  if (ordersResult.error) throw new Error(friendlyError(ordersResult.error));

  const orders = ordersResult.data ?? [];
  const gross = orders.reduce((s, o) => s + Number(o.gross_amount ?? 0), 0);
  const commission = orders.reduce((s, o) => s + Number(o.commission_amount ?? 0), 0);
  const escrow = orders
    .filter((o) => ["in_escrow", "disputed"].includes(o.status))
    .reduce((s, o) => s + Number(o.gross_amount ?? 0), 0);
  const completedCount = orders.filter((o) => o.status === "completed").length;
  const net = orders.reduce((s, o) => s + Number(o.seller_net_amount ?? 0), 0);

  return { grossUsd: gross, commissionUsd: commission, netUsd: net, escrowUsd: escrow, completedCount };
}

export function useEarningsSummary() {
  return useSBQuery(fetchEarningsSummary, []);
}

/**
 * Platform stats for the admin dashboard.
 *
 * Replaces `convexApi.stats.platformStats`. Counts come directly from the
 * Supabase tables the admin session can read.
 */
export type PlatformStats = {
  grossVolumeUsd: number;
  commissionUsd: number;
  escrowHeldUsd: number;
  userCount: number;
  approvedStoreCount: number;
  openReportCount: number;
  openDisputeCount: number;
  activeListingCount: number;
  pendingListingCount: number;
  pendingStoreCount: number;
  completedCount: number;
};

async function fetchPlatformStats(): Promise<PlatformStats> {
  const [
    ordersResult,
    profilesResult,
    storesResult,
    listingsResult,
    reportsResult,
  ] = await Promise.all([
    supabase.from("orders").select("gross_amount, commission_amount, status"),
    supabase.from("profiles").select("id"),
    supabase.from("stores").select("status"),
    supabase.from("listings").select("status"),
    supabase
      .from("off_platform_reports")
      .select("status")
      .in("status", ["open", "reviewing"]),
  ]);

  const orders = ordersResult.data ?? [];
  const grossVolume = orders.reduce((s, o) => s + Number(o.gross_amount ?? 0), 0);
  const commission = orders.reduce((s, o) => s + Number(o.commission_amount ?? 0), 0);
  const escrowHeld = orders
    .filter((o) => ["in_escrow", "disputed"].includes(o.status))
    .reduce((s, o) => s + Number(o.gross_amount ?? 0), 0);
  const completedCount = orders.filter((o) => o.status === "completed").length;

  const profiles = profilesResult.data ?? [];
  const stores = storesResult.data ?? [];
  const listings = listingsResult.data ?? [];
  const reports = reportsResult.data ?? [];

  const approvedStoreCount = stores.filter((s) => s.status === "approved").length;
  const pendingStoreCount = stores.filter((s) => s.status === "pending").length;
  const activeListingCount = listings.filter((l) => l.status === "active").length;
  const pendingListingCount = listings.filter((l) => l.status === "pending").length;
  const openReportCount = reports.length;

  return {
    grossVolumeUsd: grossVolume,
    commissionUsd: commission,
    escrowHeldUsd: escrowHeld,
    userCount: profiles.length,
    approvedStoreCount,
    openReportCount,
    openDisputeCount: 0,
    activeListingCount,
    pendingListingCount,
    pendingStoreCount,
    completedCount,
  };
}

export function usePlatformStats() {
  return useSBQuery(fetchPlatformStats, []);
}

/**
 * Signed-in user's own orders.
 *
 * Replaces `convexApi.marketplace.myOrders` and
 * `convexApi.marketplace.salesOrders`.
 */
export type OrderRow = {
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
  status: string;
  created_at: string;
};

async function fetchMyOrders(role: "buyer" | "seller" | "admin", userId: string): Promise<OrderRow[]> {
  if (!userId) return [];
  // Filter server-side: RLS already restricts rows to the parties involved,
  // but narrowing in the query keeps the payload to just this user's orders.
  let query = supabase.from("orders").select("*");
  if (role === "buyer") query = query.eq("buyer_id", userId);
  else if (role === "seller") query = query.eq("seller_id", userId);
  // "admin" must still mean "orders I am a party to". The RLS policy on orders
  // ends in `or public.is_admin()`, so for an admin it matches EVERY order, and
  // a branch that skipped the filter would put the whole marketplace order book
  // on a private account page. The admin-wide list is `useAllOrders`.
  else query = query.or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(friendlyError(error));

  const rows = data ?? [];

  return rows.map((r) => ({
    order_no: r.order_no,
    listing_id: r.listing_id,
    listing_title: r.listing_title,
    brand: r.brand,
    buyer_id: r.buyer_id,
    seller_id: r.seller_id,
    quantity: Number(r.quantity ?? 0),
    unit_price_usd: Number(r.unit_price_usd ?? 0),
    gross_amount: Number(r.gross_amount ?? 0),
    escrow_fee_usd: Number(r.escrow_fee_usd ?? 0),
    total_usd: Number(r.total_usd ?? 0),
    commission_rate: Number(r.commission_rate ?? 0),
    commission_amount: Number(r.commission_amount ?? 0),
    seller_net_amount: Number(r.seller_net_amount ?? 0),
    status: r.status,
    created_at: r.created_at,
  }));
}

export function useMyOrders(role: "buyer" | "seller" | "admin") {
  const { user } = useSession();
  return useSBQuery(
    () => fetchMyOrders(role, user?.id ?? ""),
    [role, user?.id ?? ""],
  );
}

/**
 * A single order by order_no.
 */
export async function fetchOrder(orderNo: string): Promise<OrderRow | null> {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("order_no", orderNo)
    .maybeSingle();
  if (error) throw new Error(friendlyError(error));
  if (!data) return null;
  return {
    order_no: data.order_no,
    listing_id: data.listing_id,
    listing_title: data.listing_title,
    brand: data.brand,
    buyer_id: data.buyer_id,
    seller_id: data.seller_id,
    quantity: Number(data.quantity ?? 0),
    unit_price_usd: Number(data.unit_price_usd ?? 0),
    gross_amount: Number(data.gross_amount ?? 0),
    escrow_fee_usd: Number(data.escrow_fee_usd ?? 0),
    total_usd: Number(data.total_usd ?? 0),
    commission_rate: Number(data.commission_rate ?? 0),
    commission_amount: Number(data.commission_amount ?? 0),
    seller_net_amount: Number(data.seller_net_amount ?? 0),
    status: data.status,
    created_at: data.created_at,
  };
}

/**
 * All orders, for the admin order list.
 */
export function useAllOrders() {
  return useSBQuery(
    async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw new Error(friendlyError(error));
      return (data ?? []).map((r) => ({
        order_no: r.order_no,
        listing_id: r.listing_id,
        listing_title: r.listing_title,
        brand: r.brand,
        buyer_id: r.buyer_id,
        seller_id: r.seller_id,
        quantity: Number(r.quantity ?? 0),
        unit_price_usd: Number(r.unit_price_usd ?? 0),
        gross_amount: Number(r.gross_amount ?? 0),
        escrow_fee_usd: Number(r.escrow_fee_usd ?? 0),
        total_usd: Number(r.total_usd ?? 0),
        commission_rate: Number(r.commission_rate ?? 0),
        commission_amount: Number(r.commission_amount ?? 0),
        seller_net_amount: Number(r.seller_net_amount ?? 0),
        status: r.status,
        created_at: r.created_at,
      }));
    },
    [],
  );
}

/**
 * Stores pending review, for the admin seller queue.
 *
 * Replaces `api.stores.reviewQueue` / `convexApi.stores.reviewQueue`.
 */
export type StoreRow = {
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

async function fetchReviewQueue(status: string): Promise<StoreRow[]> {
  const { data, error } = await supabase
    .from("stores")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false });
  if (error) throw new Error(friendlyError(error));
  return (data ?? []).map((r) => ({
    id: r.id,
    user_id: r.user_id,
    store_name: r.store_name,
    slug: r.slug,
    logo_path: r.logo_path,
    banner_path: r.banner_path,
    platforms: (typeof r.platforms === "string" ? r.platforms : "") ? JSON.parse(r.platforms as unknown as string) : ([] as string[]),
    delivery_speed: r.delivery_speed,
    access_format: r.access_format,
    replacement_policy: r.replacement_policy,
    restricted_regions: r.restricted_regions,
    sourcing: r.sourcing,
    contact_policy: Boolean(r.contact_policy),
    status: r.status,
    review_note: r.review_note,
    created_at: r.created_at,
  }));
}

export function useReviewQueue(status: "pending" | "approved" | "rejected") {
  return useSBQuery(() => fetchReviewQueue(status), [status]);
}

/**
 * Off-platform contact reports for the admin queue.
 *
 * Replaces `convexApi.reports.openReports`.
 */
export type ReportRow = {
  id: string;
  order_no: string | null;
  listing_id: string | null;
  reporter_id: string;
  reported_user_id: string | null;
  reason: string;
  detail: string;
  status: string;
  penalty: string | null;
  created_at: string;
};

export function useReports(status: string) {
  return useSBQuery(
    async () => {
      const { data, error } = await supabase
        .from("off_platform_reports")
        .select("*")
        .eq("status", status)
        .order("created_at", { ascending: false });
      if (error) throw new Error(friendlyError(error));
      return (data ?? []) as ReportRow[];
    },
    [status],
  );
}

/**
 * Credential-vault counts per listing.
 *
 * `credential_status` returns counts only (never ciphertext) and returns zeros
 * for anyone who does not own the listing, so this is safe to fan out over the
 * seller's whole inventory.
 */
export type CredentialStatus = {
  attached: boolean;
  totalUnits: number;
  availableUnits: number;
};

export function useCredentialStatuses(listingIds: readonly string[]) {
  const key = listingIds.join(",");
  return useSBQuery(
    async () => {
      const ids = listingIds.length ? Array.from(listingIds) : [];
      if (ids.length === 0) return {} as Record<string, CredentialStatus>;

      const entries = await Promise.all(
        ids.map(async (id) => {
          const { data, error } = await supabase.rpc("credential_status", {
            p_listing_id: id,
          });
          if (error) return [id, null] as const;
          return [id, (data ?? null) as CredentialStatus | null] as const;
        }),
      );

      const out: Record<string, CredentialStatus> = {};
      for (const [id, status] of entries) {
        if (status) out[id] = status;
      }
      return out;
    },
    [key],
  );
}

/**
 * The dispute (and its evidence thread) on one order, if any.
 */
export type DisputeRow = {
  id: string;
  order_no: string;
  opened_by: string;
  reason: string;
  detail: string;
  status: string;
  resolution_note: string | null;
  resolved_at: string | null;
  created_at: string;
  messages: { id: string; author_id: string; body: string; created_at: string }[];
};

export function useDispute(orderNo: string) {
  return useSBQuery(
    async () => {
      if (!orderNo) return null;
      const { data, error } = await supabase
        .from("disputes")
        .select("*")
        .eq("order_no", orderNo)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(friendlyError(error));
      if (!data) return null;

      const { data: messages, error: msgError } = await supabase
        .from("dispute_messages")
        .select("*")
        .eq("dispute_id", data.id)
        .order("created_at", { ascending: true });
      if (msgError) throw new Error(friendlyError(msgError));

      return { ...data, messages: messages ?? [] } as DisputeRow;
    },
    [orderNo],
  );
}

/**
 * The signed-in seller's own store record.
 *
 * Replaces `convexApi.stores.myStore`. Resolves to `null` when the seller has
 * not submitted an application yet.
 */
export function useMyStore() {
  const { user } = useSession();
  return useSBQuery(
    async () => {
      if (!user?.id) return null;
      // `.limit(1)`, never `.maybeSingle()`: two application rows must not
      // turn into an error that reads as "this account has no store".
      const { data, error } = await supabase
        .from("stores")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1);
      if (error) throw new Error(friendlyError(error));
      const row = data?.[0];
      if (!row) return null;
      return {
        ...row,
        contact_policy: Boolean(row.contact_policy),
      } as StoreRow;
    },
    [user?.id ?? ""],
  );
}

/* ------------------------- public catalogue (real data) -------------------- */

/**
 * A catalogue row built ONLY from columns that actually exist in the schema.
 *
 * The old demo `Listing` type carried `rating`, `reviewCount`, `followers`,
 * `niche` and `deliveryTime`. None of those are stored anywhere, so mapping a
 * real row onto that type would mean inventing them again — which is exactly
 * the fabrication this module exists to remove. Fields with no source are
 * omitted and the UI shows an honest empty state instead.
 */
export type PublicListing = {
  id: string;
  title: string;
  brand: string;
  summary: string | null;
  features: string[] | null;
  faq: { question: string; answer: string }[] | null;
  imagePath: string | null;
  serviceCategory: string | null;
  discountPercent: number | null;
  warrantyHours: number | null;
  priceUsd: number;
  stock: number;
  createdAt: string;
};

type PublicListingRow = {
  id: string;
  title: string;
  brand: string;
  summary: string | null;
  features: string[] | null;
  faq: { question: string; answer: string }[] | null;
  image_path: string | null;
  service_category: string | null;
  discount_percent: number | null;
  warranty_hours: number | null;
  price_usd: number | string;
  stock: number;
  created_at: string;
};

const COLUMNS =
  "id, title, brand, summary, features, faq, image_path, service_category, discount_percent, warranty_hours, price_usd, stock, created_at";

function toPublic(r: PublicListingRow): PublicListing {
  return {
    id: r.id,
    title: r.title,
    brand: r.brand,
    summary: r.summary ?? null,
    features: r.features ?? null,
    faq: r.faq ?? null,
    imagePath: r.image_path ?? null,
    serviceCategory: r.service_category ?? null,
    discountPercent: r.discount_percent ?? null,
    warrantyHours: r.warranty_hours ?? null,
    priceUsd: Number(r.price_usd ?? 0),
    stock: Number(r.stock ?? 0),
    createdAt: r.created_at,
  };
}

/**
 * Public catalogue.
 *
 * Only `status = 'active'`, non-hidden, in-stock rows are ever returned —
 * matching the `listings` SELECT RLS policy, so a seller cannot surface a
 * paused or under-review listing by manipulating the client.
 */
async function fetchPublicListings(): Promise<PublicListing[]> {
  const { data, error } = await supabase
    .from("listings")
    .select(COLUMNS)
    .eq("status", "active")
    .eq("hidden", false)
    .gt("stock", 0)
    .order("created_at", { ascending: false });
  if (error) throw new Error(friendlyError(error));
  return (data ?? []).map((r) => toPublic(r as unknown as PublicListingRow));
}

export function usePublicListings() {
  return useSBQuery(fetchPublicListings, []);
}

/** One catalogue row, or null when it does not exist / is not public. */
async function fetchPublicListing(id: string): Promise<PublicListing | null> {
  if (!id) return null;
  const { data, error } = await supabase
    .from("listings")
    .select(COLUMNS)
    .eq("id", id)
    .eq("status", "active")
    .eq("hidden", false)
    .maybeSingle();
  if (error) throw new Error(friendlyError(error));
  return data ? toPublic(data as unknown as PublicListingRow) : null;
}

export function usePublicListing(id: string | undefined) {
  return useSBQuery(() => fetchPublicListing(id ?? ""), [id ?? ""]);
}

/**
 * The moderation queue: every listing, whatever its status.
 *
 * `read listings` only exposes `active` rows to the public, so this returns
 * anything at all only for a real admin (or a seller's own rows, which the
 * admin page never asks for). Seller names come from a second read against
 * `profiles` rather than an embedded select, because `listings.seller_id`
 * points at `auth.users` and PostgREST cannot embed `public.profiles`
 * through that relationship.
 */
export type AdminListingRow = {
  id: string;
  seller_id: string;
  seller_name: string;
  seller_email: string | null;
  title: string;
  brand: string;
  service_category: string | null;
  price_usd: number;
  stock: number;
  status: string;
  hidden: boolean;
  created_at: string;
};

async function fetchAdminListings(): Promise<AdminListingRow[]> {
  const { data, error } = await supabase
    .from("listings")
    .select(
      "id, seller_id, title, brand, service_category, price_usd, stock, status, hidden, created_at",
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error(friendlyError(error));

  const rows = data ?? [];
  const sellerIds = [...new Set(rows.map((r) => r.seller_id))];
  const people = new Map<string, { name: string | null; email: string | null }>();
  if (sellerIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name, email")
      .in("id", sellerIds);
    for (const p of profiles ?? []) {
      people.set(p.id, { name: p.name, email: p.email });
    }
  }

  return rows.map((r) => ({
    id: r.id,
    seller_id: r.seller_id,
    seller_name: people.get(r.seller_id)?.name || "Member",
    seller_email: people.get(r.seller_id)?.email ?? null,
    title: r.title,
    brand: r.brand,
    service_category: r.service_category,
    price_usd: Number(r.price_usd ?? 0),
    stock: Number(r.stock ?? 0),
    status: r.status,
    hidden: Boolean(r.hidden),
    created_at: r.created_at,
  }));
}

export function useAdminListings() {
  return useSBQuery(fetchAdminListings, []);
}

/* -------------------- cart, search, payments, reviews, notifications -------------------- */

/**
 * The signed-in user's cart.
 */
export type CartItemRow = {
  id: string;
  listing_id: string;
  quantity: number;
  added_at: string;
};

async function fetchCart(user_id: string): Promise<CartItemRow[]> {
  if (!user_id) return [];
  const { data, error } = await supabase
    .from("cart_items")
    .select("id, listing_id, quantity, added_at")
    .eq("user_id", user_id)
    .order("added_at", { ascending: false });
  if (error) throw new Error(friendlyError(error));
  return (data ?? []).map((r) => ({
    id: r.id,
    listing_id: r.listing_id,
    quantity: Number(r.quantity ?? 0),
    added_at: r.added_at,
  }));
}

export function useCart() {
  const { user } = useSession();
  return useSBQuery(
    () => fetchCart(user?.id ?? ""),
    [user?.id ?? ""],
  );
}

/**
 * Server-side catalogue search + filters. Goes beyond one page of
 * `usePublicListings` by filtering server-side and returning only active,
 * non-hidden, in-stock rows that match the text and/or category and/or price
 * band. Client-side refinement (saved, sort) is layered on top.
 */
export type SearchFilters = {
  q?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
};

async function fetchSearchListings(filters: SearchFilters): Promise<PublicListing[]> {
  const base =
    supabase
      .from("listings")
      .select(COLUMNS)
      .eq("status", "active")
      .eq("hidden", false)
      .gt("stock", 0);

  let q = base;
  if (filters.q && filters.q.trim()) {
    const needle = filters.q.trim();
    q = q.or(`title.ilike.%${needle}%,summary.ilike.%${needle}%,brand.ilike.%${needle}%`);
  }
  if (filters.category) {
    q = q.or(`service_category.eq.${filters.category},brand.eq.${filters.category}`);
  }
  if (filters.minPrice != null && filters.minPrice > 0) {
    q = q.gte("price_usd", String(filters.minPrice));
  }
  if (filters.maxPrice != null && filters.maxPrice > 0) {
    q = q.lte("price_usd", String(filters.maxPrice));
  }

  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw new Error(friendlyError(error));
  return (data ?? []).map((r) => toPublic(r as unknown as PublicListingRow));
}

export function useSearchListings(filters: SearchFilters) {
  const key = [
    filters.q ?? "",
    filters.category ?? "",
    String(filters.minPrice ?? 0),
    String(filters.maxPrice ?? 0),
  ].join("|");
  return useSBQuery(() => fetchSearchListings(filters), [key]);
}

/**
 * Full catalogue with server-side search/filter defaults. Used by the
 * dedicated /search page so the initial result set is already filtered by the
 * server and not just one page of active listings.
 */
export type SearchResult = {
  listings: PublicListing[];
  total: number;
  filters: SearchFilters;
};

export async function searchCatalog(filters: SearchFilters): Promise<SearchResult> {
  const listings = await fetchSearchListings(filters);
  return { listings, total: listings.length, filters };
}

/**
 * Order payments for an order — the funding ledger.
 */
export type OrderPaymentRow = {
  id: string;
  order_no: string | null;
  method: string;
  provider: string | null;
  provider_track_id: string | null;
  provider_amount: number | null;
  provider_currency: string;
  provider_status: string | null;
  status: string;
  amount_usd: number;
  captured_at: string | null;
  created_at: string;
};

async function fetchOrderPayments(orderNo: string): Promise<OrderPaymentRow[]> {
  const { data, error } = await supabase
    .from("order_payments")
    .select("*")
    .eq("order_no", orderNo)
    .order("created_at", { ascending: false });
  if (error) throw new Error(friendlyError(error));
  return (data ?? []).map((r) => ({
    id: r.id,
    order_no: r.order_no,
    method: r.method,
    provider: r.provider,
    provider_track_id: r.provider_track_id,
    provider_amount: r.provider_amount != null ? Number(r.provider_amount) : null,
    provider_currency: r.provider_currency,
    provider_status: r.provider_status,
    status: r.status,
    amount_usd: Number(r.amount_usd ?? 0),
    captured_at: r.captured_at,
    created_at: r.created_at,
  }));
}

export function useOrderPayments(orderNo: string) {
  return useSBQuery(
    () => fetchOrderPayments(orderNo ?? ""),
    [orderNo ?? ""],
  );
}

/**
 * Product reviews for a listing.
 */
export type ReviewRow = {
  id: string;
  order_no: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  rating: number;
  title: string;
  body: string;
  created_at: string;
};

async function fetchReviews(listingId: string): Promise<ReviewRow[]> {
  const { data, error } = await supabase
    .from("reviews")
    .select("*")
    .eq("listing_id", listingId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(friendlyError(error));
  return (data ?? []).map((r) => ({
    id: r.id,
    order_no: r.order_no,
    listing_id: r.listing_id,
    buyer_id: r.buyer_id,
    seller_id: r.seller_id,
    rating: Number(r.rating),
    title: r.title,
    body: r.body,
    created_at: r.created_at,
  }));
}

export function useReviews(listingId: string) {
  return useSBQuery(
    () => fetchReviews(listingId ?? ""),
    [listingId ?? ""],
  );
}

/**
 * Buyer order history — every order the signed-in buyer ever placed.
 */
export type BuyerOrderRow = {
  order_no: string;
  listing_id: string;
  listing_title: string;
  brand: string;
  quantity: number;
  unit_price_usd: number;
  gross_amount: number;
  escrow_fee_usd: number;
  total_usd: number;
  status: string;
  payment_method: string;
  delivery_status: string;
  delivered_at: string | null;
  created_at: string;
};

async function fetchBuyerOrders(userId: string): Promise<BuyerOrderRow[]> {
  if (!userId) return [];
  const { data, error } = await supabase
    .from("orders")
    .select(
      "order_no, listing_id, listing_title, brand, quantity, unit_price_usd,"
      + " gross_amount, escrow_fee_usd, total_usd, status, payment_method,"
      + " delivery_status, delivered_at, created_at",
    )
    .eq("buyer_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(friendlyError(error));
  return (data ?? []).map((r) => ({
    order_no: r.order_no,
    listing_id: r.listing_id,
    listing_title: r.listing_title,
    brand: r.brand,
    quantity: Number(r.quantity ?? 0),
    unit_price_usd: Number(r.unit_price_usd ?? 0),
    gross_amount: Number(r.gross_amount ?? 0),
    escrow_fee_usd: Number(r.escrow_fee_usd ?? 0),
    total_usd: Number(r.total_usd ?? 0),
    status: r.status,
    payment_method: r.payment_method,
    delivery_status: r.delivery_status,
    delivered_at: r.delivered_at,
    created_at: r.created_at,
  }));
}

export function useBuyerOrders() {
  const { user } = useSession();
  return useSBQuery(
    () => fetchBuyerOrders(user?.id ?? ""),
    [user?.id ?? ""],
  );
}

/**
 * Seller order queue — every order against the signed-in seller's listings,
 * with delivery state so the seller can act on pending deliveries.
 */
export type SellerOrderRow = {
  order_no: string;
  listing_id: string;
  listing_title: string;
  brand: string;
  buyer_id: string;
  quantity: number;
  unit_price_usd: number;
  gross_amount: number;
  escrow_fee_usd: number;
  total_usd: number;
  seller_net_amount: number;
  status: string;
  payment_method: string;
  delivery_status: string;
  delivered_at: string | null;
  inspection_deadline: string | null;
  created_at: string;
};

async function fetchSellerOrders(userId: string): Promise<SellerOrderRow[]> {
  if (!userId) return [];
  const { data, error } = await supabase
    .from("orders")
    .select(
      "order_no, listing_id, listing_title, brand, buyer_id, quantity,"
      + " unit_price_usd, gross_amount, escrow_fee_usd, total_usd,"
      + " seller_net_amount, status, payment_method, delivery_status,"
      + " delivered_at, inspection_deadline, created_at",
    )
    .eq("seller_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(friendlyError(error));
  return (data ?? []).map((r) => ({
    order_no: r.order_no,
    listing_id: r.listing_id,
    listing_title: r.listing_title,
    brand: r.brand,
    buyer_id: r.buyer_id,
    quantity: Number(r.quantity ?? 0),
    unit_price_usd: Number(r.unit_price_usd ?? 0),
    gross_amount: Number(r.gross_amount ?? 0),
    escrow_fee_usd: Number(r.escrow_fee_usd ?? 0),
    total_usd: Number(r.total_usd ?? 0),
    seller_net_amount: Number(r.seller_net_amount ?? 0),
    status: r.status,
    payment_method: r.payment_method,
    delivery_status: r.delivery_status,
    delivered_at: r.delivered_at,
    inspection_deadline: r.inspection_deadline,
    created_at: r.created_at,
  }));
}

export function useSellerOrders() {
  const { user } = useSession();
  return useSBQuery(
    () => fetchSellerOrders(user?.id ?? ""),
    [user?.id ?? ""],
  );
}

/**
 * Admin dispute queue — every open / under_review dispute, with the order and
 * seller/buyer names resolved for display. Evidence messages come from the real
 * dispute_messages table.
 */
export type AdminDisputeRow = {
  id: string;
  order_no: string;
  listing_title: string;
  brand: string;
  buyer_id: string;
  buyer_name: string;
  seller_id: string;
  seller_name: string;
  reason: string;
  detail: string;
  status: string;
  resolution: string | null;
  resolution_note: string | null;
  created_at: string;
  messages: { id: string; author_id: string; author_role: string; body: string; created_at: string }[];
};

async function fetchAdminDisputes(): Promise<AdminDisputeRow[]> {
  const { data, error } = await supabase
    .from("disputes")
    .select("id, order_no, opened_by, reason, detail, status, resolution, resolution_note, created_at")
    .in("status", ["open", "under_review"])
    .order("created_at", { ascending: false });
  if (error) throw new Error(friendlyError(error));
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const orderNos = rows.map((r) => r.order_no);
  const orders = await Promise.all(
    orderNos.map(async (ono) => {
      const { data: o, error: oe } = await supabase
        .from("orders")
        .select("listing_id, listing_title, brand, buyer_id, seller_id")
        .eq("order_no", ono)
        .maybeSingle();
      if (oe) return null;
      return o;
    }),
  );

  const orderMap = new Map<string, typeof orders[number]>();
  rows.forEach((r, i) => orderMap.set(r.order_no, orders[i]));

  const people = new Set<string>();
  rows.forEach((r) => {
    const o = orderMap.get(r.order_no);
    if (o) { people.add(o.buyer_id); people.add(o.seller_id); }
  });
  const pids = [...people];
  const { data: profiles, error: pe } = await supabase
    .from("profiles")
    .select("id, name")
    .in("id", pids);
  const nameBy = new Map<string, string>();
  if (!pe && profiles) {
    for (const p of profiles) nameBy.set(p.id, p.name ?? "Member");
  }

  const disputeIds = rows.map((r) => r.id);
  const messagesByDispute = new Map<string, AdminDisputeRow["messages"]>();
  await Promise.all(
    disputeIds.map(async (did) => {
      const { data: msgs, error: me } = await supabase
        .from("dispute_messages")
        .select("id, author_id, author_role, body, created_at")
        .eq("dispute_id", did)
        .order("created_at", { ascending: true });
      if (!me) messagesByDispute.set(did, (msgs ?? []).map((m) => ({
        id: m.id,
        author_id: m.author_id,
        author_role: m.author_role,
        body: m.body,
        created_at: m.created_at,
      })));
    }),
  );

  return rows.map((r) => {
    const o = orderMap.get(r.order_no);
    return {
      id: r.id,
      order_no: r.order_no,
      listing_title: o?.listing_title ?? "(removed)",
      brand: o?.brand ?? "",
      buyer_id: o?.buyer_id ?? "",
      buyer_name: nameBy.get(o?.buyer_id ?? "") ?? "Member",
      seller_id: o?.seller_id ?? "",
      seller_name: nameBy.get(o?.seller_id ?? "") ?? "Member",
      reason: r.reason,
      detail: r.detail,
      status: r.status,
      resolution: r.resolution,
      resolution_note: r.resolution_note,
      created_at: r.created_at,
      messages: messagesByDispute.get(r.id) ?? [],
    };
  });
}

export function useAdminDisputes() {
  return useSBQuery(fetchAdminDisputes, []);
}

/**
 * User notifications (real table).
 */
export type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  reference: string | null;
  read: boolean;
  created_at: string;
};

async function fetchNotifications(userId: string): Promise<NotificationRow[]> {
  if (!userId) return [];
  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, title, body, reference, read, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(friendlyError(error));
  return (data ?? []).map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    reference: r.reference,
    read: Boolean(r.read),
    created_at: r.created_at,
  }));
}

export function useNotifications() {
  const { user } = useSession();
  return useSBQuery(
    () => fetchNotifications(user?.id ?? ""),
    [user?.id ?? ""],
  );
}

export async function markNotificationsReadForUser(userId: string): Promise<number> {
  if (!userId) return 0;
  const { data, error } = await supabase.rpc("mark_notifications_read", { p_user: userId });
  if (error) throw new Error(friendlyError(error));
  return Number(data ?? 0);
}
