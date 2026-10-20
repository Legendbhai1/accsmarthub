/**
 * The seller application: its steps, its validation, and its draft.
 *
 * Kept as pure functions so the wizard's rules can be tested without a DOM
 * (the test environment has no jsdom) and so the same rules back the
 * "review & submit" screen and the per-step gate.
 *
 * The draft lives in `localStorage` under a key scoped to the user id: a
 * reload mid-application must not lose what the applicant typed, and two
 * accounts signed in on one browser must not see each other's draft.
 */

export type ApplicationDraft = {
  storeName: string;
  categories: string[];
  platforms: string[];
  deliverySpeed: string;
  accessFormat: string;
  warrantyHours: string;
  replacementPolicy: string;
  refundPolicy: string;
  restrictedRegions: string;
  sourcing: string;
};

export const EMPTY_DRAFT: ApplicationDraft = {
  storeName: "",
  categories: [],
  platforms: [],
  deliverySpeed: "",
  accessFormat: "",
  warrantyHours: "",
  replacementPolicy: "",
  refundPolicy: "",
  restrictedRegions: "",
  sourcing: "",
};

/** Bumped when the shape changes, so an old draft is discarded rather than
 *  hydrated into fields that no longer exist. */
export const AGREEMENT_VERSION = "2026-01";

export type StepKey =
  | "store"
  | "platforms"
  | "delivery"
  | "policies";

export type Step = {
  key: StepKey;
  title: string;
  /** One line under the step heading. */
  blurb: string;
};

export const STEPS: Step[] = [
  {
    key: "store",
    title: "Store details",
    blurb: "The name buyers will see, and the categories you sell in.",
  },
  {
    key: "platforms",
    title: "Platforms",
    blurb: "Which platforms you list accounts for.",
  },
  {
    key: "delivery",
    title: "Delivery & access",
    blurb: "How fast you deliver, and in what format.",
  },
  {
    key: "policies",
    title: "Warranty & policies",
    blurb: "What a buyer can expect if something goes wrong.",
  },
];

/**
 * Whether the connected database stores the answers migration `0017` adds.
 *
 * The wizard and the database are deployed separately, and this project's
 * production database has never run `0017`, so `stores.categories`,
 * `warranty_hours` and `refund_policy` do not exist there. Asking for an answer
 * that will be silently dropped is worse than not asking: the applicant types
 * their warranty window, submits, and is then told it was not saved. Passing
 * the probed capability in lets the wizard ask only for what it can keep.
 *
 * Defaults to `true` so the pure functions stay usable without a database and
 * a fully migrated project behaves exactly as before.
 */
export type ApplicationCapabilities = { storeApplicationFields: boolean };

const ALL_FIELDS: ApplicationCapabilities = { storeApplicationFields: true };

/** Why a step is not finished yet, or null when it is. */
export function stepError(
  draft: ApplicationDraft,
  step: StepKey,
  capabilities: ApplicationCapabilities = ALL_FIELDS,
): string | null {
  const { storeApplicationFields } = capabilities;
  switch (step) {
    case "store":
      if (draft.storeName.trim().length < 3) {
        return "Enter a store name of at least 3 characters.";
      }
      // Only required where the column exists to hold it.
      if (storeApplicationFields && draft.categories.length === 0) {
        return "Choose at least one category.";
      }
      return null;
    case "platforms":
      if (draft.platforms.length === 0) {
        return "Choose at least one platform.";
      }
      return null;
    case "delivery":
      if (!draft.deliverySpeed.trim()) {
        return "Say how quickly you deliver.";
      }
      if (!draft.accessFormat.trim()) {
        return "Describe the format the buyer receives.";
      }
      return null;
    case "policies":
      if (!draft.replacementPolicy.trim()) {
        return "Describe your replacement policy.";
      }
      if (storeApplicationFields && draft.warrantyHours.trim()) {
        const hours = Number(draft.warrantyHours);
        if (!Number.isFinite(hours) || hours < 0 || hours > 8760) {
          return "Warranty must be between 0 and 8760 hours.";
        }
      }
      return null;
  }
}

/** Every step's error, in order, for the final review screen. */
export function allStepErrors(
  draft: ApplicationDraft,
  capabilities: ApplicationCapabilities = ALL_FIELDS,
): { step: Step; error: string }[] {
  return STEPS.flatMap((step) => {
    const error = stepError(draft, step.key, capabilities);
    return error ? [{ step, error }] : [];
  });
}

export function isComplete(
  draft: ApplicationDraft,
  capabilities: ApplicationCapabilities = ALL_FIELDS,
): boolean {
  return allStepErrors(draft, capabilities).length === 0;
}

/** The first unfinished step, so "continue" can jump the applicant to it. */
export function firstIncompleteStep(
  draft: ApplicationDraft,
  capabilities: ApplicationCapabilities = ALL_FIELDS,
): StepKey | null {
  return allStepErrors(draft, capabilities)[0]?.step.key ?? null;
}

// ---------------------------------------------------------------------
// Draft persistence
// ---------------------------------------------------------------------

const draftKey = (userId: string) => `accsmarthub:store-draft:${AGREEMENT_VERSION}:${userId}`;

export function readDraft(userId: string): ApplicationDraft | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(draftKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ApplicationDraft>;
    // Merge over the empty draft so a field added since the draft was
    // written has a sane default rather than `undefined`.
    return { ...EMPTY_DRAFT, ...parsed };
  } catch {
    return null;
  }
}

export function writeDraft(userId: string, draft: ApplicationDraft): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(draftKey(userId), JSON.stringify(draft));
  } catch {
    // A full or blocked storage must not break the form; the applicant just
    // loses the draft across a reload.
  }
}

export function clearDraft(userId: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(draftKey(userId));
  } catch {
    // Ignore: nothing to do if storage is unavailable.
  }
}

/**
 * Rebuild a draft from a stored row, so "Revise & resubmit" starts from what
 * the applicant already submitted rather than a blank form.
 */
export function draftFromStore(store: {
  store_name: string;
  categories?: string[] | null;
  platforms?: string[] | null;
  delivery_speed?: string | null;
  access_format?: string | null;
  warranty_hours?: number | null;
  replacement_policy?: string | null;
  refund_policy?: string | null;
  restricted_regions?: string | null;
  sourcing?: string | null;
}): ApplicationDraft {
  return {
    ...EMPTY_DRAFT,
    storeName: store.store_name ?? "",
    categories: store.categories ?? [],
    platforms: store.platforms ?? [],
    deliverySpeed: store.delivery_speed ?? "",
    accessFormat: store.access_format ?? "",
    warrantyHours:
      store.warranty_hours == null ? "" : String(store.warranty_hours),
    replacementPolicy: store.replacement_policy ?? "",
    refundPolicy: store.refund_policy ?? "",
    restrictedRegions: store.restricted_regions ?? "",
    sourcing: store.sourcing ?? "",
  };
}

/** Progress as a whole number, for the step indicator. */
export function progressPercent(draft: ApplicationDraft): number {
  const done = STEPS.filter((s) => stepError(draft, s.key) === null).length;
  return Math.round((done / STEPS.length) * 100);
}
