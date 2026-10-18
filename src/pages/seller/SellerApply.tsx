import { useState } from "react";
import { useNavigate } from "react-router";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DashLayout } from "@/components/dash/DashLayout";
import { sellerNav } from "@/components/dash/navs";
import { StatusBadge } from "@/components/common/Primitives";
import { SERVICE_CATEGORIES } from "@/lib/db";
import { readMyStore, friendlyError } from "@/lib/supabaseData";
import { submitStore, publicAssetUrl } from "@/lib/supabaseMutations";
import { toast } from "sonner";

export default function SellerApply() {
  const navigate = useNavigate();
  const [storeName, setStoreName] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [deliverySpeed, setDeliverySpeed] = useState("");
  const [accessFormat, setAccessFormat] = useState("");
  const [replacementPolicy, setReplacementPolicy] = useState("");
  const [restrictedRegions, setRestrictedRegions] = useState("");
  const [sourcing, setSourcing] = useState("");
  const [contactPolicyAccepted, setContactPolicyAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [store, setStore] = useState<Awaited<ReturnType<typeof readMyStore>> | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const platformOptions = SERVICE_CATEGORIES.map((c) => c.slug);

  const existing = store;
  const isSubmitted = existing != null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!contactPolicyAccepted) {
      setSubmitError("Please accept the contact policy to continue.");
      return;
    }
    if (!storeName.trim()) {
      setSubmitError("Store name is required.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitStore({
        storeName: storeName.trim(),
        platforms,
        deliverySpeed,
        accessFormat,
        replacementPolicy,
        restrictedRegions,
        sourcing,
        contactPolicyAccepted,
      });
      setStore(result);
      toast.success(isSubmitted ? "Store updated" : "Store application submitted");
      if (!isSubmitted) {
        navigate("/seller");
      }
    } catch (err) {
      setSubmitError(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashLayout title="Apply to sell" nav={sellerNav}>
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="glass p-6">
          <h2 className="text-lg font-semibold">Store profile</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This is how buyers will see your store. You can revise it later.
          </p>

          {isSubmitted && (
            <div className="mt-4 rounded-xl border border-border/70 bg-muted/30 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{store.store_name}</p>
                  <p className="text-xs text-muted-foreground">/{store.slug}</p>
                </div>
                <StatusBadge status={store.status} />
              </div>
              {store.logo_path && (
                <img
                  src={publicAssetUrl("store-assets", store.logo_path)}
                  alt={store.store_name}
                  className="mt-3 h-20 w-20 rounded-lg border border-border/60 object-cover"
                />
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="store-name">Store name</Label>
              <Input
                id="store-name"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="My Digital Store"
              />
            </div>

            <div className="space-y-2">
              <Label>Platforms</Label>
              <div className="flex flex-wrap gap-2">
                {platformOptions.map((p) => (
                  <Button
                    key={p}
                    type="button"
                    variant={platforms.includes(p) ? "default" : "outline"}
                    className="rounded-full"
                    onClick={() =>
                      setPlatforms((prev) =>
                        prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
                      )
                    }
                  >
                    {p}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="delivery-speed">Delivery speed</Label>
                <Input
                  id="delivery-speed"
                  value={deliverySpeed}
                  onChange={(e) => setDeliverySpeed(e.target.value)}
                  placeholder="Within 24 hours"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="access-format">Access format</Label>
                <Input
                  id="access-format"
                  value={accessFormat}
                  onChange={(e) => setAccessFormat(e.target.value)}
                  placeholder="Login + guide"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="replacement-policy">Replacement policy</Label>
              <Textarea
                id="replacement-policy"
                value={replacementPolicy}
                onChange={(e) => setReplacementPolicy(e.target.value)}
                placeholder="What happens if a buyer's issue is valid?"
                className="min-h-20 resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="restricted-regions">Restricted regions</Label>
              <Input
                id="restricted-regions"
                value={restrictedRegions}
                onChange={(e) => setRestrictedRegions(e.target.value)}
                placeholder="Comma-separated countries"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sourcing">Sourcing</Label>
              <Textarea
                id="sourcing"
                value={sourcing}
                onChange={(e) => setSourcing(e.target.value)}
                placeholder="How do you vet the accounts you sell?"
                className="min-h-20 resize-none"
              />
            </div>

            <div className="flex items-center gap-3">
              <Checkbox
                id="contact-policy"
                checked={contactPolicyAccepted}
                onCheckedChange={(checked) => setContactPolicyAccepted(Boolean(checked))}
              />
              <Label
                htmlFor="contact-policy"
                className="text-sm leading-relaxed cursor-pointer"
              >
                I will keep every conversation and payment on the platform.
              </Label>
            </div>

            {submitError && (
              <p className="text-sm text-destructive">{submitError}</p>
            )}

            <Button type="submit" className="rounded-xl" disabled={submitting}>
              {submitting
                ? "Submitting…"
                : isSubmitted
                  ? "Update store"
                  : "Submit application"}
            </Button>
          </form>
        </div>
      </div>
    </DashLayout>
  );
}
