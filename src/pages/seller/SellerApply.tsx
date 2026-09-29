import { useState } from "react";
import { Navigate } from "react-router";
import { ClipboardList, Clock, Send, ShieldCheck, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DashLayout } from "@/components/dash/DashLayout";
import { buyerNav } from "@/components/dash/navs";
import { api } from "@/lib/db";
import { useSession } from "@/lib/session";
import { toast } from "sonner";

const emptyForm = {
  storeName: "",
  platformFocus: "",
  experience: "",
  reason: "",
};

export default function SellerApply() {
  const { user, applyAsSeller } = useSession();
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  // Already approved to sell — send them to their dashboard.
  if (user && (user.role === "seller" || user.sellerStatus === "approved")) {
    return <Navigate to="/seller" replace />;
  }

  const pending = user?.sellerStatus === "pending";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.storeName.trim() || !form.platformFocus.trim() || !form.reason.trim()) {
      toast.error("Please fill in store name, platform focus and your reason.");
      return;
    }
    setSubmitting(true);
    try {
      api.applyForStore({
        userId: user.id,
        name: user.name,
        email: user.email,
        storeName: form.storeName.trim(),
        platformFocus: form.platformFocus.trim(),
        experience: form.experience.trim(),
        reason: form.reason.trim(),
      });
      applyAsSeller(user.id);
      toast.success("Application submitted", {
        description: "An admin will review your store application shortly.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashLayout title="Become a seller" nav={buyerNav}>
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Open your store</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Tell us about the accounts you sell. Applications are reviewed by
            our trust team — approved sellers can create listings immediately.
          </p>
        </div>

        {pending ? (
          <div className="glass p-6 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-amber-500/15">
              <Clock className="size-6 text-amber-600" />
            </span>
            <h3 className="mt-4 font-semibold">Application under review</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Your store application is in the review queue. Once an admin
              approves it, the seller dashboard unlocks and you can create your
              first listing. You'll keep full buyer access in the meantime.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { icon: ClipboardList, title: "Apply", text: "Describe your store and experience." },
                { icon: ShieldCheck, title: "Get approved", text: "Trust team review, usually within a day." },
                { icon: Store, title: "Start selling", text: "Create listings after approval." },
              ].map(({ icon: Icon, title, text }) => (
                <div key={title} className="inset-well rounded-xl p-4">
                  <Icon className="size-5 text-primary" />
                  <p className="mt-2 text-sm font-medium">{title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{text}</p>
                </div>
              ))}
            </div>

            <form onSubmit={submit} className="glass grid gap-4 p-6">
              <div className="grid gap-2">
                <Label htmlFor="apply-store">Store name</Label>
                <Input
                  id="apply-store"
                  value={form.storeName}
                  onChange={(e) => setForm((f) => ({ ...f, storeName: e.target.value }))}
                  className="inset-well rounded-xl border-border/60"
                  placeholder="e.g. Meridian Digital"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="apply-focus">Platform focus</Label>
                <Input
                  id="apply-focus"
                  value={form.platformFocus}
                  onChange={(e) => setForm((f) => ({ ...f, platformFocus: e.target.value }))}
                  className="inset-well rounded-xl border-border/60"
                  placeholder="e.g. Instagram theme pages, monetized YouTube channels…"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="apply-experience">Experience &amp; links</Label>
                <Textarea
                  id="apply-experience"
                  value={form.experience}
                  onChange={(e) => setForm((f) => ({ ...f, experience: e.target.value }))}
                  className="inset-well min-h-20 rounded-xl border-border/60"
                  placeholder="Where do you source accounts? Past marketplaces, portfolio or socials (optional)…"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="apply-reason">Why AccsMartHub?</Label>
                <Textarea
                  id="apply-reason"
                  value={form.reason}
                  onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                  className="inset-well min-h-20 rounded-xl border-border/60"
                  placeholder="What will you list, and how do you ensure clean transfers?"
                />
              </div>
              <Button type="submit" className="rounded-xl" disabled={submitting}>
                <Send className="size-4" />
                Submit application
              </Button>
            </form>
          </>
        )}
      </div>
    </DashLayout>
  );
}
