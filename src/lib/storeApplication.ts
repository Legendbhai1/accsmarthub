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
  supportEmail: string;
  supportHours: string;
  supportChannel: string;
  ownershipAttested: boolean;
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
  supportEmail: "",
  supportHours: "",
  supportChannel: "",
  ownershipAttested: false,
};

/** Bumped when the shape changes, so an old draft is discarded rather than
 *  hydrated into fields that no longer exist. */
export const AGREEMENT_VERSION = "2026-01";

export type StepKey =
  | "store"
  | "platforms"
  | "delivery"
  | "policies"
  | "support"
  | "compliance";

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
  {
    key: "support",
    title: "Support",
    blurb: "How buyers reach you when they need help.",
  },
  {
    key: "compliance",
    title: "Compliance",
    blurb: "Confirm you can lawfully transfer the accounts you sell.",
  },
];

/** Why a step is not finished yet, or null when it is. */
export function stepError(
  draft: ApplicationDraft,
  step: StepKey,
): string | null {
  switch (step) {
    case "store":
      if (draft.storeName.trim().length < 3) {
        return "Enter a store name of at least 3 characters.";
      }
      if (draft.categories.length === 0) {
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
      if (draft.warrantyHours.trim()) {
        const hours = Number(draft.warrantyHours);
        if (!Number.isFinite(hours) || hours < 0 || hours > 8760) {
          return "Warranty must be between 0 and 8760 hours.";
        }
      }
      return null;
    case "support":
      if (!draft.supportEmail.trim()) {
        return "A support email is required.";
      }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draft.supportEmail.trim())) {
        return "Enter a valid support email address.";
      }
      return null;
    case "compliance":
      if (!draft.ownershipAttested) {
        return "You must confirm you own or may transfer the accounts you sell.";
      }
      return null;
  }
}

/** Every step's error, in order, for the final review screen. */
export function allStepErrors(
  draft: ApplicationDraft,
): { step: Step; error: string }[] {
  return STEPS.flatMap((step) => {
    const error = stepError(draft, step.key);
    return error ? [{ step, error }] : [];
  });
}

export function isComplete(draft: ApplicationDraft): boolean {
  return allStepErrors(draft).length === 0;
}

/** The first unfinished step, so "continue" can jump the applicant to it. */
export function firstIncompleteStep(draft: ApplicationDraft): StepKey | null {
  return allStepErrors(draft)[0]?.step.key ?? null;
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
  support_email?: string | null;
  support_hours?: string | null;
  support_channel?: string | null;
  ownership_attested?: boolean | null;
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
    supportEmail: store.support_email ?? "",
    supportHours: store.support_hours ?? "",
    supportChannel: store.support_channel ?? "",
    ownershipAttested: Boolean(store.ownership_attested),
  };
}

/** Progress as a whole number, for the step indicator. */
export function progressPercent(draft: ApplicationDraft): number {
  const done = STEPS.filter((s) => stepError(draft, s.key) === null).length;
  return Math.round((done / STEPS.length) * 100);
}
