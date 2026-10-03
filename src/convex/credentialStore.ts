import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";

/**
 * Database internals for the credential vault.
 *
 * These live in their own module — NOT alongside the public action — on
 * purpose. If the action and its helpers share a file, the generated API
 * type becomes self-referential and TypeScript cannot infer the action's
 * return type (TS7022). Keeping them separate breaks that cycle.
 *
 * These are `internal`, so a browser client can never call them directly.
 */

/**
 * Authorization gate for any credential download.
 *
 * Returns the order only when `userId` is its buyer and the order was paid.
 * A refunded order forfeits access to the deliverable.
 */
export const authorizedDownload = internalQuery({
  args: { orderNo: v.string(), userId: v.string() },
  handler: async (ctx, { orderNo, userId }) => {
    const order = await ctx.db
      .query("orders")
      .withIndex("by_no", (q) => q.eq("orderNo", orderNo))
      .unique();
    if (!order) return null;
    if (order.buyerId !== userId) return null;
    if (order.status === "refunded") return null;
    return {
      orderNo: order.orderNo,
      listingId: order.listingId,
      sellerId: order.sellerId,
    };
  },
});

/** Encrypted rows this specific order reserved. Never client-reachable. */
export const claimedUnits = internalQuery({
  args: { listingId: v.string(), orderNo: v.string() },
  handler: async (ctx, { listingId, orderNo }) => {
    const rows = await ctx.db
      .query("listingCredentials")
      .withIndex("by_listing", (q) => q.eq("listingId", listingId))
      .collect();
    return rows
      .filter((r) => r.claimedByOrderNo === orderNo)
      .map((r) => ({
        unitKey: r.unitKey,
        ciphertext: r.ciphertext,
        iv: r.iv,
        authTag: r.authTag,
        fileName: r.fileName,
      }));
  },
});

/**
 * Reserves `quantity` unclaimed credential units for an order.
 *
 * Called from `placeOrder` inside the same transaction that decrements stock,
 * so two buyers can never be handed the same account. Returns the unit keys so
 * the caller can record what this order received.
 */
export const reserveUnits = internalMutation({
  args: { listingId: v.string(), orderNo: v.string(), quantity: v.number() },
  handler: async (ctx, { listingId, orderNo, quantity }) => {
    const all = await ctx.db
      .query("listingCredentials")
      .withIndex("by_listing", (q) => q.eq("listingId", listingId))
      .collect();
    const free = all.filter((r) => !r.claimedByOrderNo);
    if (free.length < quantity) {
      throw new Error(
        free.length === 0
          ? "This seller has not uploaded credentials for the units you bought. Please contact support for a refund."
          : `Only ${free.length} account${free.length === 1 ? "" : "s"} left with credentials attached.`,
      );
    }
    const chosen = free.slice(0, quantity);
    for (const row of chosen) {
      await ctx.db.patch(row._id, { claimedByOrderNo: orderNo, claimedAt: Date.now() });
    }
    return chosen.map((r) => r.unitKey);
  },
});

/** Append-only audit trail so a download can be reviewed after a dispute. */
export const recordDownload = internalMutation({
  args: {
    orderNo: v.string(),
    listingId: v.string(),
    unitKeys: v.array(v.string()),
    buyerId: v.string(),
    sellerId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const unitKey of args.unitKeys) {
      await ctx.db.insert("credentialDownloads", {
        orderNo: args.orderNo,
        listingId: args.listingId,
        unitKey,
        buyerId: args.buyerId as Id<"users">,
        sellerId: args.sellerId as Id<"users">,
        downloadedAt: now,
      });
    }
  },
});
