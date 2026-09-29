import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { internalMutation } from "./_generated/server";

/**
 * OxaPay crypto deposits (buyers only).
 *
 * Flow:
 *  1. `createDeposit` — creates an OxaPay invoice server-side and records a
 *     pending deposit row. The client redirects the buyer to `paymentUrl`.
 *  2. OxaPay POSTs the payment result to our webhook (`/oxapay-webhook`,
 *     registered in http.ts) — production path for crediting the wallet.
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

export const createDeposit = action({
  args: {
    amountUsd: v.number(),
    email: v.optional(v.string()),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, { amountUsd, email, userId }): Promise<{ paymentUrl: string; trackId: string }> => {
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
        callback_url: `${process.env.CONVEX_SITE_URL ?? ""}/oxapay-webhook`,
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
  handler: async (ctx, { trackId }): Promise<{ status: string; credited: boolean }> => {
    const merchantKey = process.env.OXAPAY_MERCHANT_API_KEY;
    if (!merchantKey) throw new Error("OxaPay is not configured");

    const info = await oxaFetch<OxaPayPaymentInfo>(`/payment/${trackId}`, {
      headers: { merchant_api_key: merchantKey },
    });
    const status = info.data?.status ?? "unknown";
    const paid = PAID_STATUSES.has(status);

    if (paid) {
      await ctx.runMutation(internal.payments.markDepositPaid, { trackId });
    }

    return { status, credited: paid };
  },
});

/** Webhook receiver for OxaPay callbacks (mounted at /oxapay-webhook). */
export const oxaPayWebhook = httpAction(async (ctx, request) => {
  const merchantKey = process.env.OXAPAY_MERCHANT_API_KEY;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const apiKey = String(body["merchant"] ?? body["merchant_api_key"] ?? "");
    if (merchantKey && apiKey !== merchantKey) {
      return new Response(JSON.stringify({ ok: false }), { status: 401 });
    }
    const trackId = String(body["track_id"] ?? "");
    const status = String(body["status"] ?? "").toLowerCase();
    if (trackId && PAID_STATUSES.has(status)) {
      await ctx.runMutation(internal.payments.markDepositPaid, { trackId });
    }
  } catch {
    // Always answer 200 so OxaPay does not retry a malformed ping forever.
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

export const markDepositPaid = internalMutation({
  args: { trackId: v.string() },
  handler: async (ctx, { trackId }) => {
    const deposit = await ctx.db
      .query("deposits")
      .withIndex("by_track", (q) => q.eq("trackId", trackId))
      .unique();
    if (!deposit || deposit.status === "paid") return;
    await ctx.db.patch(deposit._id, {
      status: "paid",
      paidAt: Date.now(),
    });
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
