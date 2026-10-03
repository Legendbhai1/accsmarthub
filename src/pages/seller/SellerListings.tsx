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
import { api, useDb, type Listing, DEMO_SELLER_ID, SERVICE_CATEGORIES } from "@/lib/db";
import { api as convexApi } from "@/convex/_generated/api";
import { useSession } from "@/lib/session";
import { toast } from "sonner";

type FaqDraft = { question: string; answer: string };

const emptyDraft = {
  title: "",
  summary: "",
  category: "instagram",
  price: "",
  followers: "",
  niche: "",
  description: "",
  features: "",
  stock: "1",
  discount: "0",
  warranty: "24",
  hidden: false,
  faq: [] as FaqDraft[],
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
  const generateListingUploadUrl = useMutation(
    convexApi.marketplace.generateListingUploadUrl,
  );
  const [imageFile, setImageFile] = useState<File | null>(null);

  const [editorOpen, setEditorOpen] = useState(() => params.get("new") === "1");
  const [editing, setEditing] = useState<Listing | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [deleteTarget, setDeleteTarget] = useState<Listing | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const approved = user?.sellerStatus === "approved";
  const ledgerByListing = new Map((ledger ?? []).map((row) => [row.listingId, row]));
  const myListings = catalogue;

  const openEdit = (listing: Listing) => {
    const row = ledgerByListing.get(listing.id);
    setEditing(listing);
    setDraft({
      title: listing.title,
      summary: row?.summary ?? "",
      category: listing.category,
      price: String(listing.price),
      followers: String(listing.followers),
      niche: listing.niche,
      description: listing.description,
      features: (row?.features ?? listing.features ?? []).join("\n"),
      stock: String(row?.stock ?? listing.stock),
      discount: String(row?.discountPercent ?? 0),
      warranty: String(row?.warrantyHours ?? 24),
      hidden: row?.hidden ?? false,
      faq: (row?.faq ?? []).map((f) => ({ ...f })),
    });
    setEditorOpen(true);
  };

  const save = async () => {
    const price = Number(draft.price);
    const followers = Number(draft.followers);
    const stock = Math.floor(Number(draft.stock));
    const discount = Number(draft.discount);
    const warranty = Number(draft.warranty);
    if (!draft.title.trim() || !price || !followers) {
      toast.error("Please fill in title, price and follower count.");
      return;
    }
    if (!Number.isFinite(stock) || stock < 0) {
      toast.error("Stock must be zero or more.");
      return;
    }
    if (!Number.isFinite(discount) || discount < 0 || discount > 90) {
      toast.error("Discount must be between 0 and 90%.");
      return;
    }
    if (!Number.isFinite(warranty) || warranty < 0) {
      toast.error("Warranty must be zero or more hours.");
      return;
    }
    const category = SERVICE_CATEGORIES.find((c) => c.slug === draft.category);
    const features = draft.features
      .split("\n")
      .map((f) => f.trim())
      .filter(Boolean);
    const faq = draft.faq
      .filter((f) => f.question.trim() || f.answer.trim())
      .map((f) => ({ question: f.question.trim(), answer: f.answer.trim() }));
    if (faq.some((f) => !f.question)) {
      toast.error("Every FAQ section needs a title.");
      return;
    }

    // Contact details are rejected on every text field, not only the
    // description — catch it before the round trip.
    const copy = [
      draft.title,
      draft.summary,
      draft.description,
      ...features,
      ...faq.map((f) => `${f.question} ${f.answer}`),
    ];
    const leaked = copy.find((text) =>
      /(?:\+\d[\s().-]*)?(?:\d[\s().-]*){9,}|[\w.+-]+@[\w-]+\.[\w.]+|(?:t\.me|@)[A-Za-z0-9_]{4,}|wa\.me|whatsapp|https?:\/\//i.test(
        text,
      ),
    );
    if (leaked) {
      toast.error("Your listing contains contact information.", {
        description:
          "Remove phone numbers, emails, chat handles and links — buyers must transact through escrow.",
      });
      return;
    }

    const uploadImage = async () => {
      const file = imageFile;
      if (!file) return undefined;
      const url = await generateListingUploadUrl();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error("Image upload failed. Try a smaller file.");
      const { storageId } = (await res.json()) as { storageId: string };
      return storageId;
    };

    try {
      const imageStorageId = await uploadImage();

      if (editing) {
        api.updateListing(editing.id, {
          title: draft.title.trim(),
          category: draft.category,
          brand: category?.brand ?? editing.brand,
          price,
          followers,
          niche: draft.niche.trim() || editing.niche,
          description: draft.description.trim() || editing.description,
          features,
          stock,
          status: stock > 0 && editing.status === "sold" ? "active" : "pending",
        });
        await publishListing({
          listingId: editing.id,
          title: draft.title.trim(),
          brand: category?.brand ?? editing.brand,
          priceUsd: price,
          stock,
          summary: draft.summary,
          features,
          faq,
          imageStorageId,
          discountPercent: discount,
          warrantyHours: warranty,
          hidden: draft.hidden,
        });
        toast.success("Listing updated — sent for review.");
      } else {
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
          features,
          stock,
          deliveryTime: "Within 24 hours",
        });
        await publishListing({
          listingId: created.id,
          title: created.title,
          brand: created.brand,
          priceUsd: price,
          stock,
          summary: draft.summary,
          features,
          faq,
          imageStorageId,
          discountPercent: discount,
          warrantyHours: warranty,
          hidden: draft.hidden,
        });
        toast.success("Listing submitted for review.", {
          description: "An admin reviews new listings before they go live.",
        });
      }
      setEditorOpen(false);
      setImageFile(null);
    } catch (err) {
      toast.error("Could not save the listing", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    }
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
            {/* Guidelines — the same rules the screenshots call out, kept in
                the project's own visual language rather than copied. */}
            <div className="rounded-xl border border-sky-500/25 bg-sky-500/[0.06] px-4 py-3.5 text-xs">
              <p className="font-semibold text-sky-900">Before you submit</p>
              <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-sky-900/80">
                <li>
                  <strong>No contact info.</strong> Phone numbers, emails and
                  chat handles in a listing get your account suspended.
                </li>
                <li>
                  <strong>Commission.</strong> AccsMartHub takes 10% of the
                  sale price. Your payout is calculated on the server.
                </li>
                <li>
                  <strong>Review window.</strong> New listings go to admin
                  review before they appear in the marketplace.
                </li>
              </ol>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="draft-title">Product title</Label>
              <Input
                id="draft-title"
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                className="inset-well rounded-xl border-border/60"
                placeholder="e.g. Premium Netflix 4K UHD Account"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="draft-summary">Short one-liner</Label>
              <Input
                id="draft-summary"
                value={draft.summary}
                onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value }))}
                className="inset-well rounded-xl border-border/60"
                placeholder="Shown on the listing card"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="draft-image">Cover image</Label>
              <Input
                id="draft-image"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                className="inset-well rounded-xl border-border/60"
              />
              <p className="text-xs text-muted-foreground">
                PNG, JPG, WebP or GIF up to 20MB.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Service category</Label>
                <Select
                  value={draft.category}
                  onValueChange={(v) => setDraft((d) => ({ ...d, category: v }))}
                >
                  <SelectTrigger className="inset-well rounded-xl border-border/60">
                    <SelectValue placeholder="Select a service" />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_CATEGORIES.map((c) => (
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
                  placeholder="0.00"
                />
                <p className="text-xs text-muted-foreground">
                  What the buyer pays before the escrow fee.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="draft-followers">Followers / audience size</Label>
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
                  Set 0 to mark it sold out.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="draft-discount">Discount (%)</Label>
                <Input
                  id="draft-discount"
                  type="number"
                  min={0}
                  max={90}
                  value={draft.discount}
                  onChange={(e) => setDraft((d) => ({ ...d, discount: e.target.value }))}
                  className="inset-well rounded-xl border-border/60"
                  placeholder="0"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="draft-warranty">Warranty window (hours)</Label>
                <Input
                  id="draft-warranty"
                  type="number"
                  min={0}
                  step={1}
                  value={draft.warranty}
                  onChange={(e) => setDraft((d) => ({ ...d, warranty: e.target.value }))}
                  className="inset-well rounded-xl border-border/60"
                  placeholder="24"
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

            <label className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm">
              <input
                type="checkbox"
                checked={draft.hidden}
                onChange={(e) => setDraft((d) => ({ ...d, hidden: e.target.checked }))}
                className="size-4 accent-[#15172b]"
              />
              Hide from storefront
              <span className="text-xs text-muted-foreground">
                Keep the listing but stop showing it in search and category
                pages.
              </span>
            </label>

            <div className="grid gap-2">
              <Label htmlFor="draft-description">Description</Label>
              <Textarea
                id="draft-description"
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                className="inset-well min-h-28 rounded-xl border-border/60"
                placeholder="Describe the product — quality, warranty, what's included…"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="draft-features">Features</Label>
              <Textarea
                id="draft-features"
                value={draft.features}
                onChange={(e) => setDraft((d) => ({ ...d, features: e.target.value }))}
                className="inset-well min-h-24 rounded-xl border-border/60"
                placeholder={"One feature per line, e.g.\nAuto delivery\n1 month warranty\n24/7 support"}
              />
            </div>

            <div className="grid gap-3">
              <div>
                <p className="text-sm font-semibold">FAQ / accordion sections</p>
                <p className="text-xs text-muted-foreground">
                  Optional — shown as expandable questions on the listing page.
                </p>
              </div>
              {draft.faq.map((item, index) => (
                <div
                  key={index}
                  className="grid gap-3 rounded-xl border border-border/60 bg-muted/20 p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">
                      Section {index + 1}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove FAQ section ${index + 1}`}
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          faq: d.faq.filter((_, i) => i !== index),
                        }))
                      }
                      className="text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <Input
                    aria-label={`FAQ section ${index + 1} title`}
                    value={item.question}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        faq: d.faq.map((f, i) =>
                          i === index ? { ...f, question: e.target.value } : f,
                        ),
                      }))
                    }
                    className="inset-well rounded-xl border-border/60"
                    placeholder="How does delivery work?"
                  />
                  <Textarea
                    aria-label={`FAQ section ${index + 1} answer`}
                    value={item.answer}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        faq: d.faq.map((f, i) =>
                          i === index ? { ...f, answer: e.target.value } : f,
                        ),
                      }))
                    }
                    className="inset-well min-h-24 rounded-xl border-border/60"
                    placeholder="Explain in detail…"
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                className="w-fit rounded-xl"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    faq: [...d.faq, { question: "", answer: "" }],
                  }))
                }
              >
                <Plus className="size-4" />
                Add FAQ section
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              By submitting you confirm this listing follows AccsMartHub&apos;s
              seller guidelines. Contact details in any field above are rejected
              automatically.
            </p>
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