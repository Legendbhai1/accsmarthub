import { supabase, SUPABASE_PROJECT_URL } from "@/lib/supabase";
import { friendlyError, type Deposit, type Report } from "@/lib/supabaseData";

/**
 * Supabase-backed mutation helpers.
 *
 * Each one calls a Postgres function or writes to a table using the CALLER's
 * session, so ownership/stock/balance checks live in the database.
 */

export type PlaceOrderInput = {
  listingId: string;
  quantity: number;
};

export async function placeOrder(input: PlaceOrderInput) {
  const { data, error } = await supabase.rpc("place_order", {
    p_listing_id: input.listingId,
    p_quantity: input.quantity,
    p_idempotency_key: crypto.randomUUID(),
  });
  if (error) throw new Error(friendlyError(error));
  return data;
}

export type CompleteOrderInput = {
  orderNo: string;
};

export async function completeOrder(input: CompleteOrderInput) {
  const { error } = await supabase.rpc("complete_order", {
    p_order_no: input.orderNo,
  });
  if (error) throw new Error(friendlyError(error));
}

// NOTE: the Convex build had `marketplace.advanceOrder` to move an order from
// `in_escrow` -> `transferring`. Supabase's `orders.status` constraint has no
// `transferring` state, so escrow release is a single step: the buyer calls
// `complete_order`. There is deliberately no `advance_order` wrapper here.

export type OpenDepositInput = {
  amountUsd: number;
  trackId: string;
};

export async function openDeposit(input: OpenDepositInput) {
  const { data, error } = await supabase.rpc("open_deposit", {
    p_amount: input.amountUsd,
    p_track_id: input.trackId,
  });
  if (error) throw new Error(friendlyError(error));
  return data;
}

export type DepositStatus = {
  track_id: string;
  amount_usd: number;
  status: "pending" | "paid" | "mismatch";
  created_at: string;
  paid_at: string | null;
};

export async function verifyDeposit(trackId: string): Promise<DepositStatus> {
  const { data, error } = await supabase
    .from("deposits")
    .select("*")
    .eq("track_id", trackId)
    .maybeSingle();
  if (error) throw new Error(friendlyError(error));
  if (!data) throw new Error("Deposit not found.");
  return {
    track_id: data.track_id,
    amount_usd: Number(data.amount_usd),
    status: data.status,
    created_at: data.created_at,
    paid_at: data.paid_at,
  };
}

export type DepositCreateResult = {
  trackId: string;
  amountUsd: number;
  paymentUrl?: string;
  /** False when the provider is not configured, so the UI can say so plainly. */
  configured?: boolean;
};

export type DepositConfigError = Error & { configured: false };

/**
 * Open a deposit and ask the provider for a payment URL.
 *
 * The OxaPay merchant API key lives ONLY in the `create-deposit-invoice` Edge
 * Function. It must never be a `VITE_` variable: everything prefixed `VITE_`
 * is inlined into the public JavaScript bundle, which would let anyone mint
 * invoices against your merchant account.
 */
export async function createDeposit(
  amountUsd: number,
  returnUrl: string,
): Promise<DepositCreateResult> {
  const trackId = crypto.randomUUID();
  const { error } = await supabase.rpc("open_deposit", {
    p_amount: amountUsd,
    p_track_id: trackId,
  });
  if (error) throw new Error(friendlyError(error));

  const { data, error: invokeError } = await supabase.functions.invoke(
    "create-deposit-invoice",
    { body: { trackId, returnUrl } },
  );

  if (invokeError) {
    // The deposit row exists but has no invoice. That is recoverable — the
    // buyer can retry — so report it instead of silently doing nothing.
    throw new Error(
      `Your deposit is open but the payment page could not be created: ${
        invokeError.message || "please try again."
      }`,
    );
  }

  const result = data as {
    trackId?: string;
    amountUsd?: number;
    paymentUrl?: string;
    error?: string;
    configured?: boolean;
  } | null;

  if (!result?.paymentUrl) {
    const err = new Error(
      result?.error ??
        "Card and crypto deposits are not switched on yet. Add your payment provider key to enable them.",
    ) as DepositConfigError;
    err.configured = false;
    throw err;
  }

  return {
    trackId: result.trackId ?? trackId,
    amountUsd: result.amountUsd ?? amountUsd,
    paymentUrl: result.paymentUrl,
    configured: true,
  };
}

export type SubmitStoreInput = {
  storeName: string;
  platforms: string[];
  deliverySpeed: string;
  accessFormat: string;
  replacementPolicy: string;
  restrictedRegions: string;
  sourcing: string;
  contactPolicyAccepted: boolean;
  logoPath?: string | null;
  bannerPath?: string | null;
};

/** Slugify a store name for the unique `stores.slug` column. */
function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "store";
}

/**
 * Upload a seller-owned image (store logo / listing photo) to Supabase Storage.
 *
 * Files land under `<user id>/…` inside a public bucket, which is what the
 * storage RLS policies allow: the seller may write only their own folder, and
 * anyone may read. Returns the storage path (NOT a public URL) to store in
 * `logo_path` / `image_path`.
 */
export async function uploadSellerAsset(
  file: File,
  folder: "store-assets" | "listing-assets",
): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error("You need to be signed in to upload files.");

  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(folder).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw new Error(friendlyError(error));
  return path;
}

/** Absolute, browser-usable URL for a stored asset path. */
export function publicAssetUrl(
  folder: "store-assets" | "listing-assets",
  path: string,
) {
  return `${SUPABASE_PROJECT_URL}/storage/v1/object/public/${folder}/${path}`;
}

/**
 * Create the seller's store application.
 *
 * New applications always land as `pending` — the RLS insert policy and the
 * `contact_policy` check enforce that a seller cannot self-approve.
 */
export async function submitStore(input: SubmitStoreInput) {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error("You need to be signed in to apply.");

  if (!input.contactPolicyAccepted) {
    throw new Error("You must accept the contact policy to apply.");
  }

  const { data, error } = await supabase
    .from("stores")
    .insert({
      user_id: userId,
      store_name: input.storeName,
      slug: slugify(input.storeName),
      logo_path: input.logoPath ?? null,
      banner_path: input.bannerPath ?? null,
      platforms: input.platforms,
      delivery_speed: input.deliverySpeed || null,
      access_format: input.accessFormat || null,
      replacement_policy: input.replacementPolicy || null,
      restricted_regions: input.restrictedRegions || null,
      sourcing: input.sourcing || null,
      contact_policy: true,
      status: "pending",
    })
    .select()
    .single();
  if (error) throw new Error(friendlyError(error));
  return data;
}

/**
 * Update an existing store.
 *
 * The `guard_store_moderation` trigger pins `status`, `review_note`,
 * `reviewed_at` and `reviewed_by` to their current values for non-admin
 * writes, so editing content can never silently re-open or self-grant
 * approval — an admin has to do that explicitly.
 */
export async function updateStore(storeId: string, input: SubmitStoreInput) {
  const { data, error } = await supabase
    .from("stores")
    .update({
      store_name: input.storeName,
      platforms: input.platforms,
      delivery_speed: input.deliverySpeed || null,
      access_format: input.accessFormat || null,
      replacement_policy: input.replacementPolicy || null,
      restricted_regions: input.restrictedRegions || null,
      sourcing: input.sourcing || null,
      contact_policy: input.contactPolicyAccepted,
    })
    .eq("id", storeId)
    .select()
    .single();
  if (error) throw new Error(friendlyError(error));
  return data;
}

export type ReviewStoreInput = {
  storeId: string;
  approve: boolean;
  note?: string;
};

export async function reviewStore(input: ReviewStoreInput) {
  const { error } = await supabase.rpc("review_store", {
    p_store_id: input.storeId,
    p_approve: input.approve,
    p_note: input.note ?? null,
  });
  if (error) throw new Error(friendlyError(error));
}

export type SetListingStatusInput = {
  listingId: string;
  status: string;
};

export async function setListingStatus(input: SetListingStatusInput) {
  const { error } = await supabase.rpc("set_listing_status", {
    p_listing_id: input.listingId,
    p_status: input.status,
  });
  if (error) throw new Error(friendlyError(error));
}

export type CredentialUnit = {
  unitKey: string;
  fileName: string;
  credentials: string;
};

/**
 * Encrypt and store seller-submitted credentials.
 *
 * Goes through the `upload-credentials` Edge Function rather than calling the
 * `upload_credentials` RPC directly, because the RPC expects base64 AES-GCM
 * ciphertext and the encryption passphrase is a function SECRET the browser
 * must never hold. The function encrypts, then calls the RPC as the caller so
 * the ownership check still applies.
 */
export async function uploadCredentials(input: {
  listingId: string;
  units: CredentialUnit[];
}) {
  const { data, error } = await supabase.functions.invoke("upload-credentials", {
    body: { listingId: input.listingId, units: input.units },
  });
  if (error) throw new Error(friendlyError(error));
  return (data ?? {}) as {
    uploaded: number;
    attached?: boolean;
    totalUnits?: number;
    availableUnits?: number;
  };
}

export type ListingDraft = {
  title: string;
  brand: string;
  summary: string;
  features: string[];
  faq: { question: string; answer: string }[];
  imagePath: string | null;
  serviceCategory: string | null;
  discountPercent: number;
  warrantyHours: number;
  hidden: boolean;
  priceUsd: number;
};

function listingRow(draft: ListingDraft, sellerId: string) {
  return {
    seller_id: sellerId,
    title: draft.title,
    brand: draft.brand,
    summary: draft.summary || null,
    features: draft.features.length ? draft.features : null,
    faq: draft.faq.length ? draft.faq : null,
    image_path: draft.imagePath,
    service_category: draft.serviceCategory,
    discount_percent: draft.discountPercent || null,
    warranty_hours: draft.warrantyHours,
    hidden: draft.hidden,
    price_usd: draft.priceUsd,
  };
}

/**
 * Create a listing. The RLS insert policy forces `status = 'pending'` and
 * `stock = 0`, so a seller cannot self-publish or fake availability — an admin
 * has to approve it via `set_listing_status`.
 */
export async function createListing(draft: ListingDraft): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error("You need to be signed in to create a listing.");

  const { data, error } = await supabase
    .from("listings")
    .insert({
      ...listingRow(draft, userId),
      listing_key: crypto.randomUUID(),
      status: "pending",
      stock: 0,
    })
    .select("id")
    .single();
  if (error) throw new Error(friendlyError(error));
  return data.id as string;
}

/**
 * Update a listing's content.
 *
 * `stock` and `status` are intentionally NOT writable here: the moderation
 * trigger pins both on seller writes, because stock is derived from attached
 * credentials and status is an admin decision.
 */
export async function updateListing(listingId: string, draft: ListingDraft) {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error("You need to be signed in.");

  const { error } = await supabase
    .from("listings")
    .update(listingRow(draft, userId))
    .eq("id", listingId);
  if (error) throw new Error(friendlyError(error));
}

/** Delete one of the seller's own listings. */
export async function deleteListing(listingId: string) {
  const { error } = await supabase.from("listings").delete().eq("id", listingId);
  if (error) throw new Error(friendlyError(error));
}

export type FileReportInput = {
  orderNo?: string;
  listingId?: string;
  reportedUserId?: string;
  /** Must be one of the reason values the DB check constraint allows. */
  reason: string;
  detail: string;
};

export async function fileReport(input: FileReportInput): Promise<Report> {
  const { data: sessionData } = await supabase.auth.getSession();
  const reporterId = sessionData.session?.user.id;
  if (!reporterId) throw new Error("You need to be signed in to file a report.");

  const { data, error } = await supabase
    .from("off_platform_reports")
    .insert({
      order_no: input.orderNo ?? null,
      listing_id: input.listingId ?? null,
      reporter_id: reporterId,
      reported_user_id: input.reportedUserId ?? null,
      reason: input.reason,
      detail: input.detail,
    })
    .select()
    .single();
  if (error) throw new Error(friendlyError(error));
  return {
    id: data.id,
    order_no: data.order_no,
    reporter_id: data.reporter_id,
    reported_user_id: data.reported_user_id,
    reason: data.reason,
    detail: data.detail,
    status: data.status,
    created_at: data.created_at,
  };
}

export type ResolveReportInput = {
  reportId: string;
  status: string;
  penalty?: string;
};

export async function resolveReport(input: ResolveReportInput) {
  const { error } = await supabase.rpc("resolve_report", {
    p_report_id: input.reportId,
    p_status: input.status,
    p_penalty: input.penalty ?? null,
  });
  if (error) throw new Error(friendlyError(error));
}

// Re-exported so callers that already import their mutations from this module
// do not need a second import for the order fetch / credential download.
export { fetchOrder, type OrderRow } from "@/lib/supabaseQueries";
export { downloadCredentials } from "@/lib/supabaseData";

/**
 * Buyer opens a dispute. Escrow freezes by flipping the order to 'disputed';
 * nothing moves until an admin resolves it.
 */
export async function openDispute(
  orderNo: string,
  reason: string,
  detail: string,
): Promise<void> {
  const { error } = await supabase.rpc("open_dispute", {
    p_order_no: orderNo,
    p_reason: reason,
    p_detail: detail,
  });
  if (error) throw new Error(friendlyError(error));
}

/** Add evidence to an open dispute. */
export async function addDisputeMessage(
  disputeId: string,
  body: string,
): Promise<void> {
  const { error } = await supabase.rpc("add_dispute_message", {
    p_dispute_id: disputeId,
    p_body: body,
  });
  if (error) throw new Error(friendlyError(error));
}

/** Admin resolves a dispute: refund the buyer or release to the seller. */
export async function resolveDispute(
  disputeId: string,
  outcome: "resolved_buyer" | "resolved_seller" | "dismissed",
  note: string,
): Promise<void> {
  const { error } = await supabase.rpc("resolve_dispute", {
    p_dispute_id: disputeId,
    p_outcome: outcome,
    p_note: note,
  });
  if (error) throw new Error(friendlyError(error));
}
