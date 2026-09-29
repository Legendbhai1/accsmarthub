import { useState } from "react";
import { useSearchParams } from "react-router";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
import { api, categories, useDb, type Listing } from "@/lib/db";
import { DEMO_SELLER_ID } from "@/pages/seller/SellerDashboard";
import { toast } from "sonner";

const emptyDraft = {
  title: "",
  category: "instagram",
  price: "",
  followers: "",
  niche: "",
  description: "",
};

export default function SellerListings() {
  const { listings } = useDb();
  const [params] = useSearchParams();
  const myListings = listings.filter((l) => l.sellerId === DEMO_SELLER_ID);

  // The create dialog opens automatically when arriving via /seller/listings?new=1
  const [editorOpen, setEditorOpen] = useState(() => params.get("new") === "1");
  const [editing, setEditing] = useState<Listing | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [deleteTarget, setDeleteTarget] = useState<Listing | null>(null);


  const openEdit = (listing: Listing) => {
    setEditing(listing);
    setDraft({
      title: listing.title,
      category: listing.category,
      price: String(listing.price),
      followers: String(listing.followers),
      niche: listing.niche,
      description: listing.description,
    });
    setEditorOpen(true);
  };

  const save = () => {
    const price = Number(draft.price);
    const followers = Number(draft.followers);
    if (!draft.title.trim() || !price || !followers) {
      toast.error("Please fill in title, price and follower count.");
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
        status: "pending",
      });
      toast.success("Listing updated — pending re-approval.");
    } else {
      api.createListing({
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
        stock: 1,
        deliveryTime: "Within 24 hours",
      });
      toast.success("Listing submitted for approval.");
    }
    setEditorOpen(false);
  };

  return (
    <DashLayout title="My listings" nav={sellerNav}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {myListings.length} listing{myListings.length === 1 ? "" : "s"} · new listings require approval before going live.
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

        {myListings.length === 0 ? (
          <EmptyState
            title="No listings yet"
            description="Create your first listing — it goes live after a quick moderation check."
          />
        ) : (
          <div className="glass overflow-hidden">
            <div className="hidden grid-cols-[1fr_7rem_7rem_9rem] gap-4 border-b border-border/70 px-6 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:grid">
              <span>Listing</span>
              <span>Price</span>
              <span>Status</span>
              <span className="text-right">Actions</span>
            </div>
            <ul className="divide-y divide-border/60">
              {myListings.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-6">
                  <span className="flex size-10 items-center justify-center rounded-xl border border-border/60 bg-muted/40">
                    <BrandMark brand={l.brand} colored className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{l.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {l.followers.toLocaleString()} followers · {l.niche}
                    </span>
                  </span>
                  <span className="w-16 text-sm font-semibold tabular-nums">
                    {formatPrice(l.price)}
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
              ))}
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
                ? "Edits are re-checked by moderation before going live again."
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
