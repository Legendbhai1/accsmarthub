import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

/** Store lifecycle: drafted → pending review → approved (can list) / rejected. */
export const storeStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
);

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // OxaPay wallet top-ups (buyers only)
    deposits: defineTable({
      trackId: v.string(), // OxaPay track id
      userId: v.string(),
      amountUsd: v.number(),
      email: v.optional(v.string()),
      status: v.union(v.literal("pending"), v.literal("paid")),
      createdAt: v.number(),
      paidAt: v.optional(v.number()),
    }).index("by_track", ["trackId"]),

    /* ------------------------------------------------------------------ *
     * Marketplace core. Everything below is server-authoritative: the
     * browser never supplies a price, a stock count or a commission.
     * ------------------------------------------------------------------ */

    // One row per account. A single account buys AND sells.
    wallets: defineTable({
      userId: v.string(),
      balanceUsd: v.number(), // spendable (buyer side)
      lockedUsd: v.number(), // held in escrow until the buyer confirms
      updatedAt: v.number(),
    }).index("by_user", ["userId"]),

    /**
     * Seller store profile, created when the user submits their answers.
     * Listing creation stays locked until an admin flips `status` to
     * "approved".
     */
    stores: defineTable({
      userId: v.string(),
      storeName: v.string(),
      slug: v.string(),
      logoStorageId: v.optional(v.string()),
      bannerStorageId: v.optional(v.string()),
      /** Required questions a buyer must know before purchasing. */
      platforms: v.array(v.string()),
      deliverySpeed: v.string(), // e.g. "Within 30 minutes"
      accessFormat: v.string(), // how the account is handed over
      replacementPolicy: v.string(), // warranty window
      restrictedRegions: v.string(), // where you cannot deliver
      sourcing: v.string(), // where the inventory comes from
      contactPolicy: v.boolean(), // seller accepted the no-off-platform-contact rule
      status: storeStatusValidator,
      createdAt: v.number(),
      reviewedAt: v.optional(v.number()),
      reviewedBy: v.optional(v.string()),
      reviewNote: v.optional(v.string()),
    })
      .index("by_user", ["userId"])
      .index("by_status", ["status"])
      .index("by_slug", ["slug"]),

    // Append-only audit trail of admin store decisions.
    storeReviews: defineTable({
      storeId: v.id("stores"),
      adminId: v.string(),
      decision: v.union(v.literal("approved"), v.literal("rejected")),
      note: v.optional(v.string()),
      createdAt: v.number(),
    }).index("by_store", ["storeId"]),

    /**
     * The single source of truth for inventory. Keyed by the catalogue
     * listing id so the demo catalogue keeps rendering while stock numbers
     * come from the server.
     */
    listingStock: defineTable({
      listingId: v.string(),
      sellerId: v.string(),
      storeId: v.optional(v.id("stores")),
      title: v.string(),
      brand: v.string(),
      priceUsd: v.number(),
      stock: v.number(),
      status: v.union(
        v.literal("pending"),
        v.literal("active"),
        v.literal("paused"),
        v.literal("sold"),
      ),
      updatedAt: v.number(),
    })
      .index("by_listing", ["listingId"])
      .index("by_seller", ["sellerId"]),

    /** Orders record the full money split so the 10% fee is auditable. */
    orders: defineTable({
      orderNo: v.string(),
      listingId: v.string(),
      listingTitle: v.string(),
      brand: v.string(),
      buyerId: v.string(),
      sellerId: v.string(),
      quantity: v.number(),
      unitPriceUsd: v.number(),
      grossAmount: v.number(), // unit price × quantity
      escrowFeeUsd: v.number(), // buyer-paid protection fee
      totalUsd: v.number(), // gross + escrow fee (what the buyer paid)
      commissionRate: v.number(), // 0.1
      commissionAmount: v.number(), // 10% of gross, kept by the platform
      sellerNetAmount: v.number(), // gross − commission, paid to the seller
      paymentMethod: v.string(),
      status: v.union(
        v.literal("in_escrow"),
        v.literal("transferring"),
        v.literal("completed"),
        v.literal("disputed"),
        v.literal("refunded"),
      ),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_no", ["orderNo"])
      .index("by_buyer", ["buyerId"])
      .index("by_seller", ["sellerId"]),

    /**
     * Off-platform contact is a marketplace-wide violation: sellers may not
     * share phone numbers, emails, Telegram/WhatsApp handles or move a deal
     * outside escrow. Buyers report it, admins enforce it.
     */
    offPlatformReports: defineTable({
      orderId: v.optional(v.string()),
      listingId: v.optional(v.string()),
      reporterId: v.string(),
      reportedUserId: v.optional(v.string()),
      reason: v.union(
        v.literal("shared_contact"),
        v.literal("payment_offsite"),
        v.literal("refused_escrow"),
        v.literal("impersonation"),
        v.literal("other"),
      ),
      detail: v.string(),
      status: v.union(
        v.literal("open"),
        v.literal("reviewing"),
        v.literal("resolved"),
        v.literal("dismissed"),
      ),
      penalty: v.optional(v.string()),
      createdAt: v.number(),
      resolvedAt: v.optional(v.number()),
    })
      .index("by_status", ["status"])
      .index("by_reported", ["reportedUserId"]),

    // add other tables here

    // tableName: defineTable({
    //   ...
    //   // table fields
    // }).index("by_field", ["field"])
  },
  {
    schemaValidation: false,
  },
);

export default schema;