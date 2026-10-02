import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  assertVerified,
  findOffPlatformContact,
  requireAccount,
  requireAdmin,
  slugify,
  storeAnswers,
} from "./lib";

/**
 * Seller store onboarding.
 *
 * A buyer account becomes a seller in two server-enforced steps:
 *   1. `submitStore` — the user answers the questions a buyer needs and
 *      uploads a logo. The store is written with status "pending".
 *   2. `approveStore` / `rejectStore` — an admin decides. Only after
 *      approval does `requireApprovedStore` let listings be created.
 */

export const myStore = query({
  args: {},
  handler: async (ctx) => {
    const account = await requireAccount(ctx);
    const store = await ctx.db
      .query("stores")
      .withIndex("by_user", (q) => q.eq("userId", account.id))
      .first();
    if (!store) return null;
    return {
      ...store,
      logoUrl: store.logoStorageId
        ? await ctx.storage.getUrl(store.logoStorageId)
        : null,
      bannerUrl: store.bannerStorageId
        ? await ctx.storage.getUrl(store.bannerStorageId)
        : null,
      answers: storeAnswers(store),
    };
  },
});

/** Public store card, used on listing pages to answer buyer questions. */
export const storeByUser = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const store = await ctx.db
      .query("stores")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!store || store.status !== "approved") return null;
    return {
      storeName: store.storeName,
      slug: store.slug,
      logoUrl: store.logoStorageId
        ? await ctx.storage.getUrl(store.logoStorageId)
        : null,
      answers: storeAnswers(store),
    };
  },
});

/** Admin approval queue. */
export const reviewQueue = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, { status }) => {
    const admin = await requireAdmin(ctx);
    void admin;
    const wanted = status as "pending" | "approved" | "rejected" | undefined;
    const stores = await ctx.db.query("stores").collect();
    const filtered = wanted
      ? stores.filter((s) => s.status === wanted)
      : stores;
    return await Promise.all(
      filtered
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(async (s) => ({
          _id: s._id,
          userId: s.userId,
          storeName: s.storeName,
          status: s.status,
          createdAt: s.createdAt,
          reviewedAt: s.reviewedAt ?? null,
          reviewNote: s.reviewNote ?? null,
          logoUrl: s.logoStorageId ? await ctx.storage.getUrl(s.logoStorageId) : null,
          answers: storeAnswers(s),
          sourcing: s.sourcing,
          contactPolicy: s.contactPolicy,
        })),
    );
  },
});

/** Issues a signed upload URL so the seller can attach a real logo file. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const account = await requireAccount(ctx);
    assertVerified(account);
    return ctx.storage.generateUploadUrl();
  },
});

/** Submit (or resubmit after a rejection) the store profile. */
export const submitStore = mutation({
  args: {
    storeName: v.string(),
    logoStorageId: v.optional(v.string()),
    bannerStorageId: v.optional(v.string()),
    platforms: v.array(v.string()),
    deliverySpeed: v.string(),
    accessFormat: v.string(),
    replacementPolicy: v.string(),
    restrictedRegions: v.string(),
    sourcing: v.string(),
    contactPolicyAccepted: v.boolean(),
  },
  handler: async (ctx, args) => {
    const account = await requireAccount(ctx);
    assertVerified(account);

    const storeName = args.storeName.trim();
    if (storeName.length < 3) throw new Error("Store name is too short.");
    const platforms = args.platforms.map((p) => p.trim()).filter(Boolean);
    if (platforms.length === 0) throw new Error("List at least one platform you sell.");

    // Sellers may not advertise off-platform contact in their own profile.
    const offending = [storeName, args.accessFormat, args.sourcing].map(
      findOffPlatformContact,
    ).find(Boolean);
    if (offending) {
      throw new Error(
        `Your store profile contains an ${offending}. Off-platform contact is not allowed — buyers must transact through AccsMartHub escrow.`,
      );
    }

    if (!args.contactPolicyAccepted) {
      throw new Error(
        "You must accept the no-off-platform-contact policy to open a store.",
      );
    }

    const answers = {
      platforms,
      deliverySpeed: args.deliverySpeed.trim(),
      accessFormat: args.accessFormat.trim(),
      replacementPolicy: args.replacementPolicy.trim(),
      restrictedRegions: args.restrictedRegions.trim(),
      sourcing: args.sourcing.trim(),
      contactPolicy: args.contactPolicyAccepted,
    };
    for (const [key, value] of Object.entries(answers)) {
      if (key === "platforms" || key === "contactPolicy") continue;
      if (!value || String(value).trim().length < 5) {
        throw new Error("Please answer every question in full.");
      }
    }

    const existing = await ctx.db
      .query("stores")
      .withIndex("by_user", (q) => q.eq("userId", account.id))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        storeName,
        slug: slugify(storeName),
        logoStorageId: args.logoStorageId ?? existing.logoStorageId,
        bannerStorageId: args.bannerStorageId ?? existing.bannerStorageId,
        ...answers,
        // Any edit sends the store back through review.
        status: "pending",
        createdAt: Date.now(),
        reviewedAt: undefined,
        reviewedBy: undefined,
        reviewNote: undefined,
      });
      return { status: "pending" as const };
    }

    await ctx.db.insert("stores", {
      userId: account.id,
      storeName,
      slug: slugify(storeName),
      logoStorageId: args.logoStorageId,
      bannerStorageId: args.bannerStorageId,
      ...answers,
      status: "pending",
      createdAt: Date.now(),
    });
    return { status: "pending" as const };
  },
});

export const approveStore = mutation({
  args: { storeId: v.id("stores"), note: v.optional(v.string()) },
  handler: async (ctx, { storeId, note }) => {
    const admin = await requireAdmin(ctx);
    const store = await ctx.db.get(storeId);
    if (!store) throw new Error("Store not found.");
    await ctx.db.patch(storeId, {
      status: "approved",
      reviewedAt: Date.now(),
      reviewedBy: admin.id,
      reviewNote: note?.trim() || undefined,
    });
    await ctx.db.insert("storeReviews", {
      storeId,
      adminId: admin.id,
      decision: "approved",
      note: note?.trim() || undefined,
      createdAt: Date.now(),
    });
    return { status: "approved" as const };
  },
});

export const rejectStore = mutation({
  args: { storeId: v.id("stores"), note: v.string() },
  handler: async (ctx, { storeId, note }) => {
    const admin = await requireAdmin(ctx);
    if (!note.trim()) throw new Error("Tell the applicant what to fix.");
    const store = await ctx.db.get(storeId);
    if (!store) throw new Error("Store not found.");
    await ctx.db.patch(storeId, {
      status: "rejected",
      reviewedAt: Date.now(),
      reviewedBy: admin.id,
      reviewNote: note.trim(),
    });
    await ctx.db.insert("storeReviews", {
      storeId,
      adminId: admin.id,
      decision: "rejected",
      note: note.trim(),
      createdAt: Date.now(),
    });
    // A rejected store must not keep live listings selling.
    const listings = await ctx.db
      .query("listingStock")
      .withIndex("by_seller", (q) => q.eq("sellerId", store.userId))
      .collect();
    for (const listing of listings) {
      if (listing.status !== "paused") {
        await ctx.db.patch(listing._id, { status: "paused", updatedAt: Date.now() });
      }
    }
    return { status: "rejected" as const };
  },
});