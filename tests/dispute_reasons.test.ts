import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DISPUTE_REASONS,
  DISPUTE_REASON_LABELS,
  DISPUTE_REASON_OPTIONS,
  disputeReasonLabel,
  isDisputeReason,
} from "@/lib/disputeReasons";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

/**
 * The bug this locks down: the buyer UI rendered its own human labels
 * ("Not as described") and posted the selected label straight into
 * `open_dispute(p_reason := ...)`, which only accepts snake_case. Every
 * dispute opened from the UI failed with "Invalid dispute reason" (P0001).
 *
 * These tests tie the three copies of the vocabulary together so they cannot
 * drift again: the UI module, the `open_dispute` RPC, and the
 * `disputes_reason_check` constraint in migration 0013.
 */

/** The canonical set as the RPC's own guard lists it. */
function rpcVocabulary(): string[] {
  const sql = read("supabase/migrations/0013_reconcile_marketplace.sql");
  const guard = sql.match(
    /if p_reason not in \(([^)]*)\) then[\s\S]*?Invalid dispute reason/,
  );
  if (!guard) throw new Error("could not find the open_dispute reason guard in 0013");
  return [...guard[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

/** The canonical set as the CHECK constraint lists it. */
function constraintVocabulary(): string[] {
  const sql = read("supabase/migrations/0013_reconcile_marketplace.sql");
  const check = sql.match(
    /add constraint disputes_reason_check check \(reason in\s*\(([\s\S]*?)\)\);/,
  );
  if (!check) throw new Error("could not find disputes_reason_check in 0013");
  return [...check[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

describe("the UI vocabulary is the canonical vocabulary", () => {
  it("every UI option value is accepted by open_dispute()", () => {
    const rpc = rpcVocabulary();
    for (const { value } of DISPUTE_REASON_OPTIONS) {
      expect(rpc, `open_dispute would reject "${value}"`).toContain(value);
    }
  });

  it("every UI option value satisfies disputes_reason_check", () => {
    const constraint = constraintVocabulary();
    for (const { value } of DISPUTE_REASON_OPTIONS) {
      expect(constraint, `disputes_reason_check would reject "${value}"`).toContain(
        value,
      );
    }
  });

  it("the three copies are the same set, not merely overlapping", () => {
    const rpc = [...rpcVocabulary()].sort();
    const constraint = [...constraintVocabulary()].sort();
    const ui = [...DISPUTE_REASONS].sort();
    expect(rpc).toEqual(ui);
    expect(constraint).toEqual(ui);
  });

  it("carries item_not_received, which the old label-only list omitted", () => {
    expect(DISPUTE_REASONS).toContain("item_not_received");
  });
});

describe("unsupported reasons are rejected", () => {
  it.each([
    "Not as described", // the label the UI used to post verbatim
    "Transfer failed",
    "Seller unresponsive",
    "Other",
    "",
    "bogus",
    "NOT_AS_DESCRIBED",
    "not-as-described",
  ])("isDisputeReason(%j) is false", (value) => {
    expect(isDisputeReason(value)).toBe(false);
  });

  it.each([null, undefined, 42, {}, ["not_as_described"]])(
    "isDisputeReason(%j) is false for non-strings",
    (value) => {
      expect(isDisputeReason(value)).toBe(false);
    },
  );

  it("accepts every canonical value", () => {
    for (const value of DISPUTE_REASONS) {
      expect(isDisputeReason(value)).toBe(true);
    }
  });
});

describe("labels are display-only", () => {
  it("no label is a canonical value, so a label can never be stored by accident", () => {
    for (const [value, label] of Object.entries(DISPUTE_REASON_LABELS)) {
      expect(label).not.toBe(value);
      expect(isDisputeReason(label)).toBe(false);
    }
  });

  it("renders a canonical value as its label", () => {
    expect(disputeReasonLabel("not_as_described")).toBe("Not as described");
    expect(disputeReasonLabel("item_not_received")).toBe("Item not received");
  });

  it("passes an unknown or legacy value through rather than hiding it", () => {
    // A pre-0013 row may still hold a label; an admin must be able to see it.
    expect(disputeReasonLabel("Not as described")).toBe("Not as described");
    expect(disputeReasonLabel("something_else")).toBe("something_else");
  });
});

describe("the buyer page posts the value, not the label", () => {
  const page = read("src/pages/buyer/BuyerOrderDetail.tsx");

  it("does not hardcode a human-label reason array", () => {
    expect(page).not.toMatch(
      /DISPUTE_REASONS\s*=\s*\[\s*"Not as described"/,
    );
  });

  it("renders the option label but keeps the option value canonical", () => {
    expect(page).toMatch(/<option key=\{r\.value\} value=\{r\.value\}/);
    expect(page).toMatch(/\{r\.label\}/);
  });

  it("still calls the RPC with the selected reason value", () => {
    expect(page).toMatch(/openDisputeRpc\(order\.order_no, reason, detail\.trim\(\)\)/);
  });
});

describe("the mutation layer refuses a non-canonical reason before the RPC sees it", () => {
  const mutations = read("src/lib/supabaseMutations.ts");

  it("guards openDispute with isDisputeReason", () => {
    expect(mutations).toMatch(/if \(!isDisputeReason\(reason\)\)/);
  });

  it("imports the guard from the shared module", () => {
    expect(mutations).toMatch(/import \{ isDisputeReason \} from "@\/lib\/disputeReasons"/);
  });
});
