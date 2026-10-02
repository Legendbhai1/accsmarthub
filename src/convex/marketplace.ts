import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  assertVerified,
  ESCROW_FEE_RATE,
  money,
  lockFunds,
  PLATFORM_COMMISSION_RATE,
  releaseEscrow,
  requireAccount,
  requireAdmin,
  requireApprovedStore,
} from "./lib";

/**
 * The marketplace ledger.
 *
 * Prices, stock and commission are decided here. The client sends only
 * "which listing" and "how many" — never a price, never a stock count and
 * never a fee. Stock is decremented inside the same transaction that writes
 * the order, so two buyers can never claim the same unit.
 */

/** Reads live stock + price for the listings currently on screen. */
export const liveStock = query({
  args: { listingIds: v.array(v.string()) },
  handler: async (ctx, { listingIds }) => {
    const rows = await Promise.all(
      listingIds.map(async (listingId) => {
        const row = await ctx.db
          .query("listingStock")
          .withIndex("by_listing", (q) => q.eq("listingId", listingId))
          .unique();
        return row
          ? {
              listingId,
              stock: row.stock,
              priceUsd: row.priceUsd,
              status: row.status,
              sellerId: row.sellerId,
            }
          : null;
      }),
    );
    const out: Record<
      string,
      { stock: number; priceUsd: number; status: string; sellerId: string }
    > = {};
    for (const row of rows) {
      if (row) out[row.listingId] = row;
    }
    return out;
  },
});

export const sellerListings = query({
  args: {},
  handler: async (ctx) => {
    const account = await requireAccount(ctx);
    const rows = await ctx.db
      .query("listingStock")
      .withIndex("by_seller", (q) => q.eq("sellerId", account.id))
      .collect();
    return rows.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

/**
 * Publishes a catalogue listing into the ledger. Blocked until the seller's
 * store has been approved by an admin.
 */
export const publishListing = mutation({
  args: {
    listingId: v.string(),
    title: v.string(),
    brand: v.string(),
    priceUsd: v.number(),
    stock: v.number(),
  },
  handler: async (ctx, args) => {
    const account = await requireAccount(ctx);
    assertVerified(account);
    const store = await requireApprovedStore(ctx, account.id);

    if (!args.title.trim()) throw new Error("Listing title is required.");
    if (!(args.priceUsd > 0)) throw new Error("Price must be greater than zero.");
    const stock = Math.floor(args.stock);
    if (!Number.isFinite(stock) || stock < 0) throw new Error("Stock cannot be negative.");

    const existing = await ctx.db
      .query("listingStock")
      .withIndex("by_listing", (q) => q.eq("listingId", args.listingId))
      .unique();
    if (existing && existing.sellerId !== account.id) {
      throw new Error("You do not own this listing.");
    }
    if (existing) {
      await ctx.db.patch(existing._id, {
        title: args.title.trim(),
        brand: args.brand,
        priceUsd: money(args.priceUsd),
        stock,
        // Editing an approved listing sends it back through moderation.
        status: existing.status === "paused" ? "paused" : "pending",
        updatedAt: Date.now(),
      });
      return { listingId: args.listingId, stock, pendingReview: true };
    }

    await ctx.db.insert("listingStock", {
      listingId: args.listingId,
      sellerId: account.id,
      storeId: store._id,
      title: args.title.trim(),
      brand: args.brand,
      priceUsd: money(args.priceUsd),
      stock,
      status: "pending",
      updatedAt: Date.now(),
    });
    return { listingId: args.listingId, stock, pendingReview: false };
  },
});

/** Seller restocking: adds or removes units of their own listing. */
export const adjustStock = mutation({
  args: { listingId: v.string(), delta: v.number() },
  handler: async (ctx, { listingId, delta }) => {
    const account = await requireAccount(ctx);
    await requireApprovedStore(ctx, account.id);
    const row = await ctx.db
      .query("listingStock")
      .withIndex("by_listing", (q) => q.eq("listingId", listingId))
      .unique();
    if (!row) throw new Error("Listing not found.");
    if (row.sellerId !== account.id) throw new Error("You do not own this listing.");

    const next = Math.max(0, row.stock + Math.trunc(delta));
    await ctx.db.patch(row._id, {
      stock: next,
      // Restocking a sold-out listing brings it back; empty means sold out.
      status: next > 0 && row.status === "sold" ? "active" : next <= 0 ? "sold" : row.status,
      updatedAt: Date.now(),
    });
    return { stock: next, status: next > 0 && row.status === "sold" ? "active" : next <= 0 ? "sold" : row.status };
  },
});

export const setStock = mutation({
  args: { listingId: v.string(), stock: v.number() },
  handler: async (ctx, { listingId, stock }) => {
    const account = await requireAccount(ctx);
    await requireApprovedStore(ctx, account.id);
    const row = await ctx.db
      .query("listingStock")
      .withIndex("by_listing", (q) => q.eq("listingId", listingId))
      .unique();
    if (!row) throw new Error("Listing not found.");
    if (row.sellerId !== account.id) throw new Error("You do not own this listing.");
    const next = Math.max(0, Math.floor(stock));
    await ctx.db.patch(row._id, {
      stock: next,
      status: next > 0 && row.status === "sold" ? "active" : next <= 0 ? "sold" : row.status,
      updatedAt: Date.now(),
    });
    return { stock: next };
  },
});

export const setListingStatus = mutation({
  args: { listingId: v.string(), status: v.union(v.literal("active"), v.literal("paused")) },
  handler: async (ctx, { listingId, status }) => {
    const account = await requireAccount(ctx);
    const row = await ctx.db
      .query("listingStock")
      .withIndex("by_listing", (q) => q.eq("listingId", listingId))
      .unique();
    if (!row) throw new Error("Listing not found.");
    if (row.sellerId !== account.id) throw new Error("You do not own this listing.");
    if (status === "active" && row.stock <= 0) {
      throw new Error("Add stock before activating this listing.");
    }
    await ctx.db.patch(row._id, { status, updatedAt: Date.now() });
    return { status };
  },
});

/**
 * Checkout. One transaction: validate stock → charge buyer → reserve units →
 * record the order with its 10% commission split.
 */
export const placeOrder = mutation({
  args: {
    listingId: v.string(),
    quantity: v.number(),
    paymentMethod: v.union(v.literal("wallet"), v.literal("card"), v.literal("bank")),
  },
  handler: async (ctx, { listingId, quantity, paymentMethod }) => {
    const account = await requireAccount(ctx);
    assertVerified(account);

    const qty = Math.floor(quantity);
    if (!Number.isFinite(qty) || qty < 1) throw new Error("Quantity must be at least 1.");

    const listing = await ctx.db
      .query("listingStock")
      .withIndex("by_listing", (q) => q.eq("listingId", listingId))
      .unique();
    if (!listing) throw new Error("This listing is not available.");
    if (listing.status !== "active") {
      throw new Error(
        listing.status === "pending"
          ? "This listing is still awaiting moderation."
          : "This listing is not available.",
      );
    }
    if (listing.sellerId === account.id) {
      throw new Error("You cannot buy your own listing.");
    }
    if (listing.stock < qty) {
      throw new Error(
        listing.stock === 0
          ? "This listing just sold out"
          : `Only ${listing.stock} left in stock`,
      );
    }

    // Server-side money math — the client's price is ignored entirely.
    const unitPriceUsd = listing.priceUsd;
    const grossAmount = money(unitPriceUsd * qty);
    const escrowFeeUsd = money(grossAmount * ESCROW_FEE_RATE);
    const totalUsd = money(grossAmount + escrowFeeUsd);
    const commissionAmount = money(grossAmount * PLATFORM_COMMISSION_RATE);
    const sellerNetAmount = money(grossAmount - commissionAmount);

    if (paymentMethod === "wallet") {
      await lockFunds(ctx, account.id, totalUsd);
    }

    const remaining = listing.stock - qty;
    await ctx.db.patch(listing._id, {
      stock: remaining,
      status: remaining <= 0 ? "sold" : listing.status,
      updatedAt: Date.now(),
    });

    const orderNo = `AMH-${Date.now().toString(36).toUpperCase()}-${Math.floor(
      1000 + Math.random() * 9000,
    )}`;
    const orderId = await ctx.db.insert("orders", {
      orderNo,
      listingId: listing.listingId,
      listingTitle: listing.title,
      brand: listing.brand,
      buyerId: account.id,
      sellerId: listing.sellerId,
      quantity: qty,
      unitPriceUsd,
      grossAmount,
      escrowFeeUsd,
      totalUsd,
      commissionRate: PLATFORM_COMMISSION_RATE,
      commissionAmount,
      sellerNetAmount,
      paymentMethod,
      status: "in_escrow",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const order = await ctx.db.get(orderId);
    return {
      orderId,
      orderNo,
      quantity: qty,
      unitPriceUsd,
      grossAmount,
      escrowFeeUsd,
      totalUsd,
      commissionRate: PLATFORM_COMMISSION_RATE,
      commissionAmount,
      sellerNetAmount,
      status: order?.status ?? "in_escrow",
      remainingStock: remaining,
    };
  },
});

export const getOrder = query({
  args: { orderNo: v.string() },
  handler: async (ctx, { orderNo }) => {
    const account = await requireAccount(ctx);
    const order = await ctx.db
      .query("orders")
      .withIndex("by_no", (q) => q.eq("orderNo", orderNo))
      .unique();
    if (!order) return null;
    if (order.buyerId !== account.id && order.sellerId !== account.id && !account.isAdmin) {
      throw new Error("You cannot view this order.");
    }
    return order;
  },
});

export const myOrders = query({
  args: {},
  handler: async (ctx) => {
    const account = await requireAccount(ctx);
    const rows = await ctx.db
      .query("orders")
      .withIndex("by_buyer", (q) => q.eq("buyerId", account.id))
      .collect();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const salesOrders = query({
  args: {},
  handler: async (ctx) => {
    const account = await requireAccount(ctx);
    const rows = await ctx.db
      .query("orders")
      .withIndex("by_seller", (q) => q.eq("sellerId", account.id))
      .collect();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Gross / 10% commission / net, all derived from the order ledger. */
export const earningsSummary = query({
  args: {},
  handler: async (ctx) => {
    const account = await requireAccount(ctx);
    const rows = await ctx.db
      .query("orders")
      .withIndex("by_seller", (q) => q.eq("sellerId", account.id))
      .collect();
    let gross = 0;
    let commission = 0;
    let net = 0;
    let escrow = 0;
    for (const o of rows) {
      if (o.status === "in_escrow" || o.status === "transferring" || o.status === "disputed") {
        escrow += o.grossAmount;
        continue;
      }
      if (o.status === "completed") {
        gross += o.grossAmount;
        commission += o.commissionAmount;
        net += o.sellerNetAmount;
      }
    }
    return {
      commissionRate: PLATFORM_COMMISSION_RATE,
      grossUsd: money(gross),
      commissionUsd: money(commission),
      netUsd: money(net),
      escrowUsd: money(escrow),
      completedCount: rows.filter((o) => o.status === "completed").length,
    };
  },
});

/** Buyer confirms the transfer: escrow is released and the seller is paid. */
export const completeOrder = mutation({
  args: { orderNo: v.string() },
  handler: async (ctx, { orderNo }) => {
    const account = await requireAccount(ctx);
    const order = await ctx.db
      .query("orders")
      .withIndex("by_no", (q) => q.eq("orderNo", orderNo))
      .unique();
    if (!order) throw new Error("Order not found.");
    if (order.buyerId !== account.id) throw new Error("Only the buyer can confirm this order.");
    if (order.status === "completed") return { status: "completed" as const };
    if (order.status === "refunded") throw new Error("This order was refunded.");

    await releaseEscrow(ctx, order.buyerId, order.sellerId, order.totalUsd, order.sellerNetAmount);
    await ctx.db.patch(order._id, { status: "completed", updatedAt: Date.now() });
    return { status: "completed" as const };
  },
});

/** Admin moderation of newly published listings. */
export const moderateListing = mutation({
  args: { listingId: v.string(), action: v.union(v.literal("approve"), v.literal("pause")) },
  handler: async (ctx, { listingId, action }) => {
    await requireAdmin(ctx);
    const row = await ctx.db
      .query("listingStock")
      .withIndex("by_listing", (q) => q.eq("listingId", listingId))
      .unique();
    if (!row) throw new Error("Listing not found.");
    if (action === "approve") {
      if (row.stock <= 0) throw new Error("Cannot publish a listing with no stock.");
      await ctx.db.patch(row._id, { status: "active", updatedAt: Date.now() });
      return { status: "active" as const };
    }
    await ctx.db.patch(row._id, { status: "paused", updatedAt: Date.now() });
    return { status: "paused" as const };
  },
});

export const allOrders = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("orders").collect();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});