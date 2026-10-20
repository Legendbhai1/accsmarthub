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
  restrictedRegions: "",
  ownershipAttested: true,
};

describe("store application steps", () => {
  it("has four steps and a unique key for each", () => {
    // Questions 4 ("Warranty & policies") and 5 ("Support") were removed; the
    // compliance attestation that used to be the sixth step is now the last.
    expect(STEPS).toHaveLength(4);
    expect(STEPS.map((s) => s.key)).toEqual([
      "store",
      "platforms",
      "delivery",
      "compliance",
    ]);
  });

  it("no longer asks the warranty, refund or support questions", () => {
    const keys = STEPS.map((s) => s.key);
    expect(keys).not.toContain("policies");
    expect(keys).not.toContain("support");
    // And the draft has no field to hold them, so nothing can quietly collect
    // an answer the wizard does not show.
    expect(EMPTY_DRAFT).not.toHaveProperty("replacementPolicy");
    expect(EMPTY_DRAFT).not.toHaveProperty("refundPolicy");
    expect(EMPTY_DRAFT).not.toHaveProperty("warrantyHours");
    expect(EMPTY_DRAFT).not.toHaveProperty("sourcing");
    expect(EMPTY_DRAFT).not.toHaveProperty("supportEmail");
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

  it("requires the ownership attestation to be confirmed", () => {
    expect(stepError({ ...complete, ownershipAttested: false }, "compliance")).toMatch(
      /own or may transfer/,
    );
    expect(stepError(complete, "compliance")).toBeNull();
  });

  it("still requires categories only where the column exists", () => {
    // On a pre-0017 database there is no `categories` column, so the answer is
    // not demanded. The other rules are unaffected.
    const withoutColumns = { storeApplicationFields: false };
    expect(stepError({ ...complete, categories: [] }, "store", withoutColumns)).toBeNull();
    expect(stepError({ ...complete, ownershipAttested: false }, "compliance", withoutColumns)).toMatch(
      /own or may transfer/,
    );
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
      restricted_regions: null,
      ownership_attested: true,
    });

    expect(draft.storeName).toBe("Nightowl Digital");
    expect(draft.platforms).toEqual(["instagram", "tiktok"]);
    expect(draft.ownershipAttested).toBe(true);
    // Nulls become empty strings rather than the text "null".
    expect(draft.restrictedRegions).toBe("");
  });

  it("treats a missing attestation as not confirmed", () => {
    const draft = draftFromStore({ store_name: "S", ownership_attested: null });
    expect(draft.ownershipAttested).toBe(false);
  });

  it("pins the agreement version so a stored attestation is traceable", () => {
    // The version is written to `stores.agreement_version`; changing it
    // without a migration would make old attestations unattributable.
    expect(AGREEMENT_VERSION).toMatch(/^\d{4}-\d{2}$/);
  });
});
