import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

/**
 * The seller application's rules.
 *
 * These are the same functions the wizard calls, so the tests describe what an
 * applicant actually experiences: which step blocks "continue", what the final
 * submit re-checks, and what a resubmission starts from.
 */

/**
 * The store write must not erase a field the caller did not mention.
 *
 * Two different callers write `stores`: the application wizard, which answers
 * every question, and the settings form, which edits a subset. `submitStore`
 * used to fill every absent optional field with `null`/`[]`, so saving the
 * settings form silently wiped the logo, the categories, the refund policy and
 * the warranty window the applicant had already provided.
 */
describe("a partial store write preserves untouched columns", () => {
  const source = read("src/lib/supabaseMutations.ts");

  it("filters undefined values out of the update payload", () => {
    // `defined()` drops `undefined` but keeps `null` and `""`, which are real
    // clears. Without it, an absent optional column is set to null.
    expect(source).toMatch(/function defined</);
    expect(source).toMatch(/value !== undefined/);
  });

  it("routes the optional columns through the filter in both writers", () => {
    const submits = source.match(/\.\.\.defined\(\{/g) ?? [];
    // One in `submitStore`, one in `updateStore`.
    expect(submits.length).toBeGreaterThanOrEqual(2);
  });

  it("never defaults an unsupplied category list to an empty array", () => {
    // `categories: input.categories ?? []` is the exact line that wiped them.
    expect(source).not.toMatch(/categories: input\.categories \?\? \[\]/);
  });

  it("never defaults an unsupplied logo to null", () => {
    expect(source).not.toMatch(/logo_path: input\.logoPath \?\? null/);
  });
});


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
};

describe("store application steps", () => {
  it("has four steps and a unique key for each", () => {
    // The support and compliance steps were removed: neither is shown to a
    // buyer, so neither earned a place in the application.
    expect(STEPS).toHaveLength(4);
    expect(STEPS.map((s) => s.key)).toEqual([
      "store",
      "platforms",
      "delivery",
      "policies",
    ]);
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

});

describe("final submission re-checks every step", () => {
  it("reports each incomplete step with its error, in step order", () => {
    // The applicant can jump back and empty a field after passing it, so the
    // submit path must not trust the visible step alone.
    const broken: ApplicationDraft = {
      ...complete,
      storeName: "",
      platforms: [],
    };
    const errors = allStepErrors(broken);
    expect(errors.map((e) => e.step.key)).toEqual(["store", "platforms"]);
    expect(firstIncompleteStep(broken)).toBe("store");
  });

  it("counts progress by finished steps, not filled fields", () => {
    // One step finished out of four is 25%.
    const onlyStore = { ...EMPTY_DRAFT, storeName: "Store", categories: ["instagram"] };
    expect(progressPercent(onlyStore)).toBe(25);
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
    });

    expect(draft.storeName).toBe("Nightowl Digital");
    expect(draft.platforms).toEqual(["instagram", "tiktok"]);
    // A number column becomes the string the input expects.
    expect(draft.warrantyHours).toBe("72");
    // Nulls become empty strings rather than the text "null".
    expect(draft.refundPolicy).toBe("");
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
