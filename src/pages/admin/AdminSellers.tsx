import { useState } from "react";
import {
  Shield,
  Search,
  CheckCheck,
  XCircle,
  MoreHorizontal,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { DashLayout } from "@/components/dash/DashLayout";
import { adminNav } from "@/components/dash/navs";
import { EmptyState } from "@/components/common/Primitives";
import { useReviewQueue, useStoreApplicationEvents, type StoreRow } from "@/lib/supabaseQueries";
import { reviewStore } from "@/lib/supabaseMutations";
import { toast } from "sonner";

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function AdminSellers() {
  const [tab, setTab] = useState<TabKey>("pending");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [approve, setApprove] = useState<boolean>(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const queueQuery = useReviewQueue(tab);
  const stores = queueQuery.data ?? [];

  const filtered =
    q.trim()
      ? stores.filter(
          (r) =>
            r.store_name.toLowerCase().includes(q.trim().toLowerCase()) ||
            r.slug.toLowerCase().includes(q.trim().toLowerCase()),
        )
      : stores;

  const openStore = stores.find((r) => r.id === openId);

  const submitReview = async () => {
    if (!openId) return;
    // A rejection must carry a reason: `review_store` refuses one without,
    // but catching it here gives the admin the message next to the button
    // rather than as a thrown error.
    if (!approve && note.trim().length < 3) {
      toast.error("A rejection reason is required.", {
        description: "Explain what the applicant needs to change.",
      });
      return;
    }
    setSaving(true);
    try {
      await reviewStore({ storeId: openId, approve, note: note.trim() ?? undefined });
      toast.success(approve ? "Store approved" : "Store rejected");
      setOpenId(null);
      setNote("");
      queueQuery.refresh();
    } catch (err) {
      toast.error("Could not save the review", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashLayout title="Seller management" nav={adminNav}>
      <div className="space-y-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Review and manage seller stores. Each applicant appears in the pending
          queue until you approve, reject, or request changes.
        </p>

        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                tab === t.key
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border/70 text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search store name or slug"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            className="rounded-xl"
            onClick={() => queueQuery.refresh()}
          >
            <Shield className="size-4 mr-2" />
            Refresh
          </Button>
        </div>

        {filtered.length === 0 ? (
          <div className="surface overflow-hidden">
            <EmptyState
              title={q.trim() ? "No stores found" : `No ${tab} stores`}
              description={
                q.trim()
                  ? "Try a different search term."
                  : `There are no ${tab} stores to review right now.`
              }
            />
          </div>
        ) : (
          <div className="surface overflow-hidden">
            <div className="border-border/70 px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Store
            </div>
            <ul className="divide-y divide-border/60">
              {filtered.map((r) => (
                <li key={r.id} className="px-5 py-4 transition-colors hover:bg-accent/30">
                  <div className="flex flex-wrap items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
                      {r.store_name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {r.store_name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {r.slug} · {r.user_id.slice(0, 8)}…
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {r.platforms.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {r.platforms[0].charAt(0).toUpperCase() +
                            r.platforms[0].slice(1)}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString()}
                      </span>
                      <Badge
                        variant="outline"
                        className={`rounded-full border-border/70 text-xs font-medium uppercase tracking-wide ${
                          tab === "approved"
                            ? "border-success/30 text-success dark:text-success"
                            : tab === "rejected"
                              ? "border-destructive/30 text-destructive"
                              : "border-warning/30 text-warning"
                        }`}
                      >
                        {tab}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {r.review_note && (
                        <span className="rounded-lg bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground">
                          Note
                        </span>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-lg"
                        onClick={() => {
                          setOpenId(r.id);
                          setApprove(tab === "approved");
                          setNote(r.review_note ?? "");
                        }}
                      >
                        <MoreHorizontal className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Dialog open={openId !== null} onOpenChange={() => setOpenId(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Review store application</DialogTitle>
            </DialogHeader>
            {openStore && (
              <div className="space-y-5">
                <div className="rounded-xl border-border/70 bg-muted/40 p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{openStore.store_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {openStore.slug} · {openStore.user_id.slice(0, 8)}…
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="rounded-full border-border/70 text-xs font-medium uppercase tracking-wide"
                    >
                      {openStore.status}
                    </Badge>
                  </div>
                </div>

                {/* Everything the applicant submitted, so a decision is made
                    on the real application rather than a name and a slug. */}
                <ApplicationDetails store={openStore} />

                <ApplicationTimeline storeId={openStore.id} />

                <div className="grid gap-3">
                  <label className="text-sm font-medium">Decision</label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={approve ? "default" : "outline"}
                      className="rounded-lg"
                      aria-pressed={approve}
                      onClick={() => setApprove(true)}
                    >
                      <CheckCheck className="size-4 mr-2" />
                      Approve
                    </Button>
                    <Button
                      type="button"
                      variant={!approve ? "default" : "outline"}
                      className="rounded-lg"
                      aria-pressed={!approve}
                      onClick={() => setApprove(false)}
                    >
                      <XCircle className="size-4 mr-2" />
                      Reject
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Review note{" "}
                    {!approve && <span className="text-destructive">*</span>}
                  </label>
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={
                      approve
                        ? "Optional context for the record."
                        : "Required: what the applicant needs to change."
                    }
                    rows={4}
                  />
                  {!approve && (
                    <p className="text-xs text-muted-foreground">
                      The applicant sees this reason and can revise and
                      resubmit.
                    </p>
                  )}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => setOpenId(null)}
              >
                Close
              </Button>
              <Button
                className="rounded-xl"
                disabled={saving || (!approve && note.trim().length < 3)}
                onClick={() => void submitReview()}
              >
                {saving && <Loader2 className="size-4 animate-spin" />}
                Save review
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashLayout>
  );
}

/** The submitted application, in the same order the applicant filled it in. */
function ApplicationDetails({ store }: { store: StoreRow }) {
  const rows: { label: string; value: string }[] = [
    { label: "Categories", value: store.categories.join(", ") },
    { label: "Platforms", value: store.platforms.join(", ") },
    { label: "Delivery speed", value: store.delivery_speed ?? "" },
    { label: "Access format", value: store.access_format ?? "" },
    {
      label: "Warranty",
      value: store.warranty_hours == null ? "" : `${store.warranty_hours} hours`,
    },
    { label: "Replacement policy", value: store.replacement_policy ?? "" },
    { label: "Refund policy", value: store.refund_policy ?? "" },
    { label: "Restricted regions", value: store.restricted_regions ?? "" },
    { label: "Sourcing", value: store.sourcing ?? "" },
    { label: "Support email", value: store.support_email ?? "" },
    { label: "Support hours", value: store.support_hours ?? "" },
    { label: "Support channel", value: store.support_channel ?? "" },
  ];

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Application</h3>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label}>
            <dt className="text-xs text-muted-foreground">{r.label}</dt>
            <dd className="break-words font-medium">
              {r.value.trim() || "—"}
            </dd>
          </div>
        ))}
      </dl>

      {/* The compliance attestation decides whether this store may be
          approved at all, so it is called out rather than buried. */}
      <div
        className={`rounded-lg border px-3 py-2 text-xs ${
          store.ownership_attested
            ? "border-success/30 bg-success/5 text-success"
            : "border-destructive/30 bg-destructive/5 text-destructive"
        }`}
      >
        {store.ownership_attested
          ? `Ownership attested${store.agreement_version ? ` (agreement ${store.agreement_version})` : ""}${
              store.compliance_accepted_at
                ? ` on ${new Date(store.compliance_accepted_at).toLocaleDateString()}`
                : ""
            }.`
          : "The applicant has not attested ownership. Approving a store without it is not advisable."}
      </div>

      <div className="text-xs text-muted-foreground">
        Submitted{" "}
        {new Date(store.submitted_at ?? store.created_at).toLocaleString()}
        {store.reviewed_at &&
          ` · last reviewed ${new Date(store.reviewed_at).toLocaleString()}`}
      </div>
    </div>
  );
}

/** The decision history, so an admin can see a resubmission or an earlier
 *  rejection before acting. */
function ApplicationTimeline({ storeId }: { storeId: string }) {
  const events = useStoreApplicationEvents(storeId);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">History</h3>
      {events.loading ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Loading…
        </p>
      ) : events.error ? (
        <p className="text-xs text-destructive">{events.error}</p>
      ) : (events.data ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground">No history recorded.</p>
      ) : (
        <ol className="space-y-2">
          {(events.data ?? []).map((e) => (
            <li
              key={e.id}
              className="flex items-start justify-between gap-3 text-xs"
            >
              <span className="min-w-0">
                <span className="font-medium capitalize">
                  {e.event.replace(/_/g, " ")}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  · {e.actor_role}
                </span>
                {e.note && (
                  <span className="mt-0.5 block text-muted-foreground">
                    {e.note}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {new Date(e.created_at).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
