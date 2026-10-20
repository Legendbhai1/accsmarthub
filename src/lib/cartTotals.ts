/**
 * The buyer-facing money maths, in one place.
 *
 * These rates are a mirror of the ones the server applies — `0001_core.sql`,
 * `0008_listing_first_publishing.sql` and `0009_buying_to_delivery_lifecycle.sql`
 * all charge a 3% buyer protection fee and take a 10% commission out of the
 * seller's side. The client is only allowed to *display* a total; the RPC
 * recomputes it from the listing rows and is the authority. This module exists
 * so the number on screen is computed once, in one place, and can be checked
 * against the SQL rather than being re-derived per component.
 */
export const BUYER_FEE_RATE = 0.03;
export const COMMISSION_RATE = 0.1;

export type CartTotalsInput = { unitPriceUsd: number; quantity: number };

export type CartTotals = {
  subtotalUsd: number;
  /** The buyer protection fee the buyer pays on top of the subtotal. */
  buyerFeeUsd: number;
  /** What the buyer is charged. */
  totalUsd: number;
  /** Commission withheld from the seller's side — never added to the total. */
  commissionUsd: number;
  /** What the seller receives once the order completes. */
  sellerNetUsd: number;
};

/** Rounds to cents the way the SQL's `round(x, 2)` does. */
const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * Totals for a set of cart lines.
 *
 * Rounds the subtotal to cents before applying the rate, matching the server,
 * which sums `numeric(12,2)` line amounts and then rounds the fee. Doing it in
 * the other order drifts by a cent on long carts and makes the displayed total
 * disagree with the charge.
 */
export function cartTotals(lines: readonly CartTotalsInput[]): CartTotals {
  const subtotalUsd = cents(
    lines.reduce((sum, line) => sum + line.unitPriceUsd * line.quantity, 0),
  );
  const buyerFeeUsd = cents(subtotalUsd * BUYER_FEE_RATE);
  const commissionUsd = cents(subtotalUsd * COMMISSION_RATE);
  return {
    subtotalUsd,
    buyerFeeUsd,
    totalUsd: cents(subtotalUsd + buyerFeeUsd),
    commissionUsd,
    sellerNetUsd: cents(subtotalUsd - commissionUsd),
  };
}
