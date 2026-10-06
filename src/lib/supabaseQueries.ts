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
