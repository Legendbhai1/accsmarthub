/**
 * The two withdrawal tiers, and the only copy of their numbers in the client.
 *
 * The authoritative rules live in `request_payout()` (migration 0019), which
 * derives the tier from the account's own store/admin state and refuses
 * anything outside it. This module exists so the UI can show the floor and the
 * fee *before* the user submits, and so the numbers are not restated inline in
 * two different pages. `tests/withdrawal_tiers.test.ts` pins these against the
 * SQL, because a floor that disagrees with the server is a form the user can
 * fill in and never submit.
 *
 *   approved seller / admin : withdraws EARNINGS, minimum $10, 1.0% fee
 *   everyone else           : withdraws DEPOSITS, minimum $20, 1.5% fee
 *
 * The fee is taken out of the requested amount: requesting $100 pays out $99.
 */

export type WithdrawalTier = {
  /** Which pool the money comes from. Matches `payout_requests.pool`. */
  pool: "spend" | "earn";
  /** Smallest amount that may be requested, in USD. */
  minimum: number;
  /** Platform fee, as a fraction of the requested amount. */
  feeRate: number;
  /** What the balance is called in copy, e.g. "sale proceeds". */
  balanceLabel: string;
};

export const SELLER_WITHDRAWAL: WithdrawalTier = {
  pool: "earn",
  minimum: 10,
  feeRate: 0.01,
  balanceLabel: "sale proceeds",
};

export const BUYER_WITHDRAWAL: WithdrawalTier = {
  pool: "spend",
  minimum: 20,
  feeRate: 0.015,
  balanceLabel: "deposited funds",
};

/**
 * The tier for an account. Only an approved store (or an administrator)
 * withdraws earnings; every other account withdraws what it deposited. This
 * mirrors the `v_is_seller` check in `request_payout()`.
 */
export function tierForRole(role: "buyer" | "seller" | "admin"): WithdrawalTier {
  return role === "buyer" ? BUYER_WITHDRAWAL : SELLER_WITHDRAWAL;
}

/** Splits a requested amount into the fee retained and the amount paid out. */
export function splitWithdrawal(
  amount: number,
  tier: WithdrawalTier,
): { fee: number; net: number } {
  const fee = Math.round(amount * tier.feeRate * 100) / 100;
  return { fee, net: Math.round((amount - fee) * 100) / 100 };
}

/** "1%" / "1.5%" — trailing zeros trimmed, so the copy reads naturally. */
export function formatFeeRate(rate: number): string {
  return `${Number((rate * 100).toFixed(2))}%`;
}
