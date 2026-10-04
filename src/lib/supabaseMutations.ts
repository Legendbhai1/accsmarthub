import { supabase } from "@/lib/supabase";
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

export type AdvanceOrderInput = {
  orderNo: string;
};

export async function advanceOrder(input: AdvanceOrderInput) {
  const { error } = await supabase.rpc("advance_order", {
    p_order_no: input.orderNo,
  });
  if (error) throw new Error(friendlyError(error));
}

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
};

export async function createDeposit(amountUsd: number, returnUrl: string): Promise<DepositCreateResult> {
  const trackId = crypto.randomUUID();
  const { error } = await supabase.rpc("open_deposit", {
    p_amount: amountUsd,
    p_track_id: trackId,
  });
  if (error) throw new Error(friendlyError(error));

  const oxapayKey = import.meta.env.VITE_OXAPAY_MERCHANT_API_KEY;
  const baseUrl = import.meta.env.VITE_SUPABASE_URL ?? "https://fbalfkvimlfmcpsfzrvn.supabase.co";

  if (!oxapayKey) {
    return { trackId, amountUsd };
  }

  const webhookUrl = `${baseUrl}/functions/v1/oxapay-webhook`;

  const { data: initRes, error: initError } = await supabase.functions.invoke("oxapay-webhook", {
    body: {
      action: "create_invoice",
      track_id: trackId,
      amount_usd: amountUsd,
      return_url: returnUrl,
      webhook_url: webhookUrl,
    },
    headers: { "Content-Type": "application/json" },
  });

  if (initError) {
    console.warn("OxaPay invoice creation failed, deposit is open but unpaid:", initError);
    return { trackId, amountUsd };
  }

  return {
    trackId,
    amountUsd,
    paymentUrl: (initRes as { paymentUrl?: string }).paymentUrl,
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

export async function submitStore(input: SubmitStoreInput) {
  const { data, error } = await supabase
    .from("stores")
    .insert({ ...input, status: "pending" })
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

export type UploadCredentialsInput = {
  listingId: string;
  units: unknown[];
};

export async function uploadCredentials(input: UploadCredentialsInput) {
  const { data, error } = await supabase.rpc("upload_credentials", {
    p_listing_id: input.listingId,
    p_units: input.units,
  });
  if (error) throw new Error(friendlyError(error));
  return data;
}

export type FileReportInput = {
  orderNo?: string;
  listingId?: string;
  reportedUserId?: string;
  reason: string;
  detail: string;
};

export async function fileReport(input: FileReportInput): Promise<Report> {
  const { data, error } = await supabase
    .from("off_platform_reports")
    .insert(input)
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
