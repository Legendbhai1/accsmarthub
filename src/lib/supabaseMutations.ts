import { supabase, SUPABASE_PROJECT_URL } from "@/lib/supabase";
import { friendlyError, type Report } from "@/lib/supabaseData";
import { isDisputeReason } from "@/lib/disputeReasons";

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
 * The browser never obtained a readable reply from the Edge Function — the
 * CORS preflight was rejected, or the device is offline. No invoice was
 * created and nothing was billed, so this is a retry condition, not a
 * misconfiguration.
 */
export type DepositUnreachableError = Error & { unreachable: true };

const DEPOSIT_UNCONFIGURED =
  "Card and crypto deposits are not switched on yet. Add your payment provider key to enable them.";

const DEPOSIT_UNREACHABLE =
  "The payment service could not be reached, so no payment page was created and you were not charged. Check your connection and try again.";

/**
 * supabase-js collapses three very different failures into one message —
 * "Failed to send a request to the Edge Function" — when the CORS preflight is
 * rejected, when DNS/TLS fails, and when the device is offline. In all three
 * the request never reached OxaPay, so none of them may be reported as an
 * open deposit waiting on a payment page.
 */
function isUnreachable(err: unknown): boolean {
  const { name, message } = (err ?? {}) as { name?: string; message?: string };
  return (
    name === "FunctionsFetchError" ||
    /Failed to (send|fetch) a request to the Edge Function/i.test(message ?? "")
  );
}

/** Shape returned by `create-deposit-invoice`, on success and on failure. */
type InvoicePayload = {
  trackId?: string;
  amountUsd?: number;
  paymentUrl?: string;
  error?: string;
  /** Present and `false` only on the 503 "merchant key missing" response. */
  configured?: boolean;
};

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

  // Every failure path in `create-deposit-invoice` answers with a non-2xx
  // status and a JSON `{ error, configured }` body (503 not configured,
  // 502 provider rejected the invoice, 409 already settled, 404 not found).
  //
  // supabase-js throws `FunctionsHttpError` for ANY non-2xx and leaves the
  // Response UNREAD on `error.context`, so `data` is null and the reason is
  // lost. Reading the body back is what keeps the UI honest: without it the
  // unconfigured case is indistinguishable from a transient failure and the
  // user is told to retry against a gateway that can never work.
  let payload: InvoicePayload | null = (data as InvoicePayload | null) ?? null;

  if (invokeError) {
    const ctx = (invokeError as { context?: unknown }).context;

    // `error.context` carries the raw Response for any status supabase-js saw.
    // Without one, nothing readable came back and the honest thing to say is
    // that the service was unreachable — NOT "your deposit is open", which
    // would point the buyer at a payment page that does not exist.
    if (!(ctx instanceof Response) && isUnreachable(invokeError)) {
      const err = new Error(DEPOSIT_UNREACHABLE) as DepositUnreachableError;
      err.unreachable = true;
      throw err;
    }

    let body: Partial<InvoicePayload> | null = null;
    if (ctx instanceof Response) {
      try {
        // clone() because a failed .json() consumes the body.
        body = (await ctx.clone().json()) as Partial<InvoicePayload>;
      } catch {
        // The Supabase gateway's own 401/429/500 replies are not our JSON;
        // fall through to the generic message below.
      }
    }
    if (body?.error) payload = { ...(payload ?? {}), ...body };

    if (payload?.configured === false) {
      const err = new Error(payload.error ?? DEPOSIT_UNCONFIGURED) as DepositConfigError;
      err.configured = false;
      throw err;
    }

    // The deposit row exists but has no invoice. That is recoverable — the
    // buyer can retry — so report it instead of silently doing nothing.
    throw new Error(
      `Your deposit is open but the payment page could not be created: ${
        payload?.error ?? invokeError.message ?? "please try again."
      }`,
    );
  }

  const result = payload;

  if (!result?.paymentUrl) {
    const err = new Error(result?.error ?? DEPOSIT_UNCONFIGURED) as DepositConfigError;
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
  /** Required. An empty array is a real value here — it clears the list. */
  platforms: string[];
  deliverySpeed: string;
  accessFormat: string;
  restrictedRegions: string;
  contactPolicyAccepted: boolean;
  /**
   * Every field below is OPTIONAL, and `undefined` means "the caller did not
   * supply this — leave the stored value alone". Only an explicit value (or an
   * empty string, which clears) is written.
   *
   * This matters because two different callers write a store: the application
   * wizard, which answers every question, and the settings form, which edits a
   * subset. When a missing field was written as `null`/`[]`, saving settings
   * silently erased the logo, the categories, the refund policy and the
   * warranty window the applicant had already filled in.
   */
  logoPath?: string | null;
  bannerPath?: string | null;
  categories?: string[];
  /**
   * The application questions the wizard no longer asks — the warranty and
   * refund terms (question 4) and the support details (question 5) — stay
   * optional and are simply left untouched, so an existing store's stored
   * values are preserved rather than blanked. The settings form still edits
   * them.
   */
  replacementPolicy?: string;
  refundPolicy?: string;
  warrantyHours?: string | number | null;
  sourcing?: string;
  supportEmail?: string;
  supportHours?: string;
  supportChannel?: string;
  ownershipAttested?: boolean;
  agreementVersion?: string;
};

/**
 * Drop keys whose value is `undefined`, so a partial update never overwrites a
 * column the caller did not mention. `null` and `""` are kept: both are
 * deliberate clears.
 */
function defined<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

/**
 * An optional text column. `undefined` means "the caller did not mention it —
 * leave the stored value alone"; an empty string is a deliberate clear and
 * becomes `null`, matching every other optional column here.
 */
function optionalText(value: string | null | undefined) {
  return value === undefined ? undefined : value || null;
}

/**
 * The `stores` columns that only migration `0017_store_applications` creates.
 *
 * A database that has never run 0017 answers any write that names one of these
 * with a PostgREST schema-cache error — which is what a seller sees as
 * "Could not find the 'agreement_version' column of 'stores' in the schema
 * cache" and what makes the application button look broken. The write is
 * retried without these columns so the application still goes through on the
 * older schema, and the caller is told that the extra detail was not stored.
 */
const APPLICATION_ONLY_COLUMNS = [
  "categories",
  "warranty_hours",
  "refund_policy",
  "support_email",
  "support_hours",
  "support_channel",
  "ownership_attested",
  "compliance_accepted_at",
  "agreement_version",
] as const;

/**
 * A write or read that an *older* database cannot satisfy.
 *
 * PostgREST rejects a column a table does not have with 42703 ("column … does
 * not exist") and a write naming an unknown column with PGRST204; both name the
 * schema cache in the message. Callers use this to retry against the columns an
 * earlier migration left behind, so the app keeps working on a database that is
 * behind the migrations in this repository.
 */
export function isSchemaCacheError(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "PGRST204" ||
    error.code === "42703" ||
    /schema cache/i.test(message) ||
    /column .* does not exist/i.test(message)
  );
}

/** Strip the 0017-only columns, for the retry against an older schema. */
function withoutApplicationColumns<T extends Record<string, unknown>>(fields: T) {
  const drop = new Set<string>(APPLICATION_ONLY_COLUMNS);
  return Object.fromEntries(
    Object.entries(fields).filter(([key]) => !drop.has(key)),
  );
}

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
 * Create or revise the seller's store application.
 *
 * Exactly one row per account, always. This used to insert unconditionally,
 * so a second press — or a resubmission after a rejection — collided on the
 * unique `stores.slug` and the button looked dead: every attempt failed with
 * "duplicate key value violates unique constraint". The existing row is read
 * first and updated when there is one, which keeps the original slug (store
 * URLs are permanent) and can never mint a second application for the same
 * seller.
 */
export async function submitStore(input: SubmitStoreInput) {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error("You need to be signed in to apply.");

  if (!input.contactPolicyAccepted) {
    throw new Error("You must accept the contact policy to apply.");
  }

  const fields = {
    store_name: input.storeName,
    platforms: input.platforms,
    delivery_speed: input.deliverySpeed || null,
    access_format: input.accessFormat || null,
    contact_policy: true,
    ...defined({
      logo_path: input.logoPath,
      banner_path: input.bannerPath,
      categories: input.categories,
      restricted_regions: optionalText(input.restrictedRegions),
      replacement_policy: optionalText(input.replacementPolicy),
      sourcing: optionalText(input.sourcing),
      refund_policy: optionalText(input.refundPolicy),
      warranty_hours:
        input.warrantyHours === undefined
          ? undefined
          : input.warrantyHours == null || input.warrantyHours === ""
            ? null
            : Number(input.warrantyHours),
      support_email: optionalText(input.supportEmail),
      support_hours: optionalText(input.supportHours),
      support_channel: optionalText(input.supportChannel),
      // The attestation is recorded with the moment it was made, so a
      // resubmission that leaves it out keeps the original timestamp.
      ownership_attested: input.ownershipAttested,
      compliance_accepted_at:
        input.ownershipAttested === undefined
          ? undefined
          : input.ownershipAttested
            ? new Date().toISOString()
            : null,
      agreement_version: input.agreementVersion,
    }),
  };

  // `.limit(1)` rather than `.maybeSingle()`: a stray second row (from the
  // old unconditional insert) would make maybeSingle error and lock the
  // seller out of the form for good.
  const { data: existingRows, error: readError } = await supabase
    .from("stores")
    .select("id, status, slug")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);
  if (readError) throw new Error(friendlyError(readError));
  const existing = existingRows?.[0];

  if (!existing) {
    // New applications always land as `pending` — the RLS insert policy and
    // the `contact_policy` check enforce that a seller cannot self-approve.
    const row = {
      user_id: userId,
      slug: slugify(input.storeName),
      ...fields,
      status: "pending" as const,
    };
    const first = await supabase.from("stores").insert(row).select().single();
    if (!first.error) return { store: first.data, degraded: false };
    // The database has not run 0017, so the application-only columns do not
    // exist. Retry without them: the seller's application still reaches the
    // review queue, and the returned `degraded` flag lets the caller say which
    // answers were not stored instead of claiming a clean save.
    if (!isSchemaCacheError(first.error)) {
      throw new Error(friendlyError(first.error));
    }
    const retry = await supabase
      .from("stores")
      .insert(withoutApplicationColumns(row))
      .select()
      .single();
    if (retry.error) throw new Error(friendlyError(retry.error));
    return { store: retry.data, degraded: true };
  }

  // A rejected application is re-queued by the resubmission. `guard_store_
  // moderation` pins these columns for non-admin writes, so until migration
  // 0007 is applied the values are silently reverted and the row keeps its
  // rejected status — the caller reads the returned row, so the UI reports
  // what actually happened instead of claiming a queue entry that does not
  // exist.
  const patch = {
    ...fields,
    ...(existing.status === "rejected"
      ? {
          status: "pending" as const,
          review_note: null,
          reviewed_at: null,
          reviewed_by: null,
        }
      : {}),
  };
  const first = await supabase
    .from("stores")
    .update(patch)
    .eq("id", existing.id)
    .select()
    .single();
  if (!first.error) return { store: first.data, degraded: false };
  if (!isSchemaCacheError(first.error)) {
    throw new Error(friendlyError(first.error));
  }
  const retry = await supabase
    .from("stores")
    .update(withoutApplicationColumns(patch))
    .eq("id", existing.id)
    .select()
    .single();
  if (retry.error) throw new Error(friendlyError(retry.error));
  return { store: retry.data, degraded: true };
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
  const patch = {
    store_name: input.storeName,
    platforms: input.platforms,
    delivery_speed: input.deliverySpeed || null,
    access_format: input.accessFormat || null,
    contact_policy: input.contactPolicyAccepted,
    // Omitted, not blanked — same rule as `submitStore`.
    ...defined({
      categories: input.categories,
      restricted_regions: optionalText(input.restrictedRegions),
      replacement_policy: optionalText(input.replacementPolicy),
      sourcing: optionalText(input.sourcing),
      refund_policy: optionalText(input.refundPolicy),
      warranty_hours:
        input.warrantyHours === undefined
          ? undefined
          : input.warrantyHours == null || input.warrantyHours === ""
            ? null
            : Number(input.warrantyHours),
      support_email: optionalText(input.supportEmail),
      support_hours: optionalText(input.supportHours),
      support_channel: optionalText(input.supportChannel),
      ownership_attested: input.ownershipAttested,
      agreement_version: input.agreementVersion,
    }),
  };

  const first = await supabase
    .from("stores")
    .update(patch)
    .eq("id", storeId)
    .select()
    .single();
  if (!first.error) return { store: first.data, degraded: false };
  // Same pre-0017 fallback as `submitStore`: the settings form must keep
  // working on a database that has not run the migration.
  if (!isSchemaCacheError(first.error)) {
    throw new Error(friendlyError(first.error));
  }
  const retry = await supabase
    .from("stores")
    .update(withoutApplicationColumns(patch))
    .eq("id", storeId)
    .select()
    .single();
  if (retry.error) throw new Error(friendlyError(retry.error));
  return { store: retry.data, degraded: true };
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
  /**
   * Why the listing was moderated. Required by the database when moving a
   * listing to `paused` (a rejection), optional otherwise. The seller sees it
   * verbatim, so it is written as the message they should read.
   */
  note?: string;
};

export async function setListingStatus(input: SetListingStatusInput) {
  const withNote = await supabase.rpc("set_listing_status", {
    p_listing_id: input.listingId,
    p_status: input.status,
    p_note: input.note ?? null,
  });
  if (!withNote.error) return;

  // 0020 replaced the 2-argument `set_listing_status(uuid, text)` with a
  // 3-argument version whose `p_note` defaults to null. A database that has
  // not run 0020 only has the 2-argument function, and PostgREST answers a
  // call it cannot resolve with PGRST202 ("no matches were found in the schema
  // cache") rather than running it — so approving a listing failed outright on
  // that database. Fall back to the two named arguments the older function
  // declares. A rejection's reason is only recorded by the newer function,
  // which is the same migration that added the column it writes.
  if (!isMissingRpcError(withNote.error)) {
    throw new Error(friendlyError(withNote.error));
  }
  const withoutNote = await supabase.rpc("set_listing_status", {
    p_listing_id: input.listingId,
    p_status: input.status,
  });
  if (withoutNote.error) throw new Error(friendlyError(withoutNote.error));
}

/**
 * PostgREST reports an RPC whose signature it cannot resolve as PGRST202 —
 * "Could not find the function … in the schema cache". That is the signal that
 * the function exists in an older shape (or not at all), which the callers
 * below use to retry against the older shape instead of failing.
 */
function isMissingRpcError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "PGRST202" ||
    /could not find the function/i.test(error.message ?? "") ||
    /schema cache/i.test(error.message ?? "")
  );
}

export type AdminUpdateListingInput = {
  listingId: string;
  title: string;
  brand: string;
  summary?: string | null;
  priceUsd: number;
  hidden?: boolean;
  note?: string | null;
};

/** Correct a listing's content as an administrator, leaving a reason. */
export async function adminUpdateListing(input: AdminUpdateListingInput) {
  const { error } = await supabase.rpc("admin_update_listing", {
    p_listing_id: input.listingId,
    p_title: input.title,
    p_brand: input.brand,
    p_summary: input.summary ?? null,
    p_price_usd: input.priceUsd,
    p_hidden: input.hidden ?? null,
    p_note: input.note ?? null,
  });
  if (!error) return;
  // `admin_update_listing` arrives with migration 0020. On a database that has
  // not run it the RPC does not exist, and PGRST202 reads as a mysterious
  // "Could not find the function" in the dialog. Approve and reject still work
  // there, so say plainly that only the edit is unavailable and why.
  if (isMissingRpcError(error)) {
    throw new Error(
      "Editing a listing needs the latest database migration. Approving and rejecting still work.",
    );
  }
  throw new Error(friendlyError(error));
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
  if (error) throw new Error(await edgeFunctionError(error));
  return (data ?? {}) as {
    uploaded: number;
    attached?: boolean;
    totalUnits?: number;
    availableUnits?: number;
  };
}

/**
 * `functions.invoke` reports any non-2xx as the generic "Edge Function
 * returned a non-2xx status code" and leaves the useful text in the response
 * body. Read it out so the seller is told what actually went wrong rather than
 * that something, somewhere, failed.
 */
async function edgeFunctionError(error: unknown): Promise<string> {
  const context = (error as { context?: Response }).context;
  if (context && typeof context.json === "function") {
    try {
      const body = await context.clone().json();
      const message = typeof body?.error === "string" ? body.error : null;
      if (message) return message;
    } catch {
      // Body was not JSON — fall through to the generic mapping.
    }
  }
  return friendlyError(error);
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
  penalty?: string | null;
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
 *
 * `reason` must be a canonical value. The RPC rejects anything else with
 * "Invalid dispute reason", so an invalid value is caught here with a clearer
 * message rather than as a raw Postgres error.
 */
export async function openDispute(
  orderNo: string,
  reason: string,
  detail: string,
): Promise<void> {
  if (!isDisputeReason(reason)) {
    throw new Error("Choose a dispute reason from the list.");
  }
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

/* -------------------- cart, checkout, delivery, disputes, reviews -------------------- */

/** Cart — add a listing with a quantity (server-validates availability). */
export type CartAddInput = { listingId: string; quantity: number };
export async function cartAdd(input: CartAddInput): Promise<string> {
  const { data, error } = await supabase.rpc("cart_add", {
    p_listing_id: input.listingId,
    p_quantity: input.quantity,
  });
  if (error) throw new Error(friendlyError(error));
  return data as string;
}

/** Cart — set a listing's quantity (0 removes it). */
export type CartSetInput = { listingId: string; quantity: number };
export async function cartSet(input: CartSetInput): Promise<void> {
  const { error } = await supabase.rpc("cart_set", {
    p_listing_id: input.listingId,
    p_quantity: input.quantity,
  });
  if (error) throw new Error(friendlyError(error));
}

/** Cart — remove a listing. */
export type CartRemoveInput = { listingId: string };
export async function cartRemove(input: CartRemoveInput): Promise<void> {
  const { error } = await supabase.rpc("cart_remove", {
    p_listing_id: input.listingId,
  });
  if (error) throw new Error(friendlyError(error));
}

/**
 * Checkout — Buy Now (single listing) funded from the wallet.
 *
 * Re-validates price/stock/eligibility server-side and funds escrow atomically.
 * Returns the created order_no. For a cart checkout use `checkoutCart`.
 */
export type CheckoutBuyNowInput = {
  listingId: string;
  quantity: number;
  idempotencyKey?: string;
};
export async function checkoutBuyNow(input: CheckoutBuyNowInput): Promise<string> {
  const key = input.idempotencyKey ?? crypto.randomUUID();
  const { data, error } = await supabase.rpc("checkout", {
    p_listing_id: input.listingId,
    p_cart_ids: null,
    p_quantity: input.quantity,
    p_idempotency_key: key,
  });
  if (error) throw new Error(friendlyError(error));
  return data as string;
}

/**
 * Checkout — cart-funded (wallet) purchase.
 *
 * Creates one order per cart item in one transaction, clears the cart, and
 * returns the first created order_no as the landing anchor. Each item is
 * re-validated server-side; a retry of the same idempotency key is a no-op.
 */
export type CheckoutCartInput = {
  cartIds: string[];
  idempotencyKey?: string;
};
export async function checkoutCart(input: CheckoutCartInput): Promise<string> {
  const key = input.idempotencyKey ?? crypto.randomUUID();
  const ids = input.cartIds.map((s) => (typeof s === "string" ? s : s));
  const { data, error } = await supabase.rpc("checkout", {
    p_listing_id: null,
    p_cart_ids: ids,
    p_quantity: null,
    p_idempotency_key: key,
  });
  if (error) throw new Error(friendlyError(error));
  return data as string;
}

/**
 * Buyer confirms delivery and releases escrow.
 *
 * Only works when the seller has marked the order delivered, or when the order
 * has claimed credentials (implicit digital delivery), and only inside the
 * inspection window.
 */
export type ConfirmDeliveryInput = { orderNo: string };
export async function confirmDelivery(input: ConfirmDeliveryInput): Promise<void> {
  const { error } = await supabase.rpc("confirm_delivery", {
    p_order_no: input.orderNo,
  });
  if (error) throw new Error(friendlyError(error));
}

/**
 * Seller marks an order delivered (manual or explicit digital).
 */
export type MarkDeliveredInput = { orderNo: string; method?: "digital" | "manual" };
export async function markOrderDelivered(input: MarkDeliveredInput): Promise<void> {
  const { error } = await supabase.rpc("mark_order_delivered", {
    p_order_no: input.orderNo,
    p_method: input.method ?? "digital",
  });
  if (error) throw new Error(friendlyError(error));
}

/**
 * Buyer requests a replacement for an in-escrow order.
 */
export type RequestReplacementInput = { orderNo: string; reason: string };
export async function requestReplacement(input: RequestReplacementInput): Promise<string> {
  const { data, error } = await supabase.rpc("request_replacement", {
    p_order_no: input.orderNo,
    p_reason: input.reason,
  });
  if (error) throw new Error(friendlyError(error));
  return data as string;
}

/**
 * Buyer requests cancellation of an in-escrow order.
 */
export type RequestCancellationInput = { orderNo: string; reason: string };
export async function requestCancellation(input: RequestCancellationInput): Promise<string> {
  const { data, error } = await supabase.rpc("request_cancellation", {
    p_order_no: input.orderNo,
    p_reason: input.reason,
  });
  if (error) throw new Error(friendlyError(error));
  return data as string;
}

/** Admin resolves a replacement/cancellation request. */
export type ResolveRequestInput = {
  requestId: string;
  outcome: "approved" | "dismissed";
  note: string;
};
export async function resolveOrderRequest(input: ResolveRequestInput): Promise<void> {
  const { error } = await supabase.rpc("resolve_order_request", {
    p_request_id: input.requestId,
    p_outcome: input.outcome,
    p_note: input.note,
  });
  if (error) throw new Error(friendlyError(error));
}

/**
 * Buyer submits a review for a completed order (eligible-purchaser-only).
 */
export type SubmitReviewInput = {
  orderNo: string;
  rating: number;
  title: string;
  body: string;
};
export async function submitReview(input: SubmitReviewInput): Promise<string> {
  const { data, error } = await supabase.rpc("submit_review", {
    p_order_no: input.orderNo,
    p_rating: input.rating,
    p_title: input.title,
    p_body: input.body,
  });
  if (error) throw new Error(friendlyError(error));
  return data as string;
}

/** Mark all of the signed-in user's notifications as read. */
export async function markNotificationsRead(): Promise<number> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return 0;
  const { data, error } = await supabase.rpc("mark_notifications_read", { p_user: userId });
  if (error) throw new Error(friendlyError(error));
  return Number(data ?? 0);
}

/**
 * Seller requests a withdrawal. The server derives the seller from the session,
 * re-reads the balance under a row lock, and holds the funds — so an amount
 * tampered with in the browser can only ever fail, never overdraw.
 */
export type RequestPayoutInput = {
  amount: number;
  method: string;
  destination: string;
};
export async function requestPayout(input: RequestPayoutInput): Promise<string> {
  const { data, error } = await supabase.rpc("request_payout", {
    p_amount: input.amount,
    p_method: input.method,
    p_destination: input.destination,
    p_idempotency_key: crypto.randomUUID(),
  });
  if (error) throw new Error(friendlyError(error));
  return data as string;
}

/**
 * Admin settles a payout request. `decision` is 'paid' or 'rejected'; a reason
 * is mandatory and is written to the audit trail.
 */
export type ResolvePayoutInput = {
  payoutId: string;
  decision: "paid" | "rejected";
  note: string;
  paidReference?: string;
};
export async function resolvePayout(input: ResolvePayoutInput): Promise<void> {
  const { error } = await supabase.rpc("resolve_payout", {
    p_payout_id: input.payoutId,
    p_decision: input.decision,
    p_note: input.note,
    p_paid_reference: input.paidReference ?? null,
  });
  if (error) throw new Error(friendlyError(error));
}

/**
 * Grant or revoke administrator access for a user. `admin_set_admin()` refuses
 * to let an admin remove their own access, and writes the change to
 * `admin_audit`; the UI is only the trigger.
 */
export async function adminSetAdmin(userId: string, makeAdmin: boolean): Promise<void> {
  const { error } = await supabase.rpc("admin_set_admin", {
    p_user: userId,
    p_make_admin: makeAdmin,
  });
  if (error) throw new Error(friendlyError(error));
}

/**
 * Admin refunds an in-escrow order in full. The order number is the handle the
 * refund RPC takes; `refund_order()` itself enforces the admin check, requires
 * a reason, and only refunds an order that is still in escrow.
 */
export type RefundOrderInput = {
  orderNo: string;
  note: string;
};
export async function refundOrder(input: RefundOrderInput): Promise<void> {
  const { error } = await supabase.rpc("refund_order", {
    p_order_no: input.orderNo,
    p_note: input.note,
    p_idempotency_key: `admin-refund:${input.orderNo}`,
  });
  if (error) throw new Error(friendlyError(error));
}

/**
 * Save or unsave a listing for the signed-in user. RLS pins `user_id` to the
 * caller, so the id cannot be spoofed; a repeat save is absorbed by the
 * primary key rather than raising.
 */
export async function toggleSavedListing(
  listingId: string,
  save: boolean,
): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error("You need to be signed in to save listings.");

  if (save) {
    const { error } = await supabase
      .from("saved_listings")
      .insert({ user_id: userId, listing_id: listingId });
    // 23505 is the primary key firing on a double tap, which is a success.
    if (error && error.code !== "23505") throw new Error(friendlyError(error));
    return;
  }

  const { error } = await supabase
    .from("saved_listings")
    .delete()
    .eq("user_id", userId)
    .eq("listing_id", listingId);
  if (error) throw new Error(friendlyError(error));
}
