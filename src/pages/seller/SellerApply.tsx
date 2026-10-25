import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Circle,
  Clock,
  Loader2,
  RotateCcw,
  Send,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState, StatusBadge } from "@/components/common/Primitives";
import { SERVICE_CATEGORIES } from "@/lib/db";
import { readMyStore, friendlyError } from "@/lib/supabaseData";
import { useStoreApplicationEvents } from "@/lib/supabaseQueries";
import { submitStore, publicAssetUrl } from "@/lib/supabaseMutations";
import { useSession } from "@/lib/session";
import {
  AGREEMENT_VERSION,
  EMPTY_DRAFT,
  STEPS,
  clearDraft,
  draftFromStore,
  firstIncompleteStep,
  isComplete,
  progressPercent,
  readDraft,
  stepError,
  writeDraft,
  type ApplicationCapabilities,
  type ApplicationDraft,
  type StepKey,
} from "@/lib/storeApplication";
import { detectCapabilities } from "@/lib/schemaCapabilities";
import { toast } from "sonner";

type Store = Awaited<ReturnType<typeof readMyStore>>;

/** A timestamp that reads the same on the applicant's screen and the admin's. */
function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const EVENT_LABEL: Record<string, string> = {
  submitted: "Application submitted",
  resubmitted: "Revised and resubmitted",
  approved: "Approved",
  rejected: "Not approved",
  status_changed: "Status changed",
};

/**
 * The seller application.
 *
 * Two screens in one route: an applicant who already has a store row sees its
 * status and history, and the form is reached from there. That keeps
 * `/seller/apply` as the single destination the guards and the workspace
 * switcher can point at, while still letting a rejected applicant revise
 * without hunting for the form.
 */
export default function SellerApply() {
  const { user } = useSession();
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  // Bumping this re-runs the loader for the retry button and after a submit.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const row = await readMyStore();
        if (cancelled) return;
        setStore(row);
        // An applicant with no row, or a rejected one, lands in the form:
        // there is nothing to show them on a status screen yet.
        setEditing(!row || row.status === "rejected");
        setLoadError(null);
      } catch (err) {
        if (!cancelled) setLoadError(friendlyError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const reload = () => {
    setLoading(true);
    setReloadToken((n) => n + 1);
  };

  if (loading) {
    return (
      <>
        <div className="surface flex items-center justify-center gap-2 px-6 py-20 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading your application…
        </div>
      </>
    );
  }

  if (loadError) {
    return (
      <>
        <div className="surface px-6 py-16 text-center">
          <AlertCircle className="mx-auto size-6 text-destructive" />
          <p className="mt-3 font-semibold">We could not load your application</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
            {loadError}
          </p>
          <Button className="mt-5 rounded-xl" onClick={reload}>
            Try again
          </Button>
        </div>
      </>
    );
  }

  if (editing) {
    return (
      <>
        <ApplicationWizard
          userId={user?.id ?? "anonymous"}
          store={store}
          onDone={async () => {
            setEditing(false);
            reload();
          }}
        />
      </>
    );
  }

  return (
    <>
      <ApplicationStatus store={store} onRevise={() => setEditing(true)} />
    </>
  );
}

/** What happened to the application, and why. */
function ApplicationStatus({
  store,
  onRevise,
}: {
  store: Store;
  onRevise: () => void;
}) {
  const events = useStoreApplicationEvents(store?.id ?? null);

  if (!store) {
    return (
      <div className="surface overflow-hidden">
        <EmptyState
          title="No application yet"
          description="Start your seller application to list accounts on the marketplace."
        />
      </div>
    );
  }

  const submitted = store.submitted_at ?? store.created_at;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-4">
            {store.logo_path ? (
              <img
                src={publicAssetUrl("store-assets", store.logo_path)}
                alt=""
                className="size-14 rounded-xl border border-border object-cover"
              />
            ) : (
              <span className="flex size-14 items-center justify-center rounded-xl bg-primary/10 text-lg font-bold text-primary">
                {store.store_name.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">{store.store_name}</h2>
              <p className="text-xs text-muted-foreground">/{store.slug}</p>
            </div>
          </div>
          <StatusBadge status={store.status} />
        </div>

        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          {store.status === "pending" &&
            "Your application is in the review queue. An administrator checks each store before it goes live."}
          {store.status === "approved" &&
            "Your store is approved. You can create listings; each one is still reviewed before it appears in the marketplace."}
          {store.status === "rejected" &&
            "Your application was not approved. Read the reason below, make your changes, and resubmit."}
        </p>

        {store.status === "rejected" && store.review_note && (
          <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-destructive">
              Reason
            </p>
            <p className="mt-1 text-sm leading-relaxed">{store.review_note}</p>
          </div>
        )}

        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Submitted</dt>
            <dd className="font-medium">{formatWhen(submitted)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Platforms</dt>
            <dd className="font-medium">
              {store.platforms.length > 0 ? store.platforms.join(", ") : "—"}
            </dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-wrap gap-2">
          {store.status === "rejected" ? (
            <Button className="rounded-xl" onClick={onRevise}>
              <RotateCcw className="size-4" />
              Revise &amp; resubmit
            </Button>
          ) : (
            <Button variant="outline" className="rounded-xl" onClick={onRevise}>
              Edit store details
            </Button>
          )}
          {store.status === "approved" && (
            <Button variant="outline" className="rounded-xl" asChild>
              <Link to="/seller/listings?new=1">Create a listing</Link>
            </Button>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="surface p-6">
        <h3 className="text-sm font-semibold">Application history</h3>
        {events.loading ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Loading history…
          </p>
        ) : events.error ? (
          <p className="mt-3 text-sm text-destructive">{events.error}</p>
        ) : (events.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No history recorded yet.
          </p>
        ) : (
          <ol className="mt-4 space-y-0">
            {(events.data ?? []).map((e, i, all) => (
              <li key={e.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Check className="size-3 text-primary" />
                  </span>
                  {i < all.length - 1 && (
                    <span className="w-px flex-1 bg-border" />
                  )}
                </div>
                <div className="pb-4">
                  <p className="text-sm font-medium">
                    {EVENT_LABEL[e.event] ?? e.event}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatWhen(e.created_at)} ·{" "}
                    {e.actor_role === "admin" ? "Administrator" : "You"}
                  </p>
                  {e.note && (
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {e.note}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

/** The six-step form, with a draft that survives a reload. */
function ApplicationWizard({
  userId,
  store,
  onDone,
}: {
  userId: string;
  store: Store | null;
  onDone: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<ApplicationDraft>(() => {
    const saved = readDraft(userId);
    if (saved) return saved;
    return store ? draftFromStore(store) : EMPTY_DRAFT;
  });
  const [stepIndex, setStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const step = STEPS[stepIndex];
  // Probe once per mount. Until it resolves, `caps` stays `null` and the
  // wizard behaves exactly as it did before — optimistic, with the write-path
  // retry as the backstop. It only ever *narrows* what is asked for.
  const [caps, setCaps] = useState<ApplicationCapabilities | null>(null);
  useEffect(() => {
    let alive = true;
    detectCapabilities()
      .then((c) => {
        if (alive) setCaps({ storeApplicationFields: c.storeApplicationFields });
      })
      .catch(() => {
        // A failed probe must not block the form; the defaults already assume
        // the fullest schema.
      });
    return () => {
      alive = false;
    };
  }, []);

  const capabilities = caps ?? { storeApplicationFields: true };
  const currentError = stepError(draft, step.key, capabilities);
  const complete = isComplete(draft, capabilities);
  const progress = progressPercent(draft);

  const update = (patch: Partial<ApplicationDraft>) => {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      // Persist on every change: a reload at any point must not lose work.
      writeDraft(userId, next);
      return next;
    });
  };

  const toggle = (field: "platforms" | "categories", value: string) => {
    setDraft((prev) => {
      const list = prev[field];
      const next = {
        ...prev,
        [field]: list.includes(value)
          ? list.filter((v) => v !== value)
          : [...list, value],
      };
      writeDraft(userId, next);
      return next;
    });
  };

  const submit = async () => {
    setSubmitError(null);
    // Re-check every step, not just the visible one: the applicant can jump
    // back and empty a field, and the review screen must not submit it.
    const missing = firstIncompleteStep(draft, capabilities);
    if (missing) {
      setStepIndex(STEPS.findIndex((s) => s.key === missing));
      setSubmitError(
        `Finish “${STEPS.find((s) => s.key === missing)?.title}” before submitting.`,
      );
      return;
    }

    setSubmitting(true);
    try {
      const { degraded } = await submitStore({
        storeName: draft.storeName.trim(),
        platforms: draft.platforms,
        categories: draft.categories,
        deliverySpeed: draft.deliverySpeed.trim(),
        accessFormat: draft.accessFormat.trim(),
        restrictedRegions: draft.restrictedRegions.trim(),
        ownershipAttested: draft.ownershipAttested,
        agreementVersion: AGREEMENT_VERSION,
        contactPolicyAccepted: true,
      });
      clearDraft(userId);
      if (degraded) {
        // The row saved, but the server dropped the answers that live in
        // columns migration 0017 adds. Saying "submitted" without this would
        // be a lie the seller only discovers when a reviewer cannot see their
        // categories or ownership attestation.
        toast.warning(
          "Application saved, but this server has not run the store-application migration yet — your categories and ownership attestation were not stored. Please contact support.",
        );
      } else {
        toast.success(
          store ? "Application updated and resubmitted" : "Application submitted",
        );
      }
      await onDone();
    } catch (err) {
      setSubmitError(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {/* Progress */}
      <div className="surface p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold">
            Step {stepIndex + 1} of {STEPS.length}
            <span className="ml-2 font-normal text-muted-foreground">
              {step.title}
            </span>
          </p>
          <span className="text-xs tabular-nums text-muted-foreground">
            {progress}% complete
          </span>
        </div>
        <div
          className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Application progress"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <ol className="mt-4 flex flex-wrap gap-1.5">
          {STEPS.map((s, i) => {
            const done = stepError(draft, s.key, capabilities) === null;
            return (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => setStepIndex(i)}
                  aria-current={i === stepIndex ? "step" : undefined}
                  className={`flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    i === stepIndex
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : done
                        ? "border-success/30 text-success"
                        : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {done ? (
                    <Check className="size-3" />
                  ) : (
                    <Circle className="size-3" />
                  )}
                  <span className="hidden sm:inline">{s.title}</span>
                  <span className="sm:hidden">{i + 1}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="surface p-5 sm:p-6">
        <h2 className="text-lg font-semibold">{step.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{step.blurb}</p>

        <div className="mt-5 space-y-4">
          <StepFields
            draft={draft}
            step={step.key}
            update={update}
            toggle={toggle}
            capabilities={capabilities}
          />
        </div>

        {currentError && (
          <p className="mt-4 flex items-start gap-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {currentError}
          </p>
        )}

        {submitError && (
          <p className="mt-4 flex items-start gap-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {submitError}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            disabled={stepIndex === 0}
            onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>

          {stepIndex < STEPS.length - 1 ? (
            <Button
              type="button"
              className="rounded-xl"
              disabled={currentError !== null}
              onClick={() =>
                setStepIndex((i) => Math.min(STEPS.length - 1, i + 1))
              }
            >
              Continue
              <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button
              type="button"
              className="rounded-xl"
              disabled={submitting || !complete}
              onClick={() => void submit()}
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              {store ? "Resubmit application" : "Submit application"}
            </Button>
          )}

          <p className="ml-auto hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
            <Clock className="size-3" />
            Your draft is saved on this device.
          </p>
        </div>
      </div>

      {/* Final review, only on the last step so the applicant sees exactly
          what they are about to send. */}
      {stepIndex === STEPS.length - 1 && (
        <div className="surface p-5 sm:p-6">
          <h3 className="text-sm font-semibold">Review your answers</h3>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <ReviewItem label="Store name" value={draft.storeName} />
            <ReviewItem label="Categories" value={draft.categories.join(", ")} />
            <ReviewItem label="Platforms" value={draft.platforms.join(", ")} />
            <ReviewItem label="Delivery speed" value={draft.deliverySpeed} />
            <ReviewItem label="Access format" value={draft.accessFormat} />
            <ReviewItem
              label="Restricted regions"
              value={draft.restrictedRegions}
            />
            <ReviewItem
              label="Ownership"
              value={
                draft.ownershipAttested ? "Confirmed by the applicant" : ""
              }
            />
          </dl>
        </div>
      )}
    </div>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value.trim() || "—"}</dd>
    </div>
  );
}

/** The inputs for one step. Kept in one place so a step cannot drift from
 *  the validation `stepError()` applies to it. */
function StepFields({
  draft,
  step,
  update,
  toggle,
  capabilities,
}: {
  draft: ApplicationDraft;
  step: StepKey;
  update: (patch: Partial<ApplicationDraft>) => void;
  toggle: (field: "platforms" | "categories", value: string) => void;
  capabilities: ApplicationCapabilities;
}) {
  const platformOptions = SERVICE_CATEGORIES.map((c) => c.slug);
  // On a database that has not run 0017 these two answers have no column to
  // land in, so the fields are not shown at all. The alternative — collecting
  // them and dropping them on save — is what produced the "your categories and
  // warranty were not stored" warning this replaces.
  const canStoreApplicationFields = capabilities.storeApplicationFields;

  switch (step) {
    case "store":
      return (
        <>
          <div className="space-y-2">
            <Label htmlFor="store-name">Store name</Label>
            <Input
              id="store-name"
              value={draft.storeName}
              onChange={(e) => update({ storeName: e.target.value })}
              placeholder="My Digital Store"
              maxLength={60}
            />
            <p className="text-xs text-muted-foreground">
              The name buyers see. You can change it later; the store URL keeps
              the slug it was created with.
            </p>
          </div>
          {canStoreApplicationFields && (
            <div className="space-y-2">
              <Label>Categories</Label>
              <div className="flex flex-wrap gap-2">
                {SERVICE_CATEGORIES.map((c) => (
                  <Button
                    key={c.slug}
                    type="button"
                    size="sm"
                    variant={
                      draft.categories.includes(c.slug) ? "default" : "outline"
                    }
                    
                    aria-pressed={draft.categories.includes(c.slug)}
                    onClick={() => toggle("categories", c.slug)}
                  >
                    {c.name}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </>
      );

    case "platforms":
      return (
        <div className="space-y-2">
          <Label>Platforms you sell for</Label>
          <div className="flex flex-wrap gap-2">
            {platformOptions.map((p) => (
              <Button
                key={p}
                type="button"
                size="sm"
                variant={draft.platforms.includes(p) ? "default" : "outline"}
                
                aria-pressed={draft.platforms.includes(p)}
                onClick={() => toggle("platforms", p)}
              >
                {p}
              </Button>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Only list platforms whose terms allow transferring an account. You
            are responsible for the accounts you sell.
          </p>
        </div>
      );

    case "delivery":
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="delivery-speed">Delivery speed</Label>
            <Input
              id="delivery-speed"
              value={draft.deliverySpeed}
              onChange={(e) => update({ deliverySpeed: e.target.value })}
              placeholder="Within 24 hours"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="access-format">Access format</Label>
            <Input
              id="access-format"
              value={draft.accessFormat}
              onChange={(e) => update({ accessFormat: e.target.value })}
              placeholder="Login + recovery guide"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="restricted-regions">
              Restricted regions{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <Input
              id="restricted-regions"
              value={draft.restrictedRegions}
              onChange={(e) => update({ restrictedRegions: e.target.value })}
              placeholder="Comma-separated countries you cannot serve"
            />
          </div>
        </div>
      );

    case "compliance":
      return (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/20 p-4">
            <Checkbox
              id="ownership-attested"
              checked={draft.ownershipAttested}
              onCheckedChange={(checked) =>
                update({ ownershipAttested: checked === true })
              }
            />
            <Label
              htmlFor="ownership-attested"
              className="text-sm font-normal leading-relaxed"
            >
              I confirm I own these accounts, or am permitted by their owner to
              transfer them, and that I will not list accounts I cannot lawfully
              hand over.
            </Label>
          </div>
        </div>
      );
  }
}
