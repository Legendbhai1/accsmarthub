import { useRef, useState } from "react";
import { Navigate } from "react-router";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  ClipboardList,
  Clock,
  ImagePlus,
  Loader2,
  Send,
  ShieldAlert,
  ShieldCheck,
  Store,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DashLayout } from "@/components/dash/DashLayout";
import { buyerNav } from "@/components/dash/navs";
import { api } from "@/convex/_generated/api";
import { useSession } from "@/lib/session";
import { toast } from "sonner";

const emptyForm = {
  storeName: "",
  platforms: "",
  deliverySpeed: "",
  accessFormat: "",
  replacementPolicy: "",
  restrictedRegions: "",
  sourcing: "",
  contactPolicy: false,
};

/**
 * Store setup, step one of becoming a seller.
 *
 * The seller answers the questions a buyer genuinely needs before purchase,
 * adds a logo, and accepts the no-off-platform-contact policy. The store is
 * then locked in "pending" until an admin approves it — listings cannot be
 * created before that, and the server rejects any attempt.
 */
export default function SellerApply() {
  const { user } = useSession();
  const store = useQuery(api.stores.myStore);
  const submitStore = useMutation(api.stores.submitStore);
  const requestUploadUrl = useMutation(api.stores.generateUploadUrl);
  const logoInput = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState(emptyForm);
  const [logoStorageId, setLogoStorageId] = useState<string | undefined>();
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (user && (user.role === "seller" || user.sellerStatus === "approved")) {
    return <Navigate to="/seller" replace />;
  }

  const status = store?.status;

  const pickLogo = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const uploadUrl = await requestUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error("Upload rejected by storage.");
      const { storageId } = (await res.json()) as { storageId: string };
      setLogoStorageId(storageId);
      setLogoPreview(URL.createObjectURL(file));
      toast.success("Logo uploaded");
    } catch (err) {
      toast.error("Could not upload the logo", {
        description: err instanceof Error ? err.message : "Try a PNG or JPG under 2 MB.",
      });
    } finally {
      setUploading(false);
      if (logoInput.current) logoInput.current.value = "";
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const platforms = form.platforms
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (form.storeName.trim().length < 3) {
      toast.error("Give your store a name of at least 3 characters.");
      return;
    }
    if (platforms.length === 0) {
      toast.error("List at least one platform you sell on.");
      return;
    }
    const answers = [
      form.deliverySpeed,
      form.accessFormat,
      form.replacementPolicy,
      form.restrictedRegions,
      form.sourcing,
    ];
    if (answers.some((a) => a.trim().length < 5)) {
      toast.error("Answer every question in full — buyers see these before buying.");
      return;
    }
    if (!form.contactPolicy) {
      toast.error("You must accept the no-off-platform-contact policy.");
      return;
    }
    setSubmitting(true);
    try {
      await submitStore({
        storeName: form.storeName.trim(),
        platforms,
        deliverySpeed: form.deliverySpeed.trim(),
        accessFormat: form.accessFormat.trim(),
        replacementPolicy: form.replacementPolicy.trim(),
        restrictedRegions: form.restrictedRegions.trim(),
        sourcing: form.sourcing.trim(),
        contactPolicyAccepted: true,
        logoStorageId,
      });
      toast.success("Store submitted for approval", {
        description:
          "An admin will review your answers and logo. You can keep buying meanwhile.",
      });
    } catch (err) {
      toast.error("Could not submit your store", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const previewLogo = logoStorageId
    ? logoPreview
    : store?.logoUrl ?? null;

  return (
    <DashLayout title="Set up your store" nav={buyerNav}>
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Set up your store</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Every account can buy and sell. To sell, answer the questions
            below — buyers see them on every listing — then wait for admin
            approval before you can publish.
          </p>
        </div>

        {!user?.emailVerified && (
          <div className="flex items-start gap-3 rounded-xl bg-amber-500/10 px-4 py-3 text-xs text-amber-700">
            <AlertTriangle className="mt-px size-4 shrink-0" />
            <span>
              Verify your email address before opening a store. Sign out and
              sign in again to receive a fresh verification code.
            </span>
          </div>
        )}

        {status === "pending" ? (
          <div className="glass p-6 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-amber-500/15">
              <Clock className="size-6 text-amber-600" />
            </span>
            <h3 className="mt-4 font-semibold">Store under review</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Your answers are with the trust team. Listing creation unlocks the
              moment an admin approves — you&apos;ll keep full buyer access in
              the meantime.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                {
                  icon: ClipboardList,
                  title: "Answer the questions",
                  text: "Everything a buyer needs before they pay.",
                },
                {
                  icon: ShieldCheck,
                  title: "Get approved",
                  text: "An admin checks your store details and logo.",
                },
                {
                  icon: Store,
                  title: "Start selling",
                  text: "Create listings once your store is approved.",
                },
              ].map(({ icon: Icon, title, text }) => (
                <div key={title} className="inset-well rounded-xl p-4">
                  <Icon className="size-5 text-primary" />
                  <p className="mt-2 text-sm font-medium">{title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{text}</p>
                </div>
              ))}
            </div>

            <form onSubmit={submit} className="glass grid gap-5 p-6">
              <div className="grid gap-2">
                <Label htmlFor="apply-store">Store name</Label>
                <Input
                  id="apply-store"
                  value={form.storeName}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, storeName: e.target.value }))
                  }
                  className="inset-well rounded-xl border-border/60"
                  placeholder="e.g. Meridian Digital"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="apply-logo">Store logo</Label>
                <div className="flex items-center gap-4">
                  <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border/70 bg-muted/40">
                    {previewLogo ? (
                      <img
                        src={previewLogo}
                        alt="Store logo"
                        className="size-full object-cover"
                      />
                    ) : (
                      <ImagePlus className="size-5 text-muted-foreground" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <input
                      ref={logoInput}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => pickLogo(e.target.files?.[0])}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-lg"
                      disabled={uploading}
                      onClick={() => logoInput.current?.click()}
                    >
                      {uploading ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Upload className="size-4" />
                      )}
                      {logoStorageId ? "Replace logo" : "Upload logo"}
                    </Button>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      PNG, JPG or WebP. Shown beside every listing you publish.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="apply-platforms">Platforms you sell on *</Label>
                <Input
                  id="apply-platforms"
                  value={form.platforms}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, platforms: e.target.value }))
                  }
                  className="inset-well rounded-xl border-border/60"
                  placeholder="Instagram, YouTube, TikTok — comma separated"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="apply-delivery">Typical delivery time *</Label>
                <Input
                  id="apply-delivery"
                  value={form.deliverySpeed}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, deliverySpeed: e.target.value }))
                  }
                  className="inset-well rounded-xl border-border/60"
                  placeholder="Within 30 minutes, 24/7"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="apply-access">
                  What the buyer receives on transfer *
                </Label>
                <Textarea
                  id="apply-access"
                  value={form.accessFormat}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, accessFormat: e.target.value }))
                  }
                  className="inset-well min-h-20 rounded-xl border-border/60"
                  placeholder="Login + password with email and 2FA reset, followers, highlights, insights…"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="apply-replacement">Replacement / warranty policy *</Label>
                <Textarea
                  id="apply-replacement"
                  value={form.replacementPolicy}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, replacementPolicy: e.target.value }))
                  }
                  className="inset-well min-h-20 rounded-xl border-border/60"
                  placeholder="e.g. 7-day replacement on any account that is recovered or has a prior ban."
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="apply-restricted">Regions you do not deliver to *</Label>
                <Textarea
                  id="apply-restricted"
                  value={form.restrictedRegions}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, restrictedRegions: e.target.value }))
                  }
                  className="inset-well min-h-20 rounded-xl border-border/60"
                  placeholder="e.g. We cannot deliver to Russia, Belarus or sanctioned regions."
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="apply-sourcing">Where does your inventory come from? *</Label>
                <Textarea
                  id="apply-sourcing"
                  value={form.sourcing}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, sourcing: e.target.value }))
                  }
                  className="inset-well min-h-20 rounded-xl border-border/60"
                  placeholder="How you acquire accounts and how you vet them before listing."
                />
              </div>

              <div className="grid gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                <p className="flex items-center gap-2 text-sm font-medium text-amber-800">
                  <ShieldAlert className="size-4" />
                  Off-platform contact is prohibited
                </p>
                <ul className="list-disc space-y-1 pl-5 text-xs text-amber-800/90">
                  <li>Do not share or request phone numbers, personal emails, Telegram or WhatsApp handles.</li>
                  <li>Do not accept payment outside escrow — not even a deposit.</li>
                  <li>Deliver accounts only through the AccsMartHub order flow.</li>
                  <li>
                    Buyers who move off-platform get a full refund and lose escrow
                    protection; sellers can have listings paused and balances held.
                  </li>
                </ul>
                <label className="flex cursor-pointer items-start gap-2.5 text-xs font-medium text-amber-900">
                  <input
                    type="checkbox"
                    checked={form.contactPolicy}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, contactPolicy: e.target.checked }))
                    }
                    className="mt-0.5 size-4 accent-amber-600"
                  />
                  <span>
                    I will keep every conversation and payment on AccsMartHub.
                  </span>
                </label>
              </div>

              {status === "rejected" && store?.reviewNote && (
                <div className="grid gap-2 rounded-xl bg-destructive/10 p-4 text-xs text-destructive">
                  <p className="font-medium">Your last submission was rejected</p>
                  <p>{store.reviewNote}</p>
                </div>
              )}

              <Button
                type="submit"
                className="rounded-xl"
                disabled={submitting || !user?.emailVerified}
              >
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                Submit store for approval
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Fields marked * are required. They appear on your listings so
                buyers know exactly what they are getting.
              </p>
            </form>
          </>
        )}
      </div>
    </DashLayout>
  );
}