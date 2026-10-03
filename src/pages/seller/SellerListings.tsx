import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { Lock, Minus, Pencil, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashLayout } from "@/components/dash/DashLayout";
import { sellerNav } from "@/components/dash/navs";
import { ConfirmDialog, EmptyState, StatusBadge } from "@/components/common/Primitives";
import { BrandMark } from "@/components/site/BrandMark";
import { formatPrice } from "@/lib/format";
import { api, categories, useDb, type Listing, DEMO_SELLER_ID } from "@/lib/db";
import { api as convexApi } from "@/convex/_generated/api";
import { useSession } from "@/lib/session";
import { toast } from "sonner";

const emptyDraft = {
  title: "",
  category: "instagram",
  price: "",
  followers: "",
  niche: "",
  description: "",
  stock: "1",
};

/**
 * Listings and inventory.
 *
 * Creating a listing requires a store an admin has approved — the server
 * rejects it otherwise. Once a listing is registered, its stock lives in the
 * server ledger, so restocking here is reflected instantly in the
 * marketplace and in checkout.
 */
export default function SellerListings() {
  const { listings } = useDb();
  const { user } = useSession();
  const [params] = useSearchParams();
  const catalogue = listings.filter((l) => l.sellerId === DEMO_SELLER_ID);

  const ledger = useQuery(
    convexApi.marketplace.sellerListings,
    user?.sellerStatus === "approved" ? {} : "skip",
  );
  const publishListing = useMutation(convexApi.marketplace.publishListing);
  const adjustStock = useMutation(convexApi.marketplace.adjustStock);

  const [editorOpen, setEditorOpen] = useState(() => params.get("new") === "1");
  const [editing, setEditing] = useState<Listing | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [deleteTarget, setDeleteTarget] = useState<Listing | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const approved = user?.sellerStatus === "approved";
  const ledgerByListing = new Map((ledger ?? []).map((row) => [row.listingId, row]));
  const myListings = catalogue;

  const openEdit = (listing: Listing) => {
    setEditing(listing);
    setDraft({
      title: listing.title,
      category: listing.category,
      price: String(listing.price),
      followers: String(listing.followers),
      niche: listing.niche,
      description: listing.description,
      stock: String(ledgerByListing.get(listing.id)?.stock ?? listing.stock),
    });
    setEditorOpen(true);
  };

  const save = async () => {
    const price = Number(draft.price);
    const followers = Number(draft.followers);
    const stock = Math.floor(Number(draft.stock));
    if (!draft.title.trim() || !price || !followers) {
      toast.error("Please fill in title, price and follower count.");
      return;
    }
    if (!Number.isFinite(stock) || stock < 0) {
      toast.error("Stock must be zero or more.");
      return;
    }
    const category = categories.find((c) => c.slug === draft.category);

    if (editing) {
      api.updateListing(editing.id, {
        title: draft.title.trim(),
        category: draft.category,
        brand: category?.brand ?? editing.brand,
        price,
        followers,
        niche: draft.niche.trim() || editing.niche,
        description: draft.description.trim() || editing.description,
        stock,
        status: stock > 0 && editing.status === "sold" ? "active" : "pending",
      });
      try {
        // Re-register with the ledger so server price/stock stay authoritative.
        await publishListing({
          listingId: editing.id,
          title: draft.title.trim(),
          brand: category?.brand ?? editing.brand,
          priceUsd: price,
          stock,
        });
        toast.success("Listing updated — price and stock saved on the server.");
      } catch (err) {
        toast.error("Saved locally, but the server rejected the update", {
          description: err instanceof Error ? err.message : "Please try again.",
        });
      }
      setEditorOpen(false);
      return;
    }

    const created = api.createListing({
      title: draft.title.trim(),
      category: draft.category,
      brand: category?.brand ?? "instagram",
      sellerId: DEMO_SELLER_ID,
      price,
      rating: 0,
      reviewCount: 0,
      followers,
      niche: draft.niche.trim() || "General",
      description: draft.description.trim() || "Description pending.",
      features: [
        "Verified proof of ownership and transfer record",
        "Original registration email included with full access",
        "Escrow-protected transfer with dispute coverage",
      ],
      stock,
      deliveryTime: "Within 24 hours",
    });
    try {
      await publishListing({
        listingId: created.id,
        title: created.title,
        brand: created.brand,
        priceUsd: price,
        stock,
      });
      toast.success("Listing created — stock is now tracked on the server.");
    } catch (err) {
      toast.error("Listing created but not published to the server", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    }
    setEditorOpen(false);
  };

  const step = async (listing: Listing, delta: number) => {
    const row = ledgerByListing.get(listing.id);
    if (!row) {
      api.adjustStock(listing.id, delta);
      return;
    }
    setBusyId(listing.id);
    try {
      await adjustStock({ listingId: listing.id, delta });
    } catch (err) {
      toast.error("Could not update stock", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setBusyId(null);
    }
  };

  if (!approved) {
    return (
      <DashLayout title="My listings" nav={sellerNav}>
        <div className="glass mx-auto max-w-lg p-8 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-amber-500/15">
            <Lock className="size-5 text-amber-600" />
          </span>
          <h2 className="mt-4 text-lg font-semibold">Store approval required</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {user?.sellerStatus === "pending"
              ? "Your store is being reviewed. Listing creation unlocks the moment an admin approves it."
              : "Set up your store and answer the required questions before you can publish listings."}
          </p>
          <Button className="mt-5 rounded-xl" asChild>
            <Link to="/seller/apply">
              {user?.sellerStatus === "pending" ? "View store status" : "Set up my store"}
            </Link>
          </Button>
        </div>
      </DashLayout>
    );
  }

  return (
    <DashLayout title="My listings" nav={sellerNav}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {myListings.length} listing{myListings.length === 1 ? "" : "s"} ·{" "}
            {myListings.reduce(
              (sum, l) => sum + (ledgerByListing.get(l.id)?.stock ?? l.stock),
              0,
            )}{" "}
            units in stock · stock is tracked on the server, so it updates in
            real time across the marketplace.
          </p>
          <Button
            className="rounded-xl"
            onClick={() => {
              setEditing(null);
              setDraft(emptyDraft);
              setEditorOpen(true);
            }}
          >
            <Plus className="size-4" />
            Create listing
          </Button>
        </div>

        <p className="flex items-start gap-2 rounded-xl bg-emerald-500/10 px-4 py-3 text-xs text-emerald-700">
          <ShieldAlert className="mt-px size-3.5 shrink-0" />
          Keep every buyer on AccsMartHub: never put a phone number, email or
          chat handle in a listing. Off-platform deals void escrow and are
          reported to our trust team.
        </p>

        {myListings.length === 0 ? (
          <EmptyState
            title="No listings yet"
            description="Create your first listing — it goes live after a quick moderation check."
          />
        ) : (
          <div className="glass overflow-hidden">
            <div className="hidden grid-cols-[1fr_7rem_9rem_7rem_9rem] gap-4 border-b border-border/70 px-6 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:grid">
              <span>Listing</span>
              <span>Price</span>
              <span className="text-center">Stock</span>
              <span>Status</span>
              <span className="text-right">Actions</span>
            </div>
            <ul className="divide-y divide-border/60">
              {myListings.map((l) => {
                const row = ledgerByListing.get(l.id);
                const stock = row?.stock ?? l.stock;
                const busy = busyId === l.id;
                return (
                  <li
                    key={l.id}
                    className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-6"
                  >
                    <span className="flex size-10 items-center justify-center rounded-xl border border-border/60 bg-muted/40">
                      <BrandMark brand={l.brand} colored className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{l.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {l.followers.toLocaleString()} followers · {l.niche}
                        {row ? "" : " · not yet synced to inventory"}
                      </span>
                    </span>
                    <span className="w-16 text-sm font-semibold tabular-nums">
                      {formatPrice(row?.priceUsd ?? l.price)}
                    </span>
                    <span className="inline-flex items-center justify-center gap-1 rounded-full border border-border bg-white p-0.5">
                      <button
                        type="button"
                        aria-label={`Remove one unit of ${l.title}`}
                        disabled={busy || stock === 0}
                        onClick={() => step(l, -1)}
                        className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                      >
                        <Minus className="size-3.5" />
                      </button>
                      <span className="w-7 text-center text-sm font-bold tabular-nums">
                        {stock}
                      </span>
                      <button
                        type="button"
                        aria-label={`Add one unit of ${l.title}`}
                        disabled={busy}
                        onClick={() => step(l, 1)}
                        className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </span>
                    <StatusBadge status={l.status} />
                    <span className="flex w-full justify-end gap-1.5 lg:w-auto">
                      {l.status === "active" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-lg"
                          onClick={() => {
                            api.updateListing(l.id, { status: "paused" });
                            toast("Listing paused");
                          }}
                        >
                          Pause
                        </Button>
                      ) : l.status === "paused" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-lg"
                          onClick={() => {
                            api.updateListing(l.id, { status: "active" });
                            toast.success("Listing active");
                          }}
                        >
                          Activate
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-8 rounded-lg"
                        aria-label={`Edit ${l.title}`}
                        onClick={() => openEdit(l)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-8 rounded-lg text-muted-foreground hover:text-destructive"
                        aria-label={`Delete ${l.title}`}
                        onClick={() => setDeleteTarget(l)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* Create / edit dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="glass max-h-[90vh] overflow-y-auto border-border/70 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit listing" : "Create listing"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Price and stock are re-validated on the server when you save."
                : "New listings are reviewed before appearing in the marketplace."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="draft-title">Title</Label>
              <Input
                id="draft-title"
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                className="inset-well rounded-xl border-border/60"
                placeholder="e.g. Aurora Lifestyle Theme Page"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Platform</Label>
                <Select
                  value={draft.category}
                  onValueChange={(v) => setDraft((d) => ({ ...d, category: v }))}
                >
                  <SelectTrigger className="inset-well rounded-xl border-border/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.slug} value={c.slug}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="draft-price">Price (USD)</Label>
                <Input
                  id="draft-price"
                  type="number"
                  min={1}
                  value={draft.price}
                  onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))}
                  className="inset-well rounded-xl border-border/60"
                  placeholder="3500"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="draft-followers">Followers</Label>
                <Input
                  id="draft-followers"
                  type="number"
                  min={1}
                  value={draft.followers}
                  onChange={(e) => setDraft((d) => ({ ...d, followers: e.target.value }))}
                  className="inset-well rounded-xl border-border/60"
                  placeholder="120000"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="draft-stock">Units available</Label>
                <Input
                  id="draft-stock"
                  type="number"
                  min={0}
                  step={1}
                  value={draft.stock}
                  onChange={(e) => setDraft((d) => ({ ...d, stock: e.target.value }))}
                  className="inset-well rounded-xl border-border/60"
                  placeholder="1"
                />
                <p className="text-xs text-muted-foreground">
                  How many buyers can purchase this listing. Set 0 to mark it
                  sold out.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="draft-niche">Niche</Label>
                <Input
                  id="draft-niche"
                  value={draft.niche}
                  onChange={(e) => setDraft((d) => ({ ...d, niche: e.target.value }))}
                  className="inset-well rounded-xl border-border/60"
                  placeholder="Fitness, travel, finance…"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="draft-description">Description</Label>
              <Textarea
                id="draft-description"
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                className="inset-well min-h-24 rounded-xl border-border/60"
                placeholder="Describe the account, its audience and what's included in the transfer…"
              />
              <p className="text-xs text-muted-foreground">
                Never include contact details or external links — buyers must
                transact through escrow.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="rounded-xl" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button className="rounded-xl" onClick={save}>
              {editing ? "Save changes" : "Submit for approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title={`Delete “${deleteTarget?.title ?? ""}”?`}
        description="This permanently removes the listing. Orders already in escrow are unaffected."
        confirmLabel="Delete listing"
        destructive
        onConfirm={() => {
          if (deleteTarget) {
            api.deleteListing(deleteTarget.id);
            toast("Listing deleted");
          }
        }}
      />
    </DashLayout>
  );
}