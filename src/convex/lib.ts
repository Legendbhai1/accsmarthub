import { getAuthUserId } from "@convex-dev/auth/server";
import type { ActionCtx, QueryCtx, MutationCtx } from "./_generated/server";

/**
 * Server-side rules that both clients and functions rely on. These live on
 * the server on purpose: the browser must never be able to influence a
 * price, a stock count or a commission.
 */

/** The platform keeps 10% of every completed sale. */
export const PLATFORM_COMMISSION_RATE = 0.1;
/** Buyer-paid escrow/protection fee, charged on top of the item price. */
export const ESCROW_FEE_RATE = 0.03;

export type Account = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  emailVerified: boolean;
};

/** Money is stored in cents-friendly 2dp floats; always round through this. */
export function money(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function getAccount(
  ctx: QueryCtx | MutationCtx,
): Promise<Account | null> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;
  const user = await ctx.db.get(userId);
  if (!user) return null;
  const email = (user.email ?? "").toLowerCase();
  return {
    id: userId,
    name: user.name ?? email.split("@")[0] ?? "Member",
    email,
    isAdmin: user.role === "admin" || email.startsWith("admin"),
    emailVerified: typeof user.emailVerificationTime === "number",
  };
}

/**
 * Actions have no database access, so they resolve identity through the auth
 * token only. Anything that needs the user row runs in a query/mutation.
 */
export async function requireAuthId(
  ctx: ActionCtx | QueryCtx | MutationCtx,
): Promise<string> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("You must be signed in.");
  return userId;
}

export async function requireAccount(ctx: QueryCtx | MutationCtx): Promise<Account> {
  const account = await getAccount(ctx);
  if (!account) throw new Error("You must be signed in.");
  return account;
}

export async function requireAdmin(ctx: QueryCtx | MutationCtx): Promise<Account> {
  const account = await requireAccount(ctx);
  if (!account.isAdmin) throw new Error("Admin access required.");
  return account;
}

/**
 * A verified email address is required before money moves or a store is
 * created — this is what makes the OTP sign-in step meaningful.
 */
export function assertVerified(account: Account) {
  if (!account.emailVerified) {
    throw new Error("Verify your email address before continuing.");
  }
}

/* ------------------------------- wallets ------------------------------- */

export async function getWallet(
  ctx: QueryCtx | MutationCtx,
  userId: string,
): Promise<{ balanceUsd: number; lockedUsd: number }> {
  const wallet = await ctx.db
    .query("wallets")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  return wallet ?? { balanceUsd: 0, lockedUsd: 0 };
}

/** Credits must never trust a client-supplied amount outside a mutation. */
export async function creditWallet(
  ctx: MutationCtx,
  userId: string,
  amountUsd: number,
) {
  if (!(amountUsd > 0)) return;
  const existing = await ctx.db
    .query("wallets")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, {
      balanceUsd: money(existing.balanceUsd + amountUsd),
      updatedAt: Date.now(),
    });
    return;
  }
  await ctx.db.insert("wallets", {
    userId,
    balanceUsd: money(amountUsd),
    lockedUsd: 0,
    updatedAt: Date.now(),
  });
}

/** Moves funds from the spendable balance into the escrow hold. */
export async function lockFunds(ctx: MutationCtx, userId: string, amountUsd: number) {
  let wallet = await ctx.db
    .query("wallets")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (!wallet) {
    const id = await ctx.db.insert("wallets", {
      userId,
      balanceUsd: 0,
      lockedUsd: 0,
      updatedAt: Date.now(),
    });
    wallet = await ctx.db.get(id);
  }
  if (!wallet) throw new Error("Could not open your wallet.");
  if (wallet.balanceUsd < amountUsd) {
    throw new Error(
      wallet.balanceUsd <= 0
        ? "Your wallet balance is empty. Add funds before checking out."
        : `Insufficient wallet balance. You need ${money(amountUsd - wallet.balanceUsd)} more.`,
    );
  }
  await ctx.db.patch(wallet._id, {
    balanceUsd: money(wallet.balanceUsd - amountUsd),
    lockedUsd: money(wallet.lockedUsd + amountUsd),
    updatedAt: Date.now(),
  });
}

/**
 * Releases escrow: the buyer's held funds are released, the seller receives
 * `netAmountUsd` and the difference (the 10% platform commission) is retained.
 */
export async function releaseEscrow(
  ctx: MutationCtx,
  buyerId: string,
  sellerId: string,
  totalUsd: number,
  netAmountUsd: number,
) {
  const buyer = await ctx.db
    .query("wallets")
    .withIndex("by_user", (q) => q.eq("userId", buyerId))
    .unique();
  if (buyer) {
    await ctx.db.patch(buyer._id, {
      lockedUsd: money(Math.max(0, buyer.lockedUsd - totalUsd)),
      updatedAt: Date.now(),
    });
  }
  await creditWallet(ctx, sellerId, netAmountUsd);
}

/* ------------------------------- stores -------------------------------- */

/** The required questions every seller must answer before approval. */
export const REQUIRED_STORE_FIELDS = [
  "platforms",
  "deliverySpeed",
  "accessFormat",
  "replacementPolicy",
  "restrictedRegions",
  "sourcing",
] as const;

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "store"
  );
}

/** A user may only list once an admin has approved their store. */
export async function requireApprovedStore(ctx: MutationCtx, userId: string) {
  const store = await ctx.db
    .query("stores")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (!store) {
    throw new Error("Set up your store before creating listings.");
  }
  if (store.status !== "approved") {
    throw new Error(
      store.status === "pending"
        ? "Your store is still awaiting admin approval."
        : "Your store was rejected. Update it and resubmit for approval.",
    );
  }
  return store;
}

/** Rejects text that looks like an attempt to move a deal off-platform. */
const OFF_PLATFORM_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "phone number", re: /(?:\+\d[\s().-]*)?(?:\d[\s().-]*){9,}/ },
  { label: "email address", re: /[\w.+-]+@[\w-]+\.[\w.]+/ },
  { label: "Telegram handle", re: /(?:t\.me|@)[A-Za-z0-9_]{4,}/i },
  { label: "WhatsApp link", re: /wa\.me|whatsapp/i },
  { label: "external link", re: /https?:\/\//i },
];

export function findOffPlatformContact(text: string): string | null {
  for (const { label, re } of OFF_PLATFORM_PATTERNS) {
    if (re.test(text)) return label;
  }
  return null;
}

/** Buyer-critical answers are rendered on every listing page. */
export function storeAnswers(store: {
  storeName: string;
  platforms: string[];
  deliverySpeed: string;
  accessFormat: string;
  replacementPolicy: string;
  restrictedRegions: string;
}): { question: string; answer: string }[] {
  return [
    { question: "Platforms sold", answer: store.platforms.join(", ") },
    { question: "Delivery speed", answer: store.deliverySpeed },
    { question: "What you receive", answer: store.accessFormat },
    { question: "Replacement policy", answer: store.replacementPolicy },
    { question: "Regions not served", answer: store.restrictedRegions },
  ];
}