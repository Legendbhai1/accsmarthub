import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DashLayout } from "@/components/dash/DashLayout";
import { sellerNav } from "@/components/dash/navs";
import { SERVICE_CATEGORIES } from "@/lib/db";
import { readMyStore, friendlyError } from "@/lib/supabaseData";
import { submitStore, publicAssetUrl } from "@/lib/supabaseMutations";
import { toast } from "sonner";

export default function SellerSettings() {
  const [store, setStore] = useState<Awaited<ReturnType<typeof readMyStore>> | null>(null);
  const [loading, setLoading] = useState(true);

  const [storeName, setStoreName] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [deliverySpeed, setDeliverySpeed] = useState("");
  const [accessFormat, setAccessFormat] = useState("");
  const [replacementPolicy, setReplacementPolicy] = useState("");
  const [restrictedRegions, setRestrictedRegions] = useState("");
  const [sourcing, setSourcing] = useState("");
  const [contactPolicyAccepted, setContactPolicyAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const row = await readMyStore();
        if (!cancelled) {
          setStore(row);
          if (row) {
            setStoreName(row.store_name ?? "");
            setPlatforms(row.platforms ?? []);
            setDeliverySpeed(row.delivery_speed ?? "");
            setAccessFormat(row.access_format ?? "");
            setReplacementPolicy(row.replacement_policy ?? "");
            setRestrictedRegions(row.restricted_regions ?? "");
            setSourcing(row.sourcing ?? "");
            setContactPolicyAccepted(Boolean(row.contact_policy));
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const platformOptions = SERVICE_CATEGORIES.map((c) => c.slug);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!contactPolicyAccepted) {
      setSubmitError("Please accept the contact policy.");
      return;
    }
    if (!storeName.trim()) {
      setSubmitError("Store name is required.");
      return;
    }

    setSubmitting(true);
    try {
      await submitStore({
        storeName: storeName.trim(),
        slug: store?.slug ?? storeName.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") || "store",
        platforms,
        deliverySpeed,
        accessFormat,
        replacementPolicy,
        restrictedRegions,
        sourcing,
        contactPolicy: contactPolicyAccepted,
      });
      toast.success("Store updated");
      const updated = await readMyStore();
      setStore(updated);
    } catch (err) {
      setSubmitError(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashLayout title="Store settings" nav={sellerNav}>
      <div className="mx-auto max-w-2xl space-y-6">
        {loading && (
          <p className="text-sm text-muted-foreground">Loading store settings…</p>
        )}

        {!loading && store && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="glass p-6 space-y-4">
              <h2 className="text-lg font-semibold">Store details</h2>

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
                {submitting ? "Saving…" : "Save store"}
              </Button>
            </div>
          </form>
        )}

        {!loading && !store && (
          <div className="glass p-6 text-center">
            <p className="text-sm text-muted-foreground">No store yet. Apply first to create one.</p>
          </div>
        )}
      </div>
    </DashLayout>
  );
}
