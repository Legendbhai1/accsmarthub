import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";
import { getAccount } from "./lib";

/**
 * Get the current signed in user. Returns null if the user is not signed in.
 * Usage: const signedInUser = await ctx.runQuery(api.authHelpers.currentUser);
 * THIS FUNCTION IS READ-ONLY. DO NOT MODIFY.
 */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    return await ctx.db.get(userId);
  },
});

/**
 * Everything the client session needs in one round trip: identity, admin
 * flag, email-verification state and whether the seller's store is approved.
 */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const account = await getAccount(ctx);
    if (!account) return null;
    const store = await ctx.db
      .query("stores")
      .withIndex("by_user", (q) => q.eq("userId", account.id))
      .first();
    return {
      id: account.id,
      name: account.name,
      email: account.email,
      isAdmin: account.isAdmin,
      emailVerified: account.emailVerified,
      storeStatus: store?.status ?? null,
      storeName: store?.storeName ?? null,
    };
  },
});