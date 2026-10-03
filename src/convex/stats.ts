import { query } from "./_generated/server";
import { money, requireAdmin } from "./lib";

/**
 * Platform totals for the admin overview.
 *
 * Every number here is counted from the real ledger — orders, listings,
 * wallets, stores and reports. Nothing is seeded or estimated, so an empty
 * platform correctly shows zeros rather than impressive-looking fiction.
 */
export const platformStats = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const [orders, listings, wallets, stores, reports, users] = await Promise.all([
      ctx.db.query("orders").collect(),
      ctx.db.query("listingStock").collect(),
      ctx.db.query("wallets").collect(),
      ctx.db.query("stores").collect(),
      ctx.db.query("offPlatformReports").collect(),
      ctx.db.query("users").collect(),
    ]);

    let grossVolumeUsd = 0;
    let commissionUsd = 0;
    let escrowHeldUsd = 0;
    let completedCount = 0;
    for (const order of orders) {
      grossVolumeUsd += order.grossAmount;
      commissionUsd += order.commissionAmount;
      if (order.status === "completed") completedCount += 1;
      // Still in escrow: the buyer's funds are locked until they confirm.
      if (order.status === "in_escrow" || order.status === "transferring" || order.status === "disputed") {
        escrowHeldUsd += order.totalUsd;
      }
    }

    let walletLiabilityUsd = 0;
    let walletLockedUsd = 0;
    for (const wallet of wallets) {
      walletLiabilityUsd += wallet.balanceUsd;
      walletLockedUsd += wallet.lockedUsd;
    }

    return {
      orderCount: orders.length,
      completedCount,
      grossVolumeUsd: money(grossVolumeUsd),
      commissionUsd: money(commissionUsd),
      escrowHeldUsd: money(escrowHeldUsd),
      walletBalanceUsd: money(walletLiabilityUsd),
      walletLockedUsd: money(walletLockedUsd),
      listingCount: listings.length,
      activeListingCount: listings.filter((l) => l.status === "active").length,
      pendingListingCount: listings.filter((l) => l.status === "pending").length,
      userCount: users.length,
      storeCount: stores.length,
      approvedStoreCount: stores.filter((s) => s.status === "approved").length,
      pendingStoreCount: stores.filter((s) => s.status === "pending").length,
      openReportCount: reports.filter((r) => r.status === "open" || r.status === "reviewing").length,
      openDisputeCount: orders.filter((o) => o.status === "disputed").length,
    };
  },
});
