/**
 * The canonical dispute-reason vocabulary, in one place.
 *
 * `disputes.reason` is constrained by migration 0013 to the snake_case set
 * below, and `open_dispute()` validates against the same set before it writes.
 * The UI must therefore send a canonical value — never the human-readable
 * label. The two lists are kept side by side so a label can never drift into
 * the database again, which is exactly what happened when the select rendered
 * "Not as described" and posted it verbatim as `p_reason`.
 *
 * The set mirrors `public.dispute_reasons()` (0013), which is the database's
 * own copy of the same list. Keep the two in step: a value accepted here but
 * missing there is rejected by the RPC with "Invalid dispute reason".
 */

export const DISPUTE_REASONS = [
  "not_as_described",
  "transfer_failed",
  "seller_unresponsive",
  "item_not_received",
  "other",
] as const;

export type DisputeReason = (typeof DISPUTE_REASONS)[number];

/** Labels are display-only and are never written to the database. */
export const DISPUTE_REASON_LABELS: Record<DisputeReason, string> = {
  not_as_described: "Not as described",
  transfer_failed: "Transfer failed",
  seller_unresponsive: "Seller unresponsive",
  item_not_received: "Item not received",
  other: "Other",
};

/** Options for a `<select>`, value first so the canonical value is what posts. */
export const DISPUTE_REASON_OPTIONS = DISPUTE_REASONS.map((value) => ({
  value,
  label: DISPUTE_REASON_LABELS[value],
}));

export function isDisputeReason(value: unknown): value is DisputeReason {
  return (
    typeof value === "string" &&
    (DISPUTE_REASONS as readonly string[]).includes(value)
  );
}

/**
 * Renders a stored reason for display. Rows written before 0013 pinned the
 * vocabulary may hold a label ("Not as described") or an unrecognised string;
 * those are shown as-is rather than hidden, so an admin can still see what the
 * buyer originally chose.
 */
export function disputeReasonLabel(value: string): string {
  return isDisputeReason(value) ? DISPUTE_REASON_LABELS[value] : value;
}
