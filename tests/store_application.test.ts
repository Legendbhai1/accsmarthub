import { describe, expect, it } from "vitest";
import {
  AGREEMENT_VERSION,
  EMPTY_DRAFT,
  STEPS,
  allStepErrors,
  draftFromStore,
  firstIncompleteStep,
  isComplete,
  progressPercent,
  stepError,
  type ApplicationDraft,
} from "@/lib/storeApplication";

/**
 * The seller application's rules.
 *
 * These are the same functions the wizard calls, so the tests describe what an
 * applicant actually experiences: which step blocks "continue", what the final
 * submit re-checks, and what a resubmission starts from.
 */

const complete: ApplicationDraft = {
  ...EMPTY_DRAFT,
  storeName: "Nightowl Digital",
  categories: ["instagram", "tiktok"],
  platforms: ["instagram"],
  deliverySpeed: "Within 24 hours",
  accessFormat: "Login + recovery guide",
  replacementPolicy: "Replaced once within the warranty window.",
  refundPolicy: "Full refund if no replacement is available.",
  warrantyHours: "72",
  restrictedRegions: "",
  sourcing: "Sourced from long-standing partners.",
  supportEmail: "support@nightowl.example",
  supportHours: "09:00-18:00 UTC",
  supportChannel: "On-platform messages",
  ownershipAttested: true,
};

describe("store application steps", () => {
  it("has six steps and a unique key for each", () => {
    expect(STEPS).toHaveLength(6);
    expect(new Set(STEPS.map((s) => s.key)).size).toBe(6);
  });

  it("starts empty and reports the first step as the blocker", () => {
    expect(isComplete(EMPTY_DRAFT)).toBe(false);
    expect(firstIncompleteStep(EMPTY_DRAFT)).toBe("store");
  });

  it("accepts a fully answered draft", () => {
    expect(isComplete(complete)).toBe(true);
    expect(allStepErrors(complete)).toEqual([]);
    expect(progressPercent(complete)).toBe(100);
  });
});

describe("step validation", () => {
  it("requires a store name of at least three characters", () => {
    expect(stepError({ ...complete, storeName: "ab" }, "store")).toMatch(/3 characters/);
    expect(stepError({ ...complete, storeName: "   " }, "store")).toMatch(/3 characters/);
    expect(stepError({ ...complete, storeName: "abc" }, "store")).toBeNull();
  });

  it("requires at least one category and one platform", () => {
    expect(stepError({ ...complete, categories: [] }, "store")).toMatch(/category/);
    expect(stepError({ ...complete, platforms: [] }, "platforms")).toMatch(/platform/);
  });

  it("requires a delivery speed and an access format", () => {
    expect(stepError({ ...complete, deliverySpeed: "" }, "delivery")).toMatch(/quickly/);
    expect(stepError({ ...complete, accessFormat: "  " }, "delivery")).toMatch(/format/);
  });

  it("requires a replacement policy but not a refund policy", () => {
    expect(stepError({ ...complete, replacementPolicy: "" }, "policies")).toMatch(
      /replacement/,
    );
    expect(stepError({ ...complete, refundPolicy: "" }, "policies")).toBeNull();
  });

  it("bounds the warranty window to one year", () => {
    expect(stepError({ ...complete, warrantyHours: "-1" }, "policies")).toMatch(/0 and 8760/);
    expect(stepError({ ...complete, warrantyHours: "8761" }, "policies")).toMatch(/0 and 8760/);
    expect(stepError({ ...complete, warrantyHours: "abc" }, "policies")).toMatch(/0 and 8760/);
    // Empty means "no warranty stated", which is allowed.
    expect(stepError({ ...complete, warrantyHours: "" }, "policies")).toBeNull();
    expect(stepError({ ...complete, warrantyHours: "8760" }, "policies")).toBeNull();
  });

  it("requires a well-formed support email", () => {
    expect(stepError({ ...complete, supportEmail: "" }, "support")).toMatch(/required/);
    expect(stepError({ ...complete, supportEmail: "nope" }, "support")).toMatch(/valid/);
    expect(stepError({ ...complete, supportEmail: "a@b" }, "support")).toMatch(/valid/);
    expect(stepError({ ...complete, supportEmail: "a@b.co" }, "support")).toBeNull();
  });

  it("blocks submission until ownership is attested", () => {
    expect(stepError({ ...complete, ownershipAttested: false }, "compliance")).toMatch(
      /confirm/,
    );
    expect(stepError({ ...complete, ownershipAttested: true }, "compliance")).toBeNull();
  });
});

describe("final submission re-checks every step", () => {
  it("reports each incomplete step with its error, in step order", () => {
    // The applicant can jump back and empty a field after passing it, so the
    // submit path must not trust the visible step alone.
    const broken: ApplicationDraft = {
      ...complete,
      storeName: "",
      platforms: [],
      ownershipAttested: false,
    };
    const errors = allStepErrors(broken);
    expect(errors.map((e) => e.step.key)).toEqual(["store", "platforms", "compliance"]);
    expect(firstIncompleteStep(broken)).toBe("store");
  });

  it("counts progress by finished steps, not filled fields", () => {
    // One step finished out of six is 17%, rounded.
    const onlyStore = { ...EMPTY_DRAFT, storeName: "Store", categories: ["instagram"] };
    expect(progressPercent(onlyStore)).toBe(17);
    expect(progressPercent(EMPTY_DRAFT)).toBe(0);
  });
});

describe("resubmission starts from what was submitted", () => {
  it("rebuilds a draft from a stored row", () => {
    const draft = draftFromStore({
      store_name: "Nightowl Digital",
      categories: ["instagram"],
      platforms: ["instagram", "tiktok"],
      delivery_speed: "Within 24 hours",
      access_format: "Login + recovery guide",
      warranty_hours: 72,
      replacement_policy: "Replaced once.",
      refund_policy: null,
      restricted_regions: null,
      sourcing: null,
      support_email: "support@nightowl.example",
      support_hours: null,
      support_channel: null,
      ownership_attested: true,
    });

    expect(draft.storeName).toBe("Nightowl Digital");
    expect(draft.platforms).toEqual(["instagram", "tiktok"]);
    // A number column becomes the string the input expects.
    expect(draft.warrantyHours).toBe("72");
    // Nulls become empty strings rather than the text "null".
    expect(draft.refundPolicy).toBe("");
    expect(draft.supportHours).toBe("");
    expect(draft.ownershipAttested).toBe(true);
  });

  it("treats a missing warranty as no warranty", () => {
    const draft = draftFromStore({ store_name: "S", warranty_hours: null });
    expect(draft.warrantyHours).toBe("");
  });

  it("pins the agreement version so a stored attestation is traceable", () => {
    // The version is written to `stores.agreement_version`; changing it
    // without a migration would make old attestations unattributable.
    expect(AGREEMENT_VERSION).toMatch(/^\d{4}-\d{2}$/);
  });
});
