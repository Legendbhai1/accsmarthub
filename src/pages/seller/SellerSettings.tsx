import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link } from "react-router";
import { CheckCircle2, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DashLayout } from "@/components/dash/DashLayout";
import { sellerNav } from "@/components/dash/navs";
import { StatusBadge } from "@/components/common/Primitives";
import { SERVICE_CATEGORIES } from "@/lib/db";
import { api as convexApi } from "@/convex/_generated/api";
import { toast } from "sonner";

/**
 * Store settings — edit the answers buyers see on every one of your
 * listings. Saving re-submits the store for admin review, because the
 * answers are part of what a buyer relies on.
 */
export default function SellerSettings() {
  const store = useQuery(convexApi.stores.myStore);
  const submitStore = useMutation(convexApi.stores.submitStore);

  const [saving, setSaving] = useState(false);
  const [accepted, setAccepted] = useState(true);
  const [form, setForm] = useState<{
    storeName: string;
    platforms: string;
    deliverySpeed: string;
    accessFormat: string;
    replacementPolicy: string;
    restrictedRegions: string;
    sourcing: string;
  } | null>(null);

  // Seed the form from the server record the first time it arrives.
  const current = form ?? {
    storeName: store?.storeName ?? "",
    platforms: (store?.platforms ?? []).join(", "),
    deliverySpeed: store?.deliverySpeed ?? "",
    accessFormat: store?.accessFormat ?? "",
    replacementPolicy: store?.replacementPolicy ?? "",
    restrictedRegions: store?.restrictedRegions ?? "",
    sourcing: store?.sourcing ?? "",
  };

  if (store === undefined) {
    return (
      <DashLayout title="Store settings" nav={sellerNav}>
        <p className="text-sm text-muted-foreground">Loading your store…</p>
      </DashLayout>
    );
  }

  if (!store) {
    return (
      <DashLayout title="Store settings" nav={sellerNav}>
        <div className="glass mx-auto max-w-lg p-8 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
            <Store className="size-5 text-muted-foreground" />
          </span>
          <h2 className="mt-4 text-lg font-semibold">No store yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Set up your store first — these answers are shown to buyers on
            every listing you publish.
          </p>
          <Button className="mt-5 rounded-xl" asChild>
            <Link to="/seller/apply">Set up my store</Link>
          </Button>
        </div>
      </DashLayout>
    );
  }

  const set = (key: keyof typeof current, value: string) =>
    setForm({ ...current, [key]: value });

  const save = async () => {
    setSaving(true);
    try {
      await submitStore({
        storeName: current.storeName,
        platforms: current.platforms.split(",").map((p) => p.trim()).filter(Boolean),
        deliverySpeed: current.deliverySpeed,
        accessFormat: current.accessFormat,
        replacementPolicy: current.replacementPolicy,
        restrictedRegions: current.restrictedRegions,
        sourcing: current.sourcing,
        contactPolicyAccepted: accepted,
      });
      setForm(null);
      toast.success("Store updated and sent for review", {
        description:
          "Your listings keep selling while an admin checks the new answers.",
      });
    } catch (err) {
      toast.error("Could not save your store", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashLayout title="Store settings" nav={sellerNav}>
      <div className="max-w-2xl space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Store settings</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Buyers see these answers on every listing you publish.
          </p>
        </div>

        <div className="glass flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            {store.logoUrl ? (
              <img
                src={store.logoUrl}
                alt=""
                className="size-11 rounded-xl object-cover"
              />
            ) : (
              <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-sm font-bold">
                {store.storeName.charAt(0)}
              </span>
            )}
            <div>
              <p className="text-sm font-semibold">{store.storeName}</p>
              <p className="text-xs text-muted-foreground">/{store.slug}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={store.status} />
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <CheckCircle2 className="size-3.5" />
              escrow protected
            </span>
          </div>
        </div>

        {store.status === "rejected" && store.reviewNote && (
          <div className="rounded-xl border border-destructive/25 bg-destructive/[0.05] px-4 py-3.5 text-sm">
            <p className="font-semibold text-destructive">
              Changes needed before you can list
            </p>
            <p className="mt-1 text-destructive/90">{store.reviewNote}</p>
          </div>
        )}

        <div className="glass space-y-4 p-6">
          <div className="grid gap-2">
            <Label htmlFor="store-name">Store name</Label>
            <Input
              id="store-name"
              value={current.storeName}
              onChange={(e) => set("storeName", e.target.value)}
              className="inset-well rounded-xl border-border/60"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="store-platforms">Platforms sold</Label>
            <Input
              id="store-platforms"
              value={current.platforms}
              onChange={(e) => set("platforms", e.target.value)}
              className="inset-well rounded-xl border-border/60"
              placeholder="Instagram, TikTok, Gmail"
            />
            <p className="text-xs text-muted-foreground">
              Comma separated. Common services:{" "}
              {SERVICE_CATEGORIES.slice(0, 8)
                .map((c) => c.name)
                .join(", ")}
              .
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="store-speed">Delivery speed</Label>
            <Input
              id="store-speed"
              value={current.deliverySpeed}
              onChange={(e) => set("deliverySpeed", e.target.value)}
              className="inset-well rounded-xl border-border/60"
              placeholder="Within 30 minutes"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="store-access">What the buyer receives</Label>
            <Textarea
              id="store-access"
              value={current.accessFormat}
              onChange={(e) => set("accessFormat", e.target.value)}
              className="inset-well min-h-20 rounded-xl border-border/60"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="store-replacement">Replacement policy</Label>
            <Input
              id="store-replacement"
              value={current.replacementPolicy}
              onChange={(e) => set("replacementPolicy", e.target.value)}
              className="inset-well rounded-xl border-border/60"
              placeholder="Free replacement within 24 hours"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="store-regions">Regions not served</Label>
            <Input
              id="store-regions"
              value={current.restrictedRegions}
              onChange={(e) => set("restrictedRegions", e.target.value)}
              className="inset-well rounded-xl border-border/60"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="store-sourcing">Where inventory comes from</Label>
            <Textarea
              id="store-sourcing"
              value={current.sourcing}
              onChange={(e) => set("sourcing", e.target.value)}
              className="inset-well min-h-20 rounded-xl border-border/60"
            />
          </div>

          <label className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 size-4 accent-[#15172b]"
            />
            <span>
              I will never share a phone number, email or chat handle. All
              deals transact through AccsMartHub escrow.
            </span>
          </label>

          <Button className="rounded-xl" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save and resubmit for review"}
          </Button>
        </div>
      </div>
    </DashLayout>
  );
}
