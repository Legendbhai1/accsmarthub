import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { KeyRound } from "lucide-react";
import { Lock, Pencil, Plus, ShieldAlert, Trash2 } from "lucide-react";
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
import { SERVICE_CATEGORIES } from "@/lib/db";
import {
  useSellerListings,
  useCredentialStatuses,
  type SellerListingsRow,
} from "@/lib/supabaseQueries";
import {
  createListing,
  updateListing,
  deleteListing,
  uploadCredentials,
  uploadSellerAsset,
  publicAssetUrl,
} from "@/lib/supabaseMutations";
import { useSession } from "@/lib/session";
import { toast } from "sonner";

type FaqDraft = { question: string; answer: string };

const emptyDraft = {
  title: "",
  summary: "",
  category: "instagram",
  price: "",
  features: "",
  discount: "0",
  warranty: "24",
  hidden: false,
  faq: [] as FaqDraft[],
};

/**
 * Listings and inventory.
 *
 * Creating a listing requires a store an admin has approved — the server
 * rejects it otherwise, and every new listing lands in `pending`.
 *
 * Stock is NOT set by hand. The moderation trigger pins `listings.stock` on
 * seller writes, and `upload_credentials` resets it to the number of credential
 * units nobody has claimed yet. So the real inventory control is the credential
 * vault: attach N accounts and you have N units to sell. That is deliberate —
 * a seller cannot advertise inventory they have not actually attached.
 */
export default function SellerListings() {
  const { user } = useSession();
  const [params] = useSearchParams();
  const listingsQuery = useSellerListings();
  const myListings = listingsQuery.data ?? [];

  const credentialStatusQuery = useCredentialStatuses(myListings.map((l) => l.id));
  const credentialStatus = credentialStatusQuery.data ?? {};

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [editorOpen, setEditorOpen] = useState(() => params.get("new") === "1");
  const [editing, setEditing] = useState<SellerListingsRow | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SellerListingsRow | null>(null);
  const [vaultFor, setVaultFor] = useState<string | null>(null);
  const [vaultText, setVaultText] = useState("");
  const [vaultName, setVaultName] = useState("");
  const [vaultFiles, setVaultFiles] = useState<
    { unitKey: string; fileName: string; credentials: string }[]
  >([]);
  const [savingVault, setSavingVault] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const approved = user?.sellerStatus === "approved";

  const openEdit = (listing: SellerListingsRow) => {
    setEditing(listing);
    setDraft({
      title: listing.title,
      summary: listing.summary ?? "",
      category: listing.service_category ?? SERVICE_CATEGORIES[0]?.slug ?? "instagram",
      price: String(listing.price_usd),
      features: (listing.features ?? []).join("\n"),
      discount: String(listing.discount_percent ?? 0),
      warranty: String(listing.warranty_hours ?? 24),
      hidden: Boolean(listing.hidden),
      faq: (listing.faq ?? []).map((f) => ({ ...f })),
    });
    setImageFile(null);
    setEditorOpen(true);
  };

  const save = async () => {
    const price = Number(draft.price);
    const discount = Number(draft.discount);
    const warranty = Number(draft.warranty);
    if (!draft.title.trim() || !price || price <= 0) {
      toast.error("Please fill in a title and a price.");
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

    setSaving(true);
    try {
      const imagePath = imageFile
        ? await uploadSellerAsset(imageFile, "listing-assets")
        : (editing?.image_path ?? null);

      const payload = {
        title: draft.title.trim(),
        brand: category?.brand ?? editing?.brand ?? "instagram",
        summary: draft.summary.trim(),
        features,
        faq,
        imagePath,
        serviceCategory: draft.category,
        discountPercent: discount,
        warrantyHours: warranty,
        hidden: draft.hidden,
        priceUsd: price,
      };

      if (editing) {
        await updateListing(editing.id, payload);
        toast.success("Listing updated.");
      } else {
        await createListing(payload);
        toast.success("Listing submitted for review.", {
          description:
            "An admin reviews new listings before they go live. Attach credentials to give it stock.",
        });
      }
      setEditorOpen(false);
      setImageFile(null);
      void listingsQuery.refresh();
    } catch (err) {
      toast.error("Could not save the listing", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleVisibility = async (l: SellerListingsRow) => {
    setBusyId(l.id);
    try {
      // A seller cannot change `status` — the moderation trigger pins it and
      // only an admin may pause/activate. `hidden` is the one visibility lever
      // a seller controls, so that is what this toggles.
      await updateListing(l.id, {
        title: l.title,
        brand: l.brand,
        summary: l.summary ?? "",
        features: l.features ?? [],
        faq: l.faq ?? [],
        imagePath: l.image_path,
        serviceCategory: l.service_category,
        discountPercent: l.discount_percent ?? 0,
        warrantyHours: l.warranty_hours ?? 0,
        hidden: !l.hidden,
        priceUsd: Number(l.price_usd),
      });
      void listingsQuery.refresh();
      toast.success(l.hidden ? "Listing is now visible" : "Listing hidden from the storefront");
    } catch (err) {
      toast.error("Could not update the listing", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      await deleteListing(deleteTarget.id);
      void listingsQuery.refresh();
      toast("Listing deleted");
    } catch (err) {
      toast.error("Could not delete the listing", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setBusyId(null);
      setDeleteTarget(null);
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
            {myListings.reduce((sum, l) => sum + l.stock, 0)} units in stock ·
            stock is the number of credential accounts nobody has claimed yet, so
            it updates in real time across the marketplace.
          </p>
          <Button
            className="rounded-xl"
            onClick={() => {
              setEditing(null);
              setDraft(emptyDraft);
              setImageFile(null);
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

        {listingsQuery.loading ? (
          <p className="text-sm text-muted-foreground">Loading your listings…</p>
        ) : myListings.length === 0 ? (
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
                const busy = busyId === l.id;
                const creds = credentialStatus[l.id];
                return (
                  <li
                    key={l.id}
                    className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-6"
                  >
                    <span className="flex size-10 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-muted/40">
                      {l.image_path ? (
                        <img
                          src={publicAssetUrl("listing-assets", l.image_path)}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        <BrandMark brand={l.brand} colored className="size-5" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {l.title}
                        {l.hidden ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            (hidden)
                          </span>
                        ) : null}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {l.service_category ?? l.brand}
                        {creds?.attached
                          ? ` · ${creds.totalUnits} account${
                              creds.totalUnits === 1 ? "" : "s"
                            } attached`
                          : " · no credentials attached yet"}
                      </span>
                    </span>
                    <span className="w-16 text-sm font-semibold tabular-nums">
                      {formatPrice(l.price_usd)}
                    </span>
                    <span className="w-16 text-center">
                      <span className="text-sm font-bold tabular-nums">{l.stock}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        units
                      </span>
                    </span>
                    <StatusBadge status={l.status} />
                    <span className="flex w-full justify-end gap-1.5 lg:w-auto">
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-8 rounded-lg"
                        aria-label={`Manage credentials for ${l.title}`}
                        title={
                          creds?.attached
                            ? `${creds.availableUnits} of ${creds.totalUnits} accounts still unsold — click to manage`
                            : "Attach the credentials buyers will download"
                        }
                        onClick={() => {
                          setVaultFor(l.id);
                          setVaultText("");
                          setVaultName("");
                          setVaultFiles([]);
                        }}
                      >
                        <KeyRound
                          className={
                            creds?.attached
                              ? "size-3.5 text-emerald-600"
                              : "size-3.5 text-amber-600"
                          }
                        />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-lg"
                        disabled={busy}
                        onClick={() => toggleVisibility(l)}
                      >
                        {l.hidden ? "Show" : "Hide"}
                      </Button>
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
                ? "Price and content are re-validated on the server when you save."
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
                  <strong>Stock comes from the vault.</strong> Attach one
                  account per unit you want to sell — stock is the number of
                  unclaimed accounts, so you cannot advertise what you do not
                  have.
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
                  step="0.01"
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
            </div>

            <label className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm">
              <input
                type="checkbox"
                checked={draft.hidden}
                onChange={(e) => setDraft((d) => ({ ...d, hidden: e.target.checked }))}
                className="size-4 accent-primary"
              />
              Hide from storefront
              <span className="text-xs text-muted-foreground">
                Keep the listing but stop showing it in search and category
                pages.
              </span>
            </label>

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
            <Button className="rounded-xl" onClick={save} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Submit for approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credential vault — one .txt per listing, reused by every buyer. */}
      <Dialog open={!!vaultFor} onOpenChange={() => setVaultFor(null)}>
        <DialogContent className="glass max-h-[90vh] overflow-y-auto border-border/70 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Account credentials</DialogTitle>
            <DialogDescription>
              Paste the credentials buyers receive after they pay. Stored
              encrypted and shared from one copy, no matter how many people buy
              this listing. Each account you attach adds one unit of stock.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="vault-file">Upload .txt files</Label>
              <Input
                id="vault-file"
                type="file"
                multiple
                accept=".txt,text/plain"
                onChange={async (e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length === 0) return;
                  const tooBig = files.find((f) => f.size > 60_000);
                  if (tooBig) {
                    toast.error(`${tooBig.name} is too large (60KB maximum).`);
                    return;
                  }
                  const loaded = await Promise.all(
                    files.map(async (file) => ({
                      unitKey: file.name.replace(/\.txt$/i, ""),
                      fileName: file.name,
                      credentials: await file.text(),
                    })),
                  );
                  setVaultFiles(loaded);
                  setVaultText("");
                  setVaultName("");
                }}
                className="inset-well rounded-xl border-border/60"
              />
              <p className="text-xs text-muted-foreground">
                One file per unit in stock — each buyer receives a different
                account. You can also type a single account below.
              </p>
            </div>

            {vaultFiles.length > 0 && (
              <ul className="space-y-1.5">
                {vaultFiles.map((f, i) => (
                  <li
                    key={f.unitKey}
                    className="inset-well flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
                  >
                    <KeyRound className="size-3.5 shrink-0 text-emerald-600" />
                    <span className="min-w-0 flex-1 truncate">{f.fileName}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${f.fileName}`}
                      onClick={() =>
                        setVaultFiles((prev) => prev.filter((_, idx) => idx !== i))
                      }
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="grid gap-2">
              <Label htmlFor="vault-name">File name</Label>
              <Input
                id="vault-name"
                value={vaultName}
                onChange={(e) => setVaultName(e.target.value)}
                className="inset-well rounded-xl border-border/60"
                placeholder={`${vaultFor ?? "listing"}-unit-1.txt`}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="vault-text">Credentials</Label>
              <Textarea
                id="vault-text"
                value={vaultText}
                onChange={(e) => setVaultText(e.target.value)}
                className="inset-well min-h-48 rounded-xl border-border/60 font-mono text-xs"
                placeholder={"username: someone@example.com\npassword: …\n2fa backup: …"}
              />
              <p className="text-xs text-muted-foreground">
                Do not include links — they are rejected. Only the account
                details themselves are delivered.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              className="rounded-xl"
              onClick={() => setVaultFor(null)}
            >
              Cancel
            </Button>
            <Button
              className="rounded-xl"
              disabled={
                savingVault ||
                (vaultFiles.length === 0 && !vaultText.trim())
              }
              onClick={async () => {
                if (!vaultFor) return;
                setSavingVault(true);
                try {
                  const files =
                    vaultFiles.length > 0
                      ? vaultFiles
                      : [
                          {
                            unitKey: vaultName.replace(/\.txt$/i, "") || "unit-1",
                            fileName: vaultName || `${vaultFor}-unit-1.txt`,
                            credentials: vaultText,
                          },
                        ];
                  const result = await uploadCredentials({
                    listingId: vaultFor,
                    units: files,
                  });
                  toast.success("Credentials saved", {
                    description: `${result.uploaded} account${
                      result.uploaded === 1 ? "" : "s"
                    } encrypted and stored.${
                      result.availableUnits !== undefined
                        ? ` ${result.availableUnits} unit${
                            result.availableUnits === 1 ? "" : "s"
                          } now available to sell.`
                        : ""
                    }`,
                  });
                  setVaultFor(null);
                  setVaultText("");
                  setVaultName("");
                  setVaultFiles([]);
                  void listingsQuery.refresh();
                  void credentialStatusQuery.refresh();
                } catch (err) {
                  toast.error("Could not save credentials", {
                    description: err instanceof Error ? err.message : "Please try again.",
                  });
                } finally {
                  setSavingVault(false);
                }
              }}
            >
              {savingVault ? "Saving…" : "Save credentials"}
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
        onConfirm={remove}
      />
    </DashLayout>
  );
}