import { supabase } from "@/lib/supabase";
import { useSBQuery, friendlyError } from "@/lib/supabaseData";
import { useSession } from "@/lib/session";

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
  if (!userId)
    return { grossUsd: 0, commissionUsd: 0, netUsd: 0, escrowUsd: 0, completedCount: 0 };

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

async function fetchMyOrders(
  role: "buyer" | "seller" | "admin",
  userId: string,
): Promise<OrderRow[]> {
  if (!userId) return [];
  let query = supabase.from("orders").select("*");
  if (role === "buyer") query = query.eq("buyer_id", userId);
  else if (role === "seller") query = query.eq("seller_id", userId);
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
    platforms: typeof r.platforms === "string" && r.platforms
      ? (JSON.parse(r.platforms) as string[])
      : ([] as string[]),
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
      return {
        id: data.id,
        order_no: data.order_no,
        opened_by: data.opened_by,
        reason: data.reason,
        detail: data.detail,
        status: data.status,
        resolution_note: data.resolution_note,
        resolved_at: data.resolved_at,
        created_at: data.created_at,
        messages: (messages ?? []).map((m) => ({
          id: m.id,
          author_id: m.author_id,
          body: m.body,
          created_at: m.created_at,
        })),
      };
    },
    [orderNo],
  );
}

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

type OrderRef = {
  listing_id: string;
  listing_title: string;
  brand: string;
  buyer_id: string;
  seller_id: string;
};

type DisputeMessage = {
  id: string;
  author_id: string;
  author_role: string;
  body: string;
  created_at: string;
};

async function fetchAdminDisputes(): Promise<AdminDisputeRow[]> {
  const { data: disputes, error: disputeError } = await supabase
    .from("disputes")
    .select("id, order_no, opened_by, reason, detail, status, resolution, resolution_note, created_at")
    .in("status", ["open", "under_review"])
    .order("created_at", { ascending: false });
  if (disputeError) throw new Error(friendlyError(disputeError));
  const rows = disputes ?? [];
  if (rows.length === 0) return [];

  const orderNos = rows.map((r) => r.order_no);
  const orderRefs = await Promise.all(
    orderNos.map(async (ono) => {
      const { data: o, error: oe } = await supabase
        .from("orders")
        .select("listing_id, listing_title, brand, buyer_id, seller_id")
        .eq("order_no", ono)
        .maybeSingle();
      if (oe || !o) return null;
      return {
        listing_id: o.listing_id,
        listing_title: o.listing_title,
        brand: o.brand,
        buyer_id: o.buyer_id,
        seller_id: o.seller_id,
      };
    }),
  );

  const orderMap = new Map<string, OrderRef | null>();
  rows.forEach((r, i) => orderMap.set(r.order_no, orderRefs[i] ?? null));

  const people = new Set<string>();
  rows.forEach((r) => {
    const o = orderMap.get(r.order_no);
    if (o) {
      people.add(o.buyer_id);
      people.add(o.seller_id);
    }
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
  const messagesByDispute = new Map<string, DisputeMessage[]>();
  await Promise.all(
    disputeIds.map(async (did) => {
      const { data: msgs, error: me } = await supabase
        .from("dispute_messages")
        .select("id, author_id, author_role, body, created_at")
        .eq("dispute_id", did)
        .order("created_at", { ascending: true });
      if (!me)
        messagesByDispute.set(
          did,
          (msgs ?? []).map((m) => ({
            id: m.id,
            author_id: m.author_id,
            author_role: m.author_role,
            body: m.body,
            created_at: m.created_at,
          })),
        );
    }),
  );

  return rows.map((r) => {
    const o = orderMap.get(r.order_no);
    const buyerId = o?.buyer_id ?? "";
    const sellerId = o?.seller_id ?? "";
    return {
      id: r.id,
      order_no: r.order_no,
      listing_title: o?.listing_title ?? "(removed)",
      brand: o?.brand ?? "",
      buyer_id: buyerId,
      buyer_name: nameBy.get(buyerId) ?? "Member",
      seller_id: sellerId,
      seller_name: nameBy.get(sellerId) ?? "Member",
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

export type PublicListing = {
  id: string;
  title: string;
  brand: string;
  serviceCategory: string | null;
  summary: string | null;
  discountPercent: number | null;
  warrantyHours: number | null;
  stock: number;
  priceUsd: number;
  status: string;
};

async function fetchPublicListings(): Promise<PublicListing[]> {
  const { data, error } = await supabase
    .from("listings")
    .select("id, title, brand, service_category, summary, discount_percent, warranty_hours, stock, price_usd, status")
    .eq("status", "active")
    .eq("hidden", false)
    .order("created_at", { ascending: false });
  if (error) throw new Error(friendlyError(error));
  return (data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    brand: r.brand,
    serviceCategory: r.service_category,
    summary: r.summary,
    discountPercent: r.discount_percent,
    warrantyHours: r.warranty_hours,
    stock: Number(r.stock ?? 0),
    priceUsd: Number(r.price_usd ?? 0),
    status: r.status,
  }));
}

export function usePublicListings() {
  return useSBQuery(fetchPublicListings, []);
}

export function usePublicListing(id: string) {
  return useSBQuery(
    async () => {
      if (!id) return undefined;
      const { data, error } = await supabase
        .from("listings")
        .select("id, title, brand, service_category, summary, discount_percent, warranty_hours, stock, price_usd, status")
        .eq("id", id)
        .eq("status", "active")
        .eq("hidden", false)
        .maybeSingle();
      if (error) throw new Error(friendlyError(error));
      if (!data) return undefined;
      return {
        id: data.id,
        title: data.title,
        brand: data.brand,
        serviceCategory: data.service_category,
        summary: data.summary,
        discountPercent: data.discount_percent,
        warrantyHours: data.warranty_hours,
        stock: Number(data.stock ?? 0),
        priceUsd: Number(data.price_usd ?? 0),
        status: data.status,
      };
    },
    [id],
  );
}

export type AdminListingRow = {
  id: string;
  title: string;
  brand: string;
  service_category: string | null;
  hidden: boolean;
  seller_id: string;
  seller_name: string;
  seller_email: string | null;
  price_usd: number;
  stock: number;
  status: "pending" | "active" | "paused" | "sold";
  updated_at: string;
};

async function fetchAdminListings(): Promise<AdminListingRow[]> {
  const { data, error } = await supabase
    .from("listings")
    .select("id, title, brand, service_category, hidden, seller_id, price_usd, stock, status, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(friendlyError(error));

  const sellerIds = new Set<string>();
  for (const row of data ?? []) {
    if (row.seller_id) sellerIds.add(row.seller_id);
  }
  const { data: profiles, error: pe } = await supabase
    .from("profiles")
    .select("id, name, email")
    .in("id", [...sellerIds]);
  const profileBy = new Map<string, { name: string | null; email: string | null }>();
  if (!pe && profiles) {
    for (const p of profiles) profileBy.set(p.id, { name: p.name, email: p.email });
  }

  return (data ?? []).map((r) => {
    const profile = profileBy.get(r.seller_id);
    return {
      id: r.id,
      title: r.title,
      brand: r.brand,
      service_category: r.service_category,
      hidden: Boolean(r.hidden),
      seller_id: r.seller_id,
      seller_name: profile?.name ?? "Unknown seller",
      seller_email: profile?.email ?? null,
      price_usd: Number(r.price_usd ?? 0),
      stock: Number(r.stock ?? 0),
      status: r.status,
      updated_at: r.updated_at,
    };
  });
}

export function useAdminListings() {
  return useSBQuery(fetchAdminListings, []);
}
