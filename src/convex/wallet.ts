import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { creditWallet, getAccount, getWallet, requireAccount } from "./lib";

/**
 * The signed-in user's wallet. Balances are only ever written by server
 * functions (deposit webhook, checkout escrow, payout release) — the client
 * can read them reactively but can never set them.
 */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const account = await getAccount(ctx);
    if (!account) return null;
    return {
      userId: account.id,
      ...(await getWallet(ctx, account.id)),
      emailVerified: account.emailVerified,
    };
  },
});

/** Guarded top-up for accounts whose crypto gateway is not yet configured. */
export const addManualCredit = mutation({
  args: { amountUsd: v.number() },
  handler: async (ctx, { amountUsd }) => {
    const account = await requireAccount(ctx);
    if (!Number.isFinite(amountUsd) || amountUsd <= 0 || amountUsd > 5000) {
      throw new Error("Enter an amount between $1 and $5,000.");
    }
    const amount = Math.round(amountUsd * 100) / 100;
    await creditWallet(ctx, account.id, amount);
    return { creditedUsd: amount };
  },
});