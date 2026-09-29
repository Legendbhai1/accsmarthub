import { v } from "convex/values";
import { action, httpAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * OxaPay crypto deposits (buyers only).
 *
 * Flow:
 *  1. `createDeposit` — creates an OxaPay invoice server-side and records a
 *     pending deposit row. The client redirects the buyer to `paymentUrl`.
 *  2. OxaPay POSTs the payment result to our webhook (`/oxapay-webhook`,
 *     registered in http.ts) with an HMAC-SHA512 signature (secret = merchant
 *     key). Statuses arrive as "paying" first, then "paid".
 *  3. `verifyDeposit` — the return page can also actively poll OxaPay's
 *     Payment Information endpoint for authoritative status and credit then.
 */

type OxaPayInvoiceResponse = {
  status: number;
  message?: string;
  data?: { track_id: string; payment_url: string; expired_at?: number };
  error?: { message: string } | null;
};

type OxaPayPaymentInfo = {
  status: number;
  data?: {
    track_id: string;
    status: string;
    order_id?: string;
    amount?: number;
    currency?: string;
  };
  error?: { message: string } | null;
};

const OXAPAY_BASE = "https://api.oxapay.com/v1";
/** OxaPay statuses that mean the buyer's money has arrived. */
const PAID_STATUSES = new Set(["paid", "completed"]);

async function oxaFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${OXAPAY_BASE}${path}`, init);
  if (!res.ok) throw new Error(`OxaPay request failed (${res.status})`);
  return (await res.json()) as T;
}

/** Constant-time hex comparison so webhook timing cannot leak the signature. */
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyHmac(rawBody: string, received: string, secret: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return safeEqualHex(hex, received.trim().toLowerCase());
}

export const createDeposit = action({
  args: {
    amountUsd: v.number(),
    email: v.optional(v.string()),
    userId: v.optional(v.string()),
    returnUrl: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { amountUsd, email, userId, returnUrl },
  ): Promise<{ paymentUrl: string; trackId: string }> => {
    if (!(amountUsd >= 1)) throw new Error("Minimum deposit is $1");
    const merchantKey = process.env.OXAPAY_MERCHANT_API_KEY;
    if (!merchantKey) {
      throw new Error(
        "OxaPay is not configured: add OXAPAY_MERCHANT_API_KEY in the Keys tab.",
      );
    }

    const res = await oxaFetch<OxaPayInvoiceResponse>("/payment/invoice", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        merchant_api_key: merchantKey,
      },
      body: JSON.stringify({
        amount: amountUsd,
        currency: "USD",
        lifetime: 60,
        email,
        order_id: userId ? `dep_${userId}_${Date.now()}` : `dep_${Date.now()}`,
        description: "AccsMartHub wallet top-up",
        callback_url: `${
          process.env.CONVEX_SITE_URL ?? "https://aware-alligator-968.convex.cloud"
        }/oxapay-webhook`,
        return_url: returnUrl,
        thanks_message: "Your AccsMartHub wallet has been topped up.",
      }),
    });

    if (!res.data?.payment_url || !res.data?.track_id) {
      throw new Error(res.error?.message ?? res.message ?? "OxaPay invoice failed");
    }

    await ctx.runMutation(internal.payments.insertDeposit, {
      trackId: res.data.track_id,
      userId: userId ?? "u-me",
      amountUsd,
      email,
    });

    return { paymentUrl: res.data.payment_url, trackId: res.data.track_id };
  },
});

export const verifyDeposit = action({
  args: { trackId: v.string() },
  handler: async (
    ctx,
    { trackId },
  ): Promise<{ status: string; credited: boolean; amountUsd?: number }> => {
    const merchantKey = process.env.OXAPAY_MERCHANT_API_KEY;
    if (!merchantKey) throw new Error("OxaPay is not configured");

    const info = await oxaFetch<OxaPayPaymentInfo>(`/payment/${trackId}`, {
      headers: { merchant_api_key: merchantKey },
    });
    const status = info.data?.status ?? "unknown";
    const paid = PAID_STATUSES.has(status);

    let credited = false;
    let amountUsd: number | undefined;
    if (paid) {
      const marked = await ctx.runMutation(internal.payments.markDepositPaid, {
        trackId,
      });
      if (marked.amountUsd != null) {
        credited = true;
        amountUsd = marked.amountUsd;
      }
    }

    return { status, credited, amountUsd };
  },
});

/** Webhook receiver for OxaPay callbacks (mounted at /oxapay-webhook). */
export const oxaPayWebhook = httpAction(async (ctx, request) => {
  const merchantKey = process.env.OXAPAY_MERCHANT_API_KEY;
  try {
    const raw = await request.text();
    const signature = request.headers.get("HMAC") ?? "";
    if (merchantKey && !(await verifyHmac(raw, signature, merchantKey))) {
      return new Response("invalid signature", { status: 401 });
    }
    const body = JSON.parse(raw) as Record<string, unknown>;
    const trackId = String(body["track_id"] ?? "");
    const status = String(body["status"] ?? "").toLowerCase();
    if (trackId && PAID_STATUSES.has(status)) {
      await ctx.runMutation(internal.payments.markDepositPaid, { trackId });
    }
  } catch {
    // Always answer "ok" so OxaPay does not retry a malformed ping forever.
  }
  // OxaPay requires an HTTP 200 with body "ok".
  return new Response("ok", { status: 200 });
});

export const markDepositPaid = internalMutation({
  args: { trackId: v.string() },
  handler: async (ctx, { trackId }): Promise<{ amountUsd: number | null }> => {
    const deposit = await ctx.db
      .query("deposits")
      .withIndex("by_track", (q) => q.eq("trackId", trackId))
      .unique();
    if (!deposit) return { amountUsd: null };
    if (deposit.status !== "paid") {
      await ctx.db.patch(deposit._id, {
        status: "paid",
        paidAt: Date.now(),
      });
    }
    return { amountUsd: deposit.amountUsd };
  },
});

export const insertDeposit = internalMutation({
  args: {
    trackId: v.string(),
    userId: v.string(),
    amountUsd: v.number(),
    email: v.optional(v.string()),
  },
  handler: async (ctx, { trackId, userId, amountUsd, email }) => {
    const existing = await ctx.db
      .query("deposits")
      .withIndex("by_track", (q) => q.eq("trackId", trackId))
      .unique();
    if (existing) return;
    await ctx.db.insert("deposits", {
      trackId,
      userId,
      amountUsd,
      email,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});
