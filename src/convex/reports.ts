import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAccount, requireAdmin } from "./lib";

/**
 * Off-platform contact is a marketplace-wide violation.
 *
 * Selling an account by moving the deal to Telegram, WhatsApp, email or a
 * direct bank transfer puts the buyer outside escrow, so it is treated as a
 * listing-blocking offence. Buyers report it from the order screen; admins
 * review the queue and can pause the reported seller's listings.
 */
export const reportOffPlatform = mutation({
  args: {
    orderNo: v.optional(v.string()),
    listingId: v.optional(v.string()),
    reportedUserId: v.optional(v.string()),
    reason: v.union(
      v.literal("shared_contact"),
      v.literal("payment_offsite"),
      v.literal("refused_escrow"),
      v.literal("impersonation"),
      v.literal("other"),
    ),
    detail: v.string(),
  },
  handler: async (ctx, args) => {
    const account = await requireAccount(ctx);
    if (args.detail.trim().length < 10) {
      throw new Error("Please describe what happened in a little more detail.");
    }
    if (!args.orderNo && !args.listingId && !args.reportedUserId) {
      throw new Error("A report must reference an order, a listing or a user.");
    }
    const id = await ctx.db.insert("offPlatformReports", {
      orderId: args.orderNo,
      listingId: args.listingId,
      reporterId: account.id,
      reportedUserId: args.reportedUserId,
      reason: args.reason,
      detail: args.detail.trim(),
      status: "open",
      createdAt: Date.now(),
    });
    return { reportId: id, status: "open" as const };
  },
});

/** The reporting policy text shown wherever contact details would appear. */
export const policy = query({
  args: {},
  handler: async () => ({
    title: "All communication and payment stay on AccsMartHub",
    rules: [
      "Never share a phone number, personal email, Telegram or WhatsApp handle.",
      "Never accept payment outside escrow, even partially or as a deposit.",
      "Never move the transfer to another platform before the order completes.",
      "Sellers deliver accounts only through the AccsMartHub order flow.",
      "Breaching this rule can pause your listings and forfeit your balance.",
    ],
  }),
});

export const openReports = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, { status }) => {
    await requireAdmin(ctx);
    const wanted = status as "open" | "reviewing" | "resolved" | "dismissed" | undefined;
    const rows = await ctx.db.query("offPlatformReports").collect();
    return rows
      .filter((r) => (wanted ? r.status === wanted : true))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const resolveReport = mutation({
  args: {
    reportId: v.id("offPlatformReports"),
    outcome: v.union(v.literal("resolved"), v.literal("dismissed")),
    penalty: v.optional(v.string()),
    suspendSellerListings: v.boolean(),
  },
  handler: async (ctx, { reportId, outcome, penalty, suspendSellerListings }) => {
    const admin = await requireAdmin(ctx);
    void admin;
    const report = await ctx.db.get(reportId);
    if (!report) throw new Error("Report not found.");

    if (suspendSellerListings && report.reportedUserId) {
      const listings = await ctx.db
        .query("listingStock")
        .withIndex("by_seller", (q) => q.eq("sellerId", report.reportedUserId!))
        .collect();
      for (const listing of listings) {
        await ctx.db.patch(listing._id, { status: "paused", updatedAt: Date.now() });
      }
    }

    await ctx.db.patch(reportId, {
      status: outcome,
      penalty: penalty?.trim() || undefined,
      resolvedAt: Date.now(),
    });
    return { status: outcome };
  },
});