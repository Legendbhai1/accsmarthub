import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BUYER_WITHDRAWAL,
  SELLER_WITHDRAWAL,
  formatFeeRate,
  splitWithdrawal,
  tierForRole,
} from "@/lib/withdrawalTiers";

/**
 * The withdrawal tiers are stated in three places — the SQL in migration 0019,
 * the client module the forms read, and the copy on the two pages. The SQL is
 * authoritative; these assertions exist so a change to the client numbers
 * cannot silently disagree with the server and turn the form into one the user
 * can fill in but never submit.
 *
 * This is the same class of bug as the dispute-reason vocabulary: two copies
 * of an enum that drifted, where the UI offered a value the database rejected.
 */
const root = process.cwd();
const migration = readFileSync(
  join(root, "supabase/migrations/0019_wallet_pools_and_withdrawals.sql"),
  "utf8",
);

describe("withdrawal tiers match the SQL that enforces them", () => {
  it("uses the seller tier — $10 floor, 1% fee, earnings pool", () => {
    expect(SELLER_WITHDRAWAL.minimum).toBe(10);
    expect(SELLER_WITHDRAWAL.feeRate).toBe(0.01);
    expect(SELLER_WITHDRAWAL.pool).toBe("earn");
  });

  it("uses the buyer tier — $20 floor, 1.5% fee, spendable pool", () => {
    expect(BUYER_WITHDRAWAL.minimum).toBe(20);
    expect(BUYER_WITHDRAWAL.feeRate).toBe(0.015);
    expect(BUYER_WITHDRAWAL.pool).toBe("spend");
  });

  it("the migration declares the same floors", () => {
    // `if v_is_seller then v_pool := 'earn'; v_min := 10; v_rate := 0.0100;`
    expect(migration).toMatch(/v_pool := 'earn';\s*v_min := 10;\s*v_rate := 0\.0100;/);
    expect(migration).toMatch(/v_pool := 'spend';\s*v_min := 20;\s*v_rate := 0\.0150;/);
  });

  it("the migration writes the pool and fee columns the client reads", () => {
    for (const column of ["pool", "fee_rate", "fee_usd", "net_usd"]) {
      expect(migration, `0019 should add payout_requests.${column}`).toContain(column);
    }
  });

  it("the migration splits the wallet into the two pools the client reads", () => {
    expect(migration).toContain("spendable_usd");
    expect(migration).toContain("earned_usd");
  });
});

describe("tier selection follows the account, not the page", () => {
  it("gives a buyer the deposit tier", () => {
    expect(tierForRole("buyer")).toBe(BUYER_WITHDRAWAL);
  });

  it("gives a seller and an admin the earnings tier", () => {
    expect(tierForRole("seller")).toBe(SELLER_WITHDRAWAL);
    expect(tierForRole("admin")).toBe(SELLER_WITHDRAWAL);
  });
});

describe("the fee is taken out of the requested amount", () => {
  it("retains 1% of a seller withdrawal", () => {
    expect(splitWithdrawal(100, SELLER_WITHDRAWAL)).toEqual({ fee: 1, net: 99 });
  });

  it("retains 1.5% of a buyer withdrawal", () => {
    expect(splitWithdrawal(200, BUYER_WITHDRAWAL)).toEqual({ fee: 3, net: 197 });
  });

  it("rounds to cents, matching the SQL's `round(..., 2)`", () => {
    // 12.34 * 1.5% = 0.1851 → 0.19
    expect(splitWithdrawal(12.34, BUYER_WITHDRAWAL)).toEqual({ fee: 0.19, net: 12.15 });
    // 10.00 * 1% = 0.10
    expect(splitWithdrawal(10, SELLER_WITHDRAWAL)).toEqual({ fee: 0.1, net: 9.9 });
  });

  it("never leaves a non-positive payout at or above the floor", () => {
    for (const tier of [SELLER_WITHDRAWAL, BUYER_WITHDRAWAL]) {
      expect(splitWithdrawal(tier.minimum, tier).net).toBeGreaterThan(0);
    }
  });

  it("formats the rate without trailing zeros", () => {
    expect(formatFeeRate(0.01)).toBe("1%");
    expect(formatFeeRate(0.015)).toBe("1.5%");
  });
});

describe("the admin pays the net, not the gross", () => {
  const root = process.cwd();
  const source = readFileSync(
    join(root, "src/pages/admin/AdminPayments.tsx"),
    "utf8",
  );

  it("tells the admin the amount actually to send", () => {
    // The fee is retained by the platform, so the amount to wire is the net.
    // The dialog used to name `amount` (the gross request), which would have
    // overpaid by the fee on every single payout.
    expect(source).toMatch(/Confirm you have sent \$\{formatPrice\(decision\?\.net/);
  });

  it("carries the net and fee into the decision, so the dialog can show them", () => {
    expect(source).toMatch(/net: p\.netUsd/);
    expect(source).toMatch(/fee: p\.feeUsd/);
  });
});
