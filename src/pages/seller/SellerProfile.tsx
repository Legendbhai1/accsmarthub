import { useState } from "react";
import { BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DashLayout } from "@/components/dash/DashLayout";
import { sellerNav } from "@/components/dash/navs";
import { getSeller } from "@/lib/db";
import { useSession } from "@/lib/session";
import { toast } from "sonner";

export default function SellerProfile() {
  const { user } = useSession();
  const seller = getSeller(DEMO_SELLER_ID_SAFE());
  const [bio, setBio] = useState(
    "Full-service account brokerage. Every listing ships with verified ownership documents and a guided handover.",
  );

  return (
    <DashLayout title="Seller profile" nav={sellerNav}>
      <div className="max-w-xl space-y-6">
        <div className="glass p-6">
          <div className="flex items-center gap-4">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-xl font-bold text-primary">
              {seller.name.charAt(0)}
            </span>
            <div>
              <p className="flex items-center gap-1.5 font-semibold">
                {seller.name}
                {seller.verified && (
                  <BadgeCheck className="size-4.5 text-primary" aria-label="Verified" />
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                {seller.rating.toFixed(1)} rating · {seller.sales.toLocaleString()} sales · member since{" "}
                {new Date(seller.memberSince).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
              </p>
            </div>
          </div>
        </div>

        <form
          className="glass space-y-4 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            toast.success("Profile saved (demo)");
          }}
        >
          <h3 className="font-semibold">Public profile</h3>
          <div className="grid gap-2">
            <Label htmlFor="seller-name">Display name</Label>
            <Input
              id="seller-name"
              defaultValue={seller.name}
              className="inset-well rounded-xl border-border/60"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="seller-bio">Bio</Label>
            <Textarea
              id="seller-bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="inset-well min-h-24 rounded-xl border-border/60"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="seller-contact">Contact email</Label>
            <Input
              id="seller-contact"
              type="email"
              defaultValue={user?.email ?? ""}
              className="inset-well rounded-xl border-border/60"
            />
          </div>
          <Button type="submit" className="rounded-xl">
            Save changes
          </Button>
        </form>
      </div>
    </DashLayout>
  );
}

function DEMO_SELLER_ID_SAFE() {
  return "s-1";
}
