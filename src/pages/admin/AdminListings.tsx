import { useCallback, useEffect, useState } from "react";
import { Eye, Search, Pause, CheckCircle2, RotateCcw, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DashLayout } from "@/components/dash/DashLayout";
import { adminNav } from "@/components/dash/navs";
import { EmptyState } from "@/components/common/Primitives";
import { formatPrice } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { adminUpdateListing, setListingStatus } from "@/lib/supabaseMutations";
import { toast } from "sonner";

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "active", label: "Active" },
  { key: "paused", label: "Paused" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/**
 * The moderation action a given listing status allows. `needsReason` mirrors
 * the database: `set_listing_status` refuses a move to `paused` without a
 * reason, because that is the decision the seller has to be told about.
 */
function actionsFor(
  status: string,
): { label: string; next: string; icon: typeof CheckCircle2; needsReason: boolean }[] {
  if (status === "pending") {
    return [
      { label: "Approve", next: "active", icon: CheckCircle2, needsReason: false },
      { label: "Reject", next: "paused", icon: Pause, needsReason: true },
    ];
  }
  if (status === "active") {
    return [{ label: "Pause", next: "paused", icon: Pause, needsReason: true }];
  }
  if (status === "paused") {
    return [{ label: "Re-approve", next: "active", icon: RotateCcw, needsReason: false }];
  }
  return [];
}

type ListingRow = {
  id: string;
  title: string;
  brand: string;
  summary: string | null;
  status: string;
  hidden: boolean;
  stock: number;
  price_usd: number;
  moderation_note: string | null;
  updated_at: string;
};

export default function AdminListings() {
  const [tab, setTab] = useState<TabKey>("pending");
  const [q, setQ] = useState("");

  const [rows, setRows] = useState<ListingRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // A move to `paused` is a rejection and needs a reason, so it goes through
  // a dialog rather than firing on the click.
  const [rejecting, setRejecting] = useState<ListingRow | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const [editing, setEditing] = useState<ListingRow | null>(null);

  // A promise chain, not an async function: the effect below must not call
  // setState synchronously, or React reports a cascading render. Loading state
  // is flipped from the event handlers that start a fresh load.
  const load = useCallback(() => {
    return Promise.resolve(
      supabase
        .from("listings")
        .select(
          "id, title, brand, summary, status, hidden, stock, price_usd, moderation_note, updated_at",
        )
        .eq("status", tab)
        .order("updated_at", { ascending: false }),
    )
      .then(({ data, error: fetchError }) => {
        if (fetchError) throw new Error(fetchError.message);
        setRows(
          (data ?? []).map((r) => ({
            ...r,
            stock: Number(r.stock ?? 0),
            price_usd: Number(r.price_usd ?? 0),
          })),
        );
        setError(null);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Unknown error"),
      )
      .finally(() => setIsLoading(false));
  }, [tab]);

  // Load on mount and whenever the tab changes. The previous version only
  // fetched from the Refresh button, so the queue looked empty until a manual
  // click.
  useEffect(() => {
    void load();
  }, [load]);

  const refresh = () => {
    setIsLoading(true);
    void load();
  };

  const selectTab = (next: TabKey) => {
    setIsLoading(true);
    setTab(next);
  };

  const moderate = async (row: ListingRow, next: string, note?: string) => {
    setBusyId(row.id);
    try {
      await setListingStatus({ listingId: row.id, status: next, note });
      toast.success(
        next === "active"
          ? "Listing approved"
          : next === "paused"
            ? "Listing rejected"
            : "Listing updated",
        { description: row.title },
      );
      await load();
    } catch (err) {
      toast.error("Could not update the listing", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setBusyId(null);
    }
  };

  const runAction = (row: ListingRow, action: { next: string; needsReason: boolean }) => {
    if (action.needsReason) {
      setRejectNote("");
      setRejecting(row);
      return;
    }
    void moderate(row, action.next);
  };

  const confirmReject = async () => {
    if (!rejecting) return;
    const note = rejectNote.trim();
    if (note.length < 3) {
      toast.error("A rejection reason is required", {
        description: "Tell the seller what to fix so they can resubmit.",
      });
      return;
    }
    const row = rejecting;
    setRejecting(null);
    await moderate(row, "paused", note);
  };

  const filtered =
    q.trim()
      ? rows.filter(
          (r) =>
            r.title.toLowerCase().includes(q.trim().toLowerCase()) ||
            r.brand.toLowerCase().includes(q.trim().toLowerCase())
        )
      : rows;

  return (
    <DashLayout title="Listing moderation" nav={adminNav}>
      <div className="space-y-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Approve, reject or correct listings. A rejection requires a reason —
          the seller sees it and can resubmit. Status and visibility both feed
          into what shoppers can see on the marketplace.
        </p>

        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => selectTab(t.key)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
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
              placeholder="Search by title or brand"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button className="rounded-xl" onClick={refresh} disabled={isLoading}>
            <Eye className="size-4 mr-2" />
            Refresh
          </Button>
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Could not load listings: {error}
          </div>
        )}

        {isLoading ? (
          <EmptyState
            title="Loading listings…"
            description={`Fetching the ${tab} queue.`}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={q.trim() ? "No listings found" : `No ${tab} listings`}
            description={
              q.trim()
                ? "Try a different search term."
                : `There are no ${tab} listings to review right now.`
            }
          />
        ) : (
          <div className="surface overflow-hidden">
            <ul className="divide-y divide-border/60">
              {filtered.map((r) => (
                <li
                  key={r.id}
                  className="px-5 py-4 transition-colors hover:bg-accent/30"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {r.title}
                      </span>
                      <span className="block text-xs capitalize text-muted-foreground">
                        {r.brand} · {r.id.slice(0, 8)}…
                      </span>
                      {/* The last moderation reason, so a second reviewer can
                          see what the seller was already told. */}
                      {r.moderation_note && (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          Last note: {r.moderation_note}
                        </span>
                      )}
                    </div>
                    <span className="w-24 text-right text-sm font-semibold tabular-nums">
                      {formatPrice(r.price_usd)}
                    </span>
                    <span className="w-20 text-right text-sm tabular-nums">
                      {r.stock}
                    </span>
                    <Badge
                      variant="outline"
                      className={`w-20 justify-center text-xs font-medium uppercase tracking-wide ${
                        r.status === "active"
                          ? "border border-success/30 text-success"
                          : r.status === "paused"
                          ? "border border-destructive/30 text-destructive"
                          : "border border-warning/30 text-warning"
                      }`}
                    >
                      {r.status}
                    </Badge>
                    {/* Real moderation actions, wired to set_listing_status().
                        The old markup was a dead "more" icon that did nothing. */}
                    <div className="flex w-60 justify-end gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="rounded-lg"
                        disabled={busyId === r.id}
                        onClick={() => setEditing(r)}
                      >
                        <Pencil className="size-3.5 mr-1.5" />
                        Edit
                      </Button>
                      {actionsFor(r.status).map((action) => (
                        <Button
                          key={action.next}
                          type="button"
                          variant={action.next === "active" ? "default" : "outline"}
                          size="sm"
                          className="rounded-lg"
                          disabled={busyId === r.id}
                          onClick={() => runAction(r, action)}
                        >
                          <action.icon className="size-3.5 mr-1.5" />
                          {action.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Rejection reason. The database refuses `paused` without one, so this
          dialog is the only path to it. */}
      <Dialog open={rejecting !== null} onOpenChange={(open) => !open && setRejecting(null)}>
        <DialogContent className="surface border-border/70 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject this listing</DialogTitle>
            <DialogDescription>
              {rejecting?.title} — the seller is notified with this reason and
              can fix the listing and resubmit it.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="reject-note">Reason</Label>
            <Textarea
              id="reject-note"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="e.g. The screenshot shows a different account tier than the description claims."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" className="rounded-xl" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button
              className="rounded-xl"
              onClick={() => void confirmReject()}
              disabled={rejectNote.trim().length < 3 || busyId !== null}
            >
              Reject listing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editing && (
        <EditListingDialog
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </DashLayout>
  );
}

/**
 * Correct a listing's content. Separate from moderation: an admin can fix a
 * typo or a mis-entered price without pausing the listing. Title, brand,
 * summary, price and visibility only — status and stock stay with the seller
 * and the moderation flow.
 */
function EditListingDialog({
  row,
  onClose,
  onSaved,
}: {
  row: ListingRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(row.title);
  const [brand, setBrand] = useState(row.brand);
  const [summary, setSummary] = useState(row.summary ?? "");
  const [price, setPrice] = useState(String(row.price_usd));
  const [hidden, setHidden] = useState(row.hidden);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const priceValue = Number(price);
  const valid =
    title.trim().length >= 2 &&
    brand.trim().length >= 1 &&
    Number.isFinite(priceValue) &&
    priceValue > 0;

  const save = async () => {
    if (!valid) {
      toast.error("Check the title, brand and price", {
        description: "The price must be greater than zero.",
      });
      return;
    }
    setSaving(true);
    try {
      await adminUpdateListing({
        listingId: row.id,
        title: title.trim(),
        brand: brand.trim(),
        summary: summary.trim() || null,
        priceUsd: priceValue,
        hidden,
        note: note.trim() || null,
      });
      toast.success("Listing updated", { description: title.trim() });
      onSaved();
    } catch (err) {
      toast.error("Could not update the listing", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="surface border-border/70 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit listing</DialogTitle>
          <DialogDescription>
            The seller is notified that an administrator edited this listing.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="edit-title">Title</Label>
            <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-brand">Brand</Label>
              <Input id="edit-brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-price">Price (USD)</Label>
              <Input
                id="edit-price"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-summary">Summary</Label>
            <Textarea
              id="edit-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={hidden}
              onChange={(e) => setHidden(e.target.checked)}
              className="size-4 rounded border-border"
            />
            Hide from the marketplace
          </label>
          <div className="grid gap-2">
            <Label htmlFor="edit-note">Note to the seller (optional)</Label>
            <Textarea
              id="edit-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why this was edited."
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" className="rounded-xl" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button className="rounded-xl" onClick={() => void save()} disabled={saving || !valid}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
